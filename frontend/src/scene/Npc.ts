import * as THREE from 'three';
import type { NpcMeta, PlayerAvatar } from '../shared/types';
import { npcLabel } from '../shared/npcLabel';
import { JUMP_HEIGHT, landingDip } from './jump';
import { EMOTIONS, EMOTION_LEAD_MS, normalizeEmotion, speechDuration, type NpcEmotion } from '../shared/dialogue';
import { expressionPose } from './expression';
import { AvatarRig, characterLook, NPC_SEAT, type SeatFit } from './AvatarRig';

/** A small, readable character assembled from local geometry. Appearance is public metadata only. */
export class Npc {
  readonly group = new THREE.Group();
  get head() { return this.rig.head; }
  private rig: AvatarRig;
  private avatarKey = '';
  private targetSeated = false;
  private seatFit: SeatFit = NPC_SEAT;
  private readonly avatar = new THREE.Group();
  private hasChair = false;
  private seatedAmount = 0;
  private targetJumpOffset = 0;
  private jumpOffset = 0;
  private landingAt = -Infinity;
  private lastUpdate = 0;
  private label: THREE.Sprite;
  private bubble: THREE.Sprite | null = null;
  private name = '';
  private reactionAt = -Infinity;
  private emotionBadge: THREE.Sprite | null = null;
  private voiceMicBadge: THREE.Sprite | null = null;
  private voiceSpeaking = false;
  private speech: { text: string; emotion: NpcEmotion; at: number; duration: number; shown: boolean } | null = null;
  private targetPos: THREE.Vector3 | null = null;
  private targetYaw = 0;
  private targetPitch = 0;

  constructor(readonly meta: NpcMeta) {
    this.avatar.name = 'avatar'; this.group.add(this.avatar);
    this.rig = new AvatarRig(characterLook(meta));
    this.avatarKey = JSON.stringify(meta.avatar ?? null);
    this.avatar.add(this.rig.root);
    this.rig.pose(0, this.seatFit, 0, expressionPose('neutral', -1, 0), 0, 0);
    this.name = meta.number > 0 ? npcLabel(meta) : meta.name;
    this.label = this.text(this.name, false);
    this.label.position.y = 2.31; this.avatar.add(this.label);
  }
  /** Apply stored player customization without recreating the model on every network tick. */
  updateAvatar(avatar?: PlayerAvatar) {
    const key = JSON.stringify(avatar ?? null);
    if (key === this.avatarKey) return;
    this.avatarKey = key;
    const old = this.rig.root;
    this.avatar.remove(old);
    const materials = new Set<THREE.Material>();
    old.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    materials.forEach(material => material.dispose());
    this.rig = new AvatarRig(characterLook({ ...this.meta, avatar }));
    this.avatar.add(this.rig.root);
    this.update(performance.now());
  }
  enableChair() {
    this.hasChair = true;
    this.targetSeated = true;
    this.seatedAmount = 1;
    this.update(performance.now());
  }
  setName(name: string) {
    const next = name;
    if (next === this.name) return;
    this.name = next; this.removeSprite(this.label);
    this.label = this.text(next, false); this.label.position.y = 2.31; this.avatar.add(this.label);
  }
  setTargetPose(x: number, y: number, z: number, yaw: number, pitch: number, seated: boolean, jumpOffset = 0, seatFit: SeatFit = NPC_SEAT) {
    const changedMode = this.targetSeated !== seated;
    this.targetSeated = seated;
    this.seatFit = seatFit;
    this.targetJumpOffset = seated ? 0 : Math.max(0, Math.min(JUMP_HEIGHT, jumpOffset));
    if (seated) { this.jumpOffset = 0; this.landingAt = -Infinity; }
    if (!this.targetPos) {
      this.targetPos = new THREE.Vector3(x, y, z);
      this.seatedAmount = Number(seated);
      this.group.position.set(x, y, z);
      this.group.rotation.y = yaw;
      this.head.rotation.x = pitch;
    } else {
      this.targetPos.set(x, y, z);
      if (changedMode || this.group.position.distanceTo(this.targetPos) > 3.0) {
        this.group.position.copy(this.targetPos);
        if (changedMode) this.group.rotation.y = yaw;
      }
    }
    this.targetYaw = yaw;
    this.targetPitch = pitch;

  }
  say(text: string, emotion: string | null = null, at = performance.now()) {
    this.stopSpeaking();
    const mood = normalizeEmotion(emotion);
    this.speech = { text, emotion: mood, at, duration: speechDuration(text), shown: false };
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fffdf7'; context.fillRect(0, 0, 128, 128);
    context.strokeStyle = EMOTIONS[mood].color; context.lineWidth = 8; context.strokeRect(4, 4, 120, 120);
    context.font = '80px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; context.textAlign = 'center';
    context.fillText(EMOTIONS[mood].emoji, 64, 94);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    this.emotionBadge = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    this.emotionBadge.name = 'npc-emotion'; this.emotionBadge.userData.emotion = mood;
    this.emotionBadge.scale.setScalar(0.55); this.emotionBadge.position.y = 2.76;
    this.emotionBadge.renderOrder = 2; this.avatar.add(this.emotionBadge);
  }
  stopSpeaking() {
    if (this.bubble) this.removeSprite(this.bubble);
    if (this.emotionBadge) this.removeSprite(this.emotionBadge);
    this.bubble = null; this.emotionBadge = null; this.speech = null;
  }
  /** <summary>Displays or removes a 3D microphone icon above a speaking judge avatar.</summary> */
  setVoiceSpeaking(speaking: boolean) {
    if (this.voiceSpeaking === speaking) return;
    this.voiceSpeaking = speaking;
    if (!speaking) {
      if (this.voiceMicBadge) {
        this.removeSprite(this.voiceMicBadge);
        this.voiceMicBadge = null;
      }
      return;
    }
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#1b2b1f'; context.fillRect(0, 0, 128, 128);
    context.strokeStyle = '#5ad47b'; context.lineWidth = 8; context.strokeRect(4, 4, 120, 120);
    context.fillStyle = '#ffffff';
    context.font = '76px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; context.textAlign = 'center';
    context.fillText('🎙', 64, 92);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    this.voiceMicBadge = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    this.voiceMicBadge.name = 'judge-voice-mic';
    this.voiceMicBadge.userData.speaking = true;
    this.voiceMicBadge.scale.setScalar(0.45);
    this.voiceMicBadge.position.y = this.label.position.y + 0.38;
    this.voiceMicBadge.renderOrder = 3;
    this.avatar.add(this.voiceMicBadge);
  }
  react(at: number) { this.reactionAt = at; }
  update(now: number) {
    const dt = this.lastUpdate ? Math.max(0, Math.min((now - this.lastUpdate) / 1000, 0.05)) : 1 / 60;
    this.lastUpdate = now;
    if (this.targetPos) {
      this.group.position.lerp(this.targetPos, 0.22);
      const dyaw = Math.atan2(Math.sin(this.targetYaw - this.group.rotation.y), Math.cos(this.targetYaw - this.group.rotation.y));
      this.group.rotation.y += dyaw * 0.25;
    }
    const wasAirborne = this.jumpOffset > 0;
    this.jumpOffset = THREE.MathUtils.damp(this.jumpOffset, this.targetJumpOffset, 24, dt);
    if (this.targetJumpOffset === 0 && this.jumpOffset < 0.005) {
      this.jumpOffset = 0;
      if (wasAirborne) this.landingAt = now;
    }
    const dip = landingDip((now - this.landingAt) / 1000);
    const tuck = this.jumpOffset / JUMP_HEIGHT;
    const speech = this.speech;
    const speechAge = speech ? now - speech.at : -1;
    const pose = expressionPose(speech?.emotion ?? 'neutral', speechAge, speech?.duration ?? 0);
    const target = this.hasChair ? (speech ? 0 : 1) : Number(this.targetSeated);
    this.seatedAmount = THREE.MathUtils.damp(this.seatedAmount, target, 10, dt);
    if (Math.abs(this.seatedAmount - target) < .0001) this.seatedAmount = target;
    this.avatar.position.y = this.jumpOffset - dip;
    this.avatar.rotation.set(0, 0, 0);
    this.avatar.scale.set(1 + dip * .4, 1 - dip, 1 + dip * .4);
    const bodyPose = this.rig.pose(this.seatedAmount, this.seatFit, this.hasChair ? .65 : this.targetSeated ? .75 : 0, pose, tuck, this.targetPitch);
    this.label.position.set(0, bodyPose.labelY, bodyPose.hipZ);
    if (speech && now >= speech.at + EMOTION_LEAD_MS && now < speech.at + speech.duration && !speech.shown) {
      speech.shown = true;
      this.bubble = this.text(speech.text, true); this.bubble.name = 'npc-speech';
      this.bubble.position.y = 3.55; this.avatar.add(this.bubble);
    }
    if (this.emotionBadge) {
      this.emotionBadge.position.y = this.label.position.y + 0.45 + Math.sin(Math.max(0, speechAge) / 230) * 0.045;
      this.emotionBadge.material.opacity = pose.weight;
    }
    if (this.bubble) {
      this.bubble.position.y = this.label.position.y + 0.78 + this.bubble.scale.y / 2;
      this.bubble.material.opacity = pose.weight;
    }
    if (this.voiceMicBadge) {
      const pulse = Math.sin(Math.max(0, now) / 140) * 0.035;
      this.voiceMicBadge.position.y = this.label.position.y + 0.38 + pulse * 0.5;
      this.voiceMicBadge.scale.setScalar(0.45 + pulse);
    }
    const age = now - this.reactionAt;
    this.rig.bodyMaterial.emissive.set('#f6b84b');
    this.rig.bodyMaterial.emissiveIntensity = age < 2400 ? (0.5 + Math.sin(age / 110) * 0.5) * 0.45 : 0;
    if (speech && now >= speech.at + speech.duration) this.stopSpeaking();
  }
  private text(text: string, bubble: boolean) {
    const canvas = document.createElement('canvas'); canvas.width = bubble ? 640 : 512;
    const context = canvas.getContext('2d')!;
    const font = bubble
      ? '27px -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif'
      : '600 30px -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif';
    context.font = font;
    const lines: string[] = [];
    if (bubble) {
      let line = '';
      for (const word of text.trim().split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (context.measureText(next).width <= 580) { line = next; continue; }
        if (line) { lines.push(line); line = ''; }
        for (const char of word) {
          if (line && context.measureText(line + char).width > 580) { lines.push(line); line = ''; }
          line += char;
        }
      }
      lines.push(line);
    }
    canvas.height = bubble ? Math.max(192, 48 + lines.length * 36) : 80;
    context.font = font;
    context.fillStyle = bubble ? '#fffdf7' : '#fffaf0'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#d9cfbd'; context.lineWidth = 5; context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    context.fillStyle = '#34434a';
    context.textAlign = 'center';
    if (bubble) lines.forEach((value, i) => context.fillText(value, canvas.width / 2, (canvas.height - lines.length * 36) / 2 + 27 + i * 36, 580));
    else context.fillText(text, canvas.width / 2, 50, 470);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: !bubble }));
    sprite.scale.set(bubble ? 3.35 : 1.55, bubble ? 3.35 * canvas.height / canvas.width : 0.26, 1); return sprite;
  }
  dispose() {
    this.group.traverse(object => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    });
    this.group.clear();
  }
  private removeSprite(sprite: THREE.Sprite) { this.avatar.remove(sprite); sprite.material.map?.dispose(); sprite.material.dispose(); }
}
