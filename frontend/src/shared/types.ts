import type { Pose, SceneSpec } from '../scene/world';
import { C2S, S2C } from './contract';

export type NpcId = string;
export interface NpcMeta { id: NpcId; index: number; number?: number; anchorId?: string; color: string }
export interface NpcDetails { displayName: string; photoColor: string; loreChunks: string[]; voiceHint: string }
export interface Chunk { id: NpcId; details: NpcDetails; sizeBytes: number }
export interface Player { id: string; pose?: Pose; yaw: number; pitch: number; connected: boolean; name?: string }
export interface Round { n: number; phase: string; endsAt: number }
export interface Board { pairs: [NpcId, NpcId][]; liars: NpcId[]; locks: Record<string, number>; notes: Record<NpcId, string> }
export interface RevealData { trueFriends: [NpcId, NpcId][]; actors: NpcId[] }
export interface LobbyState { sessionId: string; players: { id: string; name: string; connected: boolean }[]; minPlayers: number; canStart: boolean; started: boolean }
export interface Snapshot {
  sessionId: string; me: string | { id?: string; playerId?: string; name?: string; role?: string };
  scene?: SceneSpec; seats?: { id: string; occupiedBy: string | null }[];
  started: boolean; round: Round; players: Player[]; npcs: NpcMeta[]; worldSizeBytes: number;
  board: Board; score: Record<string, number>;
}
export interface Commands {
  [C2S.AUTH]: { token: string; name: string };
  [C2S.START_GAME]: undefined;
  [C2S.SEND_POSE]: { seq: number; position: Pose["position"]; yaw: number; pitch: number };
  [C2S.SIT_DOWN]: { requestId: string; seatId: string };
  [C2S.STAND_UP]: { requestId: string };
  [C2S.REQUEST_CHUNK]: { reqId: string; ids: NpcId[] };
  [C2S.RELEASE_CHUNK]: { ids: NpcId[] };
  [C2S.PAIR_NPCS]: { round: number; a: NpcId; b: NpcId };
  [C2S.UNPAIR_NPCS]: { a: NpcId; b: NpcId };
  [C2S.MARK_LIAR]: { npc: NpcId };
  [C2S.UNMARK_LIAR]: { npc: NpcId };
  [C2S.LOCK_PAIR]: { a: NpcId; b: NpcId; round: number };
  [C2S.SAVE_NOTE]: { npc: NpcId; text: string };
  [C2S.ASK_QUESTION]: { targetNpc: NpcId; text: string };
  [C2S.PING]: { t: number };
}
export interface Events {
  [S2C.AUTH_OK]: { playerId: string; sessionId: string; role: string };
  [S2C.AUTH_ERR]: { code: 'INVALID_TOKEN' | 'NAME_TAKEN' | 'SESSION_FULL'; message: string };
  [S2C.LOBBY_STATE]: LobbyState;
  [S2C.GAME_STARTED]: { rounds: { n: number; phase: string; title: string; durationSec: number }[]; npcs: NpcMeta[] };
  [S2C.ROUND_STARTED]: Round;
  [S2C.ROUND_ENDED]: { n: number; nextIn: number };
  [S2C.GAME_ENDED]: { reveal: RevealData };
  [S2C.STATE_SNAPSHOT]: Snapshot;
  [S2C.CHUNK_DATA]: { reqId: string; npcs: Chunk[] };
  [S2C.SEAT_STATE]: { seats: { id: string; occupiedBy: string | null }[] };
  [S2C.ACTION_REJECT]: { requestId: string; code: string; message: string };
  [S2C.PLAYERS_TICK]: { players: Player[] };
  [S2C.NPC_SAY]: { npc: NpcId; text: string; inReplyTo: string | null };
  [S2C.NPC_REACTION]: { npc: NpcId; reaction: string; reason?: string };
  [S2C.BOARD_SNAPSHOT]: { board: Board };
  [S2C.BOARD_REJECT]: { op: string; code: 'NO_FREE_SLOT' | 'INVALID' | 'LOCKED'; message: string };
  [S2C.QUESTION_OK]: { remaining: number; askedTo: NpcId[] };
  [S2C.QUESTION_REJECT]: { code: 'LIMIT' | 'SAME_NPC' | 'EMPTY'; message: string };
  [S2C.SCORE_UPDATE]: { players: { id: string; score: number; title: string }[] };
  [S2C.SERVER_ERROR]: { code: 'BAD_PAYLOAD' | 'AUTH_REQUIRED' | 'RATE_LIMIT'; message: string };
  [S2C.PONG]: { t: number };
}
export type EventHandler = <K extends keyof Events>(event: K, payload: Events[K]) => void;
/** <summary>Live transport and isolated preview implement the same client port.</summary> */
export interface GameClient {
  connect(token: string, name: string): Promise<void>;
  disconnect(): Promise<void>;
  send<K extends keyof Commands>(method: K, payload: Commands[K]): Promise<void>;
}
