export const UI = {
  MAX_CHAT: 80, MAX_REACTIONS: 20, QUESTION_MAX_LEN: 300,
  CONNECTION_TIMEOUT_MS: 15000, COMMAND_TIMEOUT_MS: 10000,
  LOD_DEBOUNCE_MS: 200, CHUNK_TIMEOUT_MS: 8000, MAX_CACHE_RATIO: 0.1,
  CAMERA_LIMIT: Math.PI * 2 / 3, MOUSE_SENSITIVITY: 0.002,
} as const;

/** <summary>Accept the server's pair key in either order without changing the wire format.</summary> */
export function lockedRound(locks: Record<string, number>, a: string, b: string) {
  return locks[`${a}:${b}`] ?? locks[`${b}:${a}`];
}
