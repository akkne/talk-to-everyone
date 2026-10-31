import type { Box, SceneSpec, Vec3 } from './world';
export const WALK_SPEED = 2.5;
export const PLAYER_RADIUS = .3;
const STEP = .04;
function inside(p: Vec3, b: Box) {
  const dx = Math.max(Math.abs(p.x - b.center.x) - b.size.x / 2, 0);
  const dz = Math.max(Math.abs(p.z - b.center.z) - b.size.z / 2, 0);
  return dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS - 1e-8;
}
/** Ramp height at its centerline projection; platforms cannot be climbed from ground. */
function surface(p: Vec3, currentY: number, scene: SceneSpec): number | null {
  const heights: number[] = [];
  for (const r of scene.room.ramps) {
    const dx = r.to.x - r.from.x, dz = r.to.z - r.from.z;
    const length = Math.hypot(dx, dz);
    if (!length) continue;
    const t = ((p.x - r.from.x) * dx + (p.z - r.from.z) * dz) / (length * length);
    const side = Math.abs((p.x - r.from.x) * dz - (p.z - r.from.z) * dx) / length;
    if (t >= -.02 && t <= 1.02 && side <= r.width / 2 + .01) heights.push(r.from.y + Math.max(0, Math.min(1, t)) * (r.to.y - r.from.y));
  }
  for (const b of scene.room.platforms) {
    if (Math.abs(p.x - b.center.x) <= b.size.x / 2 && Math.abs(p.z - b.center.z) <= b.size.z / 2) heights.push(b.center.y + b.size.y / 2);
  }
  if (!heights.length) heights.push(0);
  return heights.find(h => Math.abs(h - currentY) <= .08) ?? null;
}
function tryStep(p: Vec3, x: number, z: number, scene: SceneSpec): Vec3 {
  const next = { x, y: p.y, z };
  const y = surface(next, p.y, scene);
  if (y === null) return p;
  next.y = y;
  if (Math.abs(x) > scene.room.width / 2 - PLAYER_RADIUS || Math.abs(z) > scene.room.depth / 2 - PLAYER_RADIUS) return p;
  const blocked = [...scene.room.walls, ...scene.room.obstacles, ...scene.room.platforms].some(b =>
    next.y < b.center.y + b.size.y / 2 - .01 && next.y + 1.8 > b.center.y - b.size.y / 2 && inside(next, b));
  return blocked ? p : next;
}
/** Substeps prevent tunneling; axis separation lets the player slide along furniture. */
export function walk(position: Vec3, dx: number, dz: number, scene: SceneSpec): Vec3 {
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / STEP));
  let p = { ...position };
  for (let i = 0; i < count; i++) {
    p = tryStep(p, p.x + dx / count, p.z, scene);
    p = tryStep(p, p.x, p.z + dz / count, scene);
  }
  return p;
}
