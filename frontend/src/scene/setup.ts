import * as THREE from 'three';
import type { SceneSpec, Vec3 } from './world';

export function setupRoom(scene: THREE.Scene, spec: SceneSpec) {
  scene.background = new THREE.Color('#15191e');
  scene.add(new THREE.HemisphereLight('#e2eeff', '#34302d', 2));
  const addBox = (position: Vec3, size: Vec3, color: string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    mesh.position.copy(position); scene.add(mesh); return mesh;
  };
  const { room } = spec;
  addBox({ x: 0, y: -.1, z: 0 }, { x: room.width, y: .2, z: room.depth }, '#30353b');
  addBox({ x: 0, y: room.height + .1, z: 0 }, { x: room.width, y: .2, z: room.depth }, '#242932');
  room.walls.forEach(b => addBox(b.center, b.size, '#242932'));
  room.platforms.forEach(b => addBox(b.center, b.size, '#535e6b'));
  room.obstacles.filter(b => !b.id.startsWith('npc-') && !b.id.startsWith('chair-')).forEach(b => addBox(b.center, b.size, '#464d57'));
  for (const r of room.ramps) {
    const from = new THREE.Vector3().copy(r.from), to = new THREE.Vector3().copy(r.to);
    const delta = to.clone().sub(from);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(r.width, .08, delta.length()), new THREE.MeshStandardMaterial({ color: '#737f8d', roughness: 1 }));
    mesh.position.copy(from.add(to).multiplyScalar(.5)); mesh.position.y -= .04;
    // Local Z follows the ramp; X remains across its width.
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize()); scene.add(mesh);
  }
  for (const seat of spec.playerSeats) {
    const chair = new THREE.Group(); chair.position.copy(seat.position); chair.rotation.y = -seat.yaw;
    const material = new THREE.MeshStandardMaterial({ color: '#69768a', roughness: 1 });
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(.8, .15, .8), material); cushion.position.y = .45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(.8, .65, .12), material); back.position.set(0, .8, .35);
    chair.add(cushion, back); scene.add(chair);
  }
  for (const z of [-7, -3, 5]) {
    const light = new THREE.PointLight('#eef4ff', 160, 16, 2); light.position.set(0, 5.5, z); scene.add(light);
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
