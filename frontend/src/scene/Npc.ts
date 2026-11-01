import * as THREE from 'three';
import type { NpcMeta } from '../shared/types';
import { npcLabel } from '../shared/npcLabel';
import { JUMP_HEIGHT, landingDip } from './jump';
import { EMOTIONS, EMOTION_LEAD_MS, normalizeEmotion, speechDuration, type NpcEmotion } from '../shared/dialogue';
import { expressionPose } from './expression';

const skinTones = ['#e9bd9e', '#c78f6c', '#f0cfb4', '#ad7659', '#dca984'];
const hairTones = ['#332b2a', '#6a4937', '#241f25', '#9b7050'];
const cloth = (color: string, roughness = 0.86) => new THREE.MeshStandardMaterial({ color, roughness });

/** A small, readable character assembled from local geometry. Appearance is public metadata only. */
export class Npc {
  readonly group = new THREE.Group();
  readonly head = new THREE.Group();
  private readonly avatar = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly arms: THREE.Group[] = [];
  private readonly brows: THREE.Mesh[] = [];
  private readonly mouth: THREE.Mesh;
  private targetJumpOffset = 0;
  private jumpOffset = 0;
  private landingAt = -Infinity;
  private lastUpdate = 0;
  private readonly body: THREE.Mesh;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private label: THREE.Sprite;
  private bubble: THREE.Sprite | null = null;
  private name = '';
  private reactionAt = -Infinity;
  private emotionBadge: THREE.Sprite | null = null;
  private speech: { text: string; emotion: NpcEmotion; at: number; duration: number; shown: boolean } | null = null;
  private targetPos: THREE.Vector3 | null = null;
  private targetYaw = 0;
  private targetPitch = 0;

  constructor(readonly meta: NpcMeta) {
    this.avatar.name = 'avatar'; this.group.add(this.avatar);
    const profile = meta.appearance;
    const skin = cloth(skinTones[(profile?.skin ?? meta.number) % skinTones.length]);
    const hair = cloth(hairTones[(profile?.hair ?? meta.number) % hairTones.length]);
    const dark = cloth('#303c43');
    const shoe = cloth('#4b5556');
    const trim = cloth('#f7f2e9');
    this.bodyMaterial = cloth(meta.color);
    const add = (parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    // Feet, trousers and the tapered jacket create a clear silhouette even from the rear row.
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 0.14, 0.62, 0); this.avatar.add(leg); this.legs.push(leg);
      add(leg, new THREE.CapsuleGeometry(0.095, 0.34, 3, 7), dark, 0, -0.27, 0);
      add(leg, new THREE.BoxGeometry(0.21, 0.12, 0.33), shoe, 0, -0.525, 0.09);
      const arm = new THREE.Group(); arm.position.set(side * 0.34, 1.32, 0); this.avatar.add(arm); this.arms.push(arm);
      const sleeve = add(arm, new THREE.CapsuleGeometry(0.105, 0.38, 3, 7), this.bodyMaterial, side * 0.04, -0.28, 0);
      sleeve.rotation.z = side * 0.16;
      add(arm, new THREE.SphereGeometry(0.105, 9, 7), skin, side * 0.08, -0.61, 0.02);
    }
    this.body = add(this.avatar, new THREE.CylinderGeometry(0.32, 0.39, 0.76, 12), this.bodyMaterial, 0, 1.07, 0);
    add(this.avatar, new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10), skin, 0, 1.5, 0);
    this.head.position.y = 1.75;
    add(this.head, new THREE.SphereGeometry(0.245, 16, 12), skin, 0, 0, 0);
    const hairCap = add(this.head, new THREE.SphereGeometry(0.251, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.49), hair, 0, 0.025, 0);
    hairCap.scale.z = (profile?.hair ?? 0) % 2 ? 1.08 : 0.97;
    if ((profile?.hair ?? 0) === 2) {
      add(this.head, new THREE.SphereGeometry(0.17, 10, 8), hair, 0.17, 0.22, -0.08);
    }
    const eye = cloth('#34343a');
    for (const side of [-1, 1]) {
      add(this.head, new THREE.SphereGeometry(0.016, 7, 6), eye, side * 0.083, 0.005, 0.231);
      this.brows.push(add(this.head, new THREE.BoxGeometry(0.065, 0.014, 0.016), hair, side * 0.083, 0.055, 0.236));
    }
    this.mouth = add(this.head, new THREE.BoxGeometry(0.065, 0.012, 0.012), cloth('#986b62'), 0, -0.1, 0.229);
    this.avatar.add(this.head);

    const style = profile?.style ?? 'casual';
    if (style === 'sport') {
      add(this.avatar, new THREE.BoxGeometry(0.52, 0.09, 0.025), trim, 0, 1.24, 0.32);
      add(this.avatar, new THREE.BoxGeometry(0.09, 0.33, 0.025), trim, 0, 1.02, 0.335);
    } else if (style === 'tech') {
      add(this.avatar, new THREE.BoxGeometry(0.49, 0.075, 0.025), dark, 0, 1.25, 0.31);
      add(this.avatar, new THREE.BoxGeometry(0.13, 0.1, 0.03), trim, 0.18, 1.02, 0.33);
    } else if (style === 'creative') {
      add(this.avatar, new THREE.TorusGeometry(0.1, 0.025, 5, 12), trim, 0, 1.33, 0.29);
      add(this.avatar, new THREE.SphereGeometry(0.055, 8, 6), dark, -0.2, 1.07, 0.33);
    } else if (style === 'smart' || style === 'polished') {
      for (const side of [-1, 1]) {
        const lapel = add(this.avatar, new THREE.BoxGeometry(0.14, 0.38, 0.025), style === 'smart' ? trim : dark, side * 0.13, 1.2, 0.305);
        lapel.rotation.z = side * 0.26;
      }
      add(this.avatar, new THREE.SphereGeometry(0.027, 7, 6), trim, 0, 0.99, 0.36);
    } else {
      add(this.avatar, new THREE.BoxGeometry(0.37, 0.055, 0.025), trim, 0, 1.34, 0.285);
    }
    const accessory = profile?.accessory;
    if (accessory === 'glasses') {
      for (const side of [-1, 1]) add(this.head, new THREE.TorusGeometry(0.066, 0.012, 5, 12), dark, side * 0.09, 0.005, 0.235);
      add(this.head, new THREE.BoxGeometry(0.05, 0.014, 0.025), dark, 0, 0.012, 0.242);
    } else if (accessory === 'headphones') {
      add(this.head, new THREE.TorusGeometry(0.26, 0.028, 6, 20, Math.PI), dark, 0, 0.06, 0);
      for (const side of [-1, 1]) add(this.head, new THREE.BoxGeometry(0.07, 0.17, 0.13), dark, side * 0.26, 0.02, 0);
    } else if (accessory === 'beanie') {
      add(this.head, new THREE.SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.53), this.bodyMaterial, 0, 0.1, 0);
    } else if (accessory === 'cap') {
      add(this.head, new THREE.CylinderGeometry(0.23, 0.24, 0.13, 14), this.bodyMaterial, 0, 0.22, 0);
      add(this.head, new THREE.BoxGeometry(0.36, 0.035, 0.2), this.bodyMaterial, 0, 0.18, 0.21);
    }
    this.name = meta.number > 0 ? npcLabel(meta) : meta.name;
    this.label = this.text(this.name, false);
    this.label.position.y = 2.31; this.avatar.add(this.label);
  }
  setName(name: string) {
    const next = name;
    if (next === this.name) return;
    this.name = next; this.removeSprite(this.label);
    this.label = this.text(next, false); this.label.position.y = 2.31; this.avatar.add(this.label);
  }
  setTargetPose(x: number, y: number, z: number, yaw: number, pitch: number, seated: boolean, jumpOffset = 0) {
    this.targetJumpOffset = seated ? 0 : Math.max(0, Math.min(JUMP_HEIGHT, jumpOffset));
    if (seated) { this.jumpOffset = 0; this.landingAt = -Infinity; }
    if (!this.targetPos) {
      this.targetPos = new THREE.Vector3(x, y, z);
      this.group.position.set(x, y, z);
      this.group.rotation.y = yaw;
      this.head.rotation.x = pitch;
    } else {
      this.targetPos.set(x, y, z);
      if (this.group.position.distanceTo(this.targetPos) > 3.0) {
        this.group.position.copy(this.targetPos);
      }
    }
    this.targetYaw = yaw;
    this.targetPitch = pitch;
    this.body.position.y = seated ? 0.85 : 1.07;
    this.head.position.y = seated ? 1.50 : 1.75;
    this.label.position.y = seated ? 2.06 : 2.31;
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
    this.avatar.position.y = this.jumpOffset - dip;
    this.avatar.rotation.set(pose.lean, 0, pose.sway);
    this.avatar.scale.set(1 + dip * 0.4, 1 - dip, 1 + dip * 0.4);
    this.legs.forEach(leg => { leg.rotation.x = -0.5 * tuck; });
    this.arms.forEach((arm, i) => {
      arm.rotation.x = -0.8 * tuck + (i ? pose.rightX : pose.leftX) * (1 - tuck);
      arm.rotation.z = (i ? 1 : -1) * 0.5 * tuck + (i ? pose.rightZ : pose.leftZ) * (1 - tuck);
    });
    this.head.rotation.x = THREE.MathUtils.damp(this.head.rotation.x, this.targetPitch + pose.headX, 18, dt);
    this.head.rotation.z = pose.headZ;
    this.brows.forEach((brow, i) => { brow.rotation.z = (i ? -1 : 1) * pose.brow; });
    this.mouth.scale.y = 1 + pose.mouthOpen * 5;
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
    const age = now - this.reactionAt;
    this.bodyMaterial.emissive.set('#f6b84b');
    this.bodyMaterial.emissiveIntensity = age < 2400 ? (0.5 + Math.sin(age / 110) * 0.5) * 0.45 : 0;
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
