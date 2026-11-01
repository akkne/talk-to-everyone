import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';
import { EMOTIONS, normalizeEmotion } from '../shared/dialogue';
import { npcLabel } from '../shared/npcLabel';

/** <summary>Bounded transcript. Each NpcSay is displayed verbatim as one received fragment.</summary> */
export function Chat() {
  const chat = useGameStore(s => s.chat); const npcs = useGameStore(s => s.npcs);
  const active = useGameStore(s => s.dialogue.current);
  const label = (id: string) => { const npc = npcs.find(n => n.id === id); return npc ? npcLabel(npc) : '[?] Участник'; };
  const list = useRef<HTMLDivElement>(null); const follow = useRef(true);
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 680px)').matches);
  useEffect(() => { if (follow.current && list.current) list.current.scrollTop = list.current.scrollHeight; }, [chat, active?.message.id]);
  return <aside className={`chat-panel${open ? '' : ' is-collapsed'}`}><header><div className="flex items-center gap-2"><Icon name="sound" size={16} /><span className="eyebrow">ЗА СТОЛОМ</span></div><button className="chat-toggle" type="button" aria-label={open ? 'Свернуть чат' : 'Развернуть чат'} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Свернуть' : `Чат${chat.length ? ` · ${chat.length}` : ''}`}</button></header>
    <div className="chat-list" ref={list} role="log" aria-label="Реплики участников" onScroll={e => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50; }}>
      {!chat.length && !active && <div className="chat-empty"><Icon name="sound" size={30} /><p>Сначала послушаем.</p><span>Здесь появятся реплики участников.<br />Замечайте детали и противоречия.</span></div>}
      {chat.map(message => { const npc = npcs.find(n => n.id === message.npc); const mood = EMOTIONS[normalizeEmotion(message.emotion)]; return <div className="chat-message" key={message.id}><span className="chat-avatar" style={{ background: npc?.color }}>{npc?.number ?? '?'}</span><div><b>{label(message.npc)} <span role="img" aria-label={mood.label} title={mood.label}>{mood.emoji}</span></b>{message.inReplyTo && <small>ответ на вопрос</small>}<p>{message.text}</p></div></div>; })}
      {active && !active.revealed && <div className="chat-message" role="status"><span className="chat-avatar" role="img" aria-label={EMOTIONS[normalizeEmotion(active.message.emotion)].label}>{EMOTIONS[normalizeEmotion(active.message.emotion)].emoji}</span><div><b>{label(active.message.npc)}</b><p>{EMOTIONS[normalizeEmotion(active.message.emotion)].label}…</p></div></div>}
    </div><footer>Уверенный голос — ещё не доказательство.</footer>
  </aside>;
}
