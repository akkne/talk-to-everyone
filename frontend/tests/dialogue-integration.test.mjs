import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/modules.mjs';

const { applyGameEvent, tickDialogue, resetGame, useGameStore } = await loadModule('src/store/gameStore.ts');
const { S2C } = await loadModule('src/shared/contract.ts');
const { EMOTIONS, EMOTION_LEAD_MS, speechDuration } = await loadModule('src/shared/dialogue.ts');
const { Npc } = await loadModule('src/scene/Npc.ts');
const { previewScene } = await loadModule('tests/fixtures/previewScene.ts');
const roster = Object.keys(EMOTIONS).map((emotion, i) => ({ id: 'npc-' + i, number: i + 1, name: emotion, color: '#779bc9', anchorId: 'anchor-' + i }));
const message = (i, extra = {}) => ({ id: 'reply-' + i, npc: roster[i % 5].id, text: 'Ответ номер ' + i, emotion: Object.keys(EMOTIONS)[i % 5], inReplyTo: null, at: 100 + i, ...extra });
function start(round = 5) {
  resetGame();
  applyGameEvent(S2C.GAME_STARTED, { rounds: [], npcs: roster, sceneVersion: 'test' });
  applyGameEvent(S2C.ROUND_STARTED, { n: round, phase: round === 5 ? 'debate' : 'interrogation', endsAt: 999999, choiceEndsAt: null });
}
function snapshot(chat) {
  const s = useGameStore.getState();
  return { ...s, me: { id: 'me', role: 'judge' }, scene: previewScene, scoreboard: null, chat, gameInfo: {} };
}
function mockCanvas() {
  globalThis.document = { createElement: () => ({ getContext: () => ({
    fillRect() {}, strokeRect() {}, fillText() {}, measureText: text => ({ width: text.length * 12 }),
  }) }) };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
}

test('stage 3: NpcSay rejects unknown NPCs and deduplicates active, pending and displayed replies', () => {
  start();
  applyGameEvent(S2C.NPC_SAY, message(0, { npc: 'unknown' }));
  assert.equal(useGameStore.getState().dialogue.current, null);
  for (const i of [0, 0, 1, 1]) applyGameEvent(S2C.NPC_SAY, message(i));
  let s = useGameStore.getState();
  assert.equal(s.chat.length, 0);
  assert.equal(s.dialogue.pending.length, 1);
  tickDialogue(s.dialogue.current.startedAt + EMOTION_LEAD_MS);
  applyGameEvent(S2C.NPC_SAY, message(0));
  assert.equal(useGameStore.getState().chat.length, 1);
  assert.equal(useGameStore.getState().dialogue.pending.length, 1);
});

test('stages 1+2+3: round 5 events animate EVERY speaker, show emotion first and reveal the same text in chat and scene', () => {
  start(); mockCanvas();
  const actors = new Map(roster.map(meta => [meta.id, new Npc(meta)]));
  let currentId = '';
  const sync = () => {
    const active = useGameStore.getState().dialogue.current;
    if ((active?.message.id ?? '') !== currentId) {
      currentId = active?.message.id ?? '';
      actors.forEach(npc => npc.stopSpeaking());
      if (active) actors.get(active.message.npc).say(active.message.text, active.message.emotion, active.startedAt);
    }
  };
  const unsubscribe = useGameStore.subscribe(sync);
  try {
    for (let i = 0; i < 10; i++) applyGameEvent(S2C.NPC_SAY, message(i));
    for (let i = 0; i < 10; i++) {
      const active = useGameStore.getState().dialogue.current;
      assert.equal(active.message.id, message(i).id);
      const actor = actors.get(active.message.npc);
      actor.update(active.startedAt + 250);
      assert.equal(actor.group.getObjectByName('npc-emotion').userData.emotion, message(i).emotion);
      assert.equal(actor.group.getObjectByName('npc-speech'), undefined);
      assert.equal(useGameStore.getState().chat.some(m => m.id === message(i).id), false);
      assert.equal(useGameStore.getState().dialogue.current.revealed, false);
      tickDialogue(active.startedAt + EMOTION_LEAD_MS);
      actor.update(active.startedAt + EMOTION_LEAD_MS);
      assert.ok(actor.group.getObjectByName('npc-speech'));
      assert.equal(useGameStore.getState().chat.at(-1).text, message(i).text);
      assert.equal(useGameStore.getState().dialogue.current.revealed, true);
      tickDialogue(active.startedAt + speechDuration(active.message.text));
    }
    assert.equal(useGameStore.getState().chat.length, 10);
    assert.equal(useGameStore.getState().dialogue.current, null);
  } finally { unsubscribe(); actors.forEach(npc => npc.dispose()); }
});

test('stages 1+3: hostile player question uses the LLM emotion and the same prelude', () => {
  start(4);
  applyGameEvent(S2C.NPC_THINKING, { npc: roster[0].id, questionId: 'question' });
  applyGameEvent(S2C.NPC_SAY, message(0, { emotion: 'angry', inReplyTo: 'question' }));
  let s = useGameStore.getState();
  assert.equal(s.thinkingNpc, null);
  assert.equal(s.dialogue.current.message.emotion, 'angry');
  assert.equal(s.chat.length, 0);
  tickDialogue(s.dialogue.current.startedAt + EMOTION_LEAD_MS);
  assert.equal(useGameStore.getState().chat[0].inReplyTo, 'question');
});

test('stage 3: reconnect loads history without replay and clears old performances', () => {
  start();
  applyGameEvent(S2C.NPC_SAY, message(0));
  applyGameEvent(S2C.NPC_SAY, message(1));
  applyGameEvent(S2C.STATE_SNAPSHOT, snapshot([message(0), message(1)]));
  tickDialogue(1000000);
  assert.equal(useGameStore.getState().dialogue.current, null);
  assert.deepEqual(useGameStore.getState().dialogue.pending, []);
  assert.equal(useGameStore.getState().chat.length, 2);
  applyGameEvent(S2C.NPC_SAY, message(1));
  assert.equal(useGameStore.getState().dialogue.current, null);
});

test('stage 3: removing a speaker cancels its queued performances and starts the next surviving NPC', () => {
  start();
  for (const i of [0, 1, 5, 2]) applyGameEvent(S2C.NPC_SAY, message(i));
  applyGameEvent(S2C.NPCS_REMOVED, { ids: [roster[0].id], teamScore: 1 });
  const s = useGameStore.getState();
  assert.equal(s.dialogue.current.message.id, message(1).id);
  assert.deepEqual(s.dialogue.pending.map(m => m.id), [message(2).id]);
  tickDialogue(s.dialogue.current.startedAt + EMOTION_LEAD_MS);
  assert.equal(useGameStore.getState().chat[0].id, message(1).id);
});

test('stage 3: round changes keep received text, cancel stale poses, and reset drops all pending work', () => {
  start();
  for (let i = 0; i < 3; i++) applyGameEvent(S2C.NPC_SAY, message(i));
  applyGameEvent(S2C.ROUND_ENDED, { n: 5, choiceEndsAt: null });
  assert.equal(useGameStore.getState().dialogue.current, null);
  assert.deepEqual(useGameStore.getState().chat.map(m => m.id), [0, 1, 2].map(i => message(i).id));
  start(4);
  applyGameEvent(S2C.ROUND_ENDED, { n: 4, choiceEndsAt: null });
  applyGameEvent(S2C.NPC_SAY, message(0, { inReplyTo: 'late-answer' }));
  assert.equal(useGameStore.getState().dialogue.current.message.inReplyTo, 'late-answer');
  resetGame(); tickDialogue(1000000);
  assert.deepEqual(useGameStore.getState().chat, []);
  assert.equal(useGameStore.getState().dialogue.current, null);
});

test('four chair occupants sit by default; only the current speaker stands and sits again after the reply', () => {
  mockCanvas();
  const actors = roster.slice(0, 4).map(meta => new Npc(meta));
  const settle = (actor, from) => { for (let t = from; t < from + 1000; t += 16) actor.update(t); };
  try {
    actors.forEach(actor => actor.enableChair());
    for (const actor of actors) assert.equal(actor.group.getObjectByName('avatar').position.y, -0.1);
    actors[1].say('Ответ', 'happy', 2000);
    actors.forEach(actor => settle(actor, 2000));
    assert.ok(Math.abs(actors[1].group.getObjectByName('avatar').position.y) < 0.001);
    for (const i of [0, 2, 3]) assert.equal(actors[i].group.getObjectByName('avatar').position.y, -0.1);
    const end = 2000 + speechDuration('Ответ');
    actors[1].update(end);
    settle(actors[1], end + 16);
    assert.ok(Math.abs(actors[1].group.getObjectByName('avatar').position.y + 0.1) < 0.001);
    actors[2].say('Следующая реплика', 'neutral', end + 2000);
    actors[2].stopSpeaking();
    settle(actors[2], end + 2000);
    assert.equal(actors[2].group.getObjectByName('avatar').position.y, -0.1);
  } finally { actors.forEach(actor => actor.dispose()); }
});
