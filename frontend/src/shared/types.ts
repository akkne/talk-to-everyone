import { C2S, S2C } from './contract';

export type NpcId = string;
export interface Vec3 { x: number; y: number; z: number }
export interface Pose { position: Vec3; yaw: number; pitch: number; mode: 'walking' | 'seated'; seatId: string | null; seq: number }
export interface Player { id: string; name: string; connected: boolean; pose: Pose }
export interface NpcMeta { id: NpcId; number: number; color: string; anchorId: string }
export interface NpcDetails { displayName: string; photoColor: string; voiceHint: string }
export interface Chunk { id: NpcId; details: NpcDetails; sizeBytes: number }
export interface SceneSpec { version: string; room: { width: number; depth: number; height: number; platforms: { id: string; center: Vec3; size: Vec3 }[]; ramps: { id: string; from: Vec3; to: Vec3; width: number }[]; obstacles: { id: string; center: Vec3; size: Vec3 }[]; walls: { id: string; center: Vec3; size: Vec3 }[] }; npcStands: { id: string; position: Vec3; yaw: number; level: number }[]; playerSeats: { id: string; position: Vec3; yaw: number; exit: Vec3 }[]; spawnPoints: Vec3[] }
export interface SeatState { id: string; occupiedBy: string | null }
export interface Round { n: number; phase: string; endsAt: number; choiceEndsAt: number | null }
export interface RoundSpec { n: number; phase: string; title: string; durationSec: number }
export interface Board { pairs: [NpcId, NpcId][]; liars: NpcId[]; locks: Record<string, number>; notes: Record<NpcId, string>; submitted: Record<string, [NpcId, NpcId] | null> }
export interface QuestionState { remaining: number; askedTo: NpcId[]; pending: boolean }
export interface ChatMessage { id: string; npc: NpcId; text: string; inReplyTo: string | null; emotion: string | null; at: number }
export interface RevealData { trueFriends: [NpcId, NpcId][]; actors: NpcId[] }
export interface ScoreEntry { id: string; score: number; title: string }
export interface LobbyState { sessionId: string; players: { id: string; name: string; connected: boolean }[]; leaderId: string | null; minPlayers: number; canStart: boolean; started: boolean }
export interface Snapshot { sessionId: string; me: { id: string; role: string }; phase: 'lobby' | 'playing' | 'finished'; round: Round | null; rounds: RoundSpec[]; scene: SceneSpec; players: Player[]; npcs: NpcMeta[]; seats: SeatState[]; board: Board; questions: QuestionState; chat: ChatMessage[]; worldSizeBytes: number; score: Record<string, number>; scoreboard: ScoreEntry[] | null; reveal: RevealData | null }
type Request = { requestId: string };
export interface Commands {
  [C2S.AUTH]: { token: string; name: string };
  [C2S.START_GAME]: undefined;
  [C2S.SEND_POSE]: { seq: number; position: Vec3; yaw: number; pitch: number };
  [C2S.SIT_DOWN]: Request & { seatId: string };
  [C2S.STAND_UP]: Request;
  [C2S.REQUEST_CHUNK]: { reqId: string; ids: NpcId[] };
  [C2S.RELEASE_CHUNK]: { ids: NpcId[] };
  [C2S.PAIR_NPCS]: Request & { a: NpcId; b: NpcId };
  [C2S.UNPAIR_NPCS]: Request & { a: NpcId; b: NpcId };
  [C2S.MARK_LIAR]: Request & { npc: NpcId };
  [C2S.UNMARK_LIAR]: Request & { npc: NpcId };
  [C2S.SAVE_NOTE]: Request & { npc: NpcId; text: string };
  [C2S.SUBMIT_PAIR]: Request & { round: number; a?: NpcId; b?: NpcId; skip?: boolean };
  [C2S.ASK_QUESTION]: Request & { targetNpc: NpcId; text: string };
  [C2S.PING]: { t: number };
}
interface Reject { code: string; message: string; requestId?: string | null }
export interface Events {
  [S2C.AUTH_OK]: { playerId: string; sessionId: string; role: string };
  [S2C.AUTH_ERR]: Reject;
  [S2C.LOBBY_STATE]: LobbyState;
  [S2C.GAME_STARTED]: { rounds: RoundSpec[]; npcs: NpcMeta[]; sceneVersion: string };
  [S2C.ROUND_STARTED]: Round;
  [S2C.ROUND_ENDED]: { n: number; choiceEndsAt: number | null };
  [S2C.GAME_ENDED]: { reveal: RevealData; scoreboard: ScoreEntry[] };
  [S2C.STATE_SNAPSHOT]: Snapshot;
  [S2C.CHUNK_DATA]: { reqId: string; npcs: Chunk[] };
  [S2C.PLAYERS_TICK]: { players: Player[]; serverTime: number };
  [S2C.SEAT_STATE]: { seats: SeatState[] };
  [S2C.ACTION_REJECT]: Reject & { op: string; seq?: number };
  [S2C.NPC_THINKING]: { npc: NpcId; questionId: string };
  [S2C.NPC_SAY]: ChatMessage;
  [S2C.BOARD_SNAPSHOT]: { board: Board; requestId: string };
  [S2C.BOARD_REJECT]: Reject & { op: string };
  [S2C.PAIR_SUBMITTED]: { round: number; pair: [NpcId, NpcId] | null };
  [S2C.QUESTION_OK]: { requestId: string; questions: QuestionState };
  [S2C.QUESTION_STATE]: { questions: QuestionState };
  [S2C.QUESTION_REJECT]: Reject;
  [S2C.QUESTION_FAILED]: { questionId: string; code: string; message: string; questions: QuestionState };
  [S2C.SCORE_UPDATE]: { players: ScoreEntry[] };
  [S2C.SERVER_ERROR]: Reject;
  [S2C.PONG]: { t: number; serverTime: number };
}
export type EventHandler = <K extends keyof Events>(event: K, payload: Events[K]) => void;
export interface GameClient { connect(token: string, name: string): Promise<void>; disconnect(): Promise<void>; send<K extends keyof Commands>(method: K, payload: Commands[K]): Promise<void>; setPose(position: Vec3, yaw: number, pitch: number): void; syncPose(pose: Pose): void }
