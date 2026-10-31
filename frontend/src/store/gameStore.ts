import { create } from 'zustand';
import { GAME, S2C } from '../shared/contract';
import { UI } from '../shared/config';
import { createId } from '../shared/id';
import type { Board, Events, LobbyState, NpcMeta, Player, RevealData, Round } from '../shared/types';

export type ConnectionStatus = 'offline' | 'connecting' | 'authenticating' | 'syncing' | 'ready' | 'reconnecting';
interface GameState {
  connection: ConnectionStatus; preview: boolean; sessionId: string; playerId: string; role: string;
  phase: 'lobby' | 'playing' | 'reveal'; round: Round; roundEnded: boolean;
  lobby: LobbyState | null; players: Player[]; npcs: NpcMeta[]; board: Board;
  score: Record<string, number>; titles: Record<string, string>; reveal: RevealData | null;
  chat: (Events[typeof S2C.NPC_SAY] & { id: string })[];
  reactions: (Events[typeof S2C.NPC_REACTION] & { at: number })[];
  remaining: number | null; askedTo: string[]; questionPending: boolean; boardOpen: boolean;
  debug: boolean; error: string | null; rtt: number | null;
  metrics: { fps: number; calls: number; triangles: number; geometries: number; textures: number };
}
/** <summary>Return fresh collections so sessions cannot share mutable state.</summary> */
function initial(): GameState {
  return {
    connection: 'offline', preview: false, sessionId: '', playerId: '', role: '', phase: 'lobby',
    round: { n: 0, phase: 'lobby', endsAt: 0 }, roundEnded: false, lobby: null, players: [], npcs: [],
    board: { pairs: [], liars: [], locks: {}, notes: {} }, score: {}, titles: {}, reveal: null,
    chat: [], reactions: [], remaining: null, askedTo: [], questionPending: false,
    boardOpen: false, debug: false, error: null, rtt: null,
    metrics: { fps: 0, calls: 0, triangles: 0, geometries: 0, textures: 0 },
  };
}
export const useGameStore = create<GameState>(() => initial());
/** <summary>Clear local state on an explicit exit; token is owned only by the transport.</summary> */
export function resetGame() { useGameStore.setState(initial(), true); }

type Handlers = { [K in keyof Events]: (payload: Events[K]) => void };
const set = useGameStore.setState;
const handlers: Handlers = {
  [S2C.AUTH_OK]: p => set({ playerId: p.playerId, sessionId: p.sessionId, role: p.role }),
  [S2C.AUTH_ERR]: p => set({ error: p.message, connection: 'offline' }),
  [S2C.LOBBY_STATE]: p => set({ lobby: p }),
  [S2C.GAME_STARTED]: p => set({ phase: 'playing', npcs: p.npcs, remaining: GAME.QUESTIONS_PER_JUDGE, askedTo: [], reveal: null }),
  [S2C.ROUND_STARTED]: p => set({ round: p, roundEnded: false, questionPending: false, phase: p.phase === 'reveal' ? 'reveal' : 'playing' }),
  [S2C.ROUND_ENDED]: p => { if (p.n === useGameStore.getState().round.n) set({ roundEnded: true }); },
  [S2C.GAME_ENDED]: p => set({ phase: 'reveal', reveal: p.reveal, boardOpen: false, questionPending: false }),
  [S2C.STATE_SNAPSHOT]: p => {
    const me = typeof p.me === 'string' ? p.me : p.me.id ?? p.me.playerId;
    set({ sessionId: p.sessionId, playerId: me || useGameStore.getState().playerId,
      phase: !p.started ? 'lobby' : p.round.phase === 'reveal' ? 'reveal' : 'playing',
      round: p.round, roundEnded: false, players: p.players, npcs: p.npcs, board: p.board, score: p.score,
      remaining: p.started ? null : GAME.QUESTIONS_PER_JUDGE, askedTo: [], questionPending: false,
      reveal: null, chat: [], reactions: [], error: null,
    });
  },
  [S2C.CHUNK_DATA]: () => {}, // Details belong only to the bounded cache store.
  [S2C.PLAYERS_TICK]: p => set({ players: p.players }),
  [S2C.NPC_SAY]: p => set(s => ({ chat: [...s.chat, { ...p, text: p.text.slice(0, 4000), id: createId() }].slice(-UI.MAX_CHAT) })),
  [S2C.NPC_REACTION]: p => set(s => ({ reactions: [...s.reactions, { ...p, reason: import.meta.env.DEV ? p.reason : undefined, at: performance.now() }].slice(-UI.MAX_REACTIONS) })),
  [S2C.BOARD_SNAPSHOT]: p => set({ board: p.board }),
  [S2C.BOARD_REJECT]: p => set({ error: p.message }),
  [S2C.QUESTION_OK]: p => set({ remaining: p.remaining, askedTo: p.askedTo, questionPending: false }),
  [S2C.QUESTION_REJECT]: p => set({ error: p.message, questionPending: false }),
  [S2C.SCORE_UPDATE]: p => set({ score: Object.fromEntries(p.players.map(x => [x.id, x.score])), titles: Object.fromEntries(p.players.map(x => [x.id, x.title])) }),
  [S2C.SERVER_ERROR]: p => set({ error: p.message, questionPending: false }),
  [S2C.PONG]: p => set({ rtt: Math.max(0, Date.now() - p.t) }),
};
/** <summary>Every fixed S2C event has one typed handler, including events owned by cache/transport.</summary> */
export function applyGameEvent<K extends keyof Events>(event: K, payload: Events[K]) { handlers[event](payload); }
