/** Public scene geometry, shared by rendering and local collision prediction. */
export interface Vec3 { x: number; y: number; z: number }
export interface Box { id: string; center: Vec3; size: Vec3 }
export interface Ramp { id: string; from: Vec3; to: Vec3; width: number }
export interface SeatSpec { id: string; position: Vec3; yaw: number; exit: Vec3 }
export interface Pose { position: Vec3; yaw: number; pitch: number; mode: 'walking' | 'seated'; seatId: string | null; seq: number; jumpOffset?: number }
export interface SceneSpec {
  version: string;
  lighting?: { ambient: number; key: number; fill: number; floor: string; walls: string; ceiling: string };
  name?: string; theme?: 'studio' | 'club'; objects?: PropSpec[]; doors?: DoorSpec[]; foods?: FoodSpec[];
  room: { width: number; depth: number; height: number; platforms: Box[]; ramps: Ramp[]; obstacles: Box[]; walls: Box[] };
  npcStands: { id: string; position: Vec3; yaw: number; level: number }[];
  playerSeats: SeatSpec[]; spawnPoints: Vec3[];
}
export type PropType = 'column' | 'truss' | 'spotlight' | 'backdrop' | 'softbox' | 'crate' | 'cableTray' | 'sofa' | 'table' | 'camera' | 'tripod' | 'shelf' | 'sign' | 'djBooth' | 'speaker' | 'danceTile' | 'bar' | 'stool' | 'bottle' | 'mirrorball' | 'neon' | 'plant' | 'panel' | 'gate' | 'vent' | 'reflector' | 'monitor' | 'directorChair' | 'cart' | 'reel' | 'lens' | 'battery' | 'charger';
export interface PropSpec { id: string; type: PropType; position: Vec3; size: Vec3; yaw?: number; color?: string; label?: string; collidable?: boolean; beam?: boolean; collider?: { center: Vec3; size: Vec3 } }
export interface DoorSpec extends Box { label: string; open: boolean; slide: Vec3 }
export interface FoodSpec { id: string; type: 'apple' | 'sandwich' | 'donut' | 'pizza'; label: string; position: Vec3; eaten?: boolean }
