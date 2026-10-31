import type { PerspectiveCamera } from 'three';
import type { GameClient, Pose, Vec3 } from '../shared/types';
import { UI } from '../shared/config';

/** Camera and keyboard controls. The server confirms every pose. */
export class CameraController {
  private yaw = 0;
  private pitch = 0;
  private position: Vec3 = { x: 0, y: 0, z: 5 };
  private mode: Pose['mode'] = 'walking';
  private enabled = true;
  private keys = new Set<string>();
  private lastFrame = 0;
  constructor(private readonly camera: PerspectiveCamera, private readonly canvas: HTMLCanvasElement, private readonly client: GameClient) {
    canvas.addEventListener('click', this.lock);
    document.addEventListener('mousemove', this.move);
    document.addEventListener('keydown', this.keyDown);
    document.addEventListener('keyup', this.keyUp);
    document.addEventListener('pointerlockerror', this.lockError);
  }
  private lock = () => {
    if (!this.enabled) return;
    this.canvas.focus();
    try { const result = this.canvas.requestPointerLock(); if (result) void result.catch(this.lockError); }
    catch { this.lockError(); }
  };
  private lockError = () => { this.canvas.title = 'Захват мыши недоступен. Используйте стрелки для поворота.'; };
  private move = (event: MouseEvent) => {
    if (this.enabled && document.pointerLockElement === this.canvas) this.rotate(event.movementX * UI.MOUSE_SENSITIVITY, event.movementY * UI.MOUSE_SENSITIVITY);
  };
  private keyDown = (event: KeyboardEvent) => {
    if (!this.enabled || (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName))) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD'].includes(event.code)) {
      event.preventDefault(); this.keys.add(event.code);
      if (event.code.startsWith('Arrow')) this.rotate(event.code === 'ArrowLeft' ? -0.06 : event.code === 'ArrowRight' ? 0.06 : 0, event.code === 'ArrowUp' ? -0.04 : event.code === 'ArrowDown' ? 0.04 : 0);
    }
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private rotate(dx: number, dy: number) {
    const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
    this.yaw = clamp(this.yaw + dx, UI.CAMERA_LIMIT);
    this.pitch = clamp(this.pitch + dy, Math.PI / 3);
    this.apply();
  }
  syncPose(pose: Pose) {
    this.position = { ...pose.position }; this.mode = pose.mode; this.yaw = pose.yaw; this.pitch = pose.pitch;
    this.client.syncPose(pose); this.apply();
  }
  differsFrom(pose: Pose) {
    return Math.hypot(this.position.x - pose.position.x, this.position.y - pose.position.y, this.position.z - pose.position.z) > 0.5 || this.mode !== pose.mode;
  }
  update(now: number) {
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0; this.lastFrame = now;
    if (!this.enabled || this.mode !== 'walking' || !dt) return;
    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    const side = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    if (!forward && !side) return;
    const scale = 2 * dt / Math.hypot(forward, side);
    const x = this.position.x + (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side) * scale;
    const z = this.position.z + (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * side) * scale;
    const y = Math.abs(Math.abs(x) - 6.5) <= 0.8 && z >= -4 && z <= 0 ? -z * 0.375 : Math.abs(x) <= 7 && z >= -5.75 && z <= -3.25 ? 1.5 : 0;
    this.position = { x: Math.max(-8.7, Math.min(8.7, x)), y, z: Math.max(-6.7, Math.min(6.7, z)) };
    this.apply();
  }
  private apply() {
    this.camera.position.set(this.position.x, this.position.y + (this.mode === 'seated' ? 1.2 : 1.65), this.position.z);
    this.camera.rotation.set(-this.pitch, -this.yaw, 0, 'YXZ');
    this.client.setPose(this.position, this.yaw, this.pitch);
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled; if (!enabled) this.keys.clear();
    if (!enabled && document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  dispose() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.canvas.removeEventListener('click', this.lock); document.removeEventListener('mousemove', this.move);
    document.removeEventListener('keydown', this.keyDown); document.removeEventListener('keyup', this.keyUp);
    document.removeEventListener('pointerlockerror', this.lockError);
  }
}
