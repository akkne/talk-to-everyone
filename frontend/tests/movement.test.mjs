import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
// Load the actual TypeScript modules without maintaining a second implementation.
function moduleUrl(path) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const linked = source.replace(/from ['"](\.[^'"]+)['"]/g, (_, spec) => `from '${moduleUrl(resolve(dirname(path), spec + '.ts'))}'`);
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
function harness() {
  globalThis.document = new EventTarget(); globalThis.window = new EventTarget();
  const canvas = new EventTarget(); canvas.focus = () => { document.activeElement = canvas; }; canvas.blur = () => { document.activeElement = null; }; canvas.focus();
  const camera = { position: { set(x, y, z) { Object.assign(this, { x, y, z }); } }, rotation: { set(x, y) { Object.assign(this, { x, y }); } } };
  const calls = []; const poses = []; let hint = '';
  const client = { send: async (...args) => { calls.push(args); }, setPose: (...args) => { poses.push(args); }, syncPose: () => {} };
  const controller = new CameraController(camera, canvas, client, previewScene, value => { hint = value; }, assert.fail);
  controller.setEnabled(true);
  const key = (code, type = 'keydown') => { const event = new Event(type, { cancelable: true }); Object.assign(event, { code }); document.dispatchEvent(event); };
  return { controller, camera, calls, poses, key, hint: () => hint };
}
test('WASD moves camera, normalizes diagonals, and freezes for UI/blur/Escape', () => {
  const h = harness(); h.controller.syncPose({ position: { x: 0, y: 0, z: 9 }, yaw: 0, pitch: 0, seatId: null, seq: 0, mode: 'walking' });
  h.key('KeyW'); h.key('KeyD'); h.controller.update(100); h.controller.update(200);
  assert.ok(Math.abs(Math.hypot(h.camera.position.x, h.camera.position.z - 9) - .125) < .01);
  h.controller.setEnabled(false); const before = { ...h.camera.position }; h.controller.update(300); assert.deepEqual(h.camera.position, before);
  h.controller.setEnabled(true); h.key('KeyW'); window.dispatchEvent(new Event('blur')); h.controller.update(400); assert.deepEqual(h.camera.position, before);
  h.key('KeyW'); h.key('Escape'); h.controller.update(500); assert.deepEqual(h.camera.position, before); h.controller.dispose();
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
