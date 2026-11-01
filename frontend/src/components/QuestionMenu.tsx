import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { command, useClient } from '../core/client';
import { C2S } from '../shared/contract';
import { createId } from '../shared/id';
import { Icon } from './Icon';
import { npcLabel } from '../shared/npcLabel';

/** <summary>The server owns question limits, including after late join and reconnect.</summary> */
export function QuestionMenu({ onClose }: { onClose: () => void }) {
  const state = useGameStore(); const client = useClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({}); const [selected, setSelected] = useState('');
  const ask = async () => {
    const text = drafts[selected]?.trim(); if (!text || state.questions.pending) return;
    if (await command(client, C2S.ASK_QUESTION, { requestId: createId(), targetNpc: selected, text })) setDrafts(current => ({ ...current, [selected]: '' }));
  };
  return <section className="question-panel" role="dialog" aria-label="Допрос"><header><div><span className="eyebrow">РАУНД {state.round?.n} / ДОПРОС</span><h2>Спросите о деталях.</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть допрос"><Icon name="close" /></button></header><p className="muted">Задавайте вопросы разным участникам.<br />{`Осталось вопросов: ${state.questions.remaining}${state.gameInfo ? ` из ${state.gameInfo.questionLimit}` : ''}`}</p>
    <div className="question-grid">{state.npcs.map(npc => <button key={npc.id} className={selected === npc.id ? 'active' : ''} disabled={state.questions.askedTo.includes(npc.id) || state.questions.pending || state.questions.remaining === 0} onClick={() => setSelected(npc.id)}><span style={{ background: npc.color }}>[{npc.number}]</span>{npc.name}{state.questions.askedTo.includes(npc.id) && <Icon name="check" size={14} />}</button>)}</div>
    {state.npcs.map(npc => selected === npc.id && <label className="block" key={npc.id}><span className="field-label">Ваш вопрос участнику {npcLabel(npc)}</span><textarea autoFocus value={drafts[npc.id] || ''} onChange={e => setDrafts(d => ({ ...d, [npc.id]: e.target.value }))} placeholder="Что именно произошло в тот вечер?" rows={3} maxLength={state.gameInfo?.questionMaxLength} /></label>)}
    <button className="primary w-full mt-5" onClick={() => void ask()} disabled={!selected || !drafts[selected]?.trim() || state.questions.pending || state.questions.remaining === 0 || state.connection !== 'ready' || state.round?.phase !== 'interrogation' || state.roundEnded || state.questions.askedTo.includes(selected)}>{state.questions.pending ? 'Ожидаем подтверждение…' : 'Задать вопрос'}<Icon name="arrow" /></button><button className="text-button mt-4" onClick={onClose}>Пропустить · вернуться к наблюдению</button>
  </section>;
}
