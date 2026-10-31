import { useEffect, useState, type CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { useCacheStore } from '../store/cacheStore';
import { C2S } from '../shared/contract';
import { createId } from '../shared/id';
import { command, useClient } from '../core/client';

export function Voting() {
  const { voting, npcs, connection, teamScore, gameInfo, role } = useGameStore();
  const entries = useCacheStore(s => s.entries); const client = useClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [first, setFirst] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [now, setNow] = useState(Date.now());
  const [skipping, setSkipping] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  if (!voting) return null;
  const label = (id: string) => {
    const npc = npcs.find(n => n.id === id);
    return `№ ${String(npc?.number ?? '?').padStart(2, '0')}${entries[id] ? ` · ${entries[id].details.displayName}` : ''}`;
  };
  const disabled = pending || voting.submitted || !voting.eligible || connection !== 'ready' || now >= voting.endsAt;
  const chosen = voting.candidates.find(pair => pair.join(':') === selected);
  const available = new Set(voting.candidates.flat());
  const people = npcs.filter(npc => available.has(npc.id));
  const pick = (id: string) => {
    if (disabled) return;
    if (!first || first === id) { setFirst(first === id ? null : id); setSelected(null); return; }
    const pair = voting.candidates.find(([a, b]) => (a === first && b === id) || (a === id && b === first));
    setSelected(pair ? pair.join(':') : null);
    setFirst(pair ? null : id);
  };
  const submit = async () => {
    if (!chosen || disabled) return;
    setPending(true);
    await command(client, C2S.SUBMIT_PAIR, { requestId: createId(), round: voting.round, stage: voting.stage, a: chosen[0], b: chosen[1] });
    setPending(false);
  };
  const skip = async () => {
    setSkipping(true);
    await command(client, C2S.SKIP_ROUND, { requestId: createId() });
    setSkipping(false);
  };
  return <section className="voting-overlay" role="dialog" aria-modal="true" aria-labelledby="voting-title">
    <div className="voting-panel">
      <header><span className="eyebrow">ЖЮРИ · ПОСЛЕ РАУНДА {voting.round} · ТУР {voting.stage}</span>
        <h2 id="voting-title">{voting.stage === 1 ? 'Кто здесь друзья?' : 'Выберите из предложенных пар'}</h2>
        <p>{voting.stage === 1 ? 'Выберите две карточки. Эта пара покинет площадку у всех игроков.' : 'Мнения разошлись. Остались пары, получившие голоса в первом туре.'}</p>
        <div className="voting-status"><span>Голосов: {voting.received} / {voting.total}</span><b role="timer">{Math.max(0, Math.ceil((voting.endsAt - now) / 1000))} сек.</b><span>Общий счёт: {teamScore}</span></div>
      </header>
      <div className="voting-board">
        <div className="voting-board-heading"><span>{voting.stage === 1 ? 'ДОСКА УЧАСТНИКОВ' : 'ВТОРОЙ ТУР · ПАРЫ'}</span><strong>{chosen ? `Выбраны ${label(chosen[0])} и ${label(chosen[1])}` : first ? `${label(first)} — выберите второго` : 'Выберите пару'}</strong></div>
        {voting.stage === 1 ? <div className="voting-people">{people.map(npc => {
          const active = first === npc.id || !!chosen?.includes(npc.id);
          return <button key={npc.id} type="button" className={`voting-person ${active ? 'selected' : ''}`} onClick={() => pick(npc.id)} disabled={disabled} aria-pressed={active} aria-label={label(npc.id)} style={{ '--person': npc.color } as CSSProperties}>
            <span className="pin" aria-hidden="true" /><span className="portrait"><span className="photo-number">{String(npc.number).padStart(2, '0')}</span></span><strong>{entries[npc.id]?.details.displayName || `Незнакомец ${String(npc.number).padStart(2, '0')}`}</strong><small>{active ? '✓ выбрано' : 'выбрать'}</small>
          </button>;
        })}</div> : <div className="voting-pairs">{voting.candidates.map(([a, b]) => {
          const key = [a, b].join(':'); return <button key={key} type="button" className={`voting-pair ${selected === key ? 'selected' : ''}`} onClick={() => setSelected(key)} disabled={disabled} aria-pressed={selected === key}>
            <span>{label(a)}</span><i>⟷</i><span>{label(b)}</span><small>{selected === key ? '✓ выбрано' : 'выбрать'}</small>
          </button>;
        })}</div>}
      </div>
      <footer><p role="status">{voting.submitted ? 'Ваш голос принят. Ждём остальных.' : !voting.eligible ? 'Вы подключились после начала голосования. Дождитесь следующего.' : gameInfo ? `Верная пара: ${gameInfo.scoring.correct.map(x => `+${x.points} в раунде ${x.round}`).join(', ')}. Друг и актёр: ${gameInfo.scoring.mixed}; два актёра: ${gameInfo.scoring.twoActors}.` : 'Выберите пару для общего голосования.'}<br /><small>{voting.stage === 2 ? 'Победит пара с наибольшим числом голосов. При ничьей — случайная из лидеров.' : 'Если голоса разойдутся, пройдёт повторный тур.'} Если голосов нет — случайная пара из предложенных.</small></p>
        <div className="voting-actions">{role === 'leader' && <button className="secondary" disabled={skipping || connection !== 'ready' || now >= voting.endsAt} onClick={() => void skip()}>{skipping ? 'Завершаем…' : 'Завершить голосование'}</button>}<button className="primary" disabled={disabled || !chosen} onClick={() => void submit()}>{voting.submitted ? 'Голос принят' : pending ? 'Отправляем…' : 'Проголосовать'}</button></div></footer>
    </div>
  </section>;
}
