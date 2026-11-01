export const JUMP_SPEED = 4.8;
export const JUMP_GRAVITY = 14;
export const JUMP_DURATION = 2 * JUMP_SPEED / JUMP_GRAVITY;
export const JUMP_HEIGHT = JUMP_SPEED * JUMP_SPEED / (2 * JUMP_GRAVITY);
export const LANDING_DURATION = 0.16;

/** Vertical animation relative to the walkable surface, in seconds and metres. */
export function jumpHeight(elapsed: number) {
  return elapsed > 0 && elapsed < JUMP_DURATION ? JUMP_SPEED * elapsed - JUMP_GRAVITY * elapsed * elapsed / 2 : 0;
}

export function landingDip(elapsed: number) {
  return elapsed > 0 && elapsed < LANDING_DURATION ? Math.sin(Math.PI * elapsed / LANDING_DURATION) * 0.06 : 0;
}
