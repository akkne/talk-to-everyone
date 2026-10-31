import type { PerspectiveCamera } from 'three';
import type { GameClient } from '../shared/types';
import { UI } from '../shared/config';
import { createId } from '../shared/id';
import { C2S } from '../shared/contract';
import { walk, WALK_SPEED } from './movement';
import type { Pose, SceneSpec, SeatSpec } from './world';

export class CameraController {
  yaw = 0;
  pitch = 0;
  private enabled = false;
  private keys = new Set<string>();
  private position;
  private seat: SeatSpec | null = null;
  private occupied = new Set<string>();
  private pending = false;
  private seq = 0;
  private acknowledged = -1;
  private history = new Map<number, Pose>();
  private sendAt = 0;
  private lastPose = '';
  private hint = '';
  constructor(private readonly camera: PerspectiveCamera, private readonly canvas: HTMLCanvasElement, private readonly client: GameClient,
    private readonly scene: SceneSpec, private readonly preview: boolean, private readonly onHint: (hint: string) => void,
    private readonly onError: (message: string) => void) {
    this.position = { ...scene.spawnPoints[0] };
    this.applyCamera();
    canvas.addEventListener('click', this.lock);
    document.addEventListener('mousemove', this.move);
    document.addEventListener('keydown', this.keyDown);
    document.addEventListener('keyup', this.keyUp);
    document.addEventListener('pointerlockchange', this.clearKeys);
    window.addEventListener('blur', this.clearKeys);
    document.addEventListener('pointerlockerror', this.lockError);
  }
  private lock = () => {
    if (!this.enabled) return;
    this.canvas.focus();
    try { const result = this.canvas.requestPointerLock(); if (result) void result.catch(this.lockError); }
    catch { this.lockError(); }
  };
  private lockError = () => { this.canvas.title = 'Нажмите на сцену: WASD — ходьба, стрелки — обзор.'; };
  private focused() {
    return this.enabled && (document.pointerLockElement === this.canvas || document.activeElement === this.canvas);
  }
  private move = (event: MouseEvent) => {
    if (this.enabled && document.pointerLockElement === this.canvas) this.rotate(event.movementX * UI.MOUSE_SENSITIVITY, -event.movementY * UI.MOUSE_SENSITIVITY);
  };
  private keyDown = (event: KeyboardEvent) => {
    if (event.code === 'Escape') { this.keys.clear(); this.canvas.blur(); return; }
    if (!this.focused() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyE'].includes(event.code)) {
      event.preventDefault(); this.keys.add(event.code);
      if (event.code === 'KeyE' && !event.repeat) void this.toggleSeat();
    }
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private clearKeys = () => { this.keys.clear(); };
  private rotate(dx: number, dy: number) {
    this.yaw += dx;
    if (this.seat) {
      const relative = Math.atan2(Math.sin(this.yaw - this.seat.yaw), Math.cos(this.yaw - this.seat.yaw));
      this.yaw = this.seat.yaw + Math.max(-UI.CAMERA_LIMIT, Math.min(UI.CAMERA_LIMIT, relative));
    } else this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    this.pitch = Math.max(-Math.PI / 2 + .1, Math.min(Math.PI / 2 - .1, this.pitch + dy));
    this.applyCamera();
  }
  private applyCamera() {
    this.camera.position.set(this.position.x, this.position.y + (this.seat ? 1.15 : 1.65), this.position.z);
    this.camera.rotation.set(this.pitch, -this.yaw, 0, 'YXZ');
  }
  private nearestSeat() {
    return this.scene.playerSeats.filter(s => !this.occupied.has(s.id))
      .map(s => ({ seat: s, distance: Math.hypot(s.position.x - this.position.x, s.position.y - this.position.y, s.position.z - this.position.z) }))
      .filter(s => s.distance <= 1.5).sort((a, b) => a.distance - b.distance)[0]?.seat;
  }
  private async toggleSeat() {
    if (this.pending) return;
    const next = this.nearestSeat();
    if (!this.seat && !next) return;
    if (this.preview) {
      if (this.seat) { this.position = { ...this.seat.exit }; this.seat = null; }
      else if (next) { this.seat = next; this.position = { ...next.position }; this.yaw = next.yaw; this.pitch = 0; }
      this.applyCamera(); return;
    }
    this.pending = true;
    try {
      if (this.seat) await this.client.send(C2S.STAND_UP, { requestId: createId() });
      else await this.client.send(C2S.SIT_DOWN, { requestId: createId(), seatId: next!.id });
    } catch { this.onError('Не удалось изменить посадку. Попробуйте ещё раз.'); }
    finally { this.pending = false; }
  }
  setOccupied(ids: string[]) { this.occupied = new Set(ids); }
  /** Reconcile position against the predicted pose at the acknowledged sequence. */
  reconcile(pose: Pose, reset = false) {
    if (!reset && pose.seq <= this.acknowledged) return;
    const predicted = this.history.get(pose.seq);
    const changedMode = pose.seatId !== (this.seat?.id ?? null);
    if (reset || changedMode || !predicted) this.position = { ...pose.position };
    else this.position = walk(pose.position, this.position.x - predicted.position.x, this.position.z - predicted.position.z, this.scene);
    if (reset || changedMode) { this.yaw = pose.yaw; this.pitch = pose.pitch; this.keys.clear(); }
    this.seat = this.scene.playerSeats.find(s => s.id === pose.seatId) ?? null;
    this.acknowledged = pose.seq; this.seq = Math.max(this.seq, pose.seq);
    for (const seq of this.history.keys()) if (seq <= pose.seq) this.history.delete(seq);
    this.applyCamera();
  }
  update(dt: number, now: number) {
    if (this.focused()) {
      const horizontal = Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft'));
      const vertical = Number(this.keys.has('ArrowUp')) - Number(this.keys.has('ArrowDown'));
      this.rotate(horizontal * dt * 1.8, vertical * dt * 1.3);
      if (!this.seat) {
        const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
        const right = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
        const length = Math.hypot(forward, right) || 1;
        const distance = WALK_SPEED * dt / length;
        this.position = walk(this.position, (Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right) * distance,
          (-Math.cos(this.yaw) * forward + Math.sin(this.yaw) * right) * distance, this.scene);
        this.applyCamera();
      }
    }
    const hint = !this.enabled ? '' : this.seat ? 'E — встать' : this.nearestSeat() ? 'E — сесть' : 'Нажмите на сцену · WASD — ходьба · Мышь — обзор';
    if (hint !== this.hint) { this.hint = hint; this.onHint(hint); }
    if (!this.enabled || this.preview || now - this.sendAt < 100) return;
    const key = JSON.stringify([this.position, this.yaw, this.pitch]);
    if (key === this.lastPose) return;
    this.lastPose = key; this.sendAt = now;
    const pose: Pose = { position: { ...this.position }, yaw: this.yaw, pitch: this.pitch, seq: ++this.seq, mode: this.seat ? 'seated' : 'walking', seatId: this.seat?.id ?? null };
    this.history.set(pose.seq, pose);
    if (this.history.size > 60) this.history.delete(this.history.keys().next().value!);
    void this.client.send(C2S.SEND_POSE, { seq: pose.seq, position: pose.position, yaw: pose.yaw, pitch: pose.pitch }).catch(() => { this.lastPose = ''; });
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) { this.keys.clear(); if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }
  }
  dispose() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.canvas.removeEventListener('click', this.lock); document.removeEventListener('mousemove', this.move);
    document.removeEventListener('keydown', this.keyDown); document.removeEventListener('keyup', this.keyUp);
    document.removeEventListener('pointerlockchange', this.clearKeys); window.removeEventListener('blur', this.clearKeys);
    document.removeEventListener('pointerlockerror', this.lockError);
  }
}
