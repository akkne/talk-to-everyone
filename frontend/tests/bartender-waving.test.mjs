import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/modules.mjs';

const { Npc } = await loadModule('src/scene/Npc.ts');
const { AvatarRig, characterLook, NPC_SEAT } = await loadModule('src/scene/AvatarRig.ts');
const { expressionPose } = await loadModule('src/scene/expression.ts');

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
