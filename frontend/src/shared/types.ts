import { C2S, S2C } from './contract';

export type NpcId = string;
export interface Vec3 { x: number; y: number; z: number }
export interface Pose { position: Vec3; yaw: number; pitch: number; mode: 'walking' | 'seated'; seatId: string | null; seq: number; jumpOffset?: number }
export interface Player { id: string; name: string; connected: boolean; pose: Pose }
export interface ParticipantStatus { id: string; name: string; role: string; connected: boolean; fps: number; pingMs: number; activityCode: string; actionText: string; speaking: boolean }
export interface GamePauseState { paused: boolean; pausedRemainingMs: number; endsAt: number; pausedBy: string | null }
export interface VoiceSignalEnvelope { senderPlayerId: string; targetPlayerId: string; signalType: string; payload: string; sentAt: number }
export interface VoiceSpeakingEvent { playerId: string; speaking: boolean; at: number }
export interface NpcAppearance { style: 'sport' | 'tech' | 'creative' | 'smart' | 'polished' | 'casual'; accessory: 'headphones' | 'glasses' | 'beanie' | 'cap' | 'none'; hair: number; skin: number }
export interface NpcMeta { id: NpcId; number: number; name: string; color: string; anchorId: string; appearance?: NpcAppearance }
export interface NpcDetails { displayName: string; photoColor: string; voiceHint: string }
export interface Chunk { id: NpcId; details: NpcDetails; sizeBytes: number }
export type { SceneSpec } from '../scene/world';
import type { SceneSpec } from '../scene/world';
export interface SeatState { id: string; occupiedBy: string | null }
export interface Round { n: number; phase: string; endsAt: number; choiceEndsAt: number | null; paused?: boolean; pausedRemainingMs?: number }
export interface RoundSpec { n: number; phase: string; title: string; durationSec: number }
export interface Board { pairs: [NpcId, NpcId][]; liars: NpcId[]; locks: Record<string, number>; notes: Record<NpcId, string>; submitted: Record<string, [NpcId, NpcId] | null> }
export interface QuestionState { remaining: number; askedTo: NpcId[]; pending: boolean }
export interface ChatMessage { id: string; npc: NpcId; text: string; inReplyTo: string | null; emotion: string | null; at: number }
export interface RevealData { trueFriends: [NpcId, NpcId][]; actors: NpcId[] }
export interface ScoreEntry { id: string; score: number; title: string }
export interface GameInfo { npcCount: number; pairCount: number; actorCount: number; rounds: RoundSpec[]; choiceRounds: number[]; questionLimit: number; questionMaxLength: number; noteMaxLength: number; scoring: { correct: { round: number; points: number }[]; mixed: number; twoActors: number } }
export interface LobbyState { sessionId: string; players: { id: string; name: string; connected: boolean }[]; leaderId: string | null; minPlayers: number; canStart: boolean; started: boolean }
export interface VotingState { round: number; stage: number; candidates: [NpcId, NpcId][]; eligible: boolean; submitted: boolean; received: number; total: number; endsAt: number }
export interface Snapshot { voting: VotingState | null; teamScore: number; sessionId: string; me: { id: string; role: string }; phase: 'lobby' | 'playing' | 'finished'; round: Round | null; rounds: RoundSpec[]; gameInfo: GameInfo; scene: SceneSpec; players: Player[]; npcs: NpcMeta[]; seats: SeatState[]; board: Board; questions: QuestionState; chat: ChatMessage[]; worldSizeBytes: number; score: Record<string, number>; scoreboard: ScoreEntry[] | null; reveal: RevealData | null; paused?: boolean; pausedRemainingMs?: number; participants?: ParticipantStatus[]; speakingPlayerIds?: string[] }
type Request = { requestId: string };
export interface Commands {
  [C2S.INTERACT]: Request & { id: string };
  [C2S.AUTH]: { token: string; name?: string };
  [C2S.START_GAME]: undefined;
  [C2S.RESET_GAME]: undefined;
  [C2S.SKIP_ROUND]: Request;
  [C2S.SEND_POSE]: { seq: number; position: Vec3; yaw: number; pitch: number; jumpOffset?: number };
  [C2S.SIT_DOWN]: Request & { seatId: string };
  [C2S.STAND_UP]: Request;
  [C2S.REQUEST_CHUNK]: { reqId: string; ids: NpcId[] };
  [C2S.RELEASE_CHUNK]: { ids: NpcId[] };
  [C2S.PAIR_NPCS]: Request & { a: NpcId; b: NpcId };
  [C2S.UNPAIR_NPCS]: Request & { a: NpcId; b: NpcId };
  [C2S.MARK_LIAR]: Request & { npc: NpcId };
  [C2S.UNMARK_LIAR]: Request & { npc: NpcId };
  [C2S.SAVE_NOTE]: Request & { npc: NpcId; text: string };
  [C2S.SUBMIT_PAIR]: Request & { round: number; stage: number; a?: NpcId; b?: NpcId; skip?: boolean };
  [C2S.ASK_QUESTION]: Request & { targetNpc: NpcId; text: string };
  [C2S.PING]: { t: number };
  [C2S.REPORT_DIAGNOSTICS]: { fps: number; pingMs: number; activity: string };
  [C2S.SET_GAME_PAUSE]: Request & { paused: boolean };
  [C2S.SEND_VOICE_SIGNAL]: { targetPlayerId: string; signalType: string; payload: string };
  [C2S.SET_VOICE_SPEAKING]: { speaking: boolean };
}
interface Reject { code: string; message: string; requestId?: string | null }
export interface Events {
  [S2C.LOCATION_STATE]: { doors: NonNullable<SceneSpec['doors']>; foods: NonNullable<SceneSpec['foods']> };
  [S2C.INTERACTION_FEEDBACK]: { message: string };
  [S2C.VOTING_STATE]: VotingState;
  [S2C.NPCS_REMOVED]: { ids: NpcId[]; teamScore: number };
  [S2C.AUTH_OK]: { playerId: string; sessionId: string; role: string };
  [S2C.AUTH_ERR]: Reject;
  [S2C.LOBBY_STATE]: LobbyState;
  [S2C.GAME_STARTED]: { rounds: RoundSpec[]; npcs: NpcMeta[]; sceneVersion: string };
  [S2C.ROUND_STARTED]: Round;
  [S2C.ROUND_ENDED]: { n: number; choiceEndsAt: number | null };
  [S2C.GAME_ENDED]: { reveal: RevealData; scoreboard: ScoreEntry[]; npcs: NpcMeta[] };
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
  [S2C.PARTICIPANTS_UPDATED]: { participants: ParticipantStatus[] };
  [S2C.GAME_PAUSE_CHANGED]: GamePauseState;
  [S2C.VOICE_SIGNAL_RECEIVED]: VoiceSignalEnvelope;
  [S2C.VOICE_SPEAKING_UPDATED]: VoiceSpeakingEvent;
}
export type EventHandler = <K extends keyof Events>(event: K, payload: Events[K]) => void;
export interface GameClient { connect(token: string): Promise<void>; disconnect(): Promise<void>; send<K extends keyof Commands>(method: K, payload: Commands[K]): Promise<void>; setPose(position: Vec3, yaw: number, pitch: number, jumpOffset?: number): void; syncPose(pose: Pose): void }
