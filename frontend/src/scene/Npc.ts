import * as THREE from 'three';
import type { NpcMeta } from '../shared/types';

/** <summary>A capsule, head and locally rendered text; no downloaded assets.</summary> */
export class Npc {
  readonly group = new THREE.Group();
  readonly head = new THREE.Group();
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private label: THREE.Sprite;
  private bubble: THREE.Sprite | null = null;
  private name = '';
  private reactionAt = -Infinity;
  private bubbleUntil = 0;
  constructor(readonly meta: NpcMeta) {
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: meta.color, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.45, 4, 8), this.bodyMaterial);
    body.position.y = 0.85; this.group.add(body);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), this.bodyMaterial);
    this.head.position.y = 1.48; this.head.add(face); this.group.add(this.head);
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.18), new THREE.MeshStandardMaterial({ color: '#4a3524' }));
    chair.position.set(0, 0.65, -0.25); this.group.add(chair);
    this.label = this.text(`№ ${String(meta.number).padStart(2, '0')}`, false);
    this.label.position.y = 2.08; this.group.add(this.label);
  }
  /** <summary>Eviction replaces the display name with metadata-only numbering.</summary> */
  setName(name?: string) {
    const next = name || `№ ${String(this.meta.number).padStart(2, '0')}`;
    if (next === this.name) return;
    this.name = next; this.removeSprite(this.label);
    this.label = this.text(next, false); this.label.position.y = 2.08; this.group.add(this.label);
  }
  say(text: string) {
    if (this.bubble) this.removeSprite(this.bubble);
    this.bubble = this.text(text, true); this.bubble.position.y = 2.8; this.group.add(this.bubble);
    this.bubbleUntil = performance.now() + 6500;
  }
  react(at: number) { this.reactionAt = at; }
  update(now: number) {
    const age = now - this.reactionAt;
    this.bodyMaterial.emissive.set('#ffcc33');
    this.bodyMaterial.emissiveIntensity = age < 2400 ? (0.5 + Math.sin(age / 110) * 0.5) * 0.7 : 0;
    if (this.bubble && now > this.bubbleUntil) { this.removeSprite(this.bubble); this.bubble = null; }
  }
  /** <summary>Draw plain text into CanvasTexture; never interpret NPC output as HTML.</summary> */
  private text(text: string, bubble: boolean) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = bubble ? 192 : 80;
    const context = canvas.getContext('2d')!;
    context.fillStyle = bubble ? '#ede5cf' : '#171915'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = bubble ? '#2d2a23' : '#e9ddc2'; context.font = bubble ? '25px sans-serif' : '30px sans-serif';
    context.textAlign = 'center';
    const words = text.slice(0, 125).split(/\s+/); const lines: string[] = []; let line = '';
    for (const word of words) { if (context.measureText(`${line} ${word}`).width > 465) { lines.push(line); line = word; } else line += `${line ? ' ' : ''}${word}`; }
    lines.push(line);
    lines.slice(0, bubble ? 5 : 1).forEach((value, i) => context.fillText(value, 256, (bubble ? 35 : 50) + i * 31, 470));
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.scale.set(bubble ? 2.8 : 1.5, bubble ? 1.05 : 0.24, 1); return sprite;
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
