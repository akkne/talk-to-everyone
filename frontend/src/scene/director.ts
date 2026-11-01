import type { DirectorRun, DirectorStep, Vec3 } from './world';

export const DIRECTOR_COOLDOWN_MS = 30_000;
export const DIRECTOR_RADIUS = 2;

/** Each local player hears their own warning; leaving the radius never resets the cooldown. */
export class DirectorGreeting {
  private nextAt = -Infinity;

  update(now: number, player: { name: string; position: Vec3 }, director: Vec3): string | null {
    if (Math.abs(player.position.y - director.y) > 1 ||
      Math.hypot(player.position.x - director.x, player.position.z - director.z) > DIRECTOR_RADIUS ||
      now < this.nextAt) return null;
    this.nextAt = now + DIRECTOR_COOLDOWN_MS;
    return `${player.name}, вы мешаете мне работать. Отойдите, пожалуйста.`;
  }
}

/** Sample the server-owned timeline, also used by collision prediction and reconnects. */
export function sampleDirector(run: DirectorRun, now: number): DirectorStep {
  const elapsed = Math.max(0, now - run.startedAt);
  let from = run.steps[0];
  for (const to of run.steps.slice(1)) {
    if (elapsed < to.atMs) {
      const t = Math.max(0, Math.min(1, (elapsed - from.atMs) / (to.atMs - from.atMs)));
      return { ...from, laptopOpen: from.laptopOpen + (to.laptopOpen - from.laptopOpen) * t,
        position: { x: from.position.x + (to.position.x - from.position.x) * t, y: from.position.y, z: from.position.z + (to.position.z - from.position.z) * t } };
    }
    from = to;
  }
  return from;
}
