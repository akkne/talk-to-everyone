import { create } from 'zustand';
import { S2C } from '../shared/contract';
import { UI } from '../shared/config';
import type { Board, ChatMessage, Events, VotingState, GameInfo, LobbyState, NpcMeta, Player, QuestionState, RevealData, Round, RoundSpec, SceneSpec, SeatState } from '../shared/types';

export type ConnectionStatus = 'offline' | 'connecting' | 'authenticating' | 'syncing' | 'ready' | 'reconnecting';
interface GameState {
  connection: ConnectionStatus; sessionId: string; playerId: string; role: string;
  phase: 'lobby' | 'playing' | 'reveal'; round: Round | null; rounds: RoundSpec[]; roundEnded: boolean;
  lobby: LobbyState | null; scene: SceneSpec | null; players: Player[]; npcs: NpcMeta[]; seats: SeatState[]; board: Board;
  voting: VotingState | null; teamScore: number;
  score: Record<string, number>; titles: Record<string, string>; reveal: RevealData | null;
  chat: ChatMessage[]; questions: QuestionState; boardOpen: boolean;
  error: string | null; rtt: number | null;
  gameInfo: GameInfo | null; gameInfoError: string | null;
  metrics: { fps: number; calls: number; triangles: number; geometries: number; textures: number };
}
function initial(): GameState {
  return {
    voting: null, teamScore: 0, connection: 'offline', sessionId: '', playerId: '', role: '', phase: 'lobby',
    round: null, rounds: [], roundEnded: false, lobby: null, scene: null, players: [], npcs: [], seats: [],
    board: { pairs: [], liars: [], locks: {}, notes: {}, submitted: {} }, score: {}, titles: {}, reveal: null,
    chat: [], questions: { remaining: 0, askedTo: [], pending: false }, boardOpen: false,
    error: null, rtt: null, gameInfo: null, gameInfoError: null, metrics: { fps: 0, calls: 0, triangles: 0, geometries: 0, textures: 0 },
  };
}
export const useGameStore = create<GameState>(() => initial());
export function resetGame() {
  const { gameInfo, gameInfoError } = useGameStore.getState();
  useGameStore.setState({ ...initial(), gameInfo, gameInfoError }, true);
}
type Handlers = { [K in keyof Events]: (payload: Events[K]) => void };
const set = useGameStore.setState;
const scoreFields = (players: { id: string; score: number; title: string }[]) => ({
  score: Object.fromEntries(players.map(x => [x.id, x.score])),
  titles: Object.fromEntries(players.map(x => [x.id, x.title])),
});
const handlers: Handlers = {
  [S2C.VOTING_STATE]: p => set({ voting: p.stage ? p : null, boardOpen: false }),
  [S2C.NPCS_REMOVED]: p => set(s => ({
    teamScore: p.teamScore, voting: null,
    npcs: s.npcs.filter(n => !p.ids.includes(n.id)), chat: s.chat.filter(m => !p.ids.includes(m.npc)),
    board: {
      pairs: s.board.pairs.filter(pair => !pair.some(id => p.ids.includes(id))),
      liars: s.board.liars.filter(id => !p.ids.includes(id)),
      notes: Object.fromEntries(Object.entries(s.board.notes).filter(([id]) => !p.ids.includes(id))),
      locks: Object.fromEntries(Object.entries(s.board.locks).filter(([key]) => !key.split(':').some(id => p.ids.includes(id)))),
      submitted: Object.fromEntries(Object.entries(s.board.submitted).filter(([, pair]) => !pair?.some(id => p.ids.includes(id)))),
    },
  })),
  [S2C.AUTH_OK]: p => set({ playerId: p.playerId, sessionId: p.sessionId, role: p.role }),
  [S2C.AUTH_ERR]: p => set({ error: p.message, connection: 'offline' }),
  [S2C.LOBBY_STATE]: p => set({ lobby: p }),
  [S2C.GAME_STARTED]: p => set({ phase: 'playing', rounds: p.rounds, npcs: p.npcs, reveal: null }),
  [S2C.ROUND_STARTED]: p => set({ round: p, roundEnded: false, phase: 'playing' }),
  [S2C.ROUND_ENDED]: p => { if (p.n === useGameStore.getState().round?.n) set({ roundEnded: true }); },
  [S2C.GAME_ENDED]: p => set({ phase: 'reveal', reveal: p.reveal, boardOpen: false, voting: null, ...scoreFields(p.scoreboard) }),
  [S2C.STATE_SNAPSHOT]: p => set({
    sessionId: p.sessionId, playerId: p.me.id, role: p.me.role,
    phase: p.phase === 'finished' ? 'reveal' : p.phase,
    round: p.round, rounds: p.rounds, gameInfo: p.gameInfo, gameInfoError: null, roundEnded: false, scene: p.scene, players: p.players, npcs: p.npcs, seats: p.seats,
    voting: p.voting, teamScore: p.teamScore, board: p.board, questions: p.questions, chat: p.chat.slice(-UI.MAX_CHAT), score: p.score,
    titles: p.scoreboard ? scoreFields(p.scoreboard).titles : {}, reveal: p.reveal,
    error: null, boardOpen: false,
  }),
  [S2C.CHUNK_DATA]: () => {},
  [S2C.PLAYERS_TICK]: p => set({ players: p.players }),
  [S2C.SEAT_STATE]: p => set({ seats: p.seats }),
  [S2C.ACTION_REJECT]: p => set({ error: p.message }),
  [S2C.NPC_THINKING]: () => {},
  [S2C.NPC_SAY]: p => set(s => ({ chat: !s.npcs.some(n => n.id === p.npc) || s.chat.some(x => x.id === p.id) ? s.chat : [...s.chat, p].slice(-UI.MAX_CHAT) })),
  [S2C.BOARD_SNAPSHOT]: p => set({ board: p.board }),
  [S2C.BOARD_REJECT]: p => set({ error: p.message }),
  [S2C.PAIR_SUBMITTED]: () => {},
  [S2C.QUESTION_OK]: p => set({ questions: p.questions }),
  [S2C.QUESTION_STATE]: p => set({ questions: p.questions }),
  [S2C.QUESTION_REJECT]: p => set({ error: p.message }),
  [S2C.QUESTION_FAILED]: p => set({ error: p.message, questions: p.questions }),
  [S2C.SCORE_UPDATE]: p => set(scoreFields(p.players)),
  [S2C.SERVER_ERROR]: p => set({ error: p.message }),
  [S2C.PONG]: p => set({ rtt: Math.max(0, Date.now() - p.t) }),
};
export function applyGameEvent<K extends keyof Events>(event: K, payload: Events[K]) { handlers[event](payload); }
