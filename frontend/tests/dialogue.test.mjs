import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/modules.mjs';

const { EMOTIONS, normalizeEmotion, EMOTION_LEAD_MS, speechDuration, emptyDialogue, enqueueSpeech, advanceSpeech } = await loadModule('src/shared/dialogue.ts');
const line = (id, emotion = 'angry') => ({ id, npc: 'npc-' + id, text: 'Я защищаю своего друга!', emotion, inReplyTo: null, at: 1 });

test('stage 1: every LLM emotion and legacy alias has a safe visual command', () => {
  for (const emotion of Object.keys(EMOTIONS)) assert.equal(normalizeEmotion(emotion.toUpperCase()), emotion);
  for (const [raw, expected] of [[' RAGE ', 'angry'], ['ROFL', 'happy'], ['SMIRK', 'happy'], ['FACEPALM', 'sad'], ['SWEAT', 'sad'], ['SHOCK', 'surprised'], [null, 'neutral'], ['invented', 'neutral']]) {
    assert.equal(normalizeEmotion(raw), expected);
    assert.ok(EMOTIONS[expected].emoji);
  }
});

test('stage 1: emotion precedes text, reveals exactly once, and finishes at the reading duration', () => {
  const message = line('1');
  let state = enqueueSpeech(emptyDialogue(), message, 1000);
  assert.equal(advanceSpeech(state, 1000 + EMOTION_LEAD_MS - 1).revealed, null);
  let step = advanceSpeech(state, 1000 + EMOTION_LEAD_MS);
  assert.equal(step.revealed, message); state = step.dialogue;
  assert.equal(advanceSpeech(state, 2000).revealed, null);
  assert.equal(advanceSpeech(state, 1000 + speechDuration(message.text)).dialogue.current, null);
  assert.equal(speechDuration(''), EMOTION_LEAD_MS + 3500);
  assert.equal(speechDuration('a'.repeat(1000)), EMOTION_LEAD_MS + 10000);
});

test('stage 1: rapid round 5 debate replies are queued in order and deduplicated', () => {
  const lines = Array.from({ length: 10 }, (_, i) => line(String(i)));
  let state = emptyDialogue();
  for (const message of lines) state = enqueueSpeech(state, message, 1000);
  const before = state;
  assert.equal(enqueueSpeech(state, lines[5], 1010), before);
  const heard = []; let now = 1000;
  for (const message of lines) {
    assert.equal(state.current.message.id, message.id);
    let step = advanceSpeech(state, now + EMOTION_LEAD_MS);
    heard.push(step.revealed.id);
    state = advanceSpeech(step.dialogue, now += speechDuration(message.text)).dialogue;
  }
  assert.deepEqual(heard, lines.map(m => m.id));
  assert.deepEqual(state, emptyDialogue());
});

test('stage 1: a suspended tab reveals a queued reply once and gives the next NPC a full prelude', () => {
  let state = enqueueSpeech(enqueueSpeech(emptyDialogue(), line('1'), 0), line('2'), 0);
  const step = advanceSpeech(state, 60000);
  assert.equal(step.revealed.id, '1');
  assert.equal(step.dialogue.current.message.id, '2');
  assert.equal(step.dialogue.current.startedAt, 60000);
  assert.equal(advanceSpeech(step.dialogue, 60001).revealed, null);
});
