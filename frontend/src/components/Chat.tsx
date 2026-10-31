import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';

/** <summary>Bounded transcript. Each NpcSay is displayed verbatim as one received fragment.</summary> */
export function Chat() {
  const chat = useGameStore(s => s.chat); const npcs = useGameStore(s => s.npcs);
  const list = useRef<HTMLDivElement>(null); const follow = useRef(true);
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 680px)').matches);
  useEffect(() => { if (follow.current && list.current) list.current.scrollTop = list.current.scrollHeight; }, [chat]);
  return <aside className={`chat-panel${open ? '' : ' is-collapsed'}`}><header><div className="flex items-center gap-2"><Icon name="sound" size={16} /><span className="eyebrow">ЗА СТОЛОМ</span></div><button className="chat-toggle" type="button" aria-label={open ? 'Свернуть чат' : 'Развернуть чат'} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Свернуть' : `Чат${chat.length ? ` · ${chat.length}` : ''}`}</button></header>
    <div className="chat-list" ref={list} role="log" aria-label="Реплики участников" onScroll={e => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50; }}>
      {!chat.length && <div className="chat-empty"><Icon name="sound" size={30} /><p>Сначала послушаем.</p><span>Здесь появятся реплики участников.<br />Замечайте детали и противоречия.</span></div>}
      {chat.map(message => { const npc = npcs.find(n => n.id === message.npc); return <div className="chat-message" key={message.id}><span className="chat-avatar" style={{ background: npc?.color }}>{npc?.number ?? '?'}</span><div><b>{npc?.name ?? 'Участник'}</b>{message.inReplyTo && <small>ответ на вопрос</small>}<p>{message.text}</p></div></div>; })}
    </div><footer>Уверенный голос — ещё не доказательство.</footer>
  </aside>;
}
