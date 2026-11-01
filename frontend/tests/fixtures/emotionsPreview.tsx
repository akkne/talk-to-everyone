import { createRoot } from 'react-dom/client';
import { ClientContext } from '../../src/core/client';
import { Chat } from '../../src/components/Chat';
import { Scene } from '../../src/scene/Scene';
import { S2C } from '../../src/shared/contract';
import { EMOTIONS, type NpcEmotion } from '../../src/shared/dialogue';
import type { GameClient } from '../../src/shared/types';
import { applyGameEvent, resetGame, useGameStore } from '../../src/store/gameStore';
import { previewScene } from './previewScene';
import '../../src/styles.css';

// Development-only fixture: the real scene, store and transcript with deterministic NpcSay events.
const npcs = ['Аня', 'Боря', 'Вика'].map((name, i) => ({ id: `npc-${i}`, number: i + 1, name, color: ['#699fa5', '#bb795e', '#a58cb7'][i], anchorId: `anchor-${i}` }));
const scene = structuredClone(previewScene);
scene.npcStands = npcs.map((npc, i) => ({ id: npc.anchorId, position: { x: (i - 1) * 2.3, y: 0, z: -2 }, yaw: 0, level: 0 }));
scene.room.obstacles = []; scene.playerSeats = [];
const client: GameClient = { connect: async () => {}, disconnect: async () => {}, send: async () => {}, setPose() {}, syncPose() {} };
const texts: Record<NpcEmotion, string> = {
  neutral: 'Мы познакомились на учебе. Я объясню, почему помню этот день.',
  happy: 'А помнишь, как мы заблудились по дороге на концерт? До сих пор смеюсь!',
  sad: 'Мне обидно, что вы нам не верите. Мы через многое прошли вместе.',
  angry: 'Почему вы обвиняете моего друга? Я помню эту историю и готова его защитить!',
  surprised: 'Подожди, откуда ты знаешь эту деталь? Мы никому об этом не рассказывали!',
};
let seq = 0;
function reset() {
  resetGame();
  applyGameEvent(S2C.GAME_STARTED, { npcs, rounds: [], sceneVersion: scene.version });
  applyGameEvent(S2C.ROUND_STARTED, { n: 5, phase: 'debate', endsAt: Date.now() + 120000, choiceEndsAt: null });
  useGameStore.setState({ connection: 'ready', scene, playerId: 'me', players: [{ id: 'me', name: 'Судья', connected: true, pose: { position: { x: 0, y: 0, z: 3 }, yaw: 0, pitch: -0.12, mode: 'walking', seatId: null, seq: ++seq } }] });
}
function say(emotion: NpcEmotion, npcIndex = 1) {
  applyGameEvent(S2C.NPC_SAY, { id: `preview-${++seq}`, npc: npcs[npcIndex].id, text: texts[emotion], emotion, inReplyTo: null, at: Date.now() });
}
reset();
function Preview() {
  const active = useGameStore(s => s.dialogue.current);
  const pending = useGameStore(s => s.dialogue.pending.length);
  return <ClientContext.Provider value={client}><div className="game-page">
    <header style={{ padding: 18, color: '#283e4a', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <strong>Проверка эмоций · Раунд 5</strong>
      {Object.entries(EMOTIONS).map(([emotion, mood]) => <button className="secondary" key={emotion} onClick={() => { reset(); say(emotion as NpcEmotion); }}>{mood.emoji} {mood.label}</button>)}
      <button className="primary" onClick={() => { reset(); (Object.keys(EMOTIONS) as NpcEmotion[]).forEach((mood, i) => say(mood, i % 3)); }}>Перепалка: 5 реплик</button>
      <button className="secondary" onClick={reset}>Сбросить</button>
      <span role="status">{active ? `${EMOTIONS[active.message.emotion as NpcEmotion].label} · ${active.revealed ? 'Речь' : 'Реакция'}` : 'Готово'} · В очереди: {pending}</span>
    </header>
    <div className="scene-area" style={{ top: 120, bottom: 0 }}><Scene controlsBlocked /></div><Chat />
  </div></ClientContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
