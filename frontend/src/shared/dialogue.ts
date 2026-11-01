import type { ChatMessage } from './types';

export const EMOTIONS = {
  neutral: { emoji: '💬', label: 'Объясняет', color: '#699fa5' },
  happy: { emoji: '😄', label: 'Радуется', color: '#e5b741' },
  sad: { emoji: '😔', label: 'Грустит', color: '#779bc9' },
  angry: { emoji: '😠', label: 'Возмущается', color: '#dd705e' },
  surprised: { emoji: '😲', label: 'Удивляется', color: '#b58ad4' },
} as const;
export type NpcEmotion = keyof typeof EMOTIONS;

export function normalizeEmotion(raw: string | null | undefined): NpcEmotion {
  switch (raw?.trim().toLowerCase()) {
    case 'happy': case 'rofl': case 'smirk': return 'happy';
    case 'sad': case 'facepalm': case 'sweat': return 'sad';
    case 'angry': case 'rage': return 'angry';
    case 'surprised': case 'shock': return 'surprised';
    default: return 'neutral';
  }
}

/** Show the emotion first; keep gestures and text together for a readable interval. */
export const EMOTION_LEAD_MS = 550;
export const SPEECH_FADE_MS = 300;
export function speechDuration(text: string): number {
  return EMOTION_LEAD_MS + Math.min(10000, Math.max(3500, text.length * 45));
}

export interface ActiveSpeech { message: ChatMessage; startedAt: number; revealed: boolean }
export interface DialogueState { current: ActiveSpeech | null; pending: ChatMessage[] }
export const emptyDialogue = (): DialogueState => ({ current: null, pending: [] });

/** A single stage-wide queue keeps debate replies in order, including bursts in one frame. */
export function enqueueSpeech(state: DialogueState, message: ChatMessage, now: number): DialogueState {
  if (state.current?.message.id === message.id || state.pending.some(m => m.id === message.id)) return state;
  return state.current
    ? { ...state, pending: [...state.pending, message] }
    : { current: { message, startedAt: now, revealed: false }, pending: [] };
}

export function removeSpeakers(state: DialogueState, removed: string[], now: number): DialogueState {
  const pending = state.pending.filter(message => !removed.includes(message.npc));
  if (state.current && !removed.includes(state.current.message.npc)) return { current: state.current, pending };
  const [next, ...rest] = pending;
  return { current: next ? { message: next, startedAt: now, revealed: false } : null, pending: rest };
}

export function advanceSpeech(state: DialogueState, now: number): { dialogue: DialogueState; revealed: ChatMessage | null } {
  const active = state.current;
  if (!active) return { dialogue: state, revealed: null };
  const revealed = !active.revealed && now >= active.startedAt + EMOTION_LEAD_MS ? active.message : null;
  if (now >= active.startedAt + speechDuration(active.message.text)) {
    const [next, ...pending] = state.pending;
    return { dialogue: { current: next ? { message: next, startedAt: now, revealed: false } : null, pending }, revealed };
  }
  return { dialogue: revealed ? { ...state, current: { ...active, revealed: true } } : state, revealed };
}
