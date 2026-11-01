import { C2S } from '../shared/contract';
import type { GameClient, Player, Vec3, VoiceSignalEnvelope } from '../shared/types';
import { VoiceSettingsPolicy, type MicrophoneSettings } from '../store/voiceSettingsStore';
import { PushToTalkController } from './PushToTalkController';
import { SpatialAudioMath, type SpatialSpeakerAudioMetrics } from './SpatialAudioMath';

/** <summary>Represents the spatial audio graph nodes for a single remote judge peer.</summary> */
export interface PeerSpatialAudioNode {
  readonly peerId: string;
  lastMetrics: SpatialSpeakerAudioMetrics;
  updatePose(listener: { position: Vec3; yaw: number; pitch: number; seated?: boolean; jumpOffset?: number }, speaker: { position: Vec3; seated?: boolean; jumpOffset?: number }): SpatialSpeakerAudioMetrics;
  dispose(): void;
}

interface WebRtcPeerEntry {
  readonly peerId: string;
  readonly connection: RTCPeerConnection;
  spatialNode: PeerSpatialAudioNode | null;
  audioElement: HTMLAudioElement | null;
}

/** <summary>Manages WebRTC voice links between judges, microphone gain/PTT, and 3D Web Audio API spatialization.</summary> */
export class SpatialVoiceChannel {
  private audioContext: AudioContext | null = null;
  private localStream: MediaStream | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private inputGainNode: GainNode | null = null;
  private processedDestination: MediaStreamAudioDestinationNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuffer: Float32Array<ArrayBuffer> | null = null;
  private vadTimer: ReturnType<typeof setInterval> | null = null;

  private readonly peers = new Map<string, WebRtcPeerEntry>();
  private readonly spatialNodes = new Map<string, PeerSpatialAudioNode>();
  private currentDeviceId = '';
  private settings: MicrophoneSettings = {
    deviceId: VoiceSettingsPolicy.DEFAULT_DEVICE_ID,
    volume: VoiceSettingsPolicy.DEFAULT_VOLUME,
    mode: VoiceSettingsPolicy.DEFAULT_MODE,
  };
  private pttPressed = false;
  private vadActive = false;
  private lastVadSpeechAt = 0;
  private speaking = false;
  private disposed = false;

  private listenerPose: { position: Vec3; yaw: number; pitch: number; seated?: boolean; jumpOffset?: number } = {
    position: { x: 0, y: 0, z: 5 },
    yaw: 0,
    pitch: 0,
    seated: false,
    jumpOffset: 0,
  };

  constructor(
    private readonly client: GameClient,
    private readonly getLocalPlayerId: () => string,
    private readonly onLocalSpeakingChange: (speaking: boolean) => void
  ) {}

  /** <summary>Applies updated microphone settings (device, volume, mode) from the Escape menu.</summary> */
  public async applySettings(next: MicrophoneSettings): Promise<void> {
    if (this.disposed) return;
    const deviceChanged = next.deviceId !== this.currentDeviceId && this.localStream !== null;
    this.settings = next;

    if (this.inputGainNode && this.audioContext) {
      const targetGain = this.computeEffectiveOutgoingGain();
      this.inputGainNode.gain.setValueAtTime(targetGain, this.audioContext.currentTime);
    }

    if (deviceChanged) {
      await this.acquireMicrophoneStream(next.deviceId);
    }

    this.evaluateSpeakingState();
  }

  /** <summary>Updates Push-to-Talk key (G) state and immediately adjusts outgoing transmission.</summary> */
  public setPushToTalkPressed(pressed: boolean): void {
    if (this.disposed || this.pttPressed === pressed) return;
    this.pttPressed = pressed;
    if (pressed && !this.localStream) {
      void this.acquireMicrophoneStream(this.settings.deviceId);
    }
    this.evaluateSpeakingState();
  }

  /** <summary>Updates the 3D listener pose (camera) and recalculates 3D spatial audio for all connected judges.</summary> */
  public updateSpatialPositions(
    listener: { position: Vec3; yaw: number; pitch: number; seated?: boolean; jumpOffset?: number },
    remotePlayers: Player[]
  ): Map<string, SpatialSpeakerAudioMetrics> {
    this.listenerPose = listener;
    this.updateAudioContextListener(listener);

    const results = new Map<string, SpatialSpeakerAudioMetrics>();
    for (const player of remotePlayers) {
      if (!player.connected) continue;
      let node = this.spatialNodes.get(player.id);
      if (!node) {
        node = this.createVirtualSpatialNode(player.id);
        this.spatialNodes.set(player.id, node);
      }
      const metrics = node.updatePose(listener, {
        position: player.pose.position,
        seated: player.pose.mode === 'seated',
        jumpOffset: player.pose.jumpOffset ?? 0,
      });
      results.set(player.id, metrics);
    }
    return results;
  }

  /** <summary>Synchronizes WebRTC peer connections with the current set of connected studio judges.</summary> */
  public async syncPeers(players: Player[]): Promise<void> {
    if (this.disposed) return;
    const myId = this.getLocalPlayerId();
    if (!myId) return;

    const activeRemoteIds = new Set(
      players.filter(p => p.id !== myId && p.connected).map(p => p.id)
    );

    for (const [peerId, entry] of this.peers) {
      if (!activeRemoteIds.has(peerId)) {
        this.closePeer(peerId, entry);
      }
    }

    if ( typeof RTCPeerConnection === 'undefined') {
      return;
    }

    for (const remoteId of activeRemoteIds) {
      if (!this.peers.has(remoteId) && myId.localeCompare(remoteId) < 0) {
        await this.initiatePeerOffer(remoteId);
      }
    }
  }

  /** <summary>Processes an incoming WebRTC offer, answer, or ICE candidate from another judge.</summary> */
  public async handleSignal(envelope: VoiceSignalEnvelope): Promise<void> {
    if (this.disposed || typeof RTCPeerConnection === 'undefined') return;
    const peerId = envelope.senderPlayerId;
    if (!peerId || peerId === this.getLocalPlayerId()) return;

    try {
      if (envelope.signalType === 'offer') {
        const entry = await this.getOrCreatePeer(peerId);
        const desc = JSON.parse(envelope.payload) as RTCSessionDescriptionInit;
        await entry.connection.setRemoteDescription(desc);
        const answer = await entry.connection.createAnswer();
        await entry.connection.setLocalDescription(answer);
        await this.client.send(C2S.SEND_VOICE_SIGNAL, {
          targetPlayerId: peerId,
          signalType: 'answer',
          payload: JSON.stringify(answer),
        });
      } else if (envelope.signalType === 'answer') {
        const entry = this.peers.get(peerId);
        if (!entry) return;
        const desc = JSON.parse(envelope.payload) as RTCSessionDescriptionInit;
        await entry.connection.setRemoteDescription(desc);
      } else if (envelope.signalType === 'ice') {
        const entry = this.peers.get(peerId);
        if (!entry) return;
        const candidate = JSON.parse(envelope.payload) as RTCIceCandidateInit;
        await entry.connection.addIceCandidate(candidate);
      }
    } catch {
      // Ignore transient signaling race conditions during reconnect.
    }
  }

  /** <summary>Acquires or switches the browser microphone stream and attaches gain and VAD nodes.</summary> */
  public async acquireMicrophoneStream(deviceId = this.settings.deviceId): Promise<boolean> {
    if (this.disposed) return false;
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      return false;
    }

    try {
      const normalizedId = VoiceSettingsPolicy.normalizeDeviceId(deviceId);
      const constraints: MediaStreamConstraints = {
        audio:
          normalizedId !== 'default'
            ? { deviceId: { exact: normalizedId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      };

      const stream = await mediaDevices.getUserMedia(constraints);
      this.stopLocalStream();
      this.localStream = stream;
      this.currentDeviceId = normalizedId;
      this.setupLocalAudioPipeline(stream);
      this.replaceOutgoingTracks();
      return true;
    } catch {
      return false;
    }
  }

  /** <summary>Releases all WebRTC connections, microphone tracks, and Web Audio nodes.</summary> */
  public dispose(): void {
    this.disposed = true;
    if (this.vadTimer) {
      clearInterval(this.vadTimer);
      this.vadTimer = null;
    }
    for (const [peerId, entry] of this.peers) {
      this.closePeer(peerId, entry);
    }
    this.peers.clear();
    this.spatialNodes.forEach(node => node.dispose());
    this.spatialNodes.clear();
    this.stopLocalStream();
    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (this.audioContext) {
      if (this.audioContext.state === 'suspended') {
        void this.audioContext.resume().catch(() => {});
      }
      return this.audioContext;
    }
    const Ctor =
      typeof window !== 'undefined'
        ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) return null;
    try {
      this.audioContext = new Ctor();
      return this.audioContext;
    } catch {
      return null;
    }
  }

  private setupLocalAudioPipeline(stream: MediaStream): void {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    this.inputSource?.disconnect();
    this.inputGainNode?.disconnect();
    this.analyser?.disconnect();

    this.inputSource = ctx.createMediaStreamSource(stream);
    this.inputGainNode = ctx.createGain();
    this.inputGainNode.gain.value = this.computeEffectiveOutgoingGain();

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyserBuffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));

    this.processedDestination = ctx.createMediaStreamDestination();
    this.inputSource.connect(this.analyser);
    this.inputSource.connect(this.inputGainNode);
    this.inputGainNode.connect(this.processedDestination);

    if (!this.vadTimer) {
      this.vadTimer = setInterval(() => this.sampleVoiceActivity(), 80);
    }
  }

  private sampleVoiceActivity(): void {
    if (this.disposed) return;
    if (this.settings.mode === 'always' && !this.localStream) {
      void this.acquireMicrophoneStream(this.settings.deviceId);
    }
    if (!this.analyser || !this.analyserBuffer) {
      this.evaluateSpeakingState();
      return;
    }

    this.analyser.getFloatTimeDomainData(this.analyserBuffer);
    const rms = SpatialAudioMath.computeRmsAmplitude(this.analyserBuffer);
    const scaledRms = rms * VoiceSettingsPolicy.volumeToGain(this.settings.volume);
    const now = Date.now();

    if (scaledRms >= PushToTalkController.VAD_RMS_THRESHOLD) {
      this.lastVadSpeechAt = now;
      this.vadActive = true;
    } else if (now - this.lastVadSpeechAt > 280) {
      this.vadActive = false;
    }

    this.evaluateSpeakingState();
  }

  private computeEffectiveOutgoingGain(): number {
    const active = PushToTalkController.shouldTransmitVoice({
      mode: this.settings.mode,
      volume: this.settings.volume,
      pttPressed: this.pttPressed,
      voiceActivityDetected: this.settings.mode === 'always' ? true : this.pttPressed,
    });
    return active ? VoiceSettingsPolicy.volumeToGain(this.settings.volume) : 0;
  }

  private evaluateSpeakingState(): void {
    const shouldSpeak = PushToTalkController.shouldTransmitVoice({
      mode: this.settings.mode,
      volume: this.settings.volume,
      pttPressed: this.pttPressed,
      voiceActivityDetected: this.vadActive,
    });

    if (this.inputGainNode && this.audioContext) {
      const targetGain = shouldSpeak ? VoiceSettingsPolicy.volumeToGain(this.settings.volume) : 0;
      this.inputGainNode.gain.setValueAtTime(targetGain, this.audioContext.currentTime);
    }

    if (this.localStream) {
      const trackEnabled =
        VoiceSettingsPolicy.clampVolume(this.settings.volume) > 0 &&
        (this.settings.mode === 'always' || this.pttPressed);
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = trackEnabled;
      });
    }

    if (shouldSpeak !== this.speaking) {
      this.speaking = shouldSpeak;
      this.onLocalSpeakingChange(shouldSpeak);
      void this.client.send(C2S.SET_VOICE_SPEAKING, { speaking: shouldSpeak }).catch(() => {});
    }
  }

  private async initiatePeerOffer(peerId: string): Promise<void> {
    try {
      const entry = await this.getOrCreatePeer(peerId);
      const offer = await entry.connection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await entry.connection.setLocalDescription(offer);
      await this.client.send(C2S.SEND_VOICE_SIGNAL, {
        targetPlayerId: peerId,
        signalType: 'offer',
        payload: JSON.stringify(offer),
      });
    } catch {
      // Ignore offer creation failure if peer disconnected mid-handshake.
    }
  }

  private async getOrCreatePeer(peerId: string): Promise<WebRtcPeerEntry> {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    if (!this.localStream) {
      await this.acquireMicrophoneStream(this.settings.deviceId);
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    const outgoingStream = this.processedDestination?.stream ?? this.localStream;
    if (outgoingStream) {
      outgoingStream.getTracks().forEach(track => pc.addTrack(track, outgoingStream));
    }

    const entry: WebRtcPeerEntry = {
      peerId,
      connection: pc,
      spatialNode: null,
      audioElement: null,
    };

    pc.onicecandidate = event => {
      if (event.candidate) {
        void this.client
          .send(C2S.SEND_VOICE_SIGNAL, {
            targetPlayerId: peerId,
            signalType: 'ice',
            payload: JSON.stringify(event.candidate),
          })
          .catch(() => {});
      }
    };

    pc.ontrack = event => {
      const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
      this.attachRemoteStreamTo3DAudio(peerId, entry, remoteStream);
    };

    this.peers.set(peerId, entry);
    return entry;
  }

  private attachRemoteStreamTo3DAudio(peerId: string, entry: WebRtcPeerEntry, stream: MediaStream): void {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    // Muted HTMLAudioElement ensures Chromium/Firefox pump the incoming WebRTC MediaStream into Web Audio.
    if (typeof Audio !== 'undefined') {
      try {
        const audio = new Audio();
        audio.srcObject = stream;
        audio.muted = true;
        void audio.play().catch(() => {});
        entry.audioElement = audio;
      } catch {
        // Ignore in headless test environments.
      }
    }

    const source = ctx.createMediaStreamSource(stream);
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = SpatialAudioMath.REF_DISTANCE;
    panner.maxDistance = SpatialAudioMath.MAX_DISTANCE;
    panner.rolloffFactor = SpatialAudioMath.ROLLOFF_FACTOR;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 1;

    const stereo = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    const distanceGain = ctx.createGain();

    source.connect(panner);
    if (stereo) {
      panner.connect(stereo);
      stereo.connect(distanceGain);
    } else {
      panner.connect(distanceGain);
    }
    distanceGain.connect(ctx.destination);

    const initialMetrics = SpatialAudioMath.computeSpeakerMetrics(this.listenerPose, {
      position: { x: 0, y: 0, z: 3.5 },
    });

    const node: PeerSpatialAudioNode = {
      peerId,
      lastMetrics: initialMetrics,
      updatePose: (listener, speaker) => {
        const metrics = SpatialAudioMath.computeSpeakerMetrics(listener, speaker);
        node.lastMetrics = metrics;
        const pos = metrics.worldHeadPosition;
        if (panner.positionX) {
          panner.positionX.setValueAtTime(pos.x, ctx.currentTime);
          panner.positionY.setValueAtTime(pos.y, ctx.currentTime);
          panner.positionZ.setValueAtTime(pos.z, ctx.currentTime);
        } else {
          panner.setPosition(pos.x, pos.y, pos.z);
        }
        if (stereo) {
          stereo.pan.setValueAtTime(metrics.pan, ctx.currentTime);
        }
        distanceGain.gain.setValueAtTime(metrics.distanceGain, ctx.currentTime);
        return metrics;
      },
      dispose: () => {
        source.disconnect();
        panner.disconnect();
        stereo?.disconnect();
        distanceGain.disconnect();
      },
    };

    entry.spatialNode?.dispose();
    entry.spatialNode = node;
    this.spatialNodes.set(peerId, node);
  }

  private createVirtualSpatialNode(peerId: string): PeerSpatialAudioNode {
    const initialMetrics = SpatialAudioMath.computeSpeakerMetrics(this.listenerPose, {
      position: { x: 0, y: 0, z: 3.5 },
    });
    const node: PeerSpatialAudioNode = {
      peerId,
      lastMetrics: initialMetrics,
      updatePose: (listener, speaker) => {
        const metrics = SpatialAudioMath.computeSpeakerMetrics(listener, speaker);
        node.lastMetrics = metrics;
        return metrics;
      },
      dispose: () => {},
    };
    return node;
  }

  private updateAudioContextListener(listener: {
    position: Vec3;
    yaw: number;
    pitch: number;
    seated?: boolean;
    jumpOffset?: number;
  }): void {
    const ctx = this.audioContext;
    if (!ctx) return;

    const headY =
      listener.position.y +
      (listener.seated ? SpatialAudioMath.SEATED_HEAD_HEIGHT : SpatialAudioMath.STANDING_HEAD_HEIGHT) +
      (listener.jumpOffset ?? 0);
    const basis = SpatialAudioMath.computeListenerBasis(listener.yaw, listener.pitch);
    const audioListener = ctx.listener;

    if (audioListener.positionX && audioListener.forwardX && audioListener.upX) {
      audioListener.positionX.setValueAtTime(listener.position.x, ctx.currentTime);
      audioListener.positionY.setValueAtTime(headY, ctx.currentTime);
      audioListener.positionZ.setValueAtTime(listener.position.z, ctx.currentTime);
      audioListener.forwardX.setValueAtTime(basis.forward.x, ctx.currentTime);
      audioListener.forwardY.setValueAtTime(basis.forward.y, ctx.currentTime);
      audioListener.forwardZ.setValueAtTime(basis.forward.z, ctx.currentTime);
      audioListener.upX.setValueAtTime(basis.up.x, ctx.currentTime);
      audioListener.upY.setValueAtTime(basis.up.y, ctx.currentTime);
      audioListener.upZ.setValueAtTime(basis.up.z, ctx.currentTime);
    } else if (typeof audioListener.setPosition === 'function' && typeof audioListener.setOrientation === 'function') {
      audioListener.setPosition(listener.position.x, headY, listener.position.z);
      audioListener.setOrientation(
        basis.forward.x,
        basis.forward.y,
        basis.forward.z,
        basis.up.x,
        basis.up.y,
        basis.up.z
      );
    }
  }

  private replaceOutgoingTracks(): void {
    const outgoingStream = this.processedDestination?.stream ?? this.localStream;
    const audioTrack = outgoingStream?.getAudioTracks()[0];
    if (!audioTrack) return;

    for (const entry of this.peers.values()) {
      const sender = entry.connection.getSenders().find(s => s.track?.kind === 'audio');
      if (sender) {
        void sender.replaceTrack(audioTrack).catch(() => {});
      } else if (outgoingStream) {
        entry.connection.addTrack(audioTrack, outgoingStream);
      }
    }
  }

  private closePeer(peerId: string, entry: WebRtcPeerEntry): void {
    entry.spatialNode?.dispose();
    if (entry.audioElement) {
      entry.audioElement.srcObject = null;
      entry.audioElement = null;
    }
    try {
      entry.connection.close();
    } catch {
      // Ignore close errors.
    }
    this.peers.delete(peerId);
    this.spatialNodes.delete(peerId);
  }

  private stopLocalStream(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }
}
