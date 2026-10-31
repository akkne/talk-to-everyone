import type { PerspectiveCamera } from 'three';
import type { GameClient } from '../shared/types';
import { UI } from '../shared/config';

/** <summary>Seated camera with pointer lock and keyboard fallback; transport owns the 10 Hz timer.</summary> */
export class CameraController {
  yaw = 0;
  pitch = 0;
  private enabled = true;
  constructor(private readonly camera: PerspectiveCamera, private readonly canvas: HTMLCanvasElement, private readonly client: GameClient) {
    canvas.addEventListener('click', this.lock);
    document.addEventListener('mousemove', this.move);
    canvas.addEventListener('keydown', this.key);
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
  private key = (event: KeyboardEvent) => {
    if (!this.enabled || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    this.rotate(event.key === 'ArrowLeft' ? -0.06 : event.key === 'ArrowRight' ? 0.06 : 0, event.key === 'ArrowUp' ? -0.04 : event.key === 'ArrowDown' ? 0.04 : 0);
  };
  private rotate(dx: number, dy: number) {
    const clamp = (value: number) => Math.max(-UI.CAMERA_LIMIT, Math.min(UI.CAMERA_LIMIT, value));
    this.yaw = clamp(this.yaw + dx); this.pitch = clamp(this.pitch + dy);
    this.camera.rotation.set(-this.pitch, -this.yaw, 0, 'YXZ');
    this.client.setCamera(this.yaw, this.pitch);
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled && document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  dispose() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.canvas.removeEventListener('click', this.lock); document.removeEventListener('mousemove', this.move);
    this.canvas.removeEventListener('keydown', this.key); document.removeEventListener('pointerlockerror', this.lockError);
  }
}
