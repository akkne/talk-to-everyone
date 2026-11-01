import { create } from 'zustand';
import { S2C } from '../shared/contract';
import { UI } from '../shared/config';
import { advanceSpeech, emptyDialogue, enqueueSpeech, removeSpeakers, type DialogueState } from '../shared/dialogue';
import type { Board, ChatMessage, Events, VotingState, GameInfo, LobbyState, NpcMeta, ParticipantStatus, Player, QuestionState, RevealData, Round, RoundSpec, SceneSpec, ScoreEntry, SeatState, VoiceSignalEnvelope } from '../shared/types';

export type ConnectionStatus = 'offline' | 'connecting' | 'authenticating' | 'syncing' | 'ready' | 'reconnecting';
interface GameState {
  connection: ConnectionStatus; sessionId: string; playerId: string; role: string;
  phase: 'lobby' | 'playing' | 'reveal'; round: Round | null; rounds: RoundSpec[]; roundEnded: boolean;
  lobby: LobbyState | null; scene: SceneSpec | null; players: Player[]; npcs: NpcMeta[]; seats: SeatState[]; board: Board;
  voting: VotingState | null; teamScore: number;
  score: Record<string, number>; titles: Record<string, string>; scoreboard: ScoreEntry[]; reveal: RevealData | null;
  chat: ChatMessage[]; questions: QuestionState; boardOpen: boolean; escapeOpen: boolean;
  paused: boolean; pausedRemainingMs: number; pausedBy: string | null;
  participants: ParticipantStatus[];
  speakingByPlayer: Record<string, boolean>;
  incomingVoiceSignal: VoiceSignalEnvelope | null;
  dialogue: DialogueState;
  thinkingNpc: string | null; thinkingAt: number;
  error: string | null; rtt: number | null;
  gameInfo: GameInfo | null; gameInfoError: string | null;
  metrics: { fps: number; calls: number; triangles: number; geometries: number; textures: number };
}
function initial(): GameState {
  return {
    voting: null, teamScore: 0, connection: 'offline', sessionId: '', playerId: '', role: '', phase: 'lobby',
    round: null, rounds: [], roundEnded: false, lobby: null, scene: null, players: [], npcs: [], seats: [],
    board: { pairs: [], liars: [], locks: {}, notes: {}, submitted: {} }, score: {}, titles: {}, scoreboard: [], reveal: null,
    chat: [], dialogue: emptyDialogue(), questions: { remaining: 0, askedTo: [], pending: false },
    boardOpen: false, escapeOpen: false, paused: false, pausedRemainingMs: 0, pausedBy: null,
    participants: [], speakingByPlayer: {}, incomingVoiceSignal: null,
    thinkingNpc: null, thinkingAt: 0,
    error: null, rtt: null, gameInfo: null, gameInfoError: null, metrics: { fps: 0, calls: 0, triangles: 0, geometries: 0, textures: 0 },
  };
}
export const useGameStore = create<GameState>(() => initial());

/** <summary>Determines whether the given role has host/admin privileges in the Escape menu.</summary> */
export function isHostRole(role: string): boolean {
  return role === 'leader';
}

/** The scene clock reveals the transcript on the same frame as the speech bubble. No delayed timers survive a reset. */
export function tickDialogue(now: number) {
  const state = useGameStore.getState();
  if (state.paused) return;
  const { dialogue, revealed } = advanceSpeech(state.dialogue, now);
  if (dialogue !== state.dialogue) useGameStore.setState({
    dialogue,
    ...(revealed ? { chat: [...state.chat, revealed].slice(-UI.MAX_CHAT) } : {}),
  });
}
/** Preserve received text at a round boundary, while cancelling performances from that round. */
function finishDialogue(state: GameState) {
  const current = state.dialogue.current;
  return {
    chat: [...state.chat, ...(current && !current.revealed ? [current.message] : []), ...state.dialogue.pending].slice(-UI.MAX_CHAT),
    dialogue: emptyDialogue(), thinkingNpc: null,
  };
}
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
const namedNpcs = (npcs: NpcMeta[]) => npcs.map(npc => ({
  ...npc,
  name: npc.name || 'Участник',
}));
const handlers: Handlers = {
  [S2C.VOTING_STATE]: p => set({ voting: p.stage ? p : null, boardOpen: false }),
  [S2C.NPCS_REMOVED]: p => set(s => ({
    teamScore: p.teamScore, voting: null,
    npcs: s.npcs.filter(n => !p.ids.includes(n.id)), chat: s.chat.filter(m => !p.ids.includes(m.npc)),
    dialogue: removeSpeakers(s.dialogue, p.ids, performance.now()),
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
  [S2C.LOBBY_STATE]: p => set(s => ({ lobby: p, role: p.leaderId === s.playerId ? 'leader' : 'judge' })),
  [S2C.GAME_STARTED]: p => set({ phase: 'playing', scene: p.scene, rounds: p.rounds, npcs: namedNpcs(p.npcs), reveal: null, scoreboard: [], chat: [], dialogue: emptyDialogue(), thinkingNpc: null, voting: null, teamScore: 0, paused: false, pausedRemainingMs: 0, pausedBy: null }),
  [S2C.ROUND_STARTED]: p => set(s => ({
    ...(s.round?.n !== p.n || s.round?.phase !== p.phase ? finishDialogue(s) : {}),
    round: p,
    roundEnded: false,
    phase: 'playing',
    paused: p.paused ?? s.paused,
    pausedRemainingMs: p.pausedRemainingMs ?? s.pausedRemainingMs,
  })),
  [S2C.ROUND_ENDED]: p => { if (p.n === useGameStore.getState().round?.n) set(s => ({ ...finishDialogue(s), roundEnded: true })); },
  [S2C.GAME_ENDED]: p => set(s => ({ ...finishDialogue(s), phase: 'reveal', reveal: p.reveal, npcs: namedNpcs(p.npcs), scoreboard: p.scoreboard, boardOpen: false, escapeOpen: false, voting: null, paused: false, pausedRemainingMs: 0, pausedBy: null, ...scoreFields(p.scoreboard) })),
  [S2C.STATE_SNAPSHOT]: p => {
    const speakingMap: Record<string, boolean> = {};
    for (const id of p.speakingPlayerIds ?? []) speakingMap[id] = true;
    for (const part of p.participants ?? []) if (part.speaking) speakingMap[part.id] = true;
    set({
      sessionId: p.sessionId, playerId: p.me.id, role: p.me.role,
      phase: p.phase === 'finished' ? 'reveal' : p.phase,
      round: p.round, rounds: p.rounds, gameInfo: p.gameInfo, gameInfoError: null, roundEnded: false, scene: p.scene, players: p.players, npcs: namedNpcs(p.npcs), seats: p.seats,
      voting: p.voting, teamScore: p.teamScore, board: p.board, questions: p.questions, chat: p.chat.slice(-UI.MAX_CHAT), dialogue: emptyDialogue(), thinkingNpc: null, score: p.score,
      titles: p.scoreboard ? scoreFields(p.scoreboard).titles : {}, scoreboard: p.scoreboard ?? [], reveal: p.reveal,
      paused: Boolean(p.paused ?? p.round?.paused),
      pausedRemainingMs: p.pausedRemainingMs ?? p.round?.pausedRemainingMs ?? 0,
      pausedBy: null,
      participants: p.participants ?? [],
      speakingByPlayer: speakingMap,
      incomingVoiceSignal: null,
      error: null, boardOpen: false,
    });
  },
  [S2C.LOCATION_STATE]: p => set(s => ({ scene:s.scene ? {...s.scene,doors:p.doors,foods:p.foods,activeLightingPreset:p.activeLightingPreset,fanOn:p.fanOn,musicTrack:p.musicTrack}:null })),
  [S2C.INTERACTION_FEEDBACK]: p => {
    window.dispatchEvent(new CustomEvent('location-feedback', {detail:p.message}));
    if (p.action === 'read_private_notes' || p.action === 'leave_note')
      set(s => ({ boardOpen: s.phase === 'playing' }));
  },
  [S2C.CHUNK_DATA]: () => {},
  [S2C.PLAYERS_TICK]: p => set({ players: p.players }),
  [S2C.SEAT_STATE]: p => set({ seats: p.seats }),
  [S2C.ACTION_REJECT]: p => set({ error: p.message }),
  [S2C.NPC_THINKING]: p => set({ thinkingNpc: p.npc, thinkingAt: performance.now() }),
  [S2C.NPC_SAY]: p => set(s => ({
    thinkingNpc: s.thinkingNpc === p.npc ? null : s.thinkingNpc,
    dialogue: s.phase !== 'playing' || !s.npcs.some(n => n.id === p.npc) || s.chat.some(x => x.id === p.id)
      ? s.dialogue : enqueueSpeech(s.dialogue, p, performance.now()),
  })),
  [S2C.BOARD_SNAPSHOT]: p => set({ board: p.board }),
  [S2C.BOARD_REJECT]: p => set({ error: p.message }),
  [S2C.PAIR_SUBMITTED]: () => {},
  [S2C.QUESTION_OK]: p => set({ questions: p.questions }),
  [S2C.QUESTION_STATE]: p => set({ questions: p.questions }),
  [S2C.QUESTION_REJECT]: p => set({ error: p.message }),
  [S2C.QUESTION_FAILED]: p => set({ error: p.message, questions: p.questions, thinkingNpc: null }),
  [S2C.SCORE_UPDATE]: p => set(scoreFields(p.players)),
  [S2C.SERVER_ERROR]: p => set({ error: p.message, thinkingNpc: null }),
  [S2C.PONG]: p => set({ rtt: Math.max(0, Date.now() - p.t) }),
  [S2C.PARTICIPANTS_UPDATED]: p => set(s => {
    const nextSpeaking = { ...s.speakingByPlayer };
    for (const part of p.participants) {
      nextSpeaking[part.id] = Boolean(part.speaking);
    }
    return { participants: p.participants, speakingByPlayer: nextSpeaking };
  }),
  [S2C.GAME_PAUSE_CHANGED]: p => set(s => ({
    paused: p.paused,
    pausedRemainingMs: p.pausedRemainingMs,
    pausedBy: p.pausedBy,
    round: s.round ? { ...s.round, endsAt: p.endsAt, paused: p.paused, pausedRemainingMs: p.pausedRemainingMs } : null,
  })),
  [S2C.VOICE_SIGNAL_RECEIVED]: p => set({ incomingVoiceSignal: p }),
  [S2C.VOICE_SPEAKING_UPDATED]: p => set(s => ({
    speakingByPlayer: { ...s.speakingByPlayer, [p.playerId]: p.speaking },
    participants: s.participants.map(part =>
      part.id === p.playerId ? { ...part, speaking: p.speaking } : part
    ),
  })),
};
export function applyGameEvent<K extends keyof Events>(event: K, payload: Events[K]) { handlers[event](payload); }
