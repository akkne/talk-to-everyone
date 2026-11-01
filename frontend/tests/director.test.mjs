import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadModule } from './helpers/modules.mjs';

const { walk } = await loadModule('src/scene/movement.ts');
const scene = JSON.parse(readFileSync('../backend/Maps/hangar.json'));
const director = scene.ambientNPCs.find(npc => npc.type === 'human-director');
const near = { name: 'Артём', position: { ...director.position, x: director.position.x - 1.5 } };

test('the director is reachable from the equipment entrance without blocking the doorway', () => {
  const open = structuredClone(scene);
  open.doors[0].open = true;
  let p = walk({ x: 9, y: 0, z: 7.2 }, 3.5, 0, open);
  p = walk(p, 0, -1.2, open);
  assert.ok(p.x > 12 && p.z < 6.1, JSON.stringify(p));
  assert.ok(Math.hypot(p.x - director.position.x, p.z - director.position.z) <= 2);
  assert.ok(walk(p, 3, 0, open).x < director.position.x - .5);
  const laptop = open.objects.find(prop => prop.id === 'director-laptop');
  assert.equal(laptop.type, 'laptop');
  assert.equal(laptop.position.y, open.objects.find(prop => prop.id === 'director-desk').size.y);
});

const { sampleDirector } = await loadModule('src/scene/director.ts');
const { createProp } = await loadModule('src/scene/props.ts');
const { syncLocationProps } = await loadModule('src/scene/props.ts');
const { Scene: ThreeScene } = await import('three');
const { applyGameEvent, useGameStore } = await loadModule('src/store/gameStore.ts');
const { S2C } = await loadModule('src/shared/contract.ts');
const run = { triggeredAt: 1000, startedAt: 1000, speech: 'Тест', foodId: 'food-0', takeAtMs: 5000, finishedMs: 8000, steps: [
  { atMs: 0, position: { x: 14.3, y: 0, z: 6 }, yaw: 0, seated: true, laptopOpen: 1, action: 'close' },
  { atMs: 1000, position: { x: 14.3, y: 0, z: 6 }, yaw: 0, seated: false, laptopOpen: 0, action: 'stand' },
  { atMs: 2000, position: { x: 14.3, y: 0, z: 6 }, yaw: -Math.PI / 2, seated: false, laptopOpen: 0, action: 'walk' },
  { atMs: 4000, position: { x: 12.5, y: 0, z: 6 }, yaw: 0, seated: false, laptopOpen: 0, action: 'take' },
  { atMs: 8000, position: { x: 14.3, y: 0, z: 6 }, yaw: 0, seated: true, laptopOpen: 1, action: 'work' },
] };

test('server timeline interpolates walking and laptop lid, returns seated and supports late snapshots', () => {
  assert.equal(sampleDirector(run, 1500).laptopOpen, .5);
  assert.equal(sampleDirector(run, 2500).laptopOpen, 0);
  assert.equal(sampleDirector(run, 4000).position.x, 13.4);
  assert.equal(sampleDirector(run, 20_000).action, 'work');
  assert.equal(sampleDirector(run, 20_000).seated, true);
  assert.equal(sampleDirector(run, 20_000).laptopOpen, 1);
});

test('laptop lid keeps a separate hinge and server pickup hides food on every client', () => {
  const laptop = createProp({ id: 'laptop', type: 'laptop', position: { x: 0, y: 0, z: 0 }, size: { x: .7, y: .43, z: .48 } });
  const hinge = laptop.getObjectByName('laptop-hinge');
  assert.ok(hinge?.children.length >= 2);
  hinge.rotation.x = -Math.PI / 2;
  assert.equal(hinge.children[1].parent, hinge);
  const world = new ThreeScene();
  const food = new ThreeScene(); food.name = 'food-0'; world.add(food);
  useGameStore.setState({ scene: structuredClone(scene) });
  const foods = scene.foods.map(f => ({ ...f, eaten: f.id === 'food-0' }));
  applyGameEvent(S2C.LOCATION_STATE, { doors: scene.doors, foods, directorRun: run });
  syncLocationProps(world, useGameStore.getState().scene);
  assert.equal(food.visible, false);
  applyGameEvent(S2C.LOCATION_STATE, { doors: scene.doors, foods });
  assert.equal(useGameStore.getState().scene.directorRun, run);
});

test('location updates move predicted director collision away from the empty chair', async () => {
  const { CameraController } = await loadModule('src/scene/CameraController.ts');
  const { buildSceneObstacles } = await loadModule('src/scene/movement.ts');
  const local = structuredClone(scene);
  CameraController.prototype.syncLocation.call({ scene: local }, { ...scene, directorRun: run });
  assert.equal(local.directorRun, run);
  const originalNow = Date.now;
  Date.now = () => 4000;
  try {
    const obstacle = buildSceneObstacles(local).find(b => b.id === 'npc-equipment-director');
    assert.equal(obstacle.center.x, 13.4);
    assert.notEqual(obstacle.center.x, director.position.x);
  } finally { Date.now = originalNow; }
});
