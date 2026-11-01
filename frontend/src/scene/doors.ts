import type { Box, DoorSpec } from './world';

export function doorProgress(door: DoorSpec, now = Date.now()): number {
  const motion = door.transition;
  if (!motion) return door.open ? 1 : 0;
  const t = Math.max(0, Math.min(1, (now - motion.startedAt) / (door.animationDurationMs ?? 900)));
  return motion.from + (motion.to - motion.from) * t * t * (3 - 2 * t);
}

export function doorPose(door: DoorSpec, progress: number) {
  if (door.hinge && door.openAngleDegrees !== undefined) {
    const angle = door.openAngleDegrees * Math.PI / 180 * progress;
    const x = door.center.x - door.hinge.x, z = door.center.z - door.hinge.z;
    return { x: door.hinge.x + x * Math.cos(angle) + z * Math.sin(angle), y: door.center.y,
      z: door.hinge.z - x * Math.sin(angle) + z * Math.cos(angle), angle };
  }
  return { x: door.center.x + door.slide.x * progress, y: door.center.y + door.slide.y * progress,
    z: door.center.z + door.slide.z * progress, angle: 0 };
}

export function doorMoving(door: DoorSpec, now = Date.now()): boolean {
  return !!door.transition && now < door.transition.startedAt + (door.animationDurationMs ?? 900);
}

export function doorBounds(door: DoorSpec, now = Date.now()): Box {
  const moving = door.transition && now < door.transition.startedAt + (door.animationDurationMs ?? 900);
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  const samples=moving?180:0;
  for(let i=0;i<=samples;i++){
    const pose=doorPose(door,samples?i/samples:doorProgress(door,now));
    const w=Math.abs(Math.cos(pose.angle))*door.size.x+Math.abs(Math.sin(pose.angle))*door.size.z;
    const d=Math.abs(Math.sin(pose.angle))*door.size.x+Math.abs(Math.cos(pose.angle))*door.size.z;
    minX=Math.min(minX,pose.x-w/2);maxX=Math.max(maxX,pose.x+w/2);
    minY=Math.min(minY,pose.y-door.size.y/2);maxY=Math.max(maxY,pose.y+door.size.y/2);
    minZ=Math.min(minZ,pose.z-d/2);maxZ=Math.max(maxZ,pose.z+d/2);
  }
  return {id:door.id,center:{x:(minX+maxX)/2,y:(minY+maxY)/2,z:(minZ+maxZ)/2},size:{x:maxX-minX,y:maxY-minY,z:maxZ-minZ}};
}
