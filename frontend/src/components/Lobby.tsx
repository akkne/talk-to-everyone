import { useState, type FormEvent } from 'react';
import { useGameStore } from '../store/gameStore';
import { C2S } from '../shared/contract';
import { command, useClient } from '../core/client';
import { Icon } from './Icon';

interface Props { onConnect: (name: string, token: string) => Promise<void>; onExit: () => void }
/** <summary>One-session lobby; credentials are never persisted to browser storage.</summary> */
export function Lobby({ onConnect, onExit }: Props) {
  const [name, setName] = useState(''); const [token, setToken] = useState(''); const [starting, setStarting] = useState(false);
  const { connection, lobby, playerId } = useGameStore(); const client = useClient();
  const connected = connection === 'ready'; const busy = !['offline', 'ready'].includes(connection);
  const leader = lobby?.leaderId === playerId;
  const submit = (event: FormEvent) => { event.preventDefault(); void onConnect(name.trim(), token); setToken(''); };
  const start = async () => { setStarting(true); await command(client, C2S.START_GAME, undefined); setStarting(false); };
  return <main className="lobby-page">
    <header className="lobby-header"><a className="wordmark" href="/" aria-label="Угадай друзей — главная"><span className="brand-mark">у.</span>угадай друзей<span className="brand-period">®</span></a><span className="eyebrow">БЮРО СОЦИАЛЬНЫХ РАССЛЕДОВАНИЙ</span><span className="edition">ДЕЛО № 001 / 2026</span></header>
    <div className="lobby-grid">
      <section className="lobby-intro">
        <div className="case-label"><span className="status-dot" /> СОЦИАЛЬНЫЙ ДЕТЕКТИВ <span className="ml-3 opacity-40">01 — 05</span></div>
        <h1>Друзья.<br />Или хорошие<br /><em>актёры?</em></h1>
        <p className="intro-copy">Десять незнакомцев за одним столом.<br />Одни делят воспоминания. Другие их придумывают.<br /><span>Сможете отличить дружбу от убедительной истории?</span></p>
        <div className="case-facts"><div><b>10</b><span>подозреваемых</span></div><div><b>03</b><span>пары друзей</span></div><div><b>04</b><span>актёра-одиночки</span></div></div>
        <div className="intro-note"><span>↳</span> Слушайте. Сопоставляйте. Не верьте первому впечатлению.</div>
      </section>
      <section className="entry-area">
        <div className="entry-card">
          <div className="flex items-center justify-between"><span className="eyebrow">ВАШЕ МЕСТО ЗА СТОЛОМ</span><Icon name="eye" /></div>
          <h2>{connected ? 'Вы в деле.' : 'Войти в расследование'}</h2>
          {connected ? <div>
            <p className="muted mb-5">Сессия {lobby?.sessionId || 'подключена'}</p>
            <div className="lobby-players">{lobby?.players.map(p => <div key={p.id}><span className={`status-dot ${p.connected ? '' : 'opacity-30'}`} /><span>{p.name}{p.id === playerId ? ' · вы' : ''}</span><small>{p.id === lobby.leaderId ? 'ведущий' : 'судья'}</small></div>)}</div>
            <button className="primary w-full" onClick={() => void start()} disabled={!lobby?.canStart || !leader || starting}>{starting ? 'Начинаем…' : leader ? 'Начать расследование' : 'Ожидаем ведущего'}<Icon name="arrow" /></button>
            {!lobby?.canStart && <p className="muted text-xs mt-3">Нужно игроков: {lobby?.minPlayers ?? 'уточняется'}</p>}
            <button className="text-button mt-4" onClick={onExit}>Выйти из сессии</button>
          </div> : <form onSubmit={submit}>
            <label className="field-label" htmlFor="judge-name">Как вас представить?</label>
            <input id="judge-name" value={name} onChange={e => setName(e.target.value)} maxLength={32} required placeholder="Ваше имя" autoComplete="nickname" disabled={busy} />
            <label className="field-label mt-4" htmlFor="session-token">Токен сессии <span>от организатора</span></label>
            <input id="session-token" type="password" value={token} onChange={e => setToken(e.target.value)} required placeholder="Введите токен" autoComplete="off" disabled={busy} />
            <button className="primary w-full mt-6" disabled={busy || !name.trim() || !token}>{busy ? 'Подключаемся…' : 'Занять место'}<Icon name="arrow" /></button>
            <p className="entry-hint"><Icon name="lock" size={13} /> Токен используется только для входа в сессию</p>
            {busy && <button type="button" className="text-button mt-3" onClick={onExit}>Отменить подключение</button>}
          </form>}
        </div>
      </section>
    </div>
    <footer className="lobby-footer"><span>ПРАВДА КРОЕТСЯ В ДЕТАЛЯХ.</span><span>5 раундов <i /> одна общая история <i /> ваше решение</span><span>МЫШЬ + КЛАВИАТУРА ↗</span></footer>
  </main>;
}
