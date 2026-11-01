import { useEffect, useState } from 'react';
import { isHostRole, useGameStore } from '../store/gameStore';
import {
  refreshMicrophoneDevices,
  setMicrophoneDevice,
  setMicrophoneMode,
  setMicrophoneVolume,
  useVoiceSettingsStore,
  VoiceSettingsPolicy,
} from '../store/voiceSettingsStore';
import { PlayerActivityClassifier } from '../shared/activity';
import { C2S } from '../shared/contract';
import { command, useClient } from '../core/client';
import { createId } from '../shared/id';
import type { ParticipantStatus } from '../shared/types';
import { Icon } from './Icon';

interface EscapeMenuProps {
  readonly onClose: () => void;
  readonly onExit: () => void;
}

/** <summary>Builds a complete list of participants, falling back to local player state before server telemetry arrives.</summary> */
export function buildParticipantRows(
  participants: ParticipantStatus[],
  players: { id: string; name: string; connected: boolean; pose: { mode: 'walking' | 'seated' } }[],
  localPlayerId: string,
  localRole: string,
  localFps: number,
  localRtt: number | null,
  localActivityCode: ReturnType<typeof PlayerActivityClassifier.resolveCode>,
  speakingByPlayer: Record<string, boolean> = {}
): ParticipantStatus[] {
  if (participants.length > 0) {
    return participants.map(item =>
      item.id === localPlayerId
        ? {
            ...item,
            fps: localFps || item.fps,
            pingMs: localRtt ?? item.pingMs,
            activityCode: localActivityCode,
            actionText: PlayerActivityClassifier.describe(
              localActivityCode,
              players.find(p => p.id === localPlayerId)?.pose.mode ?? 'walking'
            ),
            speaking: Boolean(item.speaking || speakingByPlayer[item.id]),
          }
        : {
            ...item,
            speaking: Boolean(item.speaking || speakingByPlayer[item.id]),
          }
    );
  }

  return players.map(player => {
    const isMe = player.id === localPlayerId;
    const code = !player.connected
      ? 'offline'
      : isMe
        ? localActivityCode
        : player.pose.mode === 'seated'
          ? 'seated'
          : 'walking';
    return {
      id: player.id,
      name: player.name,
      role: isMe ? localRole : 'judge',
      connected: player.connected,
      fps: isMe ? localFps : 0,
      pingMs: isMe ? (localRtt ?? 0) : 0,
      activityCode: code,
      actionText: PlayerActivityClassifier.describe(code, player.pose.mode),
      speaking: Boolean(speakingByPlayer[player.id]),
    };
  });
}

/** <summary>Role-aware Escape menu providing microphone configuration for all users and participant telemetry + pause controls for the host.</summary> */
export function EscapeMenu({ onClose, onExit }: EscapeMenuProps) {
  const state = useGameStore();
  const voice = useVoiceSettingsStore();
  const client = useClient();
  const [pauseBusy, setPauseBusy] = useState(false);
  const [kickCandidate, setKickCandidate] = useState<string | null>(null);
  const [kickBusy, setKickBusy] = useState(false);
  const [refreshingDevices, setRefreshingDevices] = useState(false);

  const isHost = isHostRole(state.role);

  useEffect(() => {
    void refreshMicrophoneDevices(false);
  }, []);

  const handleRequestDevices = async () => {
    setRefreshingDevices(true);
    await refreshMicrophoneDevices(true);
    setRefreshingDevices(false);
  };

  const handleTogglePause = async () => {
    if (!isHost || pauseBusy || state.connection !== 'ready' || state.phase !== 'playing') {
      return;
    }
    setPauseBusy(true);
    await command(client, C2S.SET_GAME_PAUSE, {
      requestId: createId(),
      paused: !state.paused,
    });
    setPauseBusy(false);
  };

  const handleKick = async () => {
    if (!isHost || state.phase !== 'lobby' || !kickCandidate || kickBusy || state.connection !== 'ready') return;
    setKickBusy(true);
    const sent = await command(client, C2S.KICK_PLAYER, { requestId: createId(), playerId: kickCandidate });
    if (sent) setKickCandidate(null);
    setKickBusy(false);
  };

  const mePoseMode = state.players.find(p => p.id === state.playerId)?.pose.mode ?? 'walking';
  const localActivity = PlayerActivityClassifier.resolveCode({
    phase: state.phase,
    escapeOpen: true,
    votingOpen: Boolean(state.voting),
    questionOpen: false,
    questionPending: state.questions.pending,
    boardOpen: state.boardOpen,
    npcSpeaking: Boolean(state.dialogue.current),
    poseMode: mePoseMode,
  });

  const rows = buildParticipantRows(
    state.participants,
    state.players,
    state.playerId,
    state.role,
    state.metrics.fps,
    state.rtt,
    localActivity,
    state.speakingByPlayer
  );

  return (
    <div className="escape-overlay" role="dialog" aria-modal="true" aria-label="Меню паузы и настроек">
      <div className={`escape-modal ${isHost ? 'host-layout' : 'judge-layout'}`}>
        <header className="escape-header">
          <div>
            <span className="eyebrow">
              {isHost ? 'МЕНЮ ВЕДУЩЕГО (ХОСТ / АДМИН) · ESC' : 'МЕНЮ СУДЬИ · ESC'}
            </span>
            <h2>{isHost ? 'Настройки микрофона и панель управления игрой' : 'Настройки микрофона'}</h2>
          </div>
          <button type="button" className="key-button" onClick={onClose} aria-label="Закрыть меню">
            <span>Вернуться</span>
            <kbd>Esc</kbd>
            <Icon name="close" />
          </button>
        </header>

        <div className="escape-body">
          <section className="escape-section" aria-label="Настройки микрофона">
            <div className="escape-section-head">
              <h3>
                <Icon name="mic" size={18} />
                <span>Голосовой чат и микрофон</span>
              </h3>
              <button
                type="button"
                className="text-button"
                onClick={() => void handleRequestDevices()}
                disabled={refreshingDevices}
              >
                {refreshingDevices ? 'Обновляем…' : 'Обновить устройства'}
              </button>
            </div>

            <div className="escape-field">
              <label className="field-label" htmlFor="escape-mic-device">
                <span>Устройство ввода (микрофон)</span>
                <span>{voice.devices.length} дост.</span>
              </label>
              <select
                id="escape-mic-device"
                className="escape-select"
                value={voice.deviceId}
                onChange={e => setMicrophoneDevice(e.target.value)}
              >
                {voice.devices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="escape-field">
              <label className="field-label" htmlFor="escape-mic-volume">
                <span>Громкость микрофона</span>
                <span>{voice.volume}%</span>
              </label>
              <input
                id="escape-mic-volume"
                type="range"
                className="escape-range"
                min={VoiceSettingsPolicy.MIN_VOLUME}
                max={VoiceSettingsPolicy.MAX_VOLUME}
                step={5}
                value={voice.volume}
                onChange={e => setMicrophoneVolume(Number(e.target.value))}
              />
              <div className="escape-range-Scale">
                <span>0% (Выкл)</span>
                <span>100% (Норма)</span>
                <span>200% (Усиление)</span>
              </div>
            </div>

            <div className="escape-field">
              <span className="field-label">
                <span>Режим активации микрофона</span>
                <span>Клавиша рации: {VoiceSettingsPolicy.PTT_KEY_LABEL}</span>
              </span>
              <div className="escape-mode-grid" role="radiogroup" aria-label="Режим активации микрофона">
                <button
                  type="button"
                  role="radio"
                  aria-checked={voice.mode === 'always'}
                  className={`escape-mode-btn ${voice.mode === 'always' ? 'active' : ''}`}
                  onClick={() => setMicrophoneMode('always')}
                >
                  <Icon name="mic" size={16} />
                  <div>
                    <strong>Всегда включен</strong>
                    <small>Свободный разговор по активации голосом</small>
                  </div>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={voice.mode === 'ptt'}
                  className={`escape-mode-btn ${voice.mode === 'ptt' ? 'active' : ''}`}
                  onClick={() => setMicrophoneMode('ptt')}
                >
                  <kbd>{VoiceSettingsPolicy.PTT_KEY_LABEL}</kbd>
                  <div>
                    <strong>Режим рации (на кнопку G)</strong>
                    <small>Удерживайте клавишу G во время речи</small>
                  </div>
                </button>
              </div>
            </div>
          </section>

          {isHost && (
            <section className="escape-section host-section" aria-label="Панель хоста и список участников">
              {state.phase === 'playing' && <div className="escape-pause-box">
                <div>
                  <span className="eyebrow">УПРАВЛЕНИЕ ИГРОЙ И БОТАМИ (АДМИН)</span>
                  <h4>{state.paused ? 'Игра и боты сейчас на паузе' : 'Игра и боты активны'}</h4>
                  <p className="muted">
                    При паузе таймер раунда и реплики всех ботов останавливаются. Судьи могут свободно ходить по студии и работать с доской.
                  </p>
                </div>
                <button
                  type="button"
                  className={state.paused ? 'primary' : 'secondary pause-btn'}
                  onClick={() => void handleTogglePause()}
                  disabled={pauseBusy || state.connection !== 'ready' || state.phase !== 'playing'}
                >
                  <Icon name={state.paused ? 'play' : 'pause'} size={16} />
                  <span>
                    {pauseBusy
                      ? 'Применяем…'
                      : state.paused
                        ? 'Снять игру и ботов с паузы'
                        : 'Поставить игру и ботов на паузу'}
                  </span>
                </button>
              </div>}

              <div className="escape-participants">
                <div className="escape-section-head">
                  <h3>
                    <span>Участники (Жюри)</span>
                  </h3>
                  <span className="muted">
                    {rows.filter(r => r.connected).length} из {rows.length} в сети
                  </span>
                </div>

                <div className="escape-table-wrap">
                  <table className="escape-table">
                    <thead>
                      <tr>
                        <th>Участник</th>
                        <th>FPS</th>
                        <th>Пинг</th>
                        <th>Действие в данный момент</th>
                        {state.phase === 'lobby' && <th>Управление</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(participant => (
                        <tr key={participant.id} className={!participant.connected ? 'offline-row' : ''}>
                          <td>
                            <div className="participant-cell">
                              <span className={`status-dot ${participant.connected ? '' : 'disconnected'}`} />
                              <strong>{participant.name}</strong>
                              {participant.id === state.playerId && <span className="participant-tag">Вы</span>}
                              {participant.role === 'leader' && <span className="participant-tag host">Хост</span>}
                              {participant.speaking && (
                                <span className="participant-mic-badge" title="Сейчас говорит в голосовой чат">
                                  <Icon name="mic" size={14} />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="mono-cell">
                            {participant.connected ? `${participant.fps} FPS` : '—'}
                          </td>
                          <td className="mono-cell">
                            {participant.connected ? `${participant.pingMs} мс` : '—'}
                          </td>
                          <td>
                            <span className={`action-pill action-${participant.activityCode}`}>
                              {participant.actionText}
                            </span>
                          </td>
                          {state.phase === 'lobby' && <td>
                            {participant.id !== state.playerId && participant.role !== 'leader' && <button type="button" className="kick-button" onClick={() => setKickCandidate(participant.id)}>Кикнуть</button>}
                          </td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {state.phase === 'lobby' && kickCandidate && <div className="kick-confirm" role="group" aria-label="Подтверждение удаления участника">
                  <span>Удалить {rows.find(row => row.id === kickCandidate)?.name ?? 'участника'} из лобби? Он не сможет вернуться по этому коду.</span>
                  <div><button type="button" className="secondary" onClick={() => setKickCandidate(null)} disabled={kickBusy}>Отмена</button><button type="button" className="kick-confirm-button" onClick={() => void handleKick()} disabled={kickBusy}>{kickBusy ? 'Удаляем…' : 'Удалить'}</button></div>
                </div>}
              </div>
            </section>
          )}
        </div>

        <footer className="escape-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Продолжить игру <kbd>Esc</kbd>
          </button>
          <button type="button" className="text-button danger-text" onClick={onExit}>
            Выйти из комнаты ↗
          </button>
        </footer>
      </div>
    </div>
  );
}
