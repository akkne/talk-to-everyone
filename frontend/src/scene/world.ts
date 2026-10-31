/** Public scene geometry, shared by rendering and local collision prediction. */
export interface Vec3 { x: number; y: number; z: number }
export interface Box { id: string; center: Vec3; size: Vec3 }
export interface Ramp { id: string; from: Vec3; to: Vec3; width: number }
export interface SeatSpec { id: string; position: Vec3; yaw: number; exit: Vec3 }
export interface Pose { position: Vec3; yaw: number; pitch: number; mode: 'walking' | 'seated'; seatId: string | null; seq: number }
export interface SceneSpec {
  version: string;
  room: { width: number; depth: number; height: number; platforms: Box[]; ramps: Ramp[]; obstacles: Box[]; walls: Box[] };
  npcStands: { id: string; position: Vec3; yaw: number; level: number }[];
  playerSeats: SeatSpec[]; spawnPoints: Vec3[];
}
