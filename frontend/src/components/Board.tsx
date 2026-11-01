import { useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { C2S } from '../shared/contract';
import { lockedRound } from '../shared/config';
import { createId } from '../shared/id';
import { command, useClient } from '../core/client';
import { Polaroid } from './Polaroid';
import { Threads } from './Threads';
import { Icon } from './Icon';
import { npcLabel } from '../shared/npcLabel';

/** <summary>Board operations are commands; only BoardSnapshot changes the visible assignments.</summary> */
export function Board() {
  const { board, npcs, connection, phase, gameInfo } = useGameStore(); const client = useClient();
  const [selected, setSelected] = useState<string | null>(null); const root = useRef<HTMLDivElement>(null);
  const disabled = connection !== 'ready' || phase === 'reveal';
  const label = (id: string) => {
    const npc = npcs.find(n => n.id === id);
    return npc ? npcLabel(npc) : '[?] Участник';
  };
  const select = (id: string) => {
    if (selected === id) { setSelected(null); return; }
    if (!selected) { setSelected(id); return; }
    void command(client, C2S.PAIR_NPCS, { requestId: createId(), a: selected, b: id }); setSelected(null);
  };
  return <section className="board-overlay" role="dialog" aria-modal="true" aria-labelledby="board-title">
    <header className="board-header"><div><span className="eyebrow">ЛИЧНОЕ ДЕЛО / ВАШИ ВЕРСИИ</span><h2 id="board-title">Всё связано.</h2></div><p>Выберите две карточки, чтобы создать пару.<br /><span>Правый клик — оставить заметку.</span></p><button className="key-button" onClick={() => useGameStore.setState({ boardOpen: false })}>Закрыть <kbd>Tab</kbd><Icon name="close" size={16} /></button></header>
    <div className="board-scroll">
      <div className="board-sheet" ref={root}><Threads root={root} pairs={board.pairs} /><div className="polaroid-grid">{npcs.map(npc => {
        const pair = board.pairs.find(p => p.includes(npc.id)); const liar = board.liars.includes(npc.id);
        return <Polaroid key={npc.id} npc={npc} selected={selected === npc.id} assigned={!!pair || liar} liar={liar} locked={!!pair && lockedRound(board.locks, ...pair) !== undefined} note={board.notes[npc.id] || ''} disabled={disabled}
          onSelect={() => select(npc.id)} onLiar={() => { setSelected(null); void command(client, liar ? C2S.UNMARK_LIAR : C2S.MARK_LIAR, { requestId: createId(), npc: npc.id }); }} onNote={text => { void command(client, C2S.SAVE_NOTE, { requestId: createId(), npc: npc.id, text }); }} />;
      })}</div></div>
      <div className="assignment-grid"><section><div className="slot-heading"><span>ПРЕДПОЛАГАЕМЫЕ ДРУЗЬЯ</span><span>{board.pairs.length} / {gameInfo?.pairCount ?? '—'}</span></div><div className="pair-slots">{Array.from({ length: gameInfo?.pairCount ?? board.pairs.length }, (_, i) => {
        const pair = board.pairs[i]; const lock = pair ? lockedRound(board.locks, ...pair) : undefined;
        return <div className={`pair-slot ${pair ? 'filled' : ''}`} key={i}>{pair ? <><span className="pair-label"><span>{label(pair[0])}</span><span className="thread-symbol">⟷</span><span>{label(pair[1])}</span></span><div>{lock !== undefined ? <span className="lock-badge"><Icon name="lock" size={13} /> раунд {lock}</span> : <><button className="ml-3" aria-label={`Разъединить ${label(pair[0])} и ${label(pair[1])}`} disabled={disabled} onClick={() => void command(client, C2S.UNPAIR_NPCS, { requestId: createId(), a: pair[0], b: pair[1] })}><Icon name="close" size={14} /></button></>}</div></> : <span className="empty-slot">+ <span>Пара {i + 1}</span></span>}</div>;
      })}</div></section><section><div className="slot-heading"><span>АКТЁРЫ-ОДИНОЧКИ</span><span>{board.liars.length} / {gameInfo?.actorCount ?? '—'}</span></div><div className="liar-slots">{Array.from({ length: gameInfo?.actorCount ?? board.liars.length }, (_, i) => <div className={`liar-slot ${board.liars[i] ? 'filled' : ''}`} key={i}>{board.liars[i] ? <><span>{label(board.liars[i])}</span><button aria-label={`Снять метку актёра ${label(board.liars[i])}`} disabled={disabled} onClick={() => void command(client, C2S.UNMARK_LIAR, { requestId: createId(), npc: board.liars[i] })}><Icon name="close" size={12} /></button></> : '—'}</div>)}</div></section></div>
    </div>
    <footer className="board-footer"><span><span className="status-dot" /> {selected ? `Выбран ${label(selected)} — выберите второго` : 'Версии подтверждаются сервером'}</span>{gameInfo&&<span> Друг + актёр <b>{gameInfo.scoring.mixed}</b><i />Два актёра <b>{gameInfo.scoring.twoActors}</b></span>}</footer>
  </section>;
}
