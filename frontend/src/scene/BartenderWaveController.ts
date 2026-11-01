import type { Vec3 } from './world';
import type { Npc } from './Npc';

/**
 * Height of a character model in world units (1.8m), as standard in the scene geometry.
 * "2 модели в длину" = 2 * 1.8 = 3.6 meters.
 */
export const MODEL_LENGTH = 1.8;
export const TRIGGER_DISTANCE = 2 * MODEL_LENGTH; // 3.6m
export const RESET_DISTANCE = TRIGGER_DISTANCE + 0.3; // 3.9m (hysteresis to prevent edge fluttering)
export const DEFAULT_WAVE_DURATION_MS = 4000; // 4.0s (within required 3-5 seconds)
export const MIN_WAVE_DURATION_MS = 3000;
export const MAX_WAVE_DURATION_MS = 5000;

export interface JuryEntity {
  id: string;
  position: Vec3;
}

/**
 * Controls the club bartender greeting behavior:
 * - Detects proximity when ANY jury member (player) approaches closer than 2 model lengths (<= 3.6m).
 * - Triggers a 3-5 second waving animation.
 * - Stops after the duration finishes, remaining calm even if the jury stays nearby.
 * - Re-arms if a jury member steps away and returns, or if another jury member arrives.
 */
export class BartenderWaveController {
  private readonly insideJuryIds = new Set<string>();
  private wavingUntil = 0;
  private waveStartedAt = 0;
  private currentDuration = DEFAULT_WAVE_DURATION_MS;

  constructor(
    readonly npc: Npc,
    readonly position: Vec3 = { x: -9.8, y: 0, z: -1.0 },
    readonly waveDurationMs: number = DEFAULT_WAVE_DURATION_MS
  ) {
    this.currentDuration = Math.max(MIN_WAVE_DURATION_MS, Math.min(MAX_WAVE_DURATION_MS, waveDurationMs));
  }

  /** Calculate horizontal ground distance between a position and the bartender */
  distanceTo(target: Vec3): number {
    return Math.hypot(target.x - this.position.x, target.z - this.position.z);
  }

  /** Check if a position is within the 2-model-length trigger distance */
  isInProximity(target: Vec3): boolean {
    const horizontalDist = this.distanceTo(target);
    const verticalDist = Math.abs(target.y - this.position.y);
    return horizontalDist <= TRIGGER_DISTANCE && verticalDist <= 2.0;
  }

  /** Check if the bartender is currently performing the wave animation */
  isWaving(now = performance.now()): boolean {
    return now >= this.waveStartedAt && now < this.wavingUntil;
  }

  /** Manually trigger or re-trigger a wave */
  triggerWave(now = performance.now(), durationMs = this.currentDuration) {
    const validDuration = Math.max(MIN_WAVE_DURATION_MS, Math.min(MAX_WAVE_DURATION_MS, durationMs));
    this.waveStartedAt = now;
    this.wavingUntil = now + validDuration;
    this.npc.wave(validDuration, now);
  }

  /** Stop waving immediately */
  stopWaving() {
    this.wavingUntil = 0;
    this.waveStartedAt = 0;
    this.npc.stopWaving();
  }

  /** Reset all tracked jury members */
  reset() {
    this.insideJuryIds.clear();
    this.stopWaving();
  }

  /**
   * Main per-frame update loop.
   * Examines all active jury members (local player and remote players) and triggers
   * waving on approach closer than 2 model lengths.
   */
  update(now: number, juryList: JuryEntity[]) {
    const currentlyActiveIds = new Set(juryList.map(j => j.id));

    // Clean up jury members who disconnected or left the scene
    for (const id of this.insideJuryIds) {
      if (!currentlyActiveIds.has(id)) {
        this.insideJuryIds.delete(id);
      }
    }

    let approachTriggered = false;

    for (const jury of juryList) {
      const dist = this.distanceTo(jury.position);
      const verticalDist = Math.abs(jury.position.y - this.position.y);
      const isClose = dist <= TRIGGER_DISTANCE && verticalDist <= 2.0;
      const isFar = dist >= RESET_DISTANCE;

      if (isClose) {
        if (!this.insideJuryIds.has(jury.id)) {
          // Approach detected! Jury transitioned from outside to inside 2 model lengths
          this.insideJuryIds.add(jury.id);
          approachTriggered = true;
        }
      } else if (isFar) {
        // Jury member moved away beyond hysteresis distance; re-arm approach
        this.insideJuryIds.delete(jury.id);
      }
    }

    // If any jury member approached and we are not currently in an active wave, start waving!
    if (approachTriggered && !this.isWaving(now)) {
      this.triggerWave(now, this.currentDuration);
    }
  }
}
