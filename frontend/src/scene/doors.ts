import type { Box, DoorSpec } from './world';

export function doorProgress(door: DoorSpec, now = Date.now()): number {
  const motion = door.transition;
  if (!motion) return door.open ? 1 : 0;
  const t = Math.max(0, Math.min(1, (now - motion.startedAt) / (door.animationDurationMs ?? 900)));
  const eased = t * t * (3 - 2 * t);
  return motion.from + (motion.to - motion.from) * eased;
}

export function doorBounds(door: DoorSpec, now = Date.now()): Box {
  const progress = doorProgress(door, now);
  // Reserve the panel's travel corridor during motion so it cannot sweep into a player.
  const moving = door.transition && now < door.transition.startedAt + (door.animationDurationMs ?? 900);
  return {
    id: door.id,
    center: {
      x: door.center.x + door.slide.x * (moving ? .5 : progress),
      y: door.center.y + door.slide.y * (moving ? .5 : progress),
      z: door.center.z + door.slide.z * (moving ? .5 : progress),
    },
    size: moving ? {
      x: door.size.x + Math.abs(door.slide.x),
      y: door.size.y + Math.abs(door.slide.y),
      z: door.size.z + Math.abs(door.slide.z),
    } : door.size,
  };
}
