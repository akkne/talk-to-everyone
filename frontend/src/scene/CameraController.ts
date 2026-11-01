import { Vector3, type PerspectiveCamera } from 'three';
import type { GameClient, Pose, Vec3 } from '../shared/types';
import { UI } from '../shared/config';
import { createId } from '../shared/id';
import { C2S } from '../shared/contract';
import { walk, WALK_SPEED } from './movement';
import { jumpHeight, landingDip, JUMP_DURATION, LANDING_DURATION } from './jump';
import type { Box, SceneSpec, SeatSpec } from './world';

/** Camera and keyboard controls. The server confirms every pose. */
export class CameraController {
  private yaw = 0;
  private pitch = 0;
  private position: Vec3 = { x: 0, y: 0, z: 5 };
  private mode: Pose['mode'] = 'walking';
  private seat: SeatSpec | null = null;
  private occupied = new Set<string>();
  private otherPlayers: { id: string; position: Vec3; mode: 'walking' | 'seated' }[] = [];
  private pending = false;
  private enabled = false;
  private keys = new Set<string>();
  private walkForward = new Vector3();
  private walkRight = new Vector3();
  private lastFrame = 0;
  private jumpElapsed: number | null = null;
  private jumpOffset = 0;
  private landingElapsed = LANDING_DURATION;
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
  private lockError = () => { this.canvas.title = 'Нажмите на сцену: WASD — ходьба, Space — прыжок, стрелки — обзор.'; };
  private focused() { return this.enabled && (document.pointerLockElement === this.canvas || document.activeElement === this.canvas); }
  private move = (event: MouseEvent) => {
    if (this.enabled && document.pointerLockElement === this.canvas) this.rotate(event.movementX * UI.MOUSE_SENSITIVITY, event.movementY * UI.MOUSE_SENSITIVITY);
  };
  private keyDown = (event: KeyboardEvent) => {
    if (event.code === 'Escape') { this.clearKeys(); this.canvas.blur(); return; }
    if (!this.focused() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD','KeyE','Space'].includes(event.code)) {
      const held = this.keys.has(event.code);
      event.preventDefault(); this.keys.add(event.code);
      if (event.code.startsWith('Arrow')) this.rotate(event.code === 'ArrowLeft' ? -0.06 : event.code === 'ArrowRight' ? 0.06 : 0, event.code === 'ArrowUp' ? -0.04 : event.code === 'ArrowDown' ? 0.04 : 0);
      if (event.code === 'KeyE' && !event.repeat) void this.toggleSeat();
      if (event.code === 'Space' && !held && !event.repeat && this.mode === 'walking' && this.jumpElapsed === null && !this.pending) {
        this.jumpElapsed = 0; this.landingElapsed = LANDING_DURATION;
      }
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
    this.jumpElapsed = null; this.jumpOffset = 0; this.landingElapsed = LANDING_DURATION;
    this.position = { ...pose.position }; this.mode = pose.mode; this.yaw = pose.yaw; this.pitch = pose.pitch;
    this.seat = this.scene.playerSeats.find(s => s.id === pose.seatId) ?? null;
    this.client.syncPose(pose); this.apply();
  }
  differsFrom(pose: Pose) {
    return Math.hypot(this.position.x - pose.position.x, this.position.y - pose.position.y, this.position.z - pose.position.z) > 0.5 || this.mode !== pose.mode;
  }
  setOtherPlayers(players: { id: string; position: Vec3; mode: 'walking' | 'seated' }[]) {
    this.otherPlayers = players;
  }
  update(now: number) {
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0; this.lastFrame = now;
    this.onHint(!this.enabled ? '' : this.seat ? 'E — встать' : `WASD — ходьба · Space — прыжок · Мышь — обзор${this.nearestSeat() ? ' · E — сесть' : ''}`);
    if (this.mode !== 'walking' || !dt) return;
    // Finish a jump even if focus is lost or a panel opens mid-air.
    const animating = this.jumpElapsed !== null || this.landingElapsed < LANDING_DURATION;
    if (this.jumpElapsed !== null) {
      this.jumpElapsed += dt;
      this.jumpOffset = jumpHeight(this.jumpElapsed);
      if (this.jumpElapsed >= JUMP_DURATION) { this.landingElapsed = this.jumpElapsed - JUMP_DURATION; this.jumpElapsed = null; }
    } else this.landingElapsed = Math.min(LANDING_DURATION, this.landingElapsed + dt);
    if (animating) this.apply();
    if (!this.focused()) return;
    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    const side = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    if (!forward && !side) return;
    const scale = WALK_SPEED * dt / Math.hypot(forward, side);
    // Use the rendered camera basis so WASD stays aligned with the view after every turn.
    // Normalize on the floor plane so looking up/down never changes walking speed or height.
    this.camera.getWorldDirection(this.walkForward).setY(0).normalize();
    this.walkRight.setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    const dx = (forward * this.walkForward.x + side * this.walkRight.x) * scale;
    const dz = (forward * this.walkForward.z + side * this.walkRight.z) * scale;
    const dynamicObstacles: Box[] = this.otherPlayers.map(p => ({
      id: `player-${p.id}`,
      center: { x: p.position.x, y: p.position.y + (p.mode === 'seated' ? 0.6 : 0.9), z: p.position.z },
      size: p.mode === 'seated' ? { x: 0.65, y: 1.2, z: 0.65 } : { x: 0.6, y: 1.8, z: 0.6 },
    }));
    this.position = walk(this.position, dx, dz, this.scene, dynamicObstacles);
    this.apply();
  }
  private nearestSeat() {
    return this.scene.playerSeats.filter(s => !this.occupied.has(s.id))
      .map(seat => ({ seat, distance: Math.hypot(seat.position.x - this.position.x, seat.position.y - this.position.y, seat.position.z - this.position.z) }))
      .filter(item => item.distance <= 1.5).sort((a, b) => a.distance - b.distance)[0]?.seat;
  }
  private async toggleSeat() {
    if (this.pending || this.jumpElapsed !== null) return;
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
    const eyeHeight = this.mode === 'seated' ? 1.2 : 1.65 + this.jumpOffset - landingDip(this.landingElapsed);
    this.camera.position.set(this.position.x, this.position.y + eyeHeight, this.position.z);
    this.camera.rotation.set(-this.pitch, -this.yaw, 0, 'YXZ');
    this.client.setPose(this.position, this.yaw, this.pitch, this.jumpOffset);
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
