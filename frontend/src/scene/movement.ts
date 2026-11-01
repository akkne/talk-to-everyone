import { doorBounds, doorMoving } from './doors';
import { sampleDirector } from './director';
import type { Box, Ramp, SceneSpec, Vec3 } from './world';
export const WALK_SPEED = 2.5;
export const PLAYER_RADIUS = .3;
const STEP = .04;

function inside(p: Vec3, b: Box) {
  const dx = Math.max(Math.abs(p.x - b.center.x) - b.size.x / 2, 0);
  const dz = Math.max(Math.abs(p.z - b.center.z) - b.size.z / 2, 0);
  return dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS - 1e-8;
}

/** Check if a ramp touches or lands on a platform. */
function rampConnectsToPlatform(r: Ramp, b: Box): boolean {
  const touches = (pt: Vec3) =>
    Math.abs(pt.x - b.center.x) <= b.size.x / 2 + 0.3 &&
    Math.abs(pt.z - b.center.z) <= b.size.z / 2 + 0.3 &&
    Math.abs(pt.y - (b.center.y + b.size.y / 2)) <= 0.3;
  return touches(r.to) || touches(r.from);
}

/** Check if a position is within the walkable entrance/ascent corridor of a ramp. */
function isInRampCorridor(p: Vec3, r: Ramp): boolean {
  const dx = r.to.x - r.from.x, dz = r.to.z - r.from.z;
  const length = Math.hypot(dx, dz);
  if (!length) return false;
  const t = ((p.x - r.from.x) * dx + (p.z - r.from.z) * dz) / (length * length);
  const side = Math.abs((p.x - r.from.x) * dz - (p.z - r.from.z) * dx) / length;
  return t >= -0.05 && t <= 1.05 && side <= r.width / 2 + PLAYER_RADIUS;
}

/** Builds the full obstacle collision list: static obstacles, chairs, NPC models, and dynamic entities. */
export function buildSceneObstacles(scene: SceneSpec, extraObstacles: Box[] = []): Box[] {
  const obstacles: Box[] = [...(scene.room?.obstacles ?? [])];
  if (scene.directorRun) {
    const position = sampleDirector(scene.directorRun, Date.now()).position;
    const director = obstacles.find(o => o.id === 'npc-equipment-director');
    if (director) obstacles[obstacles.indexOf(director)] = { ...director, center: { ...position, y: position.y + .7 } };
  }

  for (const p of scene.objects ?? []) if (p.collider) obstacles.push({ id:p.id, ...p.collider });
  for (const d of scene.doors ?? []) {
    if (d.collidableWhileMoving === false && doorMoving(d)) continue;
    obstacles.push(doorBounds(d));
  }

  // 1. Chairs (Player seats)
  if (scene.playerSeats) {
    for (const seat of scene.playerSeats) {
      if (!obstacles.some(o => o.id === `chair-${seat.id}`)) {
        obstacles.push({
          id: `chair-${seat.id}`,
          center: { x: seat.position.x, y: seat.position.y + 0.5, z: seat.position.z },
          size: { x: 0.75, y: 1.0, z: 0.72 },
        });
      }
    }
  }

  // 2. NPC stands / models
  if (scene.npcStands) {
    for (const stand of scene.npcStands) {
      if (!obstacles.some(o => o.id === `npc-${stand.id}`)) {
        obstacles.push({
          id: `npc-${stand.id}`,
          center: { x: stand.position.x, y: stand.position.y + 0.9, z: stand.position.z },
          size: { x: 0.7, y: 1.8, z: 0.7 },
        });
      }
    }
  }

  // 3. Dynamic obstacles (other players/judges)
  for (const extra of extraObstacles) {
    obstacles.push(extra);
  }

  return obstacles;
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

function tryStep(p: Vec3, x: number, z: number, scene: SceneSpec, obstacles: Box[]): Vec3 {
  const next = { x, y: p.y, z };
  const y = surface(next, p.y, scene);
  if (y === null) return p;
  next.y = y;
  if (Math.abs(x) > scene.room.width / 2 - PLAYER_RADIUS || Math.abs(z) > scene.room.depth / 2 - PLAYER_RADIUS) return p;

  const blockedByObstacle = [...scene.room.walls, ...obstacles].some(b =>
    next.y < b.center.y + b.size.y / 2 - .01 && next.y + 1.8 > b.center.y - b.size.y / 2 && inside(next, b)
  );
  if (blockedByObstacle) return p;

  const blockedByPlatform = scene.room.platforms.some(b => {
    // If the player is in the corridor of a ramp connecting to this platform, the platform does not act as a wall
    const onConnectingRamp = scene.room.ramps.some(r => rampConnectsToPlatform(r, b) && isInRampCorridor(next, r));
    if (onConnectingRamp) return false;
    return next.y < b.center.y + b.size.y / 2 - .01 && next.y + 1.8 > b.center.y - b.size.y / 2 && inside(next, b);
  });
  if (blockedByPlatform) return p;

  return next;
}

/** Substeps prevent tunneling; axis separation lets the player slide along furniture and models. */
export function walk(position: Vec3, dx: number, dz: number, scene: SceneSpec, extraObstacles: Box[] = []): Vec3 {
  const obstacles = buildSceneObstacles(scene, extraObstacles);
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / STEP));
  let p = { ...position };
  for (let i = 0; i < count; i++) {
    p = tryStep(p, p.x + dx / count, p.z, scene, obstacles);
    p = tryStep(p, p.x, p.z + dz / count, scene, obstacles);
  }
  return p;
}
