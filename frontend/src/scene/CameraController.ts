import type { PerspectiveCamera } from 'three';
import type { GameClient, Pose, Vec3 } from '../shared/types';
import { UI } from '../shared/config';
import { createId } from '../shared/id';
import { C2S } from '../shared/contract';
import { walk, WALK_SPEED } from './movement';
import type { SceneSpec, SeatSpec } from './world';

/** Camera and keyboard controls. The server confirms every pose. */
export class CameraController {
  private yaw = 0;
  private pitch = 0;
  private position: Vec3 = { x: 0, y: 0, z: 5 };
  private mode: Pose['mode'] = 'walking';
  private seat: SeatSpec | null = null;
  private occupied = new Set<string>();
  private pending = false;
  private enabled = false;
  private keys = new Set<string>();
  private lastFrame = 0;
  constructor(private readonly camera: PerspectiveCamera, private readonly canvas: HTMLCanvasElement, private readonly client: GameClient,
    private readonly scene: SceneSpec, private readonly onHint: (hint: string) => void, private readonly onError: (message: string) => void) {
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
  private focused() { return this.enabled && (document.pointerLockElement === this.canvas || document.activeElement === this.canvas); }
  private move = (event: MouseEvent) => {
    if (this.enabled && document.pointerLockElement === this.canvas) this.rotate(event.movementX * UI.MOUSE_SENSITIVITY, -event.movementY * UI.MOUSE_SENSITIVITY);
  };
  private keyDown = (event: KeyboardEvent) => {
    if (event.code === 'Escape') { this.clearKeys(); this.canvas.blur(); return; }
    if (!this.focused() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD','KeyE'].includes(event.code)) {
      event.preventDefault(); this.keys.add(event.code);
      if (event.code.startsWith('Arrow')) this.rotate(event.code === 'ArrowLeft' ? -0.06 : event.code === 'ArrowRight' ? 0.06 : 0, event.code === 'ArrowUp' ? -0.04 : event.code === 'ArrowDown' ? 0.04 : 0);
      if (event.code === 'KeyE' && !event.repeat) void this.toggleSeat();
    }
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private clearKeys = () => { this.keys.clear(); };
  private rotate(dx: number, dy: number) {
    const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
    this.yaw += dx;
    if (this.seat) {
      const relative = Math.atan2(Math.sin(this.yaw - this.seat.yaw), Math.cos(this.yaw - this.seat.yaw));
      this.yaw = this.seat.yaw + clamp(relative, UI.CAMERA_LIMIT);
    } else this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    this.pitch = clamp(this.pitch + dy, Math.PI / 3);
    this.apply();
  }
  syncPose(pose: Pose) {
    this.position = { ...pose.position }; this.mode = pose.mode; this.yaw = pose.yaw; this.pitch = pose.pitch;
    this.seat = this.scene.playerSeats.find(s => s.id === pose.seatId) ?? null;
    this.client.syncPose(pose); this.apply();
  }
  differsFrom(pose: Pose) {
    return Math.hypot(this.position.x - pose.position.x, this.position.y - pose.position.y, this.position.z - pose.position.z) > 0.5 || this.mode !== pose.mode;
  }
  update(now: number) {
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0; this.lastFrame = now;
    this.onHint(!this.enabled ? '' : this.seat ? 'E — встать' : this.nearestSeat() ? 'E — сесть' : 'Нажмите на сцену · WASD — ходьба · Мышь — обзор');
    if (!this.focused() || this.mode !== 'walking' || !dt) return;
    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    const side = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    if (!forward && !side) return;
    const scale = WALK_SPEED * dt / Math.hypot(forward, side);
    const x = this.position.x + (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side) * scale;
    const z = this.position.z + (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * side) * scale;
    this.position = walk(this.position, x - this.position.x, z - this.position.z, this.scene);
    this.apply();
  }
  private nearestSeat() {
    return this.scene.playerSeats.filter(s => !this.occupied.has(s.id))
      .map(seat => ({ seat, distance: Math.hypot(seat.position.x - this.position.x, seat.position.y - this.position.y, seat.position.z - this.position.z) }))
      .filter(item => item.distance <= 1.5).sort((a, b) => a.distance - b.distance)[0]?.seat;
  }
  private async toggleSeat() {
    if (this.pending) return;
    const next = this.nearestSeat();
    if (!this.seat && !next) return;
    this.pending = true;
    try {
      if (this.seat) await this.client.send(C2S.STAND_UP, { requestId: createId() });
      else await this.client.send(C2S.SIT_DOWN, { requestId: createId(), seatId: next!.id });
    } catch { this.onError('Не удалось изменить посадку. Попробуйте ещё раз.'); }
    finally { this.pending = false; }
  }
  setOccupied(ids: string[]) { this.occupied = new Set(ids); }
  private apply() {
    this.camera.position.set(this.position.x, this.position.y + (this.mode === 'seated' ? 1.2 : 1.65), this.position.z);
    this.camera.rotation.set(-this.pitch, -this.yaw, 0, 'YXZ');
    this.client.setPose(this.position, this.yaw, this.pitch);
  }
  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled; if (!enabled) this.keys.clear();
    if (!enabled && document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  dispose() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.canvas.removeEventListener('click', this.lock); document.removeEventListener('mousemove', this.move);
    document.removeEventListener('keydown', this.keyDown); document.removeEventListener('keyup', this.keyUp);
    document.removeEventListener('pointerlockchange', this.clearKeys);
    window.removeEventListener('blur', this.clearKeys);
    document.removeEventListener('pointerlockerror', this.lockError);
  }
}
