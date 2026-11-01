import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/modules.mjs';

const { applyGameEvent, resetGame, useGameStore } = await loadModule('src/store/gameStore.ts');
const { S2C } = await loadModule('src/shared/contract.ts');

const npcs = [
  { id: 'friend-a', number: 1, name: 'А', color: '#fff', anchorId: 'anchor-1' },
  { id: 'friend-b', number: 2, name: 'Б', color: '#fff', anchorId: 'anchor-2' },
  { id: 'actor-a', number: 3, name: 'В', color: '#fff', anchorId: 'anchor-3' },
];
const reveal = { trueFriends: [['friend-a', 'friend-b']], actors: ['actor-a'] };
const scoreboard = [{ id: 'player-a', score: 300, title: 'Судья' }];

test('final event restores eliminated NPC metadata and player achievements', () => {
  resetGame();
  applyGameEvent(S2C.GAME_STARTED, { rounds: [], npcs, sceneVersion: 'test' });
  applyGameEvent(S2C.NPCS_REMOVED, { ids: npcs.map(n => n.id), teamScore: 300 });
  assert.equal(useGameStore.getState().npcs.length, 0);
  applyGameEvent(S2C.GAME_ENDED, { reveal, scoreboard, npcs });
  const state = useGameStore.getState();
  assert.equal(state.phase, 'reveal');
  assert.deepEqual(state.npcs.map(n => n.id), npcs.map(n => n.id));
  assert.deepEqual(state.reveal, reveal);
  assert.deepEqual(state.scoreboard, scoreboard);
});
