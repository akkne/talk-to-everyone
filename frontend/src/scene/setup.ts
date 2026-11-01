import * as THREE from 'three';
import { addLocationProps, syncLocationProps } from './props';
import type { SceneSpec } from '../shared/types';

const material = (color: string, roughness = 0.88, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Build a bright studio around the server's authoritative geometry. Decorative pieces have no collision. */
export function setupRoom(scene: THREE.Scene, spec: SceneSpec) {
  const width = spec.room.width, depth = spec.room.depth, height = spec.room.height;
  const loft = spec.theme === 'industrial-loft-bar';
  const atmosphere = loft ? '#302720' : '#eef5f4';
  scene.background = new THREE.Color(atmosphere);
  scene.fog = new THREE.Fog(atmosphere, Math.max(21, depth * 1.6), Math.max(40, depth * 2.7));
  const ambient = new THREE.HemisphereLight('#ffffff', loft ? '#6a4532' : '#b9c9c6', spec.lighting?.ambient ?? (loft ? 1.7 : 3.1));
  ambient.name = 'room-ambient'; scene.add(ambient);
  const sun = new THREE.DirectionalLight(loft ? '#ffc688' : '#fff9ed', spec.lighting?.key ?? (loft ? 2.3 : 3.2));
  sun.name = 'room-key'; sun.position.set(-4, height + 3, 6); scene.add(sun);
  const fill = new THREE.DirectionalLight(loft ? '#ad8090' : '#d2e9ed', spec.lighting?.fill ?? (loft ? .7 : 1.6));
  fill.name = 'room-fill'; fill.position.set(6, 4, -5); scene.add(fill);
  const addBox = (x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); scene.add(mesh); return mesh;
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material(spec.lighting?.floor ?? (loft ? '#655747' : '#e8eee9')));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.035; scene.add(floor);
  const tileLine = material(loft ? '#715d4b' : '#d1ded9');
  for (let x = -width / 2 + 1; x < width / 2; x += 2) addBox(x, -0.022, 0, 0.012, 0.008, depth - 0.5, tileLine);
  for (let z = -depth / 2 + 1; z < depth / 2; z += 2) addBox(0, -0.02, z, width - 0.5, 0.008, 0.012, tileLine);

  const wallMat = material(spec.lighting?.walls ?? (loft ? '#755a49' : '#f9f7ef'));
  const platformMat = material(loft ? '#51463b' : '#d9e8e6');
  const edgeMat = material(loft ? '#ad7951' : '#78a9a8', 0.55);
  for (const part of spec.room.walls) addBox(part.center.x, part.center.y, part.center.z, part.size.x, part.size.y, part.size.z, wallMat);
  for (const part of spec.room.platforms) {
    addBox(part.center.x, part.center.y, part.center.z, part.size.x, part.size.y, part.size.z, platformMat);
    const top = part.center.y + part.size.y / 2;
    // Back edge trim runs along the back wall
    addBox(part.center.x, top - 0.055, part.center.z - part.size.z / 2 - 0.015, part.size.x, 0.11, 0.04, edgeMat);

    // Front edge trim: do not place trim across ramp openings onto the platform
    const frontZ = part.center.z + part.size.z / 2 + 0.015;
    const intersectingRamps = spec.room.ramps.filter(r =>
      Math.abs(r.to.z - (part.center.z + part.size.z / 2)) <= 0.8 || Math.abs(r.from.z - (part.center.z + part.size.z / 2)) <= 0.8
    );
    if (!intersectingRamps.length) {
      addBox(part.center.x, top - 0.055, frontZ, part.size.x, 0.11, 0.04, edgeMat);
    } else {
      const minRampX = Math.min(...intersectingRamps.map(r => (r.to.x + r.from.x) / 2));
      const maxRampX = Math.max(...intersectingRamps.map(r => (r.to.x + r.from.x) / 2));
      const rampW = intersectingRamps[0]?.width ?? 1.3;
      const leftBoundary = minRampX + rampW / 2;
      const rightBoundary = maxRampX - rampW / 2;
      if (rightBoundary > leftBoundary) {
        const centerSpan = (leftBoundary + rightBoundary) / 2;
        const widthSpan = rightBoundary - leftBoundary;
        addBox(centerSpan, top - 0.055, frontZ, widthSpan, 0.11, 0.04, edgeMat);
      }
    }
  }
  for (const part of spec.room.obstacles) {
    // Avoid drawing raw gray boxes over chairs, NPCs or player models that have their own 3D meshes
    if (part.id.startsWith('chair-') || part.id.startsWith('jury-chair-') || part.id.startsWith('npc-') || part.id.startsWith('player-') || spec.objects?.some(o => o.id === part.id)) continue;
    addBox(part.center.x, part.center.y, part.center.z, part.size.x, part.size.y, part.size.z, material('#d4dfda'));
  }
  for (const ramp of spec.room.ramps) {
    const dx = ramp.to.x - ramp.from.x, dy = ramp.to.y - ramp.from.y, dz = ramp.to.z - ramp.from.z;
    const length = Math.hypot(dx, dz);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(ramp.width, 0.12, Math.hypot(length, dy)), platformMat);
    mesh.position.set((ramp.from.x + ramp.to.x) / 2, (ramp.from.y + ramp.to.y) / 2, (ramp.from.z + ramp.to.z) / 2);
    // Local +Z points from the lower landing to the upper landing.
    mesh.rotation.set(-Math.atan2(dy, length), Math.atan2(dx, dz), 0, 'YXZ'); scene.add(mesh);
  }

  // A soft central aisle guides the player toward the two rows of participants.
  const aisle = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(4.4, width * 0.3), Math.min(5.6, depth * 0.42)), material(loft ? '#6c5745' : '#dce8e5'));
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

  if (spec.theme === 'studio') addBox(0, height + .12, 0, width, .2, depth, material(spec.lighting?.ceiling ?? '#46535e'));
  if (loft) {
    const fan = new THREE.Group(); fan.name = 'loft-ceiling-fan'; fan.position.set(0, height - .7, 1);
    const fanMat = material('#514137', .5, .4);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .18, 16), fanMat); fan.add(hub);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.5, .05, .22), fanMat);
      blade.position.x = .82;
      const pivot = new THREE.Group(); pivot.rotation.y = i * Math.PI / 2; pivot.add(blade); fan.add(pivot);
    }
    scene.add(fan);
  }
  addLocationProps(scene, spec);
  syncLocationProps(scene, spec);
  syncRoomLighting(scene, spec);

}

export function syncRoomLighting(scene: THREE.Scene, spec: SceneSpec) {
  if (spec.theme !== 'industrial-loft-bar') return;
  const preset = spec.lightingPresets?.find(p => p.id === spec.activeLightingPreset) ?? spec.lightingPresets?.[0];
  if (!preset) return;
  const ambient = scene.getObjectByName('room-ambient') as THREE.HemisphereLight;
  const key = scene.getObjectByName('room-key') as THREE.DirectionalLight;
  const fill = scene.getObjectByName('room-fill') as THREE.DirectionalLight;
  ambient.color.set(preset.ambientColor).lerp(new THREE.Color('#ffffff'), .5);
  ambient.intensity = preset.id === 'interrogation-blackout' ? .45 : 2.4;
  key.color.set(preset.keyLight.color); key.intensity = preset.keyLight.intensity * 2.2;
  key.position.set(preset.keyLight.position.x, preset.keyLight.position.y, preset.keyLight.position.z);
  fill.color.set(preset.accentNeon.color); fill.intensity = preset.accentNeon.intensity * .5;
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

/** An armchair faces the same local +Z direction as its occupant. */
export function createNpcChair() {
  const chair = new THREE.Group(); chair.name = 'npc-chair';
  const upholstery = material('#a6c8c3');
  const wood = material('#b9a994');
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat = upholstery) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); chair.add(mesh);
  };
  box(0.82, 0.14, 0.74, 0, 0.47, -0.06);
  box(0.96, 0.94, 0.16, 0, 0.92, -0.46);
  for (const side of [-1, 1]) {
    box(0.14, 0.32, 0.78, side * 0.48, 0.7, -0.06);
    for (const z of [-0.32, 0.22]) box(0.07, 0.4, 0.07, side * 0.35, 0.2, z, wood);
  }
  return chair;
}
