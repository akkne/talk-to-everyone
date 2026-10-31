import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useCacheStore } from '../store/cacheStore';
import { C2S } from '../shared/contract';
import { createId } from '../shared/id';
import { command, useClient } from '../core/client';

export function Voting() {
  const { voting, npcs, connection, teamScore } = useGameStore();
  const entries = useCacheStore(s => s.entries); const client = useClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  if (!voting) return null;
  const label = (id: string) => {
    const npc = npcs.find(n => n.id === id);
    return `№ ${String(npc?.number ?? '?').padStart(2, '0')}${entries[id] ? ` · ${entries[id].details.displayName}` : ''}`;
  };
  const disabled = pending || voting.submitted || !voting.eligible || connection !== 'ready' || now >= voting.endsAt;
  const chosen = voting.candidates.find(pair => pair.join(':') === selected);
  const submit = async () => {
    if (!chosen || disabled) return;
    setPending(true);
    await command(client, C2S.SUBMIT_PAIR, { requestId: createId(), round: voting.round, stage: voting.stage, a: chosen[0], b: chosen[1] });
    setPending(false);
  };
  return <section className="voting-overlay" role="dialog" aria-modal="true" aria-labelledby="voting-title">
    <div className="voting-panel">
      <header><span className="eyebrow">ЖЮРИ · ПОСЛЕ РАУНДА {voting.round} · ТУР {voting.stage}</span>
        <h2 id="voting-title">{voting.stage === 1 ? 'Кто здесь друзья?' : 'Выберите из предложенных пар'}</h2>
        <p>{voting.stage === 1 ? 'Выберите двух участников. Эта пара покинет площадку у всех игроков.' : 'Мнения разошлись. В таблице остались только пары, получившие голоса в первом туре.'}</p>
        <div className="voting-status"><span>Голосов: {voting.received} / {voting.total}</span><b role="timer">{Math.max(0, Math.ceil((voting.endsAt - now) / 1000))} сек.</b><span>Общий счёт: {teamScore}</span></div>
      </header>
      <div className="voting-table-wrap"><table className="voting-table"><thead><tr><th>Участник</th><th>Предполагаемый друг</th><th>Ваш выбор</th></tr></thead><tbody>
        {voting.candidates.map(([a, b]) => { const key = [a, b].join(':'); return <tr key={key} className={selected === key ? 'selected' : ''}>
          <td><label htmlFor={`vote-${key}`}>{label(a)}</label></td><td><label htmlFor={`vote-${key}`}>{label(b)}</label></td>
          <td><input id={`vote-${key}`} type="radio" name="pair-vote" aria-label={`${label(a)} и ${label(b)}`} checked={selected === key} disabled={disabled} onChange={() => setSelected(key)} /></td>
        </tr>; })}
      </tbody></table></div>
      <footer><p role="status">{voting.submitted ? 'Ваш голос принят. Ждём остальных.' : !voting.eligible ? 'Вы подключились после начала голосования. Дождитесь следующего.' : 'Верная пара: +300 / +200 / +100 по раундам. Друг и актёр: −100; два актёра: −150.'}<br /><small>{voting.stage === 2 ? 'Победит пара с наибольшим числом голосов. При ничьей — случайная из лидеров.' : 'Если голоса разойдутся, пройдёт повторный тур.'} Если голосов нет — случайная пара из таблицы.</small></p>
        <button className="primary" disabled={disabled || !chosen} onClick={() => void submit()}>{voting.submitted ? 'Голос принят' : pending ? 'Отправляем…' : 'Проголосовать'}</button></footer>
    </div>
  </section>;
}
