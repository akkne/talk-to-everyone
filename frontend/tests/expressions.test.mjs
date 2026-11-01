import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/modules.mjs';

const { Npc } = await loadModule('src/scene/Npc.ts');
const { expressionPose } = await loadModule('src/scene/expression.ts');
const { EMOTIONS, EMOTION_LEAD_MS, speechDuration } = await loadModule('src/shared/dialogue.ts');
const { JUMP_HEIGHT } = await loadModule('src/scene/jump.ts');
function npc() {
  globalThis.document = { createElement: () => ({ getContext: () => ({
    fillRect() {}, strokeRect() {}, fillText() {}, measureText: text => ({ width: text.length * 12 }),
  }) }) };
  return new Npc({ id: 'npc', number: 1, name: 'Тест', color: '#779bc9', anchorId: 'anchor-0' });
}

test('stage 2: five distinct poses animate the arms and settle completely', () => {
  const poses = Object.keys(EMOTIONS).map(emotion => expressionPose(emotion, 300, 5000));
  assert.equal(new Set(poses.map(p => JSON.stringify(p))).size, 5);
  for (const emotion of Object.keys(EMOTIONS)) {
    const pose = expressionPose(emotion, 300, 5000);
    assert.ok(Math.abs(pose.leftX) + Math.abs(pose.rightX) > 0.1);
    for (const age of [-1, 0, 5000, 6000]) {
      const rest = expressionPose(emotion, age, 5000);
      for (const value of Object.values(rest)) assert.equal(Math.abs(value), 0);
    }
    assert.ok(expressionPose(emotion, 4900, 5000).weight < 0.3);
  }
});

test('stages 1+2: every mood shows the badge before speech, gestures while speaking, and disposes sprites', () => {
  for (const emotion of Object.keys(EMOTIONS)) {
    const actor = npc();
    const avatar = actor.group.getObjectByName('avatar');
    actor.say('Рассказываю историю о друге.', emotion, 1000);
    actor.update(1250);
    const badge = actor.group.getObjectByName('npc-emotion');
    assert.equal(badge.userData.emotion, emotion);
    assert.equal(actor.group.getObjectByName('npc-speech'), undefined);
    let disposed = 0;
    badge.material.map.addEventListener('dispose', () => disposed++);
    const shoulders = [-1, 1].map(side => avatar.getObjectByName(`shoulder-${side}`));
    const before = shoulders.map(c => c.quaternion.clone());
    actor.update(1000 + EMOTION_LEAD_MS);
    assert.ok(actor.group.getObjectByName('npc-speech'));
    actor.update(2000);
    assert.ok(shoulders.some((c, i) => c.quaternion.angleTo(before[i]) > 0.01));
    actor.update(1000 + speechDuration('Рассказываю историю о друге.'));
    assert.equal(actor.group.getObjectByName('npc-emotion'), undefined);
    assert.equal(actor.group.getObjectByName('npc-speech'), undefined);
    assert.equal(disposed, 1);
    assert.equal(Math.abs(avatar.rotation.x), 0);
    assert.equal(Math.abs(avatar.rotation.z), 0);
    actor.dispose();
  }
});

test('stage 2: replacing a reply and cancelling it releases both textures', () => {
  const actor = npc();
  actor.say('Первый ответ', 'angry', 100);
  actor.update(1000);
  let disposed = 0;
  for (const name of ['npc-speech', 'npc-emotion']) actor.group.getObjectByName(name).material.map.addEventListener('dispose', () => disposed++);
  actor.say('Новый ответ', 'happy', 1000);
  assert.equal(disposed, 2);
  assert.equal(actor.group.getObjectByName('npc-speech'), undefined);
  assert.equal(actor.group.getObjectByName('npc-emotion').userData.emotion, 'happy');
  actor.stopSpeaking(); actor.update(1100);
  assert.equal(actor.group.getObjectByName('npc-emotion'), undefined);
  actor.dispose();
});

test('stage 2 + movement: speech preserves jump height, ground position and seated label clearance', () => {
  const actor = npc();
  actor.setTargetPose(0, 1.5, 0, 0, 0, false, JUMP_HEIGHT);
  actor.say('Удивительный прыжок', 'surprised', 0);
  for (let now = 100; now <= 1000; now += 50) actor.update(now);
  assert.equal(actor.group.position.y, 1.5);
  assert.ok(actor.group.getObjectByName('avatar').position.y > 0.8);
  actor.setTargetPose(0, 1.5, 0, 0, 0, true);
  actor.update(1100);
  assert.equal(actor.group.getObjectByName('avatar').position.y, 0);
  assert.ok(actor.group.getObjectByName('npc-speech').position.y > actor.group.getObjectByName('npc-emotion').position.y + 0.5);
  actor.dispose();
});

test('long NPC replies fit in a growing bubble and names respect scene depth', () => {
  const canvases = [];
  globalThis.document = { createElement: () => {
    const canvas = { width: 0, height: 0, lines: [] };
    canvas.getContext = () => ({
      fillRect() {}, strokeRect() {},
      fillText(value) { canvas.lines.push(value); },
      measureText: value => ({ width: value.length * 12 }),
    });
    canvases.push(canvas);
    return canvas;
  } };
  const actor = new Npc({ id: 'npc', number: 1, name: 'Тест', color: '#779bc9', anchorId: 'anchor-0' });
  const label = actor.group.getObjectByName('avatar').children.find(child => child.isSprite);
  assert.equal(label.material.depthTest, true);

  const reply = Array.from({ length: 40 }, (_, i) => `слово${i}`).join(' ');
  actor.say(reply, 'neutral', 0);
  actor.update(EMOTION_LEAD_MS);
  const bubble = actor.group.getObjectByName('npc-speech');
  const speechCanvas = canvases.at(-1);
  assert.equal(speechCanvas.lines.join(' '), reply);
  assert.ok(speechCanvas.height > 192);
  assert.ok(bubble.scale.y > 1.05);
  assert.ok(bubble.position.y - bubble.scale.y / 2 > label.position.y + 0.7);
  actor.dispose();
});
