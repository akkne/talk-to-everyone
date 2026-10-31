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
const box = (id: string, x: number, y: number, z: number, w: number, h: number, d: number): Box => ({ id, center: { x, y, z }, size: { x: w, y: h, z: d } });
/** Preview only. A live v2 session must provide its own SceneSpec. */
export const previewScene: SceneSpec = {
  version: 'studio-preview-1',
  room: {
    width: 20, depth: 24, height: 7,
    walls: [box('back', 0, 3.5, -12, 20, 7, .2), box('front', 0, 3.5, 12, 20, 7, .2), box('left', -10, 3.5, 0, .2, 7, 24), box('right', 10, 3.5, 0, .2, 7, 24)],
    platforms: [box('lower', 0, .3, -4, 14, .6, 3), box('upper', 0, .75, -7, 14, 1.5, 3)],
    ramps: [
      { id: 'lower-ramp', from: { x: 8, y: 0, z: 0 }, to: { x: 8, y: .6, z: -4 }, width: 2 },
      { id: 'upper-ramp', from: { x: 8, y: .6, z: -4 }, to: { x: 8, y: 1.5, z: -7 }, width: 2 },
    ],
    obstacles: [],
  },
  npcStands: Array.from({ length: 10 }, (_, i) => ({ id: `anchor-${i}`, position: { x: (i % 5 - 2) * 2.5 + (i >= 5 ? .65 : 0), y: i >= 5 ? 1.5 : .6, z: i >= 5 ? -7 : -4 }, yaw: 0, level: i >= 5 ? 1 : 0 })),
  playerSeats: Array.from({ length: 5 }, (_, i) => {
    const angle = (i - 2) * .4;
    const position = { x: Math.sin(angle) * 6, y: 0, z: 2 + Math.cos(angle) * 4 };
    return { id: `seat-${i}`, position, yaw: -angle, exit: { x: position.x, y: 0, z: position.z + 1.3 } };
  }),
  spawnPoints: [{ x: 0, y: 0, z: 9 }],
};
// Tables and NPC bodies are authoritative collision volumes in the preview spec.
previewScene.room.obstacles = [
  ...previewScene.playerSeats.flatMap(s => [box(`chair-${s.id}`, s.position.x, .5, s.position.z, .8, 1, .8), box(`table-${s.id}`, s.position.x, .7, s.position.z - 1.2, 1.2, .12, .6)]),
  ...previewScene.npcStands.map(a => box(`npc-${a.id}`, a.position.x, a.position.y + .8, a.position.z, .8, 1.6, .8)),
];
