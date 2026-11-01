import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Scene } from 'three';
import { loadModule } from './helpers/modules.mjs';

const { nearestInteraction } = await loadModule('src/scene/interactions.ts');
const { setupRoom } = await loadModule('src/scene/setup.ts');
const { syncLocationProps } = await loadModule('src/scene/props.ts');
const sceneSpec = JSON.parse(readFileSync('../backend/Maps/loft_bar_scene.json', 'utf8'));

test('club counter offers food instead of bartender service and syncs its visibility', () => {
  const spec = structuredClone(sceneSpec);
  assert.deepEqual(spec.functionalNPCs.map(npc => npc.id), ['bartender-mark']);
  assert.deepEqual(spec.ambientNPCs, []);
  assert.ok(!spec.interactiveObjects.some(item => item.targetId === 'bar-counter'));
  const position = { x: -7.4, y: 0, z: spec.foods[0].position.z };
  assert.equal(nearestInteraction(spec, position)?.id, 'bar-food');
  assert.match(nearestInteraction(spec, position).hint, /E — взять/);

  const scene = new Scene();
  setupRoom(scene, spec);
  const mesh = scene.getObjectByName('bar-food');
  assert.ok(mesh?.visible);
  spec.foods[0].eaten = true;
  syncLocationProps(scene, spec);
  assert.equal(mesh.visible, false);
  assert.notEqual(nearestInteraction(spec, position)?.id, 'bar-food');
  spec.foods[0].eaten = false;
  syncLocationProps(scene, spec);
  assert.equal(mesh.visible, true);
  assert.equal(nearestInteraction(spec, position)?.id, 'bar-food');
});
