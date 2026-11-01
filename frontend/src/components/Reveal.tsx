import { useGameStore } from '../store/gameStore';
import { C2S } from '../shared/contract';
import { command, useClient } from '../core/client';
import { Icon } from './Icon';
import { Brand } from './Brand';
import { npcLabel } from '../shared/npcLabel';

/** Show the complete server-provided roster and results after the match. */
export function Reveal({ onExit }: { onExit: () => void }) {
  const { reveal, teamScore, npcs, scoreboard } = useGameStore();
  const client = useClient();
  const label = (id: string) => {
    const person = npcs.find(n => n.id === id);
    return person ? npcLabel(person) : '[?] Участник';
  };
  const backToLobby = async () => {
    const ok = await command(client, C2S.RESET_GAME, undefined);
    if (!ok) onExit();
  };

  return <div className="final-shell">
    <header className="final-header"><Brand onClick={onExit} /><span>Результаты игры</span></header>
    <main className="reveal-page">
      <div className="eyebrow">ИТОГИ РАССЛЕДОВАНИЯ</div>
      <h1>Теперь всё<br /><em>сходится.</em></h1>
      <p className="muted">Убедительная история ещё не делает человека другом.</p>
      <div className="reveal-score">
        <div className="reveal-team-score"><b>{teamScore}</b><span>общих очков</span></div>
        <div className="reveal-team-achievement"><span>Общее достижение команды</span><strong>{scoreboard[0]?.title ?? 'Ожидаем итоговый титул от сервера'}</strong></div>
      </div>

      {!reveal ? <div className="reveal-wait">Ожидаем итог от сервера.</div> : <div className="reveal-grid">
        <section>
          <h2>Настоящие друзья <small>Пар: {reveal.trueFriends.length}</small></h2>
          {reveal.trueFriends.map(([a, b]) => <div className="reveal-pair" key={`${a}:${b}`}>
            <strong>{label(a)}</strong>
            <span>⟷</span>
            <strong>{label(b)}</strong>
          </div>)}
        </section>
        <section>
          <h2>Играли роль <small>Актёров: {reveal.actors.length}</small></h2>
          <div className="reveal-actors">{reveal.actors.map(id => <div key={id}><b>{label(id)}</b></div>)}</div>
          <p className="reveal-lesson">Проверяйте общие детали, задавайте уточняющие вопросы и замечайте противоречия. Уверенность — не доказательство.</p>
        </section>
      </div>}

      <div className="flex gap-4 mt-4">
        <button className="primary" onClick={() => void backToLobby()}>Новая игра (в лобби)<Icon name="arrow" /></button>
        <button className="secondary" onClick={onExit}>Выйти из комнаты</button>
      </div>
    </main>
  </div>;
}
