/** Public scene geometry, shared by rendering and local collision prediction. */
export interface Vec3 { x: number; y: number; z: number }
export interface Box { id: string; center: Vec3; size: Vec3 }
export interface Ramp { id: string; from: Vec3; to: Vec3; width: number }
export interface SeatSpec { furnitureId?: string; label?: string; id: string; position: Vec3; yaw: number; exit: Vec3 }
export interface Pose { position: Vec3; yaw: number; pitch: number; mode: 'walking' | 'seated'; seatId: string | null; seq: number; jumpOffset?: number }
export interface SceneSpec {
  version: string;
  lighting?: { ambient: number; key: number; fill: number; floor: string; walls: string; ceiling: string };
  name?: string; theme?: 'studio' | 'club' | 'industrial-loft-bar'; objects?: PropSpec[]; doors?: DoorSpec[]; foods?: FoodSpec[];
  interactiveObjects?: InteractiveObjectSpec[]; functionalNPCs?: CharacterSpec[]; ambientNPCs?: CharacterSpec[];
  lightingPresets?: LightingPresetSpec[]; activeLightingPreset?: string; fanOn?: boolean; musicTrack?: string;
  room: { width: number; depth: number; height: number; platforms: Box[]; ramps: Ramp[]; obstacles: Box[]; walls: Box[] };
  npcStands: { id: string; position: Vec3; yaw: number; level: number }[];
  playerSeats: SeatSpec[]; furnitureSeats?: SeatSpec[]; spawnPoints: Vec3[];
}
export type PropType = 'column' | 'truss' | 'spotlight' | 'backdrop' | 'softbox' | 'crate' | 'cableTray' | 'sofa' | 'table' | 'camera' | 'tripod' | 'shelf' | 'sign' | 'djBooth' | 'speaker' | 'danceTile' | 'bar' | 'stool' | 'bottle' | 'mirrorball' | 'neon' | 'plant' | 'panel' | 'gate' | 'vent' | 'reflector' | 'monitor' | 'directorChair' | 'cart' | 'reel' | 'lens' | 'battery' | 'charger' | 'foosball' | 'vending';
export interface PropSpec { id: string; type: PropType; position: Vec3; size: Vec3; yaw?: number; color?: string; label?: string; collidable?: boolean; beam?: boolean; attachment?: { objectId: string; localPosition: Vec3 }; collider?: { center: Vec3; size: Vec3 } }
export interface DoorSpec extends Box { label: string; open: boolean; slide: Vec3; hinge?: Vec3; openAngleDegrees?: number; animationDurationMs?: number; collidableWhileMoving?: boolean; transition?: { startedAt: number; from: number; to: number } }
export interface FoodSpec { id: string; type: 'apple' | 'sandwich' | 'donut' | 'pizza'; label: string; position: Vec3; eaten?: boolean }
export interface InteractiveObjectSpec { id: string; targetId: string; type: string; interactionTrigger: Vec3 & { radius: number }; actions: string[] }
export interface CharacterSpec { id: string; name?: string; type: string; position?: Vec3; spawnPosition?: Vec3; yaw?: number; fsmState?: string }
export interface LightingPresetSpec { id: string; ambientColor: string; keyLight: { color: string; intensity: number; position: Vec3 }; accentNeon: { color: string; intensity: number } }

/** Furniture supplies its own model; all seats use the same occupancy and interaction commands. */
export function sceneSeats(scene: SceneSpec): SeatSpec[] {
  return [...scene.playerSeats, ...(scene.furnitureSeats ?? [])];
}
