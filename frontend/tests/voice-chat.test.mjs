import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/modules.mjs';

const { SpatialAudioMath } = await loadModule('src/audio/SpatialAudioMath.ts');
const { PushToTalkController } = await loadModule('src/audio/PushToTalkController.ts');
const { SpatialVoiceChannel } = await loadModule('src/audio/SpatialVoiceChannel.ts');
const { Npc } = await loadModule('src/scene/Npc.ts');
const { applyGameEvent, resetGame, useGameStore } = await loadModule('src/store/gameStore.ts');
const { C2S, S2C } = await loadModule('src/shared/contract.ts');

function mockCanvas() {
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
}

test('stage 2B: 3D spatial audio math pans left/right accurately and flips when listener turns', () => {
  const listenerForward = { position: { x: 0, y: 0, z: 5 }, yaw: 0, pitch: 0 };
  const leftSpeaker = { position: { x: -3, y: 0, z: 5 } };
  const rightSpeaker = { position: { x: 3, y: 0, z: 5 } };
  const frontSpeaker = { position: { x: 0, y: 0, z: 2 } };
  const frontRightSpeaker = { position: { x: 2, y: 0, z: 3 } };

  const leftMetrics = SpatialAudioMath.computeSpeakerMetrics(listenerForward, leftSpeaker);
  assert.ok(leftMetrics.pan < -0.99, `Expected full left pan, got ${leftMetrics.pan}`);

  const rightMetrics = SpatialAudioMath.computeSpeakerMetrics(listenerForward, rightSpeaker);
  assert.ok(rightMetrics.pan > 0.99, `Expected full right pan, got ${rightMetrics.pan}`);

  const frontMetrics = SpatialAudioMath.computeSpeakerMetrics(listenerForward, frontSpeaker);
  assert.ok(Math.abs(frontMetrics.pan) < 1e-6, `Expected center pan, got ${frontMetrics.pan}`);
  assert.ok(frontMetrics.localPosition.z > 0, 'Speaker in front must have positive local forward Z');

  const frontRightMetrics = SpatialAudioMath.computeSpeakerMetrics(listenerForward, frontRightSpeaker);
  assert.ok(frontRightMetrics.pan > 0.65 && frontRightMetrics.pan < 0.75);

  // Turn listener 180 degrees: speaker at +X is now on the listener's LEFT side
  const listenerTurnedBack = { position: { x: 0, y: 0, z: 5 }, yaw: Math.PI, pitch: 0 };
  const flippedMetrics = SpatialAudioMath.computeSpeakerMetrics(listenerTurnedBack, rightSpeaker);
  assert.ok(flippedMetrics.pan < -0.99, `After 180 turn, +X speaker should be on left ear, got ${flippedMetrics.pan}`);

  // Turn listener 90 degrees right (yaw = +PI/2): speaker at +X is now directly in front
  const listenerTurnedRight = { position: { x: 0, y: 0, z: 5 }, yaw: Math.PI / 2, pitch: 0 };
  const centeredAfterTurn = SpatialAudioMath.computeSpeakerMetrics(listenerTurnedRight, rightSpeaker);
  assert.ok(Math.abs(centeredAfterTurn.pan) < 1e-6);

  // Distance attenuation
  assert.equal(SpatialAudioMath.computeDistanceGain(1.0), 1);
  const midGain = SpatialAudioMath.computeDistanceGain(6.0);
  const farGain = SpatialAudioMath.computeDistanceGain(14.0);
  assert.ok(midGain < 1 && midGain > farGain);
  assert.equal(SpatialAudioMath.computeDistanceGain(30.0), 0.05);
});

test('stage 2B: Push-to-Talk on key G activates only outside inputs and respects volume and mode', () => {
  assert.equal(PushToTalkController.isPushToTalkKeyEvent({ code: 'KeyG', key: 'g' }), true);
  assert.equal(PushToTalkController.isPushToTalkKeyEvent({ code: 'KeyG', key: 'п' }), true);
  assert.equal(PushToTalkController.isPushToTalkKeyEvent({ code: 'KeyW', key: 'w' }), false);
  assert.equal(PushToTalkController.isPushToTalkKeyEvent({ code: 'KeyG', ctrlKey: true }), false);
  assert.equal(
    PushToTalkController.isPushToTalkKeyEvent({ code: 'KeyG', target: { tagName: 'INPUT' } }),
    false
  );
  assert.equal(
    PushToTalkController.isPushToTalkKeyEvent({ code: 'KeyG', target: { tagName: 'TEXTAREA' } }),
    false
  );
  assert.equal(
    PushToTalkController.isPushToTalkKeyEvent({ code: 'KeyG', target: { isContentEditable: true } }),
    false
  );

  // PTT mode requires pttPressed === true and volume > 0
  assert.equal(
    PushToTalkController.shouldTransmitVoice({
      mode: 'ptt',
      volume: 100,
      pttPressed: false,
      voiceActivityDetected: true,
    }),
    false
  );
  assert.equal(
    PushToTalkController.shouldTransmitVoice({
      mode: 'ptt',
      volume: 100,
      pttPressed: true,
      voiceActivityDetected: false,
    }),
    true
  );
  assert.equal(
    PushToTalkController.shouldTransmitVoice({
      mode: 'ptt',
      volume: 0,
      pttPressed: true,
      voiceActivityDetected: true,
    }),
    false
  );

  // Always mode transmits when voice activity is detected and volume > 0
  assert.equal(
    PushToTalkController.shouldTransmitVoice({
      mode: 'always',
      volume: 100,
      pttPressed: false,
      voiceActivityDetected: true,
    }),
    true
  );
  assert.equal(
    PushToTalkController.shouldTransmitVoice({
      mode: 'always',
      volume: 100,
      pttPressed: false,
      voiceActivityDetected: false,
    }),
    false
  );
});

test('stage 2B: 3D judge avatar displays and disposes microphone icon sprite when speaking', () => {
  mockCanvas();
  const judge = new Npc({
    id: 'judge-2',
    number: 0,
    name: 'Судья Борис',
    color: '#dfbf63',
    anchorId: '',
  });

  assert.equal(judge.group.getObjectByName('judge-voice-mic'), undefined);

  judge.setVoiceSpeaking(true);
  const micSprite = judge.group.getObjectByName('judge-voice-mic');
  assert.ok(micSprite, 'Expected 3D microphone badge above speaking judge');
  assert.equal(micSprite.userData.speaking, true);

  // Sitting lowers the label and the mic badge follows above the seated head
  judge.setTargetPose(1.6, 0, 3.5, 0, 0, true, 0);
  judge.update(500);
  const seatedMicY = micSprite.position.y;
  judge.setTargetPose(1.6, 0, 3.5, 0, 0, false, 0);
  judge.update(600);
  assert.ok(micSprite.position.y > seatedMicY, 'Standing mic icon must be higher than seated mic icon');

  let textureDisposed = false;
  let materialDisposed = false;
  micSprite.material.map.dispose = () => {
    textureDisposed = true;
  };
  micSprite.material.dispose = () => {
    materialDisposed = true;
  };

  judge.setVoiceSpeaking(false);
  assert.equal(judge.group.getObjectByName('judge-voice-mic'), undefined);
  assert.equal(textureDisposed, true);
  assert.equal(materialDisposed, true);
  judge.dispose();
});

test('stage 2B: SpatialVoiceChannel coordinates PTT speaking events and 3D peer positions', async () => {
  resetGame();
  const sentCommands = [];
  const fakeClient = {
    async connect() {},
    async disconnect() {},
    async send(method, payload) {
      sentCommands.push({ method, payload });
    },
    setPose() {},
    syncPose() {},
  };

  const localSpeakingHistory = [];
  const channel = new SpatialVoiceChannel(
    fakeClient,
    () => 'judge-me',
    speaking => localSpeakingHistory.push(speaking)
  );

  await channel.applySettings({ deviceId: 'default', volume: 120, mode: 'ptt' });
  channel.setPushToTalkPressed(true);
  assert.deepEqual(localSpeakingHistory, [true]);
  assert.equal(sentCommands.at(-1).method, C2S.SET_VOICE_SPEAKING);
  assert.deepEqual(sentCommands.at(-1).payload, { speaking: true });

  channel.setPushToTalkPressed(false);
  assert.deepEqual(localSpeakingHistory, [true, false]);
  assert.deepEqual(sentCommands.at(-1).payload, { speaking: false });

  // Verify 3D spatial position tracking for two remote judges on opposite sides
  const remotePlayers = [
    {
      id: 'judge-left',
      name: 'Левый Судья',
      connected: true,
      pose: { position: { x: -3.2, y: 0, z: 3.5 }, yaw: 0, pitch: 0, mode: 'seated', seatId: 'seat-1', seq: 1 },
    },
    {
      id: 'judge-right',
      name: 'Правый Судья',
      connected: true,
      pose: { position: { x: 3.2, y: 0, z: 3.5 }, yaw: 0, pitch: 0, mode: 'seated', seatId: 'seat-8', seq: 1 },
    },
  ];

  const metricsMap = channel.updateSpatialPositions(
    { position: { x: 0, y: 0, z: 5 }, yaw: 0, pitch: 0, seated: false },
    remotePlayers
  );

  assert.ok(metricsMap.get('judge-left').pan < -0.85);
  assert.ok(metricsMap.get('judge-right').pan > 0.85);

  // Verify gameStore updates speakingByPlayer and participant speaking badges on VOICE_SPEAKING_UPDATED
  applyGameEvent(S2C.PARTICIPANTS_UPDATED, {
    participants: [
      {
        id: 'judge-left',
        name: 'Левый Судья',
        role: 'judge',
        connected: true,
        fps: 60,
        pingMs: 15,
        activityCode: 'seated',
        actionText: 'Сидит в кресле',
        speaking: false,
      },
    ],
  });
  applyGameEvent(S2C.VOICE_SPEAKING_UPDATED, { playerId: 'judge-left', speaking: true, at: 5000 });
  assert.equal(useGameStore.getState().speakingByPlayer['judge-left'], true);
  assert.equal(useGameStore.getState().participants[0].speaking, true);

  channel.dispose();
});
