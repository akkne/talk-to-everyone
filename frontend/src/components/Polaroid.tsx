import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { NpcMeta } from '../shared/types';
import { GAME } from '../shared/contract';
import { useCacheStore } from '../store/cacheStore';
import { Icon } from './Icon';

interface Props {
  npc: NpcMeta; selected: boolean; assigned: boolean; liar: boolean; locked: boolean;
  note: string; disabled: boolean; onSelect: () => void; onLiar: () => void; onNote: (text: string) => void;
}
/** <summary>A metadata-only portrait survives cache eviction; notes are always plain text.</summary> */
export function Polaroid({ npc, selected, assigned, liar, locked, note, disabled, onSelect, onLiar, onNote }: Props) {
  const details = useCacheStore(s => s.entries[npc.id]?.details);
  const [editing, setEditing] = useState(false); const editor = useRef<HTMLDivElement>(null);
  useEffect(() => { if (editing && editor.current) { editor.current.textContent = note; editor.current.focus(); } }, [editing]); // Preserve in-progress typing on unrelated snapshots.
  return <article data-npc={npc.id} className={`polaroid ${selected ? 'selected' : ''} ${liar ? 'liar' : ''} ${assigned ? 'assigned' : ''}`} style={{ '--tilt': `${(npc.index % 3 - 1) * 2}deg`, '--person': npc.color } as CSSProperties} onContextMenu={event => { event.preventDefault(); if (!disabled) setEditing(true); }}>
    <span className="pin" aria-hidden="true" />
    <button className="photo-select" onClick={onSelect} disabled={disabled || assigned} aria-pressed={selected} aria-label={`Выбрать ${details?.displayName || `NPC ${npc.index + 1}`}`}>
      <div className="portrait"><span className="photo-number">{String(npc.index + 1).padStart(2, '0')}</span>{locked && <span className="photo-lock"><Icon name="lock" size={16} /></span>}{liar && <span className="actor-stamp">АКТЁР</span>}</div>
      <strong>{details?.displayName || `Незнакомец ${String(npc.index + 1).padStart(2, '0')}`}</strong>
    </button>
    <div className="photo-actions"><button onClick={() => setEditing(!editing)} disabled={disabled} title="Заметка — также по правому клику">{note ? '✎ заметка' : '+ заметка'}</button><button onClick={onLiar} disabled={disabled || (assigned && !liar)}>{liar ? 'Снять метку' : 'Актёр?'}</button></div>
    {editing ? <div className="note-editor"><div ref={editor} role="textbox" aria-label={`Заметка о NPC ${npc.index + 1}`} contentEditable={!disabled} suppressContentEditableWarning
      onInput={e => { if ((e.currentTarget.textContent?.length || 0) > GAME.NOTE_MAX_LEN) e.currentTarget.textContent = e.currentTarget.textContent!.slice(0, GAME.NOTE_MAX_LEN); }}
      onPaste={e => { e.preventDefault(); e.currentTarget.textContent = ((e.currentTarget.textContent || '') + e.clipboardData.getData('text/plain')).slice(0, GAME.NOTE_MAX_LEN); }}
      onKeyDown={e => { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); e.currentTarget.blur(); } }}
      onBlur={e => { onNote((e.currentTarget.textContent || '').slice(0, GAME.NOTE_MAX_LEN)); setEditing(false); }} /><small>до 200 символов · Enter сохранить</small></div>
      : note && <button className="sticky-note" onClick={() => setEditing(true)} disabled={disabled}>{note}</button>}
  </article>;
}
