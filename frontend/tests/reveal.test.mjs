import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/modules.mjs';

const { applyGameEvent, resetGame, useGameStore } = await loadModule('src/store/gameStore.ts');
const { S2C } = await loadModule('src/shared/contract.ts');
const { npcLabel } = await loadModule('src/shared/npcLabel.ts');
const { Npc } = await loadModule('src/scene/Npc.ts');

const npcs = Array.from({ length: 10 }, (_, i) => ({
  id: `npc-${i + 1}`, number: i + 1, name: `Имя ${i + 1}`, color: '#fff', anchorId: `anchor-${i + 1}`,
}));
const reveal = {
  trueFriends: [['npc-1', 'npc-2'], ['npc-3', 'npc-4'], ['npc-5', 'npc-6']],
  actors: ['npc-7', 'npc-8', 'npc-9', 'npc-10'],
};
const scoreboard = [{ id: 'player-a', score: 300, title: 'Судья' }];

test('final event restores all 3 friend pairs and 4 actors after eliminations', () => {
  resetGame();
  applyGameEvent(S2C.GAME_STARTED, { rounds: [], npcs, sceneVersion: 'test' });
  applyGameEvent(S2C.NPCS_REMOVED, { ids: ['npc-1', 'npc-2', 'npc-7', 'npc-8'], teamScore: 300 });
  assert.equal(useGameStore.getState().npcs.length, 6);
  applyGameEvent(S2C.GAME_ENDED, { reveal, scoreboard, npcs });
  const state = useGameStore.getState();
  assert.equal(state.phase, 'reveal');
  assert.equal(state.npcs.length, 10);
  assert.equal(state.reveal.trueFriends.length, 3);
  assert.equal(state.reveal.actors.length, 4);
  assert.deepEqual(state.scoreboard, scoreboard);
});

test('NPC labels use the same number and name format', () => {
  assert.equal(npcLabel(npcs[0]), '[1] Имя 1');
  assert.equal(npcLabel(npcs[9]), '[10] Имя 10');
});

test('model nameplate includes both the number and the name', () => {
  const drawn = [];
  globalThis.document = { createElement: () => ({ getContext: () => ({
    fillRect() {}, strokeRect() {}, fillText(value) { drawn.push(value); },
    measureText(value) { return { width: value.length * 12 }; },
  }) }) };
  const model = new Npc(npcs[0]);
  try { assert.ok(drawn.includes('[1] Имя 1')); }
  finally { model.dispose(); delete globalThis.document; }
});
