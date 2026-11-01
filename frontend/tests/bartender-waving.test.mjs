import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadModule } from './helpers/modules.mjs';

const { Npc } = await loadModule('src/scene/Npc.ts');
const { AvatarRig, characterLook, NPC_SEAT } = await loadModule('src/scene/AvatarRig.ts');
const { expressionPose } = await loadModule('src/scene/expression.ts');
const {
  BartenderWaveController,
  TRIGGER_DISTANCE,
  RESET_DISTANCE,
  MODEL_LENGTH,
  DEFAULT_WAVE_DURATION_MS,
} = await loadModule('src/scene/BartenderWaveController.ts');

function createNpc(id = 'bartender-mark', name = 'Марк') {
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        fillRect() {},
        strokeRect() {},
        fillText() {},
        measureText: text => ({ width: text.length * 12 }),
      }),
    }),
  };
  return new Npc({ id, number: 0, name, color: '#ad7962', anchorId: '' });
}

test('AvatarRig: waving procedural animation raises right arm and settles back to neutral', () => {
  const look = characterLook({ id: 'bartender', number: 0, name: 'Марк', color: '#ad7962', anchorId: '' });
  const rig = new AvatarRig(look);
  const neutralPose = expressionPose('neutral', -1, 0);

  // 1. Standing neutral without waving
  rig.pose(0, NPC_SEAT, 0, neutralPose, 0, 0, 0, 0);
  const restShoulderX = rig.rightArm.shoulder.rotation.x;
  const restElbowX = rig.rightArm.elbow.rotation.x;
  assert.ok(Math.abs(restShoulderX) < 0.2, `Neutral shoulder X should be near 0, got ${restShoulderX}`);
  assert.ok(Math.abs(restElbowX) < 0.2, `Neutral elbow X should be near 0, got ${restElbowX}`);

  // 2. Full waving weight
  rig.pose(0, NPC_SEAT, 0, neutralPose, 0, 0, 1.0, 0.5);
  const waveShoulderX = rig.rightArm.shoulder.rotation.x;
  const waveElbowX = rig.rightArm.elbow.rotation.x;
  const waveElbowZ = rig.rightArm.elbow.rotation.z;
  assert.ok(waveShoulderX < -1.0, `Waving shoulder should raise arm up (rx < -1.0), got ${waveShoulderX}`);
  assert.ok(waveElbowX < -1.0, `Waving elbow should bend forearm upward (rx < -1.0), got ${waveElbowX}`);
  assert.ok(Math.abs(waveElbowZ) > 0.05, `Waving elbow should have lateral oscillation, got ${waveElbowZ}`);

  // Left arm should remain resting and unaffected
  assert.ok(Math.abs(rig.leftArm.shoulder.rotation.x) < 0.2, 'Left arm should not wave');

  // 3. Return to waveWeight = 0
  rig.pose(0, NPC_SEAT, 0, neutralPose, 0, 0, 0, 0);
  assert.equal(rig.rightArm.shoulder.rotation.x, restShoulderX, 'Shoulder returns to neutral rest');
  assert.equal(rig.rightArm.elbow.rotation.x, restElbowX, 'Elbow returns to neutral rest');
});

test('Npc: wave lifecycle starts, animates right arm with smooth easing, and stops after duration', () => {
  const actor = createNpc();
  try {
    const avatar = actor.group.getObjectByName('avatar');
    const rightShoulder = avatar.getObjectByName('shoulder-1');
    const rightElbow = avatar.getObjectByName('forearm-1');

    // Initially idle
    actor.update(1000);
    assert.equal(actor.isWaving(1000), false);
    assert.equal(actor.getWaveWeight(1000), 0);
    const initialShoulderX = rightShoulder.rotation.x;

    // Trigger wave for 4000ms (between 3-5 seconds)
    actor.wave(4000, 1000);
    assert.equal(actor.isWaving(1000), true);

    // Ease-in phase (~200ms in)
    actor.update(1200);
    assert.ok(actor.getWaveWeight(1200) > 0.5, 'Wave weight eases in');
    assert.ok(rightShoulder.rotation.x < initialShoulderX - 0.5, 'Right shoulder lifts during ease-in');

    // Mid-wave sustain phase (2500ms in)
    actor.update(3500);
    assert.equal(actor.getWaveWeight(3500), 1.0, 'Full wave weight during sustain');
    assert.ok(rightShoulder.rotation.x < -1.0, 'Arm is fully raised');
    assert.ok(rightElbow.rotation.x < -1.0, 'Elbow is bent upward');

    // Ease-out phase (4800ms)
    actor.update(4800);
    assert.ok(actor.getWaveWeight(4800) < 0.8, 'Wave weight eases out near end');
    assert.equal(actor.isWaving(4800), true);

    // Waving complete at 5000ms
    actor.update(5001);
    assert.equal(actor.isWaving(5001), false);
    assert.equal(actor.getWaveWeight(5001), 0);
    assert.ok(Math.abs(rightShoulder.rotation.x - initialShoulderX) < 0.01, 'Right shoulder returns to rest');
  } finally {
    actor.dispose();
  }
});

test('BartenderWaveController: distance thresholds match 2 model lengths exactly (3.6m)', () => {
  assert.equal(MODEL_LENGTH, 1.8);
  assert.equal(TRIGGER_DISTANCE, 3.6);
  assert.ok(RESET_DISTANCE > TRIGGER_DISTANCE);
  assert.ok(DEFAULT_WAVE_DURATION_MS >= 3000 && DEFAULT_WAVE_DURATION_MS <= 5000);
});

test('BartenderWaveController: player approach closer than 2 model lengths triggers 3-5s wave, then stops', () => {
  const actor = createNpc();
  try {
    const bartenderPos = { x: -9.8, y: 0, z: -1.0 };
    const controller = new BartenderWaveController(actor, bartenderPos, 4000);

    // 1. Player is far away (distance = 5.0m > 3.6m)
    const farPlayer = { id: 'player-1', position: { x: -9.8 + 5.0, y: 0, z: -1.0 } };
    controller.update(1000, [farPlayer]);
    actor.update(1000);
    assert.equal(controller.isWaving(1000), false, 'Should not wave when player is far');
    assert.equal(actor.isWaving(1000), false);

    // 2. Player approaches to 3.0m (<= 3.6m, closer than 2 model lengths)
    const closePlayer = { id: 'player-1', position: { x: -9.8 + 3.0, y: 0, z: -1.0 } };
    controller.update(2000, [closePlayer]);
    actor.update(2000);
    assert.equal(controller.isWaving(2000), true, 'Bartender starts waving on approach');
    assert.equal(actor.isWaving(2000), true);

    // 3. Mid-wave (3500ms -> 1.5s after start)
    controller.update(3500, [closePlayer]);
    actor.update(3500);
    assert.equal(controller.isWaving(3500), true, 'Still waving at 1.5s');

    // 4. Wave finishes after 4.0s (at 6001ms -> 4.001s after start)
    controller.update(6001, [closePlayer]);
    actor.update(6001);
    assert.equal(controller.isWaving(6001), false, 'Bartender stops waving after 4 seconds');
    assert.equal(actor.isWaving(6001), false);

    // 5. Player STAYS close (still at 3.0m): bartender should NOT start waving again!
    controller.update(7000, [closePlayer]);
    actor.update(7000);
    assert.equal(controller.isWaving(7000), false, 'Should remain stopped while player stays inside radius');
    assert.equal(actor.isWaving(7000), false);

    // 6. Player steps back outside (> 3.9m reset distance, e.g. at 5.0m)
    controller.update(8000, [farPlayer]);
    actor.update(8000);
    assert.equal(controller.isWaving(8000), false);

    // 7. Player approaches AGAIN to 2.0m: triggers new wave!
    const reApproachedPlayer = { id: 'player-1', position: { x: -9.8 + 2.0, y: 0, z: -1.0 } };
    controller.update(9000, [reApproachedPlayer]);
    actor.update(9000);
    assert.equal(controller.isWaving(9000), true, 'Re-approach after leaving triggers waving again');
    assert.equal(actor.isWaving(9000), true);
  } finally {
    actor.dispose();
  }
});

test('BartenderWaveController: any jury member approach triggers wave, even if another jury is already nearby', () => {
  const actor = createNpc();
  try {
    const bartenderPos = { x: -9.8, y: 0, z: -1.0 };
    const controller = new BartenderWaveController(actor, bartenderPos, 3500);

    // Jury 1 approaches and finishes waving
    const jury1 = { id: 'judge-alice', position: { x: -9.8 + 2.5, y: 0, z: -1.0 } };
    controller.update(1000, [jury1]);
    actor.update(1000);
    assert.equal(controller.isWaving(1000), true);

    // Fast forward to after Jury 1 wave ends (1000 + 3500 = 4500)
    controller.update(4600, [jury1]);
    actor.update(4600);
    assert.equal(controller.isWaving(4600), false, 'Finished waving for Jury 1');

    // Jury 2 was far away at x = 0 (dist ~9.8m)
    const jury2Far = { id: 'judge-bob', position: { x: 0, y: 0, z: -1.0 } };
    controller.update(4700, [jury1, jury2Far]);
    assert.equal(controller.isWaving(4700), false);

    // Jury 2 approaches closer than 2 models (dist = 1.5m <= 3.6m) while Jury 1 is still standing there
    const jury2Close = { id: 'judge-bob', position: { x: -9.8 + 1.5, y: 0, z: -1.0 } };
    controller.update(5000, [jury1, jury2Close]);
    actor.update(5000);
    assert.equal(controller.isWaving(5000), true, 'Approach of second jury triggers a new wave');
    assert.equal(actor.isWaving(5000), true);
  } finally {
    actor.dispose();
  }
});

test('club map integration: bartender Mark is present in club scenes and waves on jury approach', () => {
  // Test with backend loft_bar_scene.json (the server club map)
  const loftSpec = JSON.parse(readFileSync('../backend/Maps/loft_bar_scene.json', 'utf8'));
  const mark = loftSpec.functionalNPCs?.find(n => n.id === 'bartender-mark');
  assert.ok(mark, 'Bartender Mark exists in loft_bar_scene.json functionalNPCs');
  assert.equal(mark.type, 'functional-service-npc');
  assert.ok(mark.position && typeof mark.position.x === 'number');

  // Test with frontend public/scenes/club.json
  const clubSpec = JSON.parse(readFileSync('public/scenes/club.json', 'utf8'));
  const clubMark = clubSpec.functionalNPCs?.find(n => n.id === 'bartender-mark');
  assert.ok(clubMark, 'Bartender Mark exists in public/scenes/club.json functionalNPCs');

  const actor = createNpc(mark.id, mark.name);
  try {
    const controller = new BartenderWaveController(actor, mark.position, 4000);

    // Initial state: local jury at spawn point (e.g. x = 0, z = 0, dist ~9.8m)
    let now = 1000;
    const localJury = { id: 'me', position: { x: 0, y: 0, z: 0 } };
    controller.update(now, [localJury]);
    actor.update(now);
    assert.equal(controller.isWaving(now), false);

    // Local jury walks to the bar counter (-7.5, 0, -1.0 -> dist = 2.3m <= 3.6m)
    now = 2000;
    localJury.position = { x: -7.5, y: 0, z: -1.0 };
    controller.update(now, [localJury]);
    actor.update(now);
    assert.equal(controller.isWaving(now), true, 'Bartender begins waving when local player approaches bar');
    assert.equal(actor.isWaving(now), true);

    // Mid-animation at 3.5s in
    now = 4500;
    controller.update(now, [localJury]);
    actor.update(now);
    assert.equal(controller.isWaving(now), true);

    // Animation ends at 4.0s (now = 6000)
    now = 6001;
    controller.update(now, [localJury]);
    actor.update(now);
    assert.equal(controller.isWaving(now), false, 'Bartender ceases waving after 4 seconds');

    // Staying ordered drink at counter: bartender remains calm
    now = 10000;
    controller.update(now, [localJury]);
    actor.update(now);
    assert.equal(controller.isWaving(now), false);

    // Another jury member ('judge-2') approaches to (-8.0, 0, -1.0)
    const remoteJury = { id: 'judge-2', position: { x: -8.0, y: 0, z: -1.0 } };
    now = 11000;
    controller.update(now, [localJury, remoteJury]);
    actor.update(now);
    assert.equal(controller.isWaving(now), true, 'Bartender waves for the new jury member arriving at bar');
  } finally {
    actor.dispose();
  }
});


