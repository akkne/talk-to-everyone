import type { DirectorRun, DirectorStep } from './world';

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
