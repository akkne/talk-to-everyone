import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/modules.mjs';

const {
  VoiceSettingsPolicy,
  useVoiceSettingsStore,
  setMicrophoneDevice,
  setMicrophoneVolume,
  setMicrophoneMode,
  refreshMicrophoneDevices,
  resetVoiceSettings,
} = await loadModule('src/store/voiceSettingsStore.ts');
const { PlayerActivityClassifier } = await loadModule('src/shared/activity.ts');
const { applyGameEvent, isHostRole, resetGame, tickDialogue, useGameStore } = await loadModule('src/store/gameStore.ts');
const { S2C } = await loadModule('src/shared/contract.ts');
const { EMOTION_LEAD_MS } = await loadModule('src/shared/dialogue.ts');
const { buildParticipantRows } = await loadModule('src/components/EscapeMenu.tsx');
const { handleEscapeKeyState } = await loadModule('src/App.tsx');

test('stage 1B: microphone settings store validates device, volume (0..200), and always vs PTT (G) mode', async () => {
  resetVoiceSettings();
  let state = useVoiceSettingsStore.getState();
  assert.equal(state.deviceId, 'default');
  assert.equal(state.volume, 100);
  assert.equal(state.mode, 'always');
  assert.equal(VoiceSettingsPolicy.PTT_KEY_CODE, 'KeyG');
  assert.equal(VoiceSettingsPolicy.PTT_KEY_LABEL, 'G');

  setMicrophoneVolume(-25);
  assert.equal(useVoiceSettingsStore.getState().volume, 0);
  assert.equal(VoiceSettingsPolicy.volumeToGain(0), 0);

  setMicrophoneVolume(165);
  assert.equal(useVoiceSettingsStore.getState().volume, 165);
  assert.equal(VoiceSettingsPolicy.volumeToGain(165), 1.65);

  setMicrophoneVolume(999);
  assert.equal(useVoiceSettingsStore.getState().volume, 200);
  assert.equal(VoiceSettingsPolicy.volumeToGain(200), 2);

  setMicrophoneMode('ptt');
  assert.equal(useVoiceSettingsStore.getState().mode, 'ptt');

  const fakeCatalog = {
    async listAudioInputs() {
      return [
        { deviceId: 'default', label: 'По умолчанию' },
        { deviceId: 'usb-shure-1', label: 'USB Condenser Mic' },
      ];
    },
  };
  await refreshMicrophoneDevices(false, fakeCatalog);
  setMicrophoneDevice('usb-shure-1');
  assert.equal(useVoiceSettingsStore.getState().deviceId, 'usb-shure-1');

  // If the selected microphone is unplugged, refreshing falls back to 'default'
  const unpluggedCatalog = {
    async listAudioInputs() {
      return [{ deviceId: 'default', label: 'По умолчанию' }];
    },
  };
  await refreshMicrophoneDevices(false, unpluggedCatalog);
  assert.equal(useVoiceSettingsStore.getState().deviceId, 'default');
});

test('stage 1B: PlayerActivityClassifier resolves every judge action in priority order', () => {
  const base = {
    phase: 'playing',
    escapeOpen: false,
    votingOpen: false,
    questionOpen: false,
    questionPending: false,
    boardOpen: false,
    npcSpeaking: false,
    poseMode: 'walking',
  };

  assert.equal(PlayerActivityClassifier.resolveCode(base), 'walking');
  assert.equal(PlayerActivityClassifier.describe('walking', 'walking'), 'Ходит по студии');

  assert.equal(PlayerActivityClassifier.resolveCode({ ...base, poseMode: 'seated' }), 'seated');
  assert.equal(PlayerActivityClassifier.describe('seated', 'seated'), 'Сидит в кресле');

  assert.equal(PlayerActivityClassifier.resolveCode({ ...base, poseMode: 'seated', npcSpeaking: true }), 'listening');
  assert.equal(PlayerActivityClassifier.describe('listening', 'seated'), 'Сидит и слушает участника');
  assert.equal(PlayerActivityClassifier.describe('listening', 'walking'), 'Слушает участника');

  assert.equal(PlayerActivityClassifier.resolveCode({ ...base, npcSpeaking: true, boardOpen: true }), 'board');
  assert.equal(PlayerActivityClassifier.describe('board'), 'Изучает доску');

  assert.equal(PlayerActivityClassifier.resolveCode({ ...base, boardOpen: true, questionOpen: true }), 'asking_question');
  assert.equal(PlayerActivityClassifier.describe('asking_question'), 'Задает вопрос');

  assert.equal(PlayerActivityClassifier.resolveCode({ ...base, votingOpen: true }), 'voting');
  assert.equal(PlayerActivityClassifier.describe('voting'), 'Выбирает пару');

  assert.equal(PlayerActivityClassifier.resolveCode({ ...base, votingOpen: true, escapeOpen: true }), 'escape_menu');
  assert.equal(PlayerActivityClassifier.describe('escape_menu'), 'Смотрит в меню');
});

test('stage 1B: Escape key toggles menu and closes sub-panels cleanly', () => {
  let ui = { phase: 'playing', escapeOpen: false, boardOpen: true, questionsOpen: false };
  ui = { ...ui, ...handleEscapeKeyState(ui) };
  assert.deepEqual(ui, { phase: 'playing', escapeOpen: false, boardOpen: false, questionsOpen: false });

  ui = { ...ui, ...handleEscapeKeyState(ui) };
  assert.deepEqual(ui, { phase: 'playing', escapeOpen: true, boardOpen: false, questionsOpen: false });

  ui = { ...ui, ...handleEscapeKeyState(ui) };
  assert.deepEqual(ui, { phase: 'playing', escapeOpen: false, boardOpen: false, questionsOpen: false });
});

test('stage 1B: role permissions and participant table rows separate regular judge from host', () => {
  assert.equal(isHostRole('leader'), true);
  assert.equal(isHostRole('judge'), false);
  assert.equal(isHostRole(''), false);

  const players = [
    { id: 'host-1', name: 'Ведущий', connected: true, pose: { mode: 'walking' } },
    { id: 'judge-1', name: 'Судья Анна', connected: true, pose: { mode: 'seated' } },
  ];
  const fallbackRows = buildParticipantRows([], players, 'host-1', 'leader', 120, 18, 'escape_menu');
  assert.equal(fallbackRows.length, 2);
  assert.equal(fallbackRows[0].name, 'Ведущий');
  assert.equal(fallbackRows[0].fps, 120);
  assert.equal(fallbackRows[0].pingMs, 18);
  assert.equal(fallbackRows[0].actionText, 'Смотрит в меню');
  assert.equal(fallbackRows[1].actionText, 'Сидит в кресле');
});

test('stage 1B: host soft pause freezes dialogue and round deadline in gameStore until resumed', () => {
  resetGame();
  const roster = [{ id: 'npc-1', number: 1, name: 'Аня', color: '#779bc9', anchorId: 'anchor-1' }];
  applyGameEvent(S2C.GAME_STARTED, { rounds: [], npcs: roster, sceneVersion: '1' });
  applyGameEvent(S2C.ROUND_STARTED, { n: 1, phase: 'presentation', endsAt: 100_000, choiceEndsAt: null });

  applyGameEvent(S2C.NPC_SAY, {
    id: 'msg-1',
    npc: 'npc-1',
    text: 'Привет всем в студии!',
    inReplyTo: null,
    emotion: 'happy',
    at: 1000,
  });

  const startedAt = useGameStore.getState().dialogue.current.startedAt;

  // Host pauses the game
  applyGameEvent(S2C.GAME_PAUSE_CHANGED, {
    paused: true,
    pausedRemainingMs: 45_000,
    endsAt: 145_000,
    pausedBy: 'host-1',
  });
  assert.equal(useGameStore.getState().paused, true);
  assert.equal(useGameStore.getState().pausedRemainingMs, 45_000);

  // While paused, tickDialogue does not reveal the NPC message
  tickDialogue(startedAt + EMOTION_LEAD_MS + 500);
  assert.equal(useGameStore.getState().chat.length, 0);

  // Host resumes the game
  applyGameEvent(S2C.GAME_PAUSE_CHANGED, {
    paused: false,
    pausedRemainingMs: 0,
    endsAt: 185_000,
    pausedBy: null,
  });
  assert.equal(useGameStore.getState().paused, false);
  assert.equal(useGameStore.getState().round.endsAt, 185_000);

  tickDialogue(startedAt + EMOTION_LEAD_MS + 500);
  assert.equal(useGameStore.getState().chat.length, 1);
});
