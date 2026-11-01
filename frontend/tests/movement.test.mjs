import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import { PerspectiveCamera, Vector3 } from 'three';
// Load the actual TypeScript modules without maintaining a second implementation.
function moduleUrl(path) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const linked = source.replace(/from ['"]([^'"]+)['"]/g, (_, spec) => `from '${spec.startsWith('.') ? moduleUrl(resolve(dirname(path), spec + '.ts')) : import.meta.resolve(spec)}'`);
  return 'data:text/javascript;base64,' + Buffer.from(linked).toString('base64');
}
const load = p => import(moduleUrl(resolve('src/scene', p + '.ts')));
const { walk } = await load('movement');
const { previewScene } = await import(moduleUrl(resolve('tests/fixtures/previewScene.ts')));
const { CameraController } = await load('CameraController');
const empty = () => ({ ...structuredClone(previewScene), room: { width: 20, depth: 24, height: 7, walls: [], obstacles: [], platforms: [], ramps: [] } });
test('walls and thin furniture stop a long movement without tunneling', () => {
  const scene = empty(); scene.room.obstacles.push({ id: 'table', center: { x: 0, y: .6, z: 0 }, size: { x: 2, y: 1.2, z: .1 } });
  const p = walk({ x: 0, y: 0, z: 2 }, 0, -6, scene);
  assert.ok(p.z >= .35 - 1e-6);
  assert.ok(walk({ x: 0, y: 0, z: 3 }, 100, 0, scene).x <= 9.7);
});
test('both tiers are reachable via ramps, including the sideways platform seam and return', () => {
  let p = { x: 8, y: 0, z: 1 };
  p = walk(p, 0, -5, previewScene); assert.ok(Math.abs(p.y - .6) < .01);
  const lower = walk(p, -2, 0, previewScene); assert.ok(lower.x < 7 && Math.abs(lower.y - .6) < .01);
  p = walk(p, 0, -3, previewScene); assert.ok(Math.abs(p.y - 1.5) < .01);
  const upper = walk(p, -2, 0, previewScene); assert.ok(upper.x < 7 && Math.abs(upper.y - 1.5) < .01);
  p = walk(p, 0, 8, previewScene); assert.ok(Math.abs(p.y) < .01 && p.z > 0);
});
test('platform faces cannot be climbed and tier edges cannot be walked off', () => {
  const p = walk({ x: 1, y: 0, z: 0 }, 0, -5, previewScene); assert.equal(p.y, 0); assert.ok(p.z > -2.5);
  const edge = walk({ x: 1, y: .6, z: -3 }, 0, 4, previewScene); assert.equal(edge.y, .6); assert.ok(edge.z <= -2.5);
});
function harness(scene = previewScene) {
  globalThis.document = new EventTarget(); globalThis.window = new EventTarget();
  const canvas = new EventTarget(); canvas.focus = () => { document.activeElement = canvas; }; canvas.blur = () => { document.activeElement = null; }; canvas.focus();
  const camera = new PerspectiveCamera();
  const calls = []; const poses = []; let hint = '';
  const client = { send: async (...args) => { calls.push(args); }, setPose: (...args) => { poses.push(args); }, syncPose: () => {} };
  const controller = new CameraController(camera, canvas, client, scene, value => { hint = value; }, assert.fail);
  controller.setEnabled(true);
  const key = (code, type = 'keydown') => { const event = new Event(type, { cancelable: true }); Object.assign(event, { code }); document.dispatchEvent(event); };
  const mouse = (movementX, movementY) => {
    document.pointerLockElement = canvas;
    const event = new Event('mousemove'); Object.assign(event, { movementX, movementY }); document.dispatchEvent(event);
  };
  document.exitPointerLock = () => { document.pointerLockElement = null; };
  return { controller, camera, calls, poses, key, mouse, hint: () => hint };
}
test('WASD moves camera, normalizes diagonals, and freezes for UI/blur/Escape', () => {
  const h = harness(); h.controller.syncPose({ position: { x: 0, y: 0, z: 9 }, yaw: 0, pitch: 0, seatId: null, seq: 0, mode: 'walking' });
  h.key('KeyW'); h.key('KeyD'); h.controller.update(100); h.controller.update(200);
  assert.ok(Math.abs(Math.hypot(h.camera.position.x, h.camera.position.z - 9) - .125) < .01);
  h.controller.setEnabled(false); const before = h.camera.position.clone(); h.controller.update(300); assert.deepEqual(h.camera.position, before);
  h.controller.setEnabled(true); h.key('KeyW'); window.dispatchEvent(new Event('blur')); h.controller.update(400); assert.deepEqual(h.camera.position, before);
  h.key('KeyW'); h.key('Escape'); h.controller.update(500); assert.deepEqual(h.camera.position, before); h.controller.dispose();
});
test('walking follows camera yaw for forward, strafe, backward, and keeps pitch horizontal', () => {
  const h = harness();
  h.controller.syncPose({ position: { x: 0, y: 0, z: 9 }, yaw: Math.PI / 2, pitch: Math.PI / 4, seatId: null, seq: 0, mode: 'walking' });
  h.key('KeyW'); h.controller.update(100); h.controller.update(200);
  assert.ok(Math.abs(h.camera.position.x - .125) < .01);
  assert.ok(Math.abs(h.camera.position.z - 9) < .001);
  h.key('KeyW', 'keyup'); h.key('KeyD'); h.controller.update(300);
  assert.ok(Math.abs(h.camera.position.x - .125) < .01);
  assert.ok(Math.abs(h.camera.position.z - 9.125) < .01);
  h.key('KeyD', 'keyup'); h.key('KeyS'); h.controller.update(400);
  assert.ok(Math.abs(h.camera.position.x) < .01);
  assert.ok(Math.abs(h.camera.position.z - 9.125) < .01);
  h.controller.dispose();
});
test('walking continues in the viewed direction beyond the seated turn limit', () => {
  const h = harness();
  h.controller.syncPose({ position: { x: 0, y: 0, z: 9 }, yaw: Math.PI * 3 / 4, pitch: 0, seatId: null, seq: 0, mode: 'walking' });
  h.key('KeyW'); h.controller.update(100); h.controller.update(200);
  assert.ok(h.camera.position.x > .08);
  assert.ok(h.camera.position.z > 9.08);
  assert.ok(Math.abs(h.poses.at(-1)[1] - Math.PI * 3 / 4) < .001);
  h.controller.dispose();
});
test('WASD and diagonals match the real camera across a full turn and pitch limits', () => {
  const h = harness(empty());
  const directions = [
    [['KeyW'], 0, -1], [['KeyS'], 0, 1], [['KeyA'], -1, 0], [['KeyD'], 1, 0],
    [['KeyW', 'KeyD'], 1, -1], [['KeyW', 'KeyA'], -1, -1],
    [['KeyS', 'KeyD'], 1, 1], [['KeyS', 'KeyA'], -1, 1],
  ];
  let now = 100; h.controller.update(now);
  for (let step = -8; step <= 8; step++) for (const pitch of [-Math.PI / 3, 0, Math.PI / 3]) {
    for (const [keys, right, back] of directions) {
      h.controller.syncPose({ position: { x: 0, y: 0, z: 0 }, yaw: step * Math.PI / 4, pitch, seatId: null, seq: 0, mode: 'walking' });
      keys.forEach(code => h.key(code));
      h.controller.update(now += 50);
      keys.forEach(code => h.key(code, 'keyup'));
      // Camera-local X/Z measures what the player sees, independent of controller angle conventions.
      const local = h.camera.position.clone().setY(0).applyQuaternion(h.camera.quaternion.clone().invert());
      assert.ok(Math.abs(local.x - right / Math.hypot(right, back) * .125) < 1e-9);
      assert.ok(Math.abs(local.z / Math.cos(pitch) - back / Math.hypot(right, back) * .125) < 1e-9);
      assert.ok(Math.abs(Math.hypot(h.camera.position.x, h.camera.position.z) - .125) < 1e-9);
      assert.equal(h.camera.position.y, 1.65);
    }
  }
  h.controller.dispose();
});
test('mouse and arrow look directions agree, including after yaw wraps', () => {
  for (const [arrow, dx, dy, axis, sign] of [
    ['ArrowLeft', -30, 0, 'x', -1], ['ArrowRight', 30, 0, 'x', 1],
    ['ArrowUp', 0, -20, 'y', 1], ['ArrowDown', 0, 20, 'y', -1],
  ]) {
    const h = harness(empty());
    const reset = () => h.controller.syncPose({ position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, seatId: null, seq: 0, mode: 'walking' });
    reset(); h.key(arrow);
    const arrowDirection = h.camera.getWorldDirection(new Vector3());
    reset(); h.mouse(dx, dy);
    const mouseDirection = h.camera.getWorldDirection(new Vector3());
    assert.ok(mouseDirection[axis] * sign > 0, `${arrow}: mouse must look in the same direction`);
    assert.ok(mouseDirection.distanceTo(arrowDirection) < 1e-9);
    h.controller.dispose();
  }
  const h = harness(empty());
  h.controller.syncPose({ position: { x: 0, y: 0, z: 0 }, yaw: Math.PI - .01, pitch: 0, seatId: null, seq: 0, mode: 'walking' });
  h.key('KeyW'); h.controller.update(100);
  for (let i = 0; i < 110; i++) {
    const before = h.camera.position.clone();
    h.mouse(30, i % 2 ? -20 : 20);
    const viewed = h.camera.getWorldDirection(new Vector3()).setY(0).normalize();
    h.controller.update(150 + i * 50);
    const moved = h.camera.position.clone().sub(before);
    assert.ok(moved.distanceTo(viewed.multiplyScalar(.125)) < 1e-9);
  }
  h.controller.dispose();
});
test('E requests a free nearby seat and waits for server confirmation', async () => {
  const h = harness(); h.controller.syncPose({ position: { x: 0, y: 0, z: 7.3 }, yaw: 0, pitch: 0, seatId: null, seq: 0, mode: 'walking' });
  h.controller.setOccupied(['seat-2']); h.key('KeyE'); assert.equal(h.calls.length, 0);
  h.controller.setOccupied([]); h.key('KeyE'); assert.equal(h.calls[0][0], 'SitDown'); assert.equal(h.camera.position.y, 1.65);
  await Promise.resolve();
  h.controller.syncPose({ position: { x: 0, y: 0, z: 6 }, yaw: 0, pitch: 0, seatId: 'seat-2', seq: 0, mode: 'seated' });
  assert.equal(h.camera.position.y, 1.2); h.key('KeyE'); assert.equal(h.calls[1][0], 'StandUp'); h.controller.dispose();
});
test('server pose corrects predicted movement and walking can turn past seated limit', () => {
  const h = harness(); h.controller.syncPose({ position: { x: 0, y: 0, z: 9 }, yaw: 0, pitch: 0, seatId: null, seq: 0, mode: 'walking' });
  for (let i = 0; i < 40; i++) h.key('ArrowRight');
  assert.ok(Math.abs(h.poses.at(-1)[1]) > Math.PI * 2 / 3);
  h.controller.syncPose({ position: { x: 1, y: 0, z: 8 }, yaw: 0, pitch: 0, seatId: null, seq: 1, mode: 'walking' });
  assert.equal(h.camera.position.x, 1); h.controller.dispose();
});
test('jury tables leave a clear view above the seated eye height', () => {
  for (const box of previewScene.room.obstacles.filter(b => b.id.startsWith('table-'))) {
    assert.ok(box.center.y + box.size.y / 2 < 1.15);
  }
});
