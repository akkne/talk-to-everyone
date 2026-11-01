import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useClient } from '../core/client';
import { tickDialogue, useGameStore } from '../store/gameStore';
import { useVoiceSettingsStore } from '../store/voiceSettingsStore';
import { SpatialVoiceChannel } from '../audio/SpatialVoiceChannel';
import { setupRoom, disposeScene, createNpcChair } from './setup';
import { syncLocationProps, animateLocationDoors } from './props';
import { CameraController } from './CameraController';
import { Npc } from './Npc';
import { NpcLod } from './lod';
import { npcLabel } from '../shared/npcLabel';

/** <summary>One visible canvas; subscription callbacks bridge Zustand to the imperative three.js scene and 3D spatial voice audio.</summary> */
export function Scene({ controlsBlocked = false }: { controlsBlocked?: boolean }) {
  const blocked = useRef(controlsBlocked);
  blocked.current = controlsBlocked;
  const canvas = useRef<HTMLCanvasElement>(null);
  const client = useClient();
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    const element = canvas.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: element, antialias: true });
    } catch {
      setError('Не удалось запустить WebGL. Включите аппаратное ускорение в Chrome и перезагрузите страницу.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const spec = useGameStore.getState().scene;
    if (!spec) {
      renderer.dispose();
      setError('Сервер не прислал описание сцены.');
      return;
    }
    const scene = new THREE.Scene();
    setupRoom(scene, spec);
    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 100);
    const controller = new CameraController(
      camera,
      element,
      client,
      spec,
      setHint,
      message => useGameStore.setState({ error: message })
    );
    const npcs = new Map<string, Npc>();
    const judges = new Map<string, Npc>();
    const lod = new NpcLod(camera, npcs, client);
    const voiceChannel = new SpatialVoiceChannel(
      client,
      () => useGameStore.getState().playerId,
      speaking => {
        const myId = useGameStore.getState().playerId;
        if (myId) {
          useGameStore.setState(s => ({
            speakingByPlayer: { ...s.speakingByPlayer, [myId]: speaking },
          }));
        }
      }
    );

    const initialVoice = useVoiceSettingsStore.getState();
    void voiceChannel.applySettings({
      deviceId: initialVoice.deviceId,
      volume: initialVoice.volume,
      mode: initialVoice.mode,
    });
    voiceChannel.setPushToTalkPressed(initialVoice.pushToTalkPressed);

    const unsubscribeVoice = useVoiceSettingsStore.subscribe(v => {
      void voiceChannel.applySettings({
        deviceId: v.deviceId,
        volume: v.volume,
        mode: v.mode,
      });
      voiceChannel.setPushToTalkPressed(v.pushToTalkPressed);
    });

    let lastSpeech = '';
    let lastThinkingAt = 0;
    let lastMeSeq = -1;
    let lastSeat: string | null = null;
    let lastSignalAt = 0;

    const sync = () => {
      const state = useGameStore.getState();
      if(state.scene){ controller.syncLocation(state.scene);syncLocationProps(scene,state.scene); }
      controller.setOccupied(
        state.seats.filter(seat => seat.occupiedBy && seat.occupiedBy !== state.playerId).map(seat => seat.id)
      );
      for (const [id, npc] of npcs) {
        if (!state.npcs.some(n => n.id === id)) {
          scene.remove(npc.group);
          npc.dispose();
          npcs.delete(id);
        }
      }
      for (const meta of state.npcs) {
        if (!npcs.has(meta.id)) {
          const stand = spec.npcStands.find(x => x.id === meta.anchorId);
          if (!stand) continue;
          const npc = new Npc(meta);
          npc.enableChair();
          npc.group.add(createNpcChair());
          npc.group.position.set(stand.position.x, stand.position.y, stand.position.z);
          npc.group.rotation.y = stand.yaw;
          npcs.set(meta.id, npc);
          scene.add(npc.group);
        }
      }
      for (const meta of state.npcs) npcs.get(meta.id)?.setName(npcLabel(meta));
      if (state.thinkingNpc && state.thinkingAt > lastThinkingAt) {
        lastThinkingAt = state.thinkingAt;
        npcs.get(state.thinkingNpc)?.react(performance.now());
      }
      const me = state.players.find(p => p.id === state.playerId);
      if (
        me &&
        (lastMeSeq < 0 ||
          me.pose.seatId !== lastSeat ||
          (me.pose.seq > lastMeSeq && controller.differsFrom(me.pose)))
      ) {
        lastMeSeq = me.pose.seq;
        lastSeat = me.pose.seatId;
        controller.syncPose(me.pose);
      }
      if (me) lastMeSeq = Math.max(lastMeSeq, me.pose.seq);
      syncPlayers();
      void voiceChannel.syncPeers(state.players);
      if (state.incomingVoiceSignal && state.incomingVoiceSignal.sentAt !== lastSignalAt) {
        lastSignalAt = state.incomingVoiceSignal.sentAt;
        void voiceChannel.handleSignal(state.incomingVoiceSignal);
      }
      const active = state.dialogue.current;
      if ((active?.message.id ?? '') !== lastSpeech) {
        lastSpeech = active?.message.id ?? '';
        npcs.forEach(npc => npc.stopSpeaking());
        if (active) npcs.get(active.message.npc)?.say(active.message.text, active.message.emotion, active.startedAt);
      }
    };

    const syncPlayers = () => {
      const state = useGameStore.getState();
      const others = state.players.filter(p => p.id !== state.playerId);
      const connectedOthers = others.filter(p => p.connected);
      controller.setOtherPlayers(
        connectedOthers.map(p => ({
          id: p.id,
          position: p.pose.position,
          mode: p.pose.mode,
        }))
      );
      for (const [id, judge] of judges) {
        judge.group.visible = connectedOthers.some(p => p.id === id);
      }
      others.forEach(player => {
        let judge = judges.get(player.id);
        if (!judge) {
          judge = new Npc({ id: player.id, number: 0, name: player.name, color: '#dfbf63', anchorId: '' });
          judges.set(player.id, judge);
          scene.add(judge.group);
        }
        judge.setName(player.name);
        judge.group.visible = player.connected;
        judge.setVoiceSpeaking(Boolean(player.connected && state.speakingByPlayer[player.id]));
        judge.setTargetPose(
          player.pose.position.x,
          player.pose.position.y,
          player.pose.position.z,
          Math.PI - player.pose.yaw,
          player.pose.pitch,
          player.pose.mode === 'seated',
          player.pose.jumpOffset ?? 0
        );
      });
    };

    sync();
    const unsubscribe = useGameStore.subscribe(sync);
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const lost = (event: Event) => {
      event.preventDefault();
      setError('Графический контекст потерян. Перезагрузите страницу и войдите в сессию снова.');
    };
    element.addEventListener('webglcontextlost', lost);
    let frame = 0;
    let frames = 0;
    let sampleAt = performance.now();
    const animate = (now: number) => {
      const state = useGameStore.getState();
      controller.setEnabled(!blocked.current && !state.boardOpen && state.connection === 'ready');
      frame = requestAnimationFrame(animate);
      if(state.scene)animateLocationDoors(scene,state.scene);
      controller.update(now);
      tickDialogue(now);
      npcs.forEach(npc => npc.update(now));
      judges.forEach(judge => judge.update(now));
      lod.update(now, state.connection === 'ready');

      const me = state.players.find(p => p.id === state.playerId);
      const others = state.players.filter(p => p.id !== state.playerId && p.connected);
      voiceChannel.updateSpatialPositions(
        {
          position: { x: camera.position.x, y: me?.pose.position.y ?? 0, z: camera.position.z },
          yaw: -camera.rotation.y,
          pitch: -camera.rotation.x,
          seated: me?.pose.mode === 'seated',
          jumpOffset: me?.pose.jumpOffset ?? 0,
        },
        others
      );

      renderer.render(scene, camera);
      frames++;
      if (now - sampleAt >= 1000) {
        const info = renderer.info;
        useGameStore.setState({
          metrics: {
            fps: Math.round((frames * 1000) / (now - sampleAt)),
            calls: info.render.calls,
            triangles: info.render.triangles,
            geometries: info.memory.geometries,
            textures: info.memory.textures,
          },
        });
        frames = 0;
        sampleAt = now;
      }
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe();
      unsubscribeVoice();
      voiceChannel.dispose();
      element.removeEventListener('webglcontextlost', lost);
      controller.dispose();
      lod.dispose();
      disposeScene(scene);
      renderer.dispose();
    };
  }, [client]);

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvas}
        className="h-full w-full outline-none"
        tabIndex={0}
        aria-label="Комната расследования. WASD — ходьба, Space — прыжок, мышь — обзор, E — взаимодействовать, сесть или встать, G — рация."
      />
      {error && (
        <div className="scene-error" role="alert">
          {error}
        </div>
      )}
      <div className="movement-hint" role="status">
        {hint}
      </div>
    </div>
  );
}
