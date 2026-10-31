import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useCacheStore } from '../store/cacheStore';
import { command, useClient } from '../core/client';
import { C2S, NET } from '../shared/contract';
import { UI } from '../shared/config';
import { Icon } from './Icon';

/** <summary>The server owns question limits, including after late join and reconnect.</summary> */
export function QuestionMenu({ onClose }: { onClose: () => void }) {
  const state = useGameStore(); const entries = useCacheStore(s => s.entries); const client = useClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({}); const [selected, setSelected] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (!state.questionPending) clearTimeout(timer.current); }, [state.questionPending]);
  const ask = async () => {
    const text = drafts[selected]?.trim(); if (!text || state.questionPending) return;
    useGameStore.setState({ questionPending: true });
    timer.current = setTimeout(() => useGameStore.setState({ questionPending: false, error: 'Ответ на вопрос задерживается. Лимит проверяет сервер; перед повтором проверьте ленту реплик.' }), NET.LLM_TIMEOUT_MS + 2000);
    if (!await command(client, C2S.ASK_QUESTION, { targetNpc: selected, text })) useGameStore.setState({ questionPending: false });
    else {
      if (!useGameStore.getState().questionPending) clearTimeout(timer.current);
      setDrafts(current => ({ ...current, [selected]: '' }));
    }
  };
  return <section className="question-panel" role="dialog" aria-label="Допрос"><header><div><span className="eyebrow">РАУНД 04 / ДОПРОС</span><h2>Спросите о деталях.</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть допрос"><Icon name="close" /></button></header><p className="muted">Два вопроса двум разным участникам.<br />{state.remaining === null ? 'После входа остаток уточнит сервер при запросе.' : `Осталось вопросов: ${state.remaining} из 2`}</p>
    <div className="question-grid">{state.npcs.map(npc => <button key={npc.id} className={selected === npc.id ? 'active' : ''} disabled={state.askedTo.includes(npc.id) || state.questionPending || state.remaining === 0} onClick={() => setSelected(npc.id)}><span style={{ background: npc.color }}>{String(npc.index + 1).padStart(2, '0')}</span>{entries[npc.id]?.details.displayName || `Участник ${npc.index + 1}`}{state.askedTo.includes(npc.id) && <Icon name="check" size={14} />}</button>)}</div>
    {state.npcs.map(npc => selected === npc.id && <label className="block" key={npc.id}><span className="field-label">Ваш вопрос участнику № {npc.index + 1}</span><textarea autoFocus value={drafts[npc.id] || ''} onChange={e => setDrafts(d => ({ ...d, [npc.id]: e.target.value }))} placeholder="Что именно произошло в тот вечер?" rows={3} maxLength={UI.QUESTION_MAX_LEN} /></label>)}
    <button className="primary w-full mt-5" onClick={() => void ask()} disabled={!selected || !drafts[selected]?.trim() || state.questionPending || state.remaining === 0 || state.connection !== 'ready' || state.round.n !== 4 || state.roundEnded || state.askedTo.includes(selected)}>{state.questionPending ? 'Ожидаем подтверждение…' : 'Задать вопрос'}<Icon name="arrow" /></button><button className="text-button mt-4" onClick={onClose}>Пропустить · вернуться к наблюдению</button>
  </section>;
}
