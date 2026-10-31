import * as THREE from 'three';
import type { NpcMeta } from '../shared/types';

const skinTones = ['#e9bd9e', '#c78f6c', '#f0cfb4', '#ad7659', '#dca984'];
const hairTones = ['#332b2a', '#6a4937', '#241f25', '#9b7050'];
const cloth = (color: string, roughness = 0.86) => new THREE.MeshStandardMaterial({ color, roughness });

/** A small, readable character assembled from local geometry. Appearance is public metadata only. */
export class Npc {
  readonly group = new THREE.Group();
  readonly head = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private label: THREE.Sprite;
  private bubble: THREE.Sprite | null = null;
  private name = '';
  private reactionAt = -Infinity;
  private bubbleUntil = 0;
  private targetPos: THREE.Vector3 | null = null;
  private targetYaw = 0;
  private targetPitch = 0;

  constructor(readonly meta: NpcMeta) {
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
      add(this.group, new THREE.CapsuleGeometry(0.095, 0.34, 3, 7), dark, side * 0.14, 0.35, 0);
      add(this.group, new THREE.BoxGeometry(0.21, 0.12, 0.33), shoe, side * 0.14, 0.095, 0.09);
      const arm = add(this.group, new THREE.CapsuleGeometry(0.105, 0.38, 3, 7), this.bodyMaterial, side * 0.38, 1.04, 0);
      arm.rotation.z = side * 0.16;
      add(this.group, new THREE.SphereGeometry(0.105, 9, 7), skin, side * 0.42, 0.71, 0.02);
    }
    this.body = add(this.group, new THREE.CylinderGeometry(0.32, 0.39, 0.76, 12), this.bodyMaterial, 0, 1.07, 0);
    add(this.group, new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10), skin, 0, 1.5, 0);
    this.head.position.y = 1.75;
    add(this.head, new THREE.SphereGeometry(0.245, 16, 12), skin, 0, 0, 0);
    const hairCap = add(this.head, new THREE.SphereGeometry(0.251, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.49), hair, 0, 0.025, 0);
    hairCap.scale.z = (profile?.hair ?? 0) % 2 ? 1.08 : 0.97;
    if ((profile?.hair ?? 0) === 2) {
      add(this.head, new THREE.SphereGeometry(0.17, 10, 8), hair, 0.17, 0.22, -0.08);
    }
    const eye = cloth('#34343a');
    for (const side of [-1, 1]) add(this.head, new THREE.SphereGeometry(0.016, 7, 6), eye, side * 0.083, 0.005, 0.231);
    add(this.head, new THREE.BoxGeometry(0.065, 0.012, 0.012), cloth('#986b62'), 0, -0.1, 0.229);
    this.group.add(this.head);

    const style = profile?.style ?? 'casual';
    if (style === 'sport') {
      add(this.group, new THREE.BoxGeometry(0.52, 0.09, 0.025), trim, 0, 1.24, 0.32);
      add(this.group, new THREE.BoxGeometry(0.09, 0.33, 0.025), trim, 0, 1.02, 0.335);
    } else if (style === 'tech') {
      add(this.group, new THREE.BoxGeometry(0.49, 0.075, 0.025), dark, 0, 1.25, 0.31);
      add(this.group, new THREE.BoxGeometry(0.13, 0.1, 0.03), trim, 0.18, 1.02, 0.33);
    } else if (style === 'creative') {
      add(this.group, new THREE.TorusGeometry(0.1, 0.025, 5, 12), trim, 0, 1.33, 0.29);
      add(this.group, new THREE.SphereGeometry(0.055, 8, 6), dark, -0.2, 1.07, 0.33);
    } else if (style === 'smart' || style === 'polished') {
      for (const side of [-1, 1]) {
        const lapel = add(this.group, new THREE.BoxGeometry(0.14, 0.38, 0.025), style === 'smart' ? trim : dark, side * 0.13, 1.2, 0.305);
        lapel.rotation.z = side * 0.26;
      }
      add(this.group, new THREE.SphereGeometry(0.027, 7, 6), trim, 0, 0.99, 0.36);
    } else {
      add(this.group, new THREE.BoxGeometry(0.37, 0.055, 0.025), trim, 0, 1.34, 0.285);
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
    this.name = meta.name;
    this.label = this.text(this.name, false);
    this.label.position.y = 2.31; this.group.add(this.label);
  }
  setName(name: string) {
    const next = name;
    if (next === this.name) return;
    this.name = next; this.removeSprite(this.label);
    this.label = this.text(next, false); this.label.position.y = 2.31; this.group.add(this.label);
  }
  setTargetPose(x: number, y: number, z: number, yaw: number, pitch: number, seated: boolean) {
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
  say(text: string) {
    if (this.bubble) this.removeSprite(this.bubble);
    this.bubble = this.text(text, true); this.bubble.position.y = 2.91; this.group.add(this.bubble);
    this.bubbleUntil = performance.now() + 6500;
  }
  react(at: number) { this.reactionAt = at; }
  update(now: number) {
    if (this.targetPos) {
      this.group.position.lerp(this.targetPos, 0.22);
      const dyaw = Math.atan2(Math.sin(this.targetYaw - this.group.rotation.y), Math.cos(this.targetYaw - this.group.rotation.y));
      this.group.rotation.y += dyaw * 0.25;
      this.head.rotation.x += (this.targetPitch - this.head.rotation.x) * 0.25;
    }
    const age = now - this.reactionAt;
    this.bodyMaterial.emissive.set('#f6b84b');
    this.bodyMaterial.emissiveIntensity = age < 2400 ? (0.5 + Math.sin(age / 110) * 0.5) * 0.45 : 0;
    if (this.bubble && now > this.bubbleUntil) { this.removeSprite(this.bubble); this.bubble = null; }
  }
  private text(text: string, bubble: boolean) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = bubble ? 192 : 80;
    const context = canvas.getContext('2d')!;
    context.fillStyle = bubble ? '#fffdf7' : '#fffaf0'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#d9cfbd'; context.lineWidth = 5; context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    context.fillStyle = '#34434a'; context.font = bubble
      ? '25px -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif'
      : '600 30px -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif';
    context.textAlign = 'center';
    const words = text.slice(0, 125).split(/\s+/); const lines: string[] = []; let line = '';
    for (const word of words) { if (context.measureText(`${line} ${word}`).width > 465) { lines.push(line); line = word; } else line += `${line ? ' ' : ''}${word}`; }
    lines.push(line);
    lines.slice(0, bubble ? 5 : 1).forEach((value, i) => context.fillText(value, 256, (bubble ? 35 : 50) + i * 31, 470));
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.scale.set(bubble ? 2.8 : 1.55, bubble ? 1.05 : 0.26, 1); return sprite;
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
  private removeSprite(sprite: THREE.Sprite) { this.group.remove(sprite); sprite.material.map?.dispose(); sprite.material.dispose(); }
}
