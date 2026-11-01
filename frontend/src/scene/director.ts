import type { Vec3 } from './world';

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
