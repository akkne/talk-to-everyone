import { useGameStore } from '../store/gameStore';
import { C2S } from '../shared/contract';
import { command, useClient } from '../core/client';
import { Icon } from './Icon';
import { Brand } from './Brand';

/** <summary>Reveal only server-provided roles; absent late-join reveal remains explicitly unknown.</summary> */
export function Reveal({ onExit }: { onExit: () => void }) {
  const { reveal, teamScore, titles, playerId, board, npcs } = useGameStore();
  const client = useClient();
  const number = (id: string) => String(npcs.find(n => n.id === id)?.number ?? '?').padStart(2, '0');
  const backToLobby = async () => {
    const ok = await command(client, C2S.RESET_GAME, undefined);
    if (!ok) onExit();
  };
  return <div className="final-shell"><header className="final-header"><Brand onClick={onExit} /><span>Результаты игры</span></header><main className="reveal-page"><div className="eyebrow">ИТОГИ РАССЛЕДОВАНИЯ</div><h1>Теперь всё<br /><em>сходится.</em></h1><p className="muted">Убедительная история ещё не делает человека другом.</p>
    <div className="reveal-score"><b>{teamScore}</b><span>общих очков<br />{titles[playerId] || 'Ожидаем итоговый титул от сервера'}</span></div>
    {!reveal ? <div className="reveal-wait">Ожидаем итог от сервера.</div> : <div className="reveal-grid"><section><h2>Настоящие друзья</h2>{reveal.trueFriends.map(([a, b]) => {
      const correct = board.pairs.some(pair => pair.includes(a) && pair.includes(b));
      return <div className={`reveal-pair ${correct ? 'correct' : ''}`} key={a}><strong>№ {number(a)}</strong><span>⟷</span><strong>№ {number(b)}</strong><small>{correct ? '✓ ваша пара совпала' : 'пара не угадана'}</small></div>;
    })}</section><section><h2>Играли роль</h2><div className="reveal-actors">{reveal.actors.map(id => <div key={id}><b>№ {number(id)}</b><span>{board.liars.includes(id) ? '✓ раскрыт' : 'не отмечен'}</span></div>)}</div><p className="reveal-lesson">Проверяйте общие детали, задавайте уточняющие вопросы и замечайте противоречия. Уверенность — не доказательство.</p></section></div>}
    <div className="flex gap-4 mt-4">
      <button className="primary" onClick={() => void backToLobby()}>Новая игра (в лобби)<Icon name="arrow" /></button>
      <button className="secondary" onClick={onExit}>Выйти из комнаты</button>
    </div>
  </main></div>;
}
