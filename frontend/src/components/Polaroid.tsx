import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { NpcMeta } from '../shared/types';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';
import { npcLabel } from '../shared/npcLabel';

interface Props {
  npc: NpcMeta; selected: boolean; assigned: boolean; liar: boolean; locked: boolean;
  note: string; disabled: boolean; onSelect: () => void; onLiar: () => void; onNote: (text: string) => void;
}
/** <summary>A portrait and its public name survive cache eviction; notes are always plain text.</summary> */
export function Polaroid({ npc, selected, assigned, liar, locked, note, disabled, onSelect, onLiar, onNote }: Props) {
  const maxNoteLength = useGameStore(s => s.gameInfo?.noteMaxLength);
  const [editing, setEditing] = useState(false); const editor = useRef<HTMLDivElement>(null);
  useEffect(() => { if (editing && editor.current) { editor.current.textContent = note; editor.current.focus(); } }, [editing]); // Preserve in-progress typing on unrelated snapshots.
  return <article data-npc={npc.id} className={`polaroid ${selected ? 'selected' : ''} ${liar ? 'liar' : ''} ${assigned ? 'assigned' : ''}`} style={{ '--tilt': `${(npc.number % 3 - 1) * 2}deg`, '--person': npc.color } as CSSProperties} onContextMenu={event => { event.preventDefault(); if (!disabled) setEditing(true); }}>
    <span className="pin" aria-hidden="true" />
    <button className="photo-select" onClick={onSelect} disabled={disabled || assigned} aria-pressed={selected} aria-label={`Выбрать ${npcLabel(npc)}`}>
      <div className="portrait"><span className="photo-number">{npc.number}</span>{locked && <span className="photo-lock"><Icon name="lock" size={16} /></span>}{liar && <span className="actor-stamp">АКТЁР</span>}</div>
      <strong>{npcLabel(npc)}</strong>
    </button>
    <div className="photo-actions"><button onClick={() => setEditing(!editing)} disabled={disabled} title="Заметка — также по правому клику">{note ? '✎ заметка' : '+ заметка'}</button><button onClick={onLiar} disabled={disabled || (assigned && !liar)}>{liar ? 'Снять метку' : 'Актёр?'}</button></div>
    {editing ? <div className="note-editor"><div ref={editor} role="textbox" aria-label={`Заметка о ${npcLabel(npc)}`} contentEditable={!disabled} suppressContentEditableWarning
      onInput={e => { if (maxNoteLength !== undefined && (e.currentTarget.textContent?.length || 0) > maxNoteLength) e.currentTarget.textContent = e.currentTarget.textContent!.slice(0, maxNoteLength); }}
      onPaste={e => { e.preventDefault(); e.currentTarget.textContent = ((e.currentTarget.textContent || '') + e.clipboardData.getData('text/plain')).slice(0, maxNoteLength); }}
      onKeyDown={e => { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); e.currentTarget.blur(); } }}
      onBlur={e => { onNote((e.currentTarget.textContent || '').slice(0, maxNoteLength)); setEditing(false); }} /><small>{maxNoteLength === undefined ? 'Enter сохранить' : `до ${maxNoteLength} символов · Enter сохранить`}</small></div>
      : note && <button className="sticky-note" onClick={() => setEditing(true)} disabled={disabled}>{note}</button>}
  </article>;
}
