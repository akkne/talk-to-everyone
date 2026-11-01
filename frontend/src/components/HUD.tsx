import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useCacheStore } from '../store/cacheStore';
import { C2S } from '../shared/contract';
import { command, useClient } from '../core/client';
import { createId } from '../shared/id';
import { Icon } from './Icon';
import { Brand } from './Brand';

/** <summary>Display server deadlines and pause status; never advance a round locally when the countdown reaches zero.</summary> */
export function HUD({
  onExit,
  onQuestions,
  onOpenEscape,
}: {
  onExit: () => void;
  onQuestions: () => void;
  onOpenEscape?: () => void;
}) {
  const state = useGameStore();
  const cache = useCacheStore();
  const [now, setNow] = useState(Date.now());
  const [skipping, setSkipping] = useState(false);
  const client = useClient();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = state.paused
    ? state.pausedRemainingMs || Math.max(0, (state.round?.endsAt ?? 0) - now)
    : Math.max(0, (state.round?.endsAt ?? 0) - now);
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const round = state.round;
  const roundSpec = state.rounds.find(r => r.n === round?.n);

  const skipRound = async () => {
    setSkipping(true);
    await command(client, C2S.SKIP_ROUND, { requestId: createId() });
    setSkipping(false);
  };

  const me = state.players.find(p => p.id === state.playerId);
  const nearestSeat =
    me?.pose.mode === 'walking'
      ? state.scene?.playerSeats
          .filter(seat => !state.seats.some(s => s.id === seat.id && s.occupiedBy))
          .map(seat => ({
            seat,
            distance: Math.hypot(
              seat.position.x - me.pose.position.x,
              seat.position.y - me.pose.position.y,
              seat.position.z - me.pose.position.z
            ),
          }))
          .filter(item => item.distance <= 1.5)
          .sort((a, b) => a.distance - b.distance)[0]?.seat
      : null;

  return (
    <>
      <header className="game-header">
        <Brand onClick={onExit} />
        <div className="round-header">
          <span className="eyebrow">
            РАУНД {state.round?.n} / {state.rounds.length}
            {state.paused ? ' · ПАУЗА' : ''}
          </span>
          <strong>
            {round?.phase === 'choice' ? 'Выбор пары' : roundSpec?.title || 'Ожидаем начало'}
          </strong>
        </div>
        <div className={`timer ${!state.paused && seconds < 20 ? 'urgent' : ''} ${state.paused ? 'paused' : ''}`}>
          <span>
            {state.connection !== 'ready'
              ? 'нет синхронизации'
              : state.paused
                ? 'игра на паузе'
                : seconds === 0 || state.roundEnded
                  ? 'ожидаем сервер'
                  : 'до конца раунда'}
          </span>
          <b>{time}</b>
        </div>
        <div className="score">
          <span>общий счёт</span>
          <b>
            {state.teamScore} <small>оч.</small>
          </b>
        </div>
        {state.role === 'leader' && round && round.phase !== 'resolved' && (
          <button
            className="skip-round"
            onClick={() => void skipRound()}
            disabled={skipping || seconds === 0 || state.roundEnded || state.connection !== 'ready'}
          >
            {skipping ? 'Завершаем…' : round.phase === 'choice' ? 'Завершить голосование' : 'Завершить раунд'}
          </button>
        )}
        <button
          type="button"
          className="secondary hud-menu-btn"
          onClick={() => (onOpenEscape ? onOpenEscape() : useGameStore.setState({ escapeOpen: true }))}
        >
          <Icon name="settings" size={15} />
          <span>Меню</span>
          <kbd>Esc</kbd>
        </button>
        <button className="exit-button" onClick={onExit}>
          Выйти ↗
        </button>
      </header>
      <div className="round-rail">
        {state.rounds.map(r => (
          <div
            key={r.n}
            className={r.n === state.round?.n ? 'current' : r.n < (state.round?.n ?? 0) ? 'done' : ''}
          >
            <span>{String(r.n).padStart(2, '0')}</span>
            <b>{r.title}</b>
          </div>
        ))}
      </div>

      <div className="game-controls">
        <span>
          <kbd>WASD</kbd> по карте <i />
          <kbd>МЫШЬ</kbd> осмотреться <i />
          <kbd>Esc</kbd> меню
        </span>
        <div>
          {me?.pose.mode === 'seated' && (
            <button
              className="secondary"
              disabled={state.connection !== 'ready'}
              onClick={() => void command(client, C2S.STAND_UP, { requestId: createId() })}
            >
              Встать
            </button>
          )}
          {nearestSeat && (
            <button
              className="secondary"
              disabled={state.connection !== 'ready'}
              onClick={() => void command(client, C2S.SIT_DOWN, { requestId: createId(), seatId: nearestSeat.id })}
            >
              Сесть
            </button>
          )}
          {state.round?.phase === 'interrogation' && (
            <button className="secondary" disabled={state.paused} onClick={onQuestions}>
              Задать вопрос <Icon name="arrow" size={16} />
            </button>
          )}
          <button className="primary" onClick={() => useGameStore.setState({ boardOpen: true })}>
            <Icon name="board" />
            Доска расследования
            <kbd>Tab</kbd>
          </button>
        </div>
      </div>
      <footer className="game-footer">
        <span>
          <span className={`status-dot ${state.connection === 'ready' ? '' : 'disconnected'}`} />
          {state.connection === 'ready'
            ? 'Сессия подключена'
            : state.connection === 'offline'
              ? 'Связь потеряна'
              : 'Восстанавливаем сессию…'}{' '}
          · {state.players.filter(p => p.connected).length} за столом
        </span>
        <span
          className="cache-metric"
          title={cache.warning || 'Резидентные детали NPC / размер мира из StateSnapshot'}
        >
          КЭШ {Object.keys(cache.entries).length}/1 · {cache.bytes.toLocaleString('ru')} /{' '}
          {cache.worldBytes.toLocaleString('ru')} B ·{' '}
          <b>{cache.ratio === null ? 'нет размера мира' : `${(cache.ratio * 100).toFixed(1)}%`}</b>
        </span>
        <span
          title={`Draw calls: ${state.metrics.calls}; triangles: ${state.metrics.triangles}; geometries: ${state.metrics.geometries}; textures: ${state.metrics.textures}`}
        >
          {state.metrics.fps} FPS{state.rtt !== null ? ` · ${state.rtt} ms` : ''}
        </span>
      </footer>
    </>
  );
}
