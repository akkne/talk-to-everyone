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

/**
 * Returns the highest walkable surface at position p that is reachable from currentY.
 * Allows stepping or jumping down (falling) to lower surfaces without artificial invisible walls,
 * while preventing unassisted walking up steep vertical cliffs without ramps or jumps.
 */
function getWalkableSurface(p: Vec3, currentY: number, scene: SceneSpec, jumpOffset = 0): number | null {
  const heights: number[] = [];

  // 1. Ramps
  for (const r of scene.room.ramps) {
    const dx = r.to.x - r.from.x, dz = r.to.z - r.from.z;
    const length = Math.hypot(dx, dz);
    if (!length) continue;
    const t = ((p.x - r.from.x) * dx + (p.z - r.from.z) * dz) / (length * length);
    const side = Math.abs((p.x - r.from.x) * dz - (p.z - r.from.z) * dx) / length;
    if (t >= -0.05 && t <= 1.05 && side <= r.width / 2 + 0.05) {
      heights.push(r.from.y + Math.max(0, Math.min(1, t)) * (r.to.y - r.from.y));
    }
  }

  // 2. Platforms
  for (const b of scene.room.platforms) {
    if (Math.abs(p.x - b.center.x) <= b.size.x / 2 && Math.abs(p.z - b.center.z) <= b.size.z / 2) {
      heights.push(b.center.y + b.size.y / 2);
    }
  }

  // 3. Ground floor is always available across the studio
  heights.push(0);

  // Highest to lowest candidate surface
  heights.sort((a, b) => b - a);

  // Maximum climb height: standard step up is ~0.12m. When jumping, reach includes jumpOffset.
  const maxClimbY = currentY + Math.max(jumpOffset, 0) + 0.12;

  // Pick the highest valid surface reachable at or below max climb reach
  const surface = heights.find(h => h <= maxClimbY);
  return surface !== undefined ? surface : null;
}

function tryStep(p: Vec3, x: number, z: number, scene: SceneSpec, obstacles: Box[], jumpOffset = 0): Vec3 {
  const next = { x, y: p.y, z };
  const y = getWalkableSurface(next, p.y, scene, jumpOffset);
  if (y === null) return p;
  next.y = y;
  if (Math.abs(x) > scene.room.width / 2 - PLAYER_RADIUS || Math.abs(z) > scene.room.depth / 2 - PLAYER_RADIUS) return p;

  // Solid obstacles (room walls, chairs, NPC models, player models)
  const blockedByObstacle = [...scene.room.walls, ...obstacles].some(b =>
    next.y < b.center.y + b.size.y / 2 - .01 && next.y + 1.8 > b.center.y - b.size.y / 2 && inside(next, b)
  );
  if (blockedByObstacle) return p;

  // Platforms: only block horizontal penetration into the solid platform body from below.
  // Never create invisible walls in mid-air when jumping, stepping down, or using ramps.
  const blockedByPlatform = scene.room.platforms.some(b => {
    const platformTop = b.center.y + b.size.y / 2;
    const platformBottom = b.center.y - b.size.y / 2;

    // 1. If player was already on top of this platform (or dropping off it), don't block
    if (p.y >= platformTop - 0.05) return false;

    // 2. If player is jumping and their airborne reach clears the platform top, don't block
    if (p.y + Math.max(jumpOffset, 0) >= platformTop - 0.05) return false;

    // 3. If player is inside a ramp corridor connecting to this platform, don't block
    const onConnectingRamp = scene.room.ramps.some(r => rampConnectsToPlatform(r, b) && isInRampCorridor(next, r));
    if (onConnectingRamp) return false;

    // 4. If destination height is on top of the platform, don't block
    if (next.y >= platformTop - 0.05) return false;

    // Only block if player's vertical span collides with the solid platform body
    const intersectsVertical = next.y < platformTop - 0.01 && next.y + 1.8 > platformBottom;
    return intersectsVertical && inside(next, b);
  });
  if (blockedByPlatform) return p;

  return next;
}

/** Substeps prevent tunneling; axis separation lets the player slide along furniture and models. */
export function walk(
  position: Vec3,
  dx: number,
  dz: number,
  scene: SceneSpec,
  extraObstacles: Box[] = [],
  jumpOffset = 0
): Vec3 {
  const obstacles = buildSceneObstacles(scene, extraObstacles);
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / STEP));
  let p = { ...position };
  for (let i = 0; i < count; i++) {
    p = tryStep(p, p.x + dx / count, p.z, scene, obstacles, jumpOffset);
    p = tryStep(p, p.x, p.z + dz / count, scene, obstacles, jumpOffset);
  }
  return p;
}
