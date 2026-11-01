import * as THREE from 'three';
import type { NpcMeta, PlayerAvatar } from '../shared/types';
import { npcLabel } from '../shared/npcLabel';
import { JUMP_HEIGHT, landingDip } from './jump';
import { EMOTIONS, EMOTION_LEAD_MS, normalizeEmotion, speechDuration, type NpcEmotion } from '../shared/dialogue';
import { expressionPose } from './expression';

const skinTones = ['#e9bd9e', '#c78f6c', '#f0cfb4', '#ad7659', '#dca984'];
const hairTones = ['#332b2a', '#6a4937', '#241f25', '#9b7050'];
const cloth = (color: string, roughness = 0.86) => new THREE.MeshStandardMaterial({ color, roughness });

/** A small, readable character assembled from local geometry. Supports customizable avatars or procedural NPC styles. */
export class Npc {
  readonly group = new THREE.Group();
  readonly head = new THREE.Group();
  private readonly avatar = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly knees: THREE.Group[] = [];
  private hasChair = false;
  private seatedAmount = 0;
  private readonly arms: THREE.Group[] = [];
  private readonly brows: THREE.Mesh[] = [];
  private mouth: THREE.Mesh;
  private targetJumpOffset = 0;
  private jumpOffset = 0;
  private landingAt = -Infinity;
  private lastUpdate = 0;
  private readonly body: THREE.Mesh;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly skinMaterial: THREE.MeshStandardMaterial;
  private readonly hairMaterial: THREE.MeshStandardMaterial;
  private readonly hairGroup = new THREE.Group();
  private readonly eyesGroup = new THREE.Group();
  private readonly mouthGroup = new THREE.Group();
  private readonly accessoryGroup = new THREE.Group();
  private readonly styleGroup = new THREE.Group();
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
  private currentAvatar?: PlayerAvatar;

  constructor(readonly meta: NpcMeta) {
    this.currentAvatar = meta.avatar;
    this.avatar.name = 'avatar'; this.group.add(this.avatar);
    const profile = meta.appearance;
    const initialSkin = meta.avatar?.skinTone ?? skinTones[(profile?.skin ?? meta.number) % skinTones.length];
    const initialHair = meta.avatar?.hairColor ?? hairTones[(profile?.hair ?? meta.number) % hairTones.length];
    const initialBody = meta.avatar?.bodyColor ?? meta.color;

    this.skinMaterial = cloth(initialSkin);
    this.hairMaterial = cloth(initialHair);
    this.bodyMaterial = cloth(initialBody);

    const dark = cloth('#303c43');
    const shoe = cloth('#4b5556');
    const add = (parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };

    // Feet, trousers and arms
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 0.14, 0.62, 0); this.avatar.add(leg); this.legs.push(leg);
      add(leg, new THREE.CapsuleGeometry(0.095, 0.08, 3, 7), dark, 0, -0.135, 0);
      const knee = new THREE.Group(); knee.position.y = -0.27; leg.add(knee); this.knees.push(knee);
      add(knee, new THREE.CapsuleGeometry(0.095, 0.08, 3, 7), dark, 0, -0.135, 0);
      add(knee, new THREE.BoxGeometry(0.21, 0.12, 0.33), shoe, 0, -0.255, 0.09);
      const arm = new THREE.Group(); arm.position.set(side * 0.34, 1.32, 0); this.avatar.add(arm); this.arms.push(arm);
      const sleeve = add(arm, new THREE.CapsuleGeometry(0.105, 0.38, 3, 7), this.bodyMaterial, side * 0.04, -0.28, 0);
      sleeve.rotation.z = side * 0.16;
      add(arm, new THREE.SphereGeometry(0.105, 9, 7), this.skinMaterial, side * 0.08, -0.61, 0.02);
    }

    this.body = add(this.avatar, new THREE.CylinderGeometry(0.32, 0.39, 0.76, 12), this.bodyMaterial, 0, 1.07, 0);
    add(this.avatar, new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10), this.skinMaterial, 0, 1.5, 0);

    this.head.position.y = 1.75;
    add(this.head, new THREE.SphereGeometry(0.245, 16, 12), this.skinMaterial, 0, 0, 0);

    this.head.add(this.hairGroup);
    this.head.add(this.eyesGroup);
    this.head.add(this.mouthGroup);
    this.head.add(this.accessoryGroup);
    this.avatar.add(this.styleGroup);
    this.avatar.add(this.head);

    // Initial placeholder mouth so this.mouth is always non-null
    this.mouth = add(this.mouthGroup, new THREE.BoxGeometry(0.065, 0.012, 0.012), cloth('#986b62'), 0, -0.1, 0.229);

    this.rebuildAvatar();

    this.name = meta.number > 0 ? npcLabel(meta) : meta.name;
    this.label = this.text(this.name, false);
    this.label.position.y = 2.31; this.avatar.add(this.label);
  }

  /** <summary>Updates customized avatar parts (body color, hairstyle, eyes, mouth, skin, accessory).</summary> */
  updateAvatar(avatar?: PlayerAvatar) {
    this.currentAvatar = avatar;
    this.rebuildAvatar();
  }

  private rebuildAvatar() {
    const avatar = this.currentAvatar;
    const profile = this.meta.appearance;

    const bodyCol = avatar?.bodyColor ?? this.meta.color;
    const skinCol = avatar?.skinTone ?? skinTones[(profile?.skin ?? this.meta.number) % skinTones.length];
    const hairCol = avatar?.hairColor ?? hairTones[(profile?.hair ?? this.meta.number) % hairTones.length];

    this.bodyMaterial.color.set(bodyCol);
    this.skinMaterial.color.set(skinCol);
    this.hairMaterial.color.set(hairCol);

    this.rebuildHair(avatar?.hairStyle ?? (profile?.hair === 2 ? 'bun' : 'short'));
    this.rebuildEyes(avatar?.eyes ?? 'dots');
    this.rebuildMouth(avatar?.mouth ?? 'smile');
    this.rebuildAccessories(avatar?.accessory ?? profile?.accessory ?? 'none');
    this.rebuildStyle(profile?.style ?? 'casual');
  }

  private rebuildHair(style: string) {
    this.hairGroup.clear();
    const add = (geom: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geom, this.hairMaterial);
      mesh.position.set(x, y, z);
      if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
      this.hairGroup.add(mesh);
      return mesh;
    };

    if (style === 'bald') return;

    if (style === 'spiky') {
      add(new THREE.SphereGeometry(0.248, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), 0, 0.02, 0);
      for (let i = 0; i < 5; i++) {
        const z = -0.1 + i * 0.055;
        const angle = -0.15 + i * 0.08;
        add(new THREE.ConeGeometry(0.042, 0.13, 5), 0, 0.23, z, angle, 0, 0);
      }
    } else if (style === 'bob') {
      add(new THREE.SphereGeometry(0.251, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), 0, 0.025, 0);
      for (const side of [-1, 1]) {
        add(new THREE.BoxGeometry(0.065, 0.22, 0.16), side * 0.21, -0.04, 0.02);
      }
      add(new THREE.BoxGeometry(0.36, 0.18, 0.08), 0, -0.04, -0.18);
    } else if (style === 'bun') {
      add(new THREE.SphereGeometry(0.251, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.49), 0, 0.025, 0);
      add(new THREE.SphereGeometry(0.1, 12, 10), 0, 0.24, -0.12);
    } else if (style === 'afro') {
      add(new THREE.SphereGeometry(0.31, 16, 12), 0, 0.06, -0.02);
    } else {
      // default short
      const cap = add(new THREE.SphereGeometry(0.251, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.49), 0, 0.025, 0);
      cap.scale.z = (this.meta.appearance?.hair ?? 0) % 2 ? 1.08 : 0.97;
    }
  }

  private rebuildEyes(style: string) {
    this.eyesGroup.clear();
    this.brows.length = 0;
    const eyeMat = cloth('#34343a');
    const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const visorMat = new THREE.MeshStandardMaterial({
      color: '#06b6d4',
      emissive: '#06b6d4',
      emissiveIntensity: 0.65,
      roughness: 0.2,
    });

    const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, y, z);
      this.eyesGroup.add(mesh);
      return mesh;
    };

    if (style === 'visor') {
      add(new THREE.BoxGeometry(0.26, 0.04, 0.035), visorMat, 0, 0.01, 0.235);
      for (const side of [-1, 1]) {
        this.brows.push(add(new THREE.BoxGeometry(0.065, 0.014, 0.016), this.hairMaterial, side * 0.083, 0.055, 0.236));
      }
      return;
    }

    for (const side of [-1, 1]) {
      if (style === 'wide') {
        add(new THREE.SphereGeometry(0.028, 10, 8), eyeMat, side * 0.083, 0.008, 0.228);
        add(new THREE.SphereGeometry(0.009, 6, 6), glintMat, side * 0.076, 0.018, 0.246);
        this.brows.push(add(new THREE.BoxGeometry(0.065, 0.014, 0.016), this.hairMaterial, side * 0.083, 0.062, 0.236));
      } else if (style === 'focused') {
        const slit = add(new THREE.BoxGeometry(0.052, 0.01, 0.018), eyeMat, side * 0.083, 0.005, 0.233);
        slit.rotation.z = side * -0.08;
        const brow = add(new THREE.BoxGeometry(0.068, 0.015, 0.016), this.hairMaterial, side * 0.083, 0.048, 0.236);
        brow.rotation.z = side * -0.16;
        this.brows.push(brow);
      } else if (style === 'wink') {
        if (side === -1) {
          add(new THREE.SphereGeometry(0.026, 9, 7), eyeMat, -0.083, 0.008, 0.23);
          add(new THREE.SphereGeometry(0.008, 5, 5), glintMat, -0.076, 0.017, 0.246);
        } else {
          const wink = add(new THREE.BoxGeometry(0.052, 0.008, 0.018), eyeMat, 0.083, 0.005, 0.234);
          wink.rotation.z = -0.1;
        }
        this.brows.push(add(new THREE.BoxGeometry(0.065, 0.014, 0.016), this.hairMaterial, side * 0.083, 0.055, 0.236));
      } else {
        // default dots
        add(new THREE.SphereGeometry(0.016, 7, 6), eyeMat, side * 0.083, 0.005, 0.231);
        this.brows.push(add(new THREE.BoxGeometry(0.065, 0.014, 0.016), this.hairMaterial, side * 0.083, 0.055, 0.236));
      }
    }
  }

  private rebuildMouth(style: string) {
    this.mouthGroup.clear();
    const mouthMat = cloth('#986b62');
    const teethMat = cloth('#ffffff');

    const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, y, z);
      if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
      this.mouthGroup.add(mesh);
      return mesh;
    };

    if (style === 'smile') {
      this.mouth = add(new THREE.BoxGeometry(0.04, 0.012, 0.012), mouthMat, 0, -0.1, 0.229);
      for (const side of [-1, 1]) {
        add(new THREE.BoxGeometry(0.028, 0.012, 0.012), mouthMat, side * 0.026, -0.095, 0.228, 0, 0, side * 0.24);
      }
    } else if (style === 'grin') {
      this.mouth = add(new THREE.BoxGeometry(0.085, 0.025, 0.012), mouthMat, 0, -0.098, 0.228);
      add(new THREE.BoxGeometry(0.075, 0.013, 0.014), teethMat, 0, -0.094, 0.23);
    } else if (style === 'surprised') {
      this.mouth = add(new THREE.TorusGeometry(0.022, 0.007, 6, 12), mouthMat, 0, -0.098, 0.23);
    } else if (style === 'smirk') {
      this.mouth = add(new THREE.BoxGeometry(0.055, 0.012, 0.012), mouthMat, 0.02, -0.092, 0.229, 0, 0, 0.25);
    } else {
      // default neutral
      this.mouth = add(new THREE.BoxGeometry(0.065, 0.012, 0.012), mouthMat, 0, -0.1, 0.229);
    }
  }

  private rebuildAccessories(accessory: string) {
    this.accessoryGroup.clear();
    const dark = cloth('#303c43');

    const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, y, z);
      if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
      this.accessoryGroup.add(mesh);
      return mesh;
    };

    if (accessory === 'glasses') {
      for (const side of [-1, 1]) add(new THREE.TorusGeometry(0.066, 0.012, 5, 12), dark, side * 0.09, 0.005, 0.235);
      add(new THREE.BoxGeometry(0.05, 0.014, 0.025), dark, 0, 0.012, 0.242);
    } else if (accessory === 'headphones') {
      add(new THREE.TorusGeometry(0.26, 0.028, 6, 20, Math.PI), dark, 0, 0.06, 0);
      for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.07, 0.17, 0.13), dark, side * 0.26, 0.02, 0);
    } else if (accessory === 'beanie') {
      add(new THREE.SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.53), this.bodyMaterial, 0, 0.1, 0);
    } else if (accessory === 'cap') {
      add(new THREE.CylinderGeometry(0.23, 0.24, 0.13, 14), this.bodyMaterial, 0, 0.22, 0);
      add(new THREE.BoxGeometry(0.36, 0.035, 0.2), this.bodyMaterial, 0, 0.18, 0.21);
    }
  }

  private rebuildStyle(style: string) {
    this.styleGroup.clear();
    const trim = cloth('#f7f2e9');
    const dark = cloth('#303c43');

    const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, y, z);
      if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
      this.styleGroup.add(mesh);
      return mesh;
    };

    if (style === 'sport') {
      add(new THREE.BoxGeometry(0.52, 0.09, 0.025), trim, 0, 1.24, 0.32);
      add(new THREE.BoxGeometry(0.09, 0.33, 0.025), trim, 0, 1.02, 0.335);
    } else if (style === 'tech') {
      add(new THREE.BoxGeometry(0.49, 0.075, 0.025), dark, 0, 1.25, 0.31);
      add(new THREE.BoxGeometry(0.13, 0.1, 0.03), trim, 0.18, 1.02, 0.33);
    } else if (style === 'creative') {
      add(new THREE.TorusGeometry(0.1, 0.025, 5, 12), trim, 0, 1.33, 0.29);
      add(new THREE.SphereGeometry(0.055, 8, 6), dark, -0.2, 1.07, 0.33);
    } else if (style === 'smart' || style === 'polished') {
      for (const side of [-1, 1]) {
        add(new THREE.BoxGeometry(0.14, 0.38, 0.025), style === 'smart' ? trim : dark, side * 0.13, 1.2, 0.305, 0, 0, side * 0.26);
      }
      add(new THREE.SphereGeometry(0.027, 7, 6), trim, 0, 0.99, 0.36);
    } else {
      add(new THREE.BoxGeometry(0.37, 0.055, 0.025), trim, 0, 1.34, 0.285);
    }
  }

  enableChair() {
    this.hasChair = true;
    this.seatedAmount = 1;
    this.update(performance.now());
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
  react(at: number) { this.reactionAt = at; }
  say(text: string, emotion: string | null, startedAt: number) {
    const mood = normalizeEmotion(emotion);
    this.speech = { text, emotion: mood, at: startedAt, duration: speechDuration(text), shown: false };
    if (this.bubble) { this.removeSprite(this.bubble); this.bubble = null; }
    if (this.emotionBadge) { this.removeSprite(this.emotionBadge); this.emotionBadge = null; }
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#1b2b1f'; context.fillRect(0, 0, 128, 128);
    context.strokeStyle = '#dfbf63'; context.lineWidth = 8; context.strokeRect(4, 4, 120, 120);
    context.fillStyle = '#ffffff';
    context.font = '76px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; context.textAlign = 'center';
    context.fillText(EMOTIONS[mood].emoji, 64, 92);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    this.emotionBadge = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, opacity: 0 }));
    this.emotionBadge.name = 'npc-emotion';
    this.emotionBadge.userData.emotion = mood;
    this.emotionBadge.scale.set(0.65, 0.65, 1);
    this.emotionBadge.position.y = this.label.position.y + 0.45;
    this.emotionBadge.renderOrder = 2; this.avatar.add(this.emotionBadge);
  }
  stopSpeaking() {
    this.speech = null;
    if (this.bubble) { this.removeSprite(this.bubble); this.bubble = null; }
    if (this.emotionBadge) { this.removeSprite(this.emotionBadge); this.emotionBadge = null; }
  }
  /** <summary>Displays or removes a 3D microphone icon above a speaking judge avatar.</summary> */
  setVoiceSpeaking(speaking: boolean) {
    if (this.voiceSpeaking === speaking) return;
    this.voiceSpeaking = speaking;
    if (speaking) {
      if (this.voiceMicBadge) return;
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
    } else {
      if (!this.voiceMicBadge) return;
      this.removeSprite(this.voiceMicBadge);
      this.voiceMicBadge = null;
    }
  }
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
    if (this.hasChair) this.seatedAmount = THREE.MathUtils.damp(this.seatedAmount, speech ? 0 : 1, 14, dt);
    const seated = this.seatedAmount;
    this.avatar.position.y = this.jumpOffset - dip - seated * 0.1;
    this.avatar.position.z = this.hasChair ? (1 - seated) * 0.65 : 0;
    this.avatar.rotation.set(pose.lean, 0, pose.sway);
    this.avatar.scale.set(1 + dip * 0.4, 1 - dip, 1 + dip * 0.4);
    this.legs.forEach(leg => { leg.rotation.x = -0.5 * tuck - seated * Math.PI / 2; });
    this.knees.forEach(knee => { knee.rotation.x = seated * Math.PI / 2; });
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
    if (this.voiceMicBadge) {
      const pulse = Math.sin(Math.max(0, now) / 140) * 0.035;
      this.voiceMicBadge.position.y = this.label.position.y + 0.38 + pulse * 0.5;
      this.voiceMicBadge.scale.setScalar(0.45 + pulse);
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
