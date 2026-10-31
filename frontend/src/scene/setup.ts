import * as THREE from 'three';
import type { SceneSpec } from '../shared/types';

/** <summary>Build the room entirely from primitives and local materials.</summary> */
export function setupRoom(scene: THREE.Scene, spec: SceneSpec) {
  scene.background = new THREE.Color('#15130f');
  scene.fog = new THREE.Fog('#15130f', 12, 28);
  scene.add(new THREE.HemisphereLight('#ffe8c2', '#24251e', 2));
  const light = new THREE.PointLight('#ffd28a', 100, 18, 2);
  light.position.set(0, 5, 0); scene.add(light);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(spec.room.width, spec.room.depth), new THREE.MeshStandardMaterial({ color: '#292b25', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.04; scene.add(floor);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.18, 48), new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 0.85 }));
  table.scale.x = 1.45; table.position.set(0, 0.76, -0.3); scene.add(table);
  const inset = new THREE.Mesh(new THREE.CylinderGeometry(2.78, 2.78, 0.01, 48), new THREE.MeshStandardMaterial({ color: '#35463d', roughness: 1 }));
  inset.scale.x = 1.45; inset.position.set(0, 0.86, -0.3); scene.add(inset);
  for (const x of [-3, 3]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 2.5), new THREE.MeshStandardMaterial({ color: '#261e17' }));
    leg.position.set(x, 0.37, -0.3); scene.add(leg);
  }
  const material = new THREE.MeshStandardMaterial({ color: '#34382e' });
  for (const part of [...spec.room.walls, ...spec.room.platforms, ...spec.room.obstacles]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(part.size.x, part.size.y, part.size.z), material);
    mesh.position.set(part.center.x, part.center.y, part.center.z); scene.add(mesh);
  }
  for (const ramp of spec.room.ramps) {
    const length = Math.hypot(ramp.to.x-ramp.from.x, ramp.to.z-ramp.from.z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(ramp.width, 0.12, length), material);
    mesh.position.set((ramp.from.x+ramp.to.x)/2, (ramp.from.y+ramp.to.y)/2, (ramp.from.z+ramp.to.z)/2);
    mesh.rotation.x = -Math.atan2(ramp.to.y-ramp.from.y, length); scene.add(mesh);
  }
  for (const seat of spec.playerSeats) {
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.18), new THREE.MeshStandardMaterial({ color: '#4a3524' }));
    chair.position.set(seat.position.x, seat.position.y + 0.65, seat.position.z + 0.25);
    chair.rotation.y = seat.yaw; scene.add(chair);
  }
  const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#b6a076', side: THREE.DoubleSide }));
  lamp.position.set(0, 4.8, -0.3); scene.add(lamp);
  for (let i = 0; i < 6; i++) {
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.48), new THREE.MeshStandardMaterial({ color: '#d6cbb0' }));
    paper.rotation.set(-Math.PI / 2, 0, i * 0.7); paper.position.set(Math.sin(i * 2) * 2, 0.875, Math.cos(i * 2) * 1.4 - 0.3); scene.add(paper);
  }
}
/** <summary>Release all GPU resources created by the scene, including text sprites.</summary> */
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
