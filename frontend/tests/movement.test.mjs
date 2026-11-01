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
const { Npc } = await load('Npc');
const { JUMP_HEIGHT } = await load('jump');
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
test('platform faces cannot be climbed from ground without ramp, but tiers can be walked/jumped off to floor without invisible walls', () => {
  const p = walk({ x: 1, y: 0, z: 0 }, 0, -5, previewScene); assert.equal(p.y, 0); assert.ok(p.z > -2.5);
  const edge = walk({ x: 1, y: .6, z: -3 }, 0, 4, previewScene); assert.equal(edge.y, 0); assert.ok(edge.z > -2.5);
});
function harness(scene = previewScene) {
  globalThis.document = new EventTarget(); globalThis.window = new EventTarget();
  const canvas = new EventTarget(); canvas.focus = () => { document.activeElement = canvas; }; canvas.blur = () => { document.activeElement = null; }; canvas.focus();
  const camera = new PerspectiveCamera();
  const calls = []; const poses = []; let hint = '';
  const client = { send: async (...args) => { calls.push(args); }, setPose: (...args) => { poses.push(args); }, syncPose: () => {} };
  const controller = new CameraController(camera, canvas, client, scene, value => { hint = value; }, assert.fail);
  controller.setEnabled(true);
  const key = (code, type = 'keydown', options = {}) => { const event = new Event(type, { cancelable: true }); Object.assign(event, { code, ...options }); document.dispatchEvent(event); return event; };
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

test('Space jumps once per press, sends height separately, and lands without changing the navigation surface', () => {
  const h = harness(empty());
  h.controller.syncPose({ position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, seatId: null, seq: 0, mode: 'walking' });
  h.controller.update(100);
  assert.equal(h.key('Space').defaultPrevented, true);
  let peak = 0;
  for (let now = 110; now <= 1100; now += 10) {
    h.controller.update(now);
    peak = Math.max(peak, h.camera.position.y - 1.65);
    assert.equal(h.poses.at(-1)[0].y, 0);
    assert.ok(h.poses.at(-1)[3] >= 0 && h.poses.at(-1)[3] <= JUMP_HEIGHT);
    h.key('Space', 'keydown', { repeat: true });
  }
  assert.ok(Math.abs(peak - JUMP_HEIGHT) < .001);
  assert.equal(h.camera.position.y, 1.65);
  h.key('Space'); h.controller.update(1110); assert.equal(h.camera.position.y, 1.65);
  h.key('Space', 'keyup'); h.key('Space'); h.controller.update(1120);
  assert.ok(h.camera.position.y > 1.65);
  h.controller.dispose();
});

test('jumping preserves camera-relative movement and settles even when controls lose focus', () => {
  const h = harness(empty());
  h.controller.syncPose({ position: { x: 0, y: 0, z: 0 }, yaw: Math.PI / 2, pitch: Math.PI / 3, seatId: null, seq: 0, mode: 'walking' });
  h.controller.update(100); h.key('KeyW'); h.key('Space');
  h.controller.update(150);
  assert.ok(Math.abs(h.camera.position.x - .125) < 1e-9);
  assert.ok(h.camera.position.y > 1.65);
  h.controller.setEnabled(false); window.dispatchEvent(new Event('blur'));
  assert.equal(h.key('Space').defaultPrevented, false);
  for (let now = 200; now <= 1200; now += 50) h.controller.update(now);
  assert.ok(Math.abs(h.camera.position.x - .125) < 1e-9);
  assert.equal(h.camera.position.y, 1.65);
  assert.equal(h.poses.at(-1)[3], 0);
  h.controller.dispose();
});

test('jump cannot start seated, from unfocused input, or with shortcuts, and sitting waits for landing', () => {
  const h = harness();
  const pose = { position: { x: 0, y: 0, z: 7.3 }, yaw: 0, pitch: 0, seatId: null, seq: 0, mode: 'walking' };
  h.controller.syncPose(pose); h.controller.update(100);
  document.activeElement = null;
  assert.equal(h.key('Space').defaultPrevented, false);
  h.controller.update(150); assert.equal(h.camera.position.y, 1.65);
  h.key('Escape'); h.controller.dispose();
  const s = harness();
  s.controller.syncPose({ ...pose, seatId: 'seat-2', mode: 'seated' }); s.controller.update(100);
  s.key('Space'); s.controller.update(150); assert.equal(s.camera.position.y, 1.2);
  s.controller.syncPose(pose); s.key('Space', 'keyup');
  assert.equal(s.key('Space', 'keydown', { ctrlKey: true }).defaultPrevented, false);
  s.controller.update(200); assert.equal(s.camera.position.y, 1.65);
  s.key('Space'); s.controller.update(250); s.key('KeyE'); assert.equal(s.calls.length, 0);
  s.controller.syncPose({ ...pose, mode: 'seated', seatId: 'seat-2' });
  assert.equal(s.camera.position.y, 1.2); assert.equal(s.poses.at(-1)[3], 0);
  s.controller.dispose();
});

test('jump on an upper platform lands at the same height and retains collision checks', () => {
  const scene = empty();
  scene.room.platforms = [{ id: 'tier', center: { x: 0, y: .75, z: 0 }, size: { x: 8, y: 1.5, z: 8 } }];
  scene.room.walls = [{ id: 'wall', center: { x: 0, y: 3, z: -1 }, size: { x: 8, y: 6, z: .1 } }];
  const h = harness(scene);
  h.controller.syncPose({ position: { x: 0, y: 1.5, z: 0 }, yaw: 0, pitch: 0, seatId: null, seq: 0, mode: 'walking' });
  h.controller.update(100); h.key('Space'); h.key('KeyW');
  for (let now = 150; now <= 1150; now += 50) h.controller.update(now);
  assert.equal(h.camera.position.y, 3.15);
  assert.ok(h.camera.position.z >= -.65 - 1e-6);
  assert.equal(h.poses.at(-1)[0].y, 1.5);
  h.controller.dispose();
});

test('other players rise, tuck limbs and animate landing without moving their ground position', () => {
  globalThis.document = { createElement: () => ({ getContext: () => ({
    fillRect() {}, strokeRect() {}, fillText() {}, measureText: text => ({ width: text.length * 12 }),
  }) }) };
  const player = new Npc({ id: 'judge', number: 0, name: 'Игрок', color: '#dfbf63', anchorId: '' });
  player.setTargetPose(0, 1.5, 0, 0, 0, false);
  player.update(100);
  const avatar = player.group.getObjectByName('avatar');
  const rest = avatar.children.map(child => child.quaternion.clone());
  player.setTargetPose(0, 1.5, 0, 0, 0, false, JUMP_HEIGHT);
  for (let now = 150; now <= 350; now += 50) player.update(now);
  assert.ok(avatar.position.y > .8);
  assert.equal(player.group.position.y, 1.5);
  assert.ok(avatar.children.some((child, i) => child.quaternion.angleTo(rest[i]) > .2));
  player.setTargetPose(0, 1.5, 0, 0, 0, false, 0);
  let landingDipSeen = false;
  for (let now = 400; now <= 1200; now += 10) { player.update(now); landingDipSeen ||= avatar.position.y < 0; }
  assert.ok(landingDipSeen);
  assert.equal(avatar.position.y, 0);
  assert.equal(avatar.scale.y, 1);
  assert.equal(player.group.position.y, 1.5);
  player.setTargetPose(0, 1.5, 0, 0, 0, true, JUMP_HEIGHT); player.update(1250);
  assert.equal(avatar.position.y, 0);
  player.dispose();
});


const liveStudioSpec = {
  version: '1',
  room: {
    width: 18, depth: 14, height: 6,
    platforms: [{ id: 'upper', center: { x: 0, y: 1.35, z: -4.5 }, size: { x: 14, y: 0.3, z: 2.5 } }],
    ramps: [
      { id: 'left-ramp', from: { x: -6.5, y: 0, z: 0 }, to: { x: -6.5, y: 1.5, z: -4 }, width: 1.3 },
      { id: 'right-ramp', from: { x: 6.5, y: 0, z: 0 }, to: { x: 6.5, y: 1.5, z: -4 }, width: 1.3 },
    ],
    obstacles: [],
    walls: [
      { id: 'back', center: { x: 0, y: 3, z: -7 }, size: { x: 18, y: 6, z: 0.3 } },
      { id: 'front', center: { x: 0, y: 3, z: 7 }, size: { x: 18, y: 6, z: 0.3 } },
      { id: 'left', center: { x: -9, y: 3, z: 0 }, size: { x: 0.3, y: 6, z: 14 } },
      { id: 'right', center: { x: 9, y: 3, z: 0 }, size: { x: 0.3, y: 6, z: 14 } },
    ],
  },
  npcStands: Array.from({ length: 10 }, (_, n) => ({
    id: `anchor-${n + 1}`,
    position: {
      x: (n + 1 <= 5 ? n + 1 - 3 : n + 1 - 8) * 2.1 + (n + 1 <= 5 ? 0 : 0.45),
      y: n + 1 <= 5 ? 0 : 1.5,
      z: n + 1 <= 5 ? -2.5 : -5,
    },
    yaw: 0,
    level: n + 1 <= 5 ? 0 : 1,
  })),
  playerSeats: Array.from({ length: 8 }, (_, n) => ({
    id: `seat-${n + 1}`,
    position: { x: (n + 1 - 4.5) * 1.6, y: 0, z: 3.5 },
    yaw: 0,
    exit: { x: (n + 1 - 4.5) * 1.6, y: 0, z: 5 },
  })),
  spawnPoints: [{ x: 0, y: 0, z: 5 }],
};

test('upper floor ramp has no invisible wall: player walks smoothly up to the upper platform and back down', () => {
  // Ascend left ramp: start at base of ramp (z = 0.5), walk forward towards upper tier
  let p = { x: -6.5, y: 0, z: 0.5 };
  p = walk(p, 0, -5, liveStudioSpec);
  // Reached the upper platform without being blocked by invisible wall at -2.95!
  assert.ok(p.z <= -4.2, `Expected player on upper platform (z <= -4.2), got z=${p.z}`);
  assert.ok(Math.abs(p.y - 1.5) < 0.05, `Expected upper platform height 1.5, got y=${p.y}`);

  // Walk around on upper platform
  p = walk(p, 2, 0, liveStudioSpec);
  assert.ok(Math.abs(p.y - 1.5) < 0.05, `Expected height on platform to remain 1.5, got y=${p.y}`);

  // Return to ramp and walk back down to the ground
  p = walk({ x: -6.5, y: 1.5, z: -4.5 }, 0, 6, liveStudioSpec);
  assert.ok(p.z > 0.2, `Expected player to descend to ground floor, got z=${p.z}`);
  assert.ok(Math.abs(p.y) < 0.05, `Expected ground height 0, got y=${p.y}`);

  // Ascend right ramp (x = 6.5)
  let pRight = { x: 6.5, y: 0, z: 0.5 };
  pRight = walk(pRight, 0, -5, liveStudioSpec);
  assert.ok(pRight.z <= -4.2, `Expected player on upper platform via right ramp, got z=${pRight.z}`);
  assert.ok(Math.abs(pRight.y - 1.5) < 0.05);

  // Directly walking into the platform face where there is NO ramp (e.g. x = 0) is still blocked
  const faceHit = walk({ x: 0, y: 0, z: -1 }, 0, -5, liveStudioSpec);
  assert.equal(faceHit.y, 0, 'Cannot step onto upper platform without ramp');
  assert.ok(faceHit.z > -3.25, `Expected blocked in front of platform, got z=${faceHit.z}`);
});

test('jumping from ramp towards AIs has no invisible walls and lands cleanly', () => {
  // Start on left ramp at x = -6.5, y = 1.125, z = -3.0
  // Jump towards lower AIs in the center (x = -4.2, z = -2.5)
  const jumpOffset = 0.5;
  const jumpLower = walk({ x: -6.5, y: 1.125, z: -3.0 }, 2.0, 0.5, liveStudioSpec, [], jumpOffset);
  assert.ok(jumpLower.x > -5.0, `Expected jump to advance towards AIs in X, got x=${jumpLower.x}`);
  assert.ok(jumpLower.z > -2.8, `Expected jump to advance towards AIs in Z, got z=${jumpLower.z}`);
  assert.equal(jumpLower.y, 0, 'Lands cleanly on ground floor');

  // Jump from ramp onto upper platform towards upper tier AIs
  const jumpUpper = walk({ x: -6.5, y: 1.125, z: -3.5 }, 2.0, -1.0, liveStudioSpec, [], jumpOffset);
  assert.ok(jumpUpper.x > -5.0, `Expected jump onto upper platform in X, got x=${jumpUpper.x}`);
  assert.ok(jumpUpper.z < -4.0, `Expected jump onto upper platform in Z, got z=${jumpUpper.z}`);
  assert.ok(Math.abs(jumpUpper.y - 1.5) < 0.05, 'Lands on upper platform at y=1.5');

  // Walking sideways off ramp steps down to floor without hitting invisible wall
  const stepOff = walk({ x: -6.5, y: 0.75, z: -2.0 }, 1.5, 0, liveStudioSpec);
  assert.ok(stepOff.x > -5.5, `Expected player stepped off ramp, got x=${stepOff.x}`);
  assert.equal(stepOff.y, 0, 'Dropped to ground floor after leaving ramp');
});

test('chairs provide solid collision: walking into seats is blocked and slides', () => {
  // Seat 1 is at x = -5.6, y = 0, z = 3.5. Player starts in front at z = 5.0
  const start = { x: -5.6, y: 0, z: 5.0 };
  const walked = walk(start, 0, -3, liveStudioSpec);
  // Chair depth is 0.72 (from 3.14 to 3.86) + PLAYER_RADIUS (0.3) -> player stops at z >= 4.14
  assert.ok(walked.z >= 4.14, `Expected player blocked in front of chair, got z=${walked.z}`);
  assert.equal(walked.y, 0);

  // Diagonal walk slides past the chair
  const slide = walk(start, 1.5, -3, liveStudioSpec);
  assert.ok(slide.x > start.x, 'Player slides sideways around chair');
  assert.ok(slide.z < start.z, 'Player advances past chair after sliding');
});

test('NPC models on both tiers provide solid collision', () => {
  // Lower tier NPC 3 is at x = 0, y = 0, z = -2.5
  const startLower = { x: 0, y: 0, z: -1.0 };
  const hitLower = walk(startLower, 0, -3, liveStudioSpec);
  // NPC size is 0.7 (from -2.85 to -2.15) + PLAYER_RADIUS (0.3) -> stops at z >= -1.86
  assert.ok(hitLower.z >= -1.86, `Expected player blocked by lower NPC, got z=${hitLower.z}`);

  // Upper tier NPC 8 is at x = 0.45, y = 1.5, z = -5.0
  const startUpper = { x: 0.45, y: 1.5, z: -4.1 };
  const hitUpper = walk(startUpper, 0, -2, liveStudioSpec);
  assert.ok(hitUpper.z >= -4.36, `Expected player blocked by upper tier NPC, got z=${hitUpper.z}`);
  assert.ok(Math.abs(hitUpper.y - 1.5) < 0.05);
});

test('dynamic other player models (judges) provide collision', () => {
  const otherJudge = {
    id: 'player-judge-2',
    center: { x: 2, y: 0.9, z: 1 },
    size: { x: 0.6, y: 1.8, z: 0.6 },
  };
  const start = { x: 2, y: 0, z: 3 };
  const walked = walk(start, 0, -4, liveStudioSpec, [otherJudge]);
  // Judge center at z = 1, size = 0.6 (from 0.7 to 1.3) + PLAYER_RADIUS (0.3) -> stops at z >= 1.58
  assert.ok(walked.z >= 1.58, `Expected blocked by other player model, got z=${walked.z}`);
});
