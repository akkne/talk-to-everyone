import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadModule } from './helpers/modules.mjs';

const { DirectorGreeting } = await loadModule('src/scene/director.ts');
const { walk } = await loadModule('src/scene/movement.ts');
const scene = JSON.parse(readFileSync('../backend/Maps/hangar.json'));
const director = scene.ambientNPCs.find(npc => npc.type === 'human-director');
const near = { name: 'Артём', position: { ...director.position, x: director.position.x - 1.5 } };

test('director addresses the nearby player and enforces the full 30 second cooldown', () => {
  const greeting = new DirectorGreeting();
  assert.equal(greeting.update(100, near, director.position), 'Артём, вы мешаете мне работать. Отойдите, пожалуйста.');
  assert.equal(greeting.update(30_099, near, director.position), null);
  assert.equal(greeting.update(30_100, { ...near, name: 'Лина' }, director.position), 'Лина, вы мешаете мне работать. Отойдите, пожалуйста.');
});

test('distance and height gate the warning, leaving and returning do not reset its cooldown', () => {
  const greeting = new DirectorGreeting();
  const far = { ...near, position: { ...director.position, x: 9.5 } };
  assert.equal(greeting.update(0, far, director.position), null);
  assert.equal(greeting.update(1, { ...near, position: { ...near.position, y: 2 } }, director.position), null);
  assert.ok(greeting.update(2, near, director.position));
  assert.equal(greeting.update(10_000, far, director.position), null);
  assert.equal(greeting.update(20_000, near, director.position), null);
  assert.ok(greeting.update(30_002, near, director.position));
});

test('the director is reachable from the equipment entrance without blocking the doorway', () => {
  const open = structuredClone(scene);
  open.doors[0].open = true;
  let p = walk({ x: 9, y: 0, z: 7.2 }, 3.5, 0, open);
  p = walk(p, 0, -1.2, open);
  assert.ok(p.x > 12 && p.z < 6.1, JSON.stringify(p));
  assert.ok(new DirectorGreeting().update(0, { name: 'Игрок', position: p }, director.position));
  assert.ok(walk(p, 3, 0, open).x < director.position.x - .5);
  const laptop = open.objects.find(prop => prop.id === 'director-laptop');
  assert.equal(laptop.type, 'laptop');
  assert.equal(laptop.position.y, open.objects.find(prop => prop.id === 'director-desk').size.y);
});
