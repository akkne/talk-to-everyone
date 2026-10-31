import * as THREE from 'three';
import type { SceneSpec } from '../shared/types';

const material = (color: string, roughness = 0.88, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Build a bright studio around the server's authoritative geometry. Decorative pieces have no collision. */
export function setupRoom(scene: THREE.Scene, spec: SceneSpec) {
  const width = spec.room.width, depth = spec.room.depth, height = spec.room.height;
  scene.background = new THREE.Color('#eef5f4');
  scene.fog = new THREE.Fog('#eef5f4', Math.max(21, depth * 1.6), Math.max(40, depth * 2.7));
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9c9c6', 3.1));
  const sun = new THREE.DirectionalLight('#fff9ed', 3.2);
  sun.position.set(-4, height + 3, 6); scene.add(sun);
  const fill = new THREE.DirectionalLight('#d2e9ed', 1.6);
  fill.position.set(6, 4, -5); scene.add(fill);
  const addBox = (x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); scene.add(mesh); return mesh;
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material('#e8eee9'));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.035; scene.add(floor);
  const tileLine = material('#d1ded9');
  for (let x = -width / 2 + 1; x < width / 2; x += 2) addBox(x, -0.022, 0, 0.012, 0.008, depth - 0.5, tileLine);
  for (let z = -depth / 2 + 1; z < depth / 2; z += 2) addBox(0, -0.02, z, width - 0.5, 0.008, 0.012, tileLine);

  const wallMat = material('#f9f7ef');
  const platformMat = material('#d9e8e6');
  const edgeMat = material('#78a9a8', 0.55);
  for (const part of spec.room.walls) addBox(part.center.x, part.center.y, part.center.z, part.size.x, part.size.y, part.size.z, wallMat);
  for (const part of spec.room.platforms) {
    addBox(part.center.x, part.center.y, part.center.z, part.size.x, part.size.y, part.size.z, platformMat);
    const top = part.center.y + part.size.y / 2;
    addBox(part.center.x, top - 0.055, part.center.z + part.size.z / 2 + 0.015, part.size.x, 0.11, 0.04, edgeMat);
    addBox(part.center.x, top - 0.055, part.center.z - part.size.z / 2 - 0.015, part.size.x, 0.11, 0.04, edgeMat);
  }
  for (const part of spec.room.obstacles) addBox(part.center.x, part.center.y, part.center.z, part.size.x, part.size.y, part.size.z, material('#d4dfda'));
  for (const ramp of spec.room.ramps) {
    const dx = ramp.to.x - ramp.from.x, dy = ramp.to.y - ramp.from.y, dz = ramp.to.z - ramp.from.z;
    const length = Math.hypot(dx, dz);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(ramp.width, 0.12, Math.hypot(length, dy)), platformMat);
    mesh.position.set((ramp.from.x + ramp.to.x) / 2, (ramp.from.y + ramp.to.y) / 2, (ramp.from.z + ramp.to.z) / 2);
    // Local +Z points from the lower landing to the upper landing.
    mesh.rotation.set(-Math.atan2(dy, length), Math.atan2(dx, dz), 0, 'YXZ'); scene.add(mesh);
  }

  // A soft central aisle guides the player toward the two rows of participants.
  const aisle = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(4.4, width * 0.3), Math.min(5.6, depth * 0.42)), material('#dce8e5'));
  aisle.rotation.x = -Math.PI / 2; aisle.position.set(0, -0.012, 2.8); scene.add(aisle);
  for (const stand of spec.npcStands) {
    const platform = spec.room.platforms.find(p => Math.abs(stand.position.x - p.center.x) < p.size.x / 2 && Math.abs(stand.position.z - p.center.z) < p.size.z / 2);
    const y = platform ? platform.center.y + platform.size.y / 2 : 0;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.62, 0.045, 24), material('#faf8f1'));
    base.position.set(stand.position.x, y + 0.022, stand.position.z); scene.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.018, 5, 24), edgeMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(stand.position.x, y + 0.051, stand.position.z); scene.add(ring);
  }

  const wood = material('#b9a994');
  const seatMat = material('#a6c8c3');
  for (const seat of spec.playerSeats) {
    const chair = new THREE.Group(); chair.position.set(seat.position.x, seat.position.y, seat.position.z); chair.rotation.y = seat.yaw;
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.7), seatMat); cushion.position.y = 0.52; chair.add(cushion);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.72, 0.11), seatMat); back.position.set(0, 0.92, 0.34); chair.add(back);
    for (const x of [-0.28, 0.28]) for (const z of [-0.25, 0.25]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.47, 0.065), wood); leg.position.set(x, 0.25, z); chair.add(leg);
    }
    scene.add(chair);
  }

  // Inset panels, trim and a large show sign frame the back wall without occupying the walkable floor.
  const backZ = -depth / 2 + 0.2;
  const panel = material('#d7e8e4');
  const rail = material('#a7bbb5');
  addBox(0, height * 0.62, backZ + 0.05, width * 0.7, height * 0.53, 0.04, panel);
  for (const x of [-width * 0.37, width * 0.37]) {
    addBox(x, height * 0.55, backZ + 0.1, 0.06, height * 0.83, 0.08, rail);
    addBox(x, height * 0.55, -backZ - 0.1, 0.06, height * 0.83, 0.08, rail);
  }
  for (const z of [backZ + 0.1, -backZ - 0.1]) {
    addBox(0, 0.18, z, width - 0.45, 0.25, 0.07, wood);
    addBox(0, height - 0.38, z, width - 0.45, 0.07, 0.07, wood);
  }
  const signCanvas = document.createElement('canvas'); signCanvas.width = 1024; signCanvas.height = 256;
  const ctx = signCanvas.getContext('2d')!;
  ctx.fillStyle = '#f9f7f0'; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#0a66c2'; ctx.textAlign = 'center'; ctx.font = '600 82px -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif';
  ctx.fillText('УГАДАЙ ДРУЗЕЙ', 512, 153);
  ctx.fillStyle = '#c88e5d'; ctx.fillRect(276, 188, 472, 8);
  const texture = new THREE.CanvasTexture(signCanvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(7, width * 0.43), 1.75), new THREE.MeshBasicMaterial({ map: texture }));
  sign.position.set(0, height * 0.7, backZ + 0.102); scene.add(sign);

  // Ceiling light boxes make the studio feel evenly lit without heavy real-time shadows.
  for (const x of [-width * 0.25, 0, width * 0.25]) for (const z of [-depth * 0.22, depth * 0.22]) {
    addBox(x, height - 0.12, z, 2.35, 0.08, 0.72, material('#e1e7e0'));
    addBox(x, height - 0.17, z, 2.1, 0.02, 0.52, new THREE.MeshBasicMaterial({ color: '#fffdf2' }));
  }
}

/** Release all GPU resources created by the scene, including text sprites. */
export function disposeScene(scene: THREE.Scene) {
  scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
  scene.clear();
}
