import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useCacheStore } from '../store/cacheStore';
import { Icon } from './Icon';

/** <summary>Bounded transcript. Each NpcSay is displayed verbatim as one received fragment.</summary> */
export function Chat() {
  const chat = useGameStore(s => s.chat); const npcs = useGameStore(s => s.npcs);
  const reactions = useGameStore(s => s.reactions); const debug = useGameStore(s => s.debug);
  const entries = useCacheStore(s => s.entries); const list = useRef<HTMLDivElement>(null); const follow = useRef(true);
  useEffect(() => { if (follow.current && list.current) list.current.scrollTop = list.current.scrollHeight; }, [chat]);
  return <aside className="chat-panel"><header><div className="flex items-center gap-2"><Icon name="sound" size={16} /><span className="eyebrow">ЗА СТОЛОМ</span></div><span className="recording"><i />LIVE</span></header>
    <div className="chat-list" ref={list} role="log" aria-label="Реплики участников" onScroll={e => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50; }}>
      {!chat.length && <div className="chat-empty"><Icon name="sound" size={30} /><p>Сначала послушаем.</p><span>Здесь появятся реплики участников.<br />Замечайте детали и противоречия.</span></div>}
      {chat.map(message => { const npc = npcs.find(n => n.id === message.npc); return <div className="chat-message" key={message.id}><span className="chat-avatar" style={{ background: npc?.color }}>{(npc?.index ?? 0) + 1}</span><div><b>{entries[message.npc]?.details.displayName || `Незнакомец ${String((npc?.index ?? 0) + 1).padStart(2, '0')}`}</b>{message.inReplyTo && <small>ответ на вопрос</small>}<p>{message.text}</p></div></div>; })}
    </div><footer>Уверенный голос — ещё не доказательство.</footer>
    {import.meta.env.DEV && debug && <div className="debug-reasons">{reactions.slice(-4).map((r, i) => <p key={i}>{r.npc}: {r.reason || r.reaction}</p>)}</div>}
  </aside>;
}
