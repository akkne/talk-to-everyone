import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useCacheStore } from '../store/cacheStore';
import { GAME } from '../shared/contract';
import { Icon } from './Icon';

/** <summary>Display server deadlines; never advance a round locally when the countdown reaches zero.</summary> */
export function HUD({ onExit, onQuestions }: { onExit: () => void; onQuestions: () => void }) {
  const state = useGameStore(); const cache = useCacheStore(); const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((state.round.endsAt - now) / 1000));
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const round = GAME.ROUNDS.find(r => r.n === state.round.n);
  return <>
    <header className="game-header"><div className="wordmark"><span className="brand-mark">у.</span>угадай друзей</div><div className="round-header"><span className="eyebrow">РАУНД {state.round.n} / 05</span><strong>{round?.title || 'Ожидаем начало'}</strong></div><div className={`timer ${seconds < 20 ? 'urgent' : ''}`}><span>{state.connection !== 'ready' ? 'нет синхронизации' : seconds === 0 || state.roundEnded ? 'ожидаем сервер' : 'до конца раунда'}</span><b>{time}</b></div><div className="score"><span>ваш счёт</span><b>{state.score[state.playerId] ?? '—'} <small>оч.</small></b></div><button className="exit-button" onClick={onExit}>Выйти ↗</button></header>
    <div className="round-rail">{GAME.ROUNDS.map(r => <div key={r.n} className={r.n === state.round.n ? 'current' : r.n < state.round.n ? 'done' : ''}><span>{String(r.n).padStart(2, '0')}</span><b>{['Знакомство', 'Компромат', 'Слепые пятна', 'Допрос', 'Вскрытие'][r.n - 1]}</b></div>)}</div>
    {state.preview && <div className="preview-ribbon">ОСМОТР ИНТЕРФЕЙСА · сценарные реплики · без сервера, PostgreSQL и AI · раунды по 30 с</div>}
    <div className="scene-caption"><span className="eyebrow">НАБЛЮДАЙТЕ ЗА РЕАКЦИЕЙ</span><p>Некоторые истории<br /><em>узнают без слов.</em></p></div>
    <div className="game-controls"><span><kbd>МЫШЬ</kbd> осмотреться <i /><kbd>Esc</kbd> курсор</span><div>{state.round.n === 4 && <button className="secondary" onClick={onQuestions}>Задать вопрос <Icon name="arrow" size={16} /></button>}<button className="primary" onClick={() => useGameStore.setState({ boardOpen: true })}><Icon name="board" />Доска расследования<kbd>Tab</kbd></button></div></div>
    <footer className="game-footer"><span><span className={`status-dot ${state.connection === 'ready' ? '' : 'disconnected'}`} />{state.connection === 'ready' ? state.preview ? 'Локальный осмотр' : 'Сессия подключена' : state.connection === 'offline' ? 'Связь потеряна' : 'Восстанавливаем сессию…'} · {state.players.filter(p => p.connected).length} за столом</span><span className="cache-metric" title={cache.warning || 'Резидентные детали NPC / размер мира из StateSnapshot'}>КЭШ {Object.keys(cache.entries).length}/1 · {cache.bytes.toLocaleString('ru')} / {cache.worldBytes.toLocaleString('ru')} B · <b>{cache.ratio === null ? 'нет размера мира' : `${(cache.ratio * 100).toFixed(1)}%`}</b></span><span title={`Draw calls: ${state.metrics.calls}; triangles: ${state.metrics.triangles}; geometries: ${state.metrics.geometries}; textures: ${state.metrics.textures}`}>{state.metrics.fps} FPS{state.rtt !== null ? ` · ${state.rtt} ms` : ''}</span></footer>
  </>;
}
