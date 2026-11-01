import * as THREE from 'three';
import type { CharacterLook, NpcMeta } from '../shared/types';
import type { expressionPose } from './expression';

export const ANATOMY = { hip: 1.146, thigh: .466, shin: .565, ankle: .115, pelvisRadius: .11 } as const;
export interface SeatFit { surface: number; hipZ: number; footZ: number }
export const NPC_SEAT: SeatFit = { surface: .54, hipZ: -.08, footZ: .44 };
export const JURY_SEAT: SeatFit = { surface: .59, hipZ: -.035, footZ: .48 };
export const SOFA_SEAT: SeatFit = { surface: .61, hipZ: .18, footZ: .65 };
const smooth = (v: number) => { const t = THREE.MathUtils.clamp(v, 0, 1); return t * t * (3 - 2 * t); };

/** Fixed bone lengths, knee on the forward side of the two-bone solution. Coordinates are floor-relative. */
export function legPose(hipY: number, hipZ: number, ankleY: number, ankleZ: number) {
  const y = ankleY - hipY, z = ankleZ - hipZ;
  const distance = Math.hypot(y, z);
  const d = THREE.MathUtils.clamp(distance, Math.abs(ANATOMY.thigh - ANATOMY.shin) + 1e-6, ANATOMY.thigh + ANATOMY.shin - 1e-6);
  const along = (ANATOMY.thigh ** 2 - ANATOMY.shin ** 2 + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, ANATOMY.thigh ** 2 - along ** 2));
  const uy = y / distance, uz = z / distance;
  const kneeY = hipY + uy * along + uz * height;
  const kneeZ = hipZ + uz * along - uy * height;
  const thighX = Math.atan2(-(kneeZ - hipZ), -(kneeY - hipY));
  const shinX = Math.atan2(-(ankleZ - kneeZ), -(ankleY - kneeY));
  return { kneeY, kneeZ, thighX, kneeX: shinX - thighX, footX: -shinX };
}

export function characterLook(meta: NpcMeta): CharacterLook {
  if (meta.avatar) {
    const a = meta.avatar;
    const hair: CharacterLook['hair'] = a.hairStyle === 'bald' ? 'bald' : a.hairStyle === 'bob' ? 'shoulder' : a.hairStyle === 'bun' ? 'layered' : a.hairStyle === 'spiky' ? 'messy' : 'crop';
    return { gender: a.hairStyle === 'bob' || a.hairStyle === 'bun' ? 'f' : 'm', style: 'sweater', color: a.bodyColor,
      skin: a.skinTone, hairColor: a.hairColor, hair, facial: 'none', access: a.accessory, pants: '#384650', custom: a };
  }
  if (meta.appearance?.model) return meta.appearance.model;
  const female = /^(Аня|Анна|Вика|Оля|Ольга|Яна|Алина|Даша|Дарья|София|Ксюша|Ксения|Катя|Света|Диана|Лера|Рита|Полина|Милана|Кира|Юля|Арина|Кристина|Таисия|Алиса|Ева|Настя)$/.test(meta.name);
  const hair = meta.appearance?.hair ?? meta.number % 4;
  return { gender: female ? 'f' : 'm', style: meta.appearance?.style === 'sport' ? 'sport' : meta.appearance?.style === 'smart' ? 'cardigan' : 'sweater',
    color: meta.color, hair: female ? 'shoulder' : (['crop', 'part', 'fade', 'messy'] as const)[hair % 4],
    access: meta.appearance?.accessory ?? 'none', facial: 'none', hairColor: ['#49342e', '#79543e', '#29262d', '#976f4f'][hair % 4],
    skin: ['#d7a384', '#c28c6c', '#efcdb3', '#ad7659', '#dca984'][(meta.appearance?.skin ?? meta.number) % 5], pants: '#384650' };
}

type MaterialKey = 'skin' | 'hair' | 'shirt' | 'pants' | 'shoe' | 'sole' | 'trim' | 'lip' | 'mouth' | 'accent' | 'eye';
type Point = [number, number, number];
type MoodPose = ReturnType<typeof expressionPose>;
interface Leg { thigh: THREE.Group; knee: THREE.Group; foot: THREE.Group }
interface Arm { shoulder: THREE.Group; elbow: THREE.Group; wrist: THREE.Group }

/** Local geometry and articulated limbs; all visual variants share the same floor and seat constraints. */
export class AvatarRig {
  readonly root = new THREE.Group();
  readonly upper = new THREE.Group();
  readonly head = new THREE.Group();
  readonly bodyMaterial: THREE.MeshStandardMaterial;
  readonly mouth: THREE.Mesh;
  readonly brows: THREE.Mesh[] = [];
  private readonly pelvis: THREE.Mesh;
  private readonly legs: Leg[] = [];
  private readonly arms: Arm[] = [];
  private readonly lowerLip: THREE.Mesh;
  private readonly materials: Record<MaterialKey, THREE.MeshStandardMaterial>;
  constructor(readonly look: CharacterLook) {
    const colors: Record<MaterialKey, string> = { skin: look.skin, hair: look.hairColor, shirt: look.color, pants: look.pants,
      shoe: '#eee9df', sole: '#77818a', trim: '#e9e2ef', lip: '#a76e67', mouth: '#704b46', accent: look.color, eye: '#30343a' };
    this.materials = Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, new THREE.MeshStandardMaterial({ color, roughness: .85 })])) as typeof this.materials;
    this.materials.accent.color.multiplyScalar(.72);
    this.bodyMaterial = this.materials.shirt;
    this.root.name = 'character-rig'; this.upper.name = 'upper-body'; this.root.add(this.upper);
    this.pelvis = this.ell(this.root, 'pants', [0, ANATOMY.hip, 0], [.215, .11, .14]); this.pelvis.name = 'pelvis';
    // Torso coordinates are relative to the hips, so collar, accessories and shoulders move together.
    const points = [[.21, .91], [.205, .98], [.215, 1.12], [.255, 1.32], [.235, 1.38], [.11, 1.42]].map(([r, y]) => new THREE.Vector2(r, y - .89));
    this.mesh(this.upper, new THREE.LatheGeometry(points, 24), 'shirt', [0, 0, 0], [1, 1, .66]);
    this.mesh(this.upper, new THREE.CylinderGeometry(.075, .09, .09, 16), 'skin', [0, 1.435 - .89, 0]);
    this.mesh(this.upper, new THREE.TorusGeometry(.088, .016, 8, 24), 'trim', [0, 1.414 - .89, 0]).rotation.x = Math.PI / 2;
    this.head.position.y = 1.625 - .89; this.head.scale.setScalar(.85); this.head.name = 'head'; this.upper.add(this.head);
    this.ell(this.head, 'skin', [0, 0, 0], [.142, .19, .133]); this.ell(this.head, 'skin', [0, -.085, .015], [.113, .097, .109]);
    for (const side of [-1, 1]) {
      this.ell(this.head, 'skin', [side * .143, -.015, 0], [.025, .047, .026]);
      if (look.custom?.eyes === 'visor') {
        if (side < 0) this.box(this.head, 'sole', [0, .012, .144], [.17, .027, .02]);
      } else if (look.custom?.eyes === 'focused') {
        this.box(this.head, 'eye', [side * .052, .012, .136], [.036, .008, .01]).rotation.z = side * .12;
      } else {
        this.ell(this.head, 'eye', [side * .052, .012, .122], look.custom?.eyes === 'wide' ? [.020, .025, .012] : [.014, .018, .008]);
        if (look.custom?.eyes === 'wide') this.ell(this.head, 'trim', [side * .048, .02, .137], [.006, .007, .004]);
      }
      this.brows.push(this.box(this.head, 'hair', [side * .052, .047, .125], [.043, .009, .009]));
    }
    this.ell(this.head, 'skin', [0, -.024, .133], [.022, .034, .026]);
    this.addHair();
    // Place lips on top of the face (and facial hair), rather than inside the head sphere.
    this.ell(this.head, 'lip', [0, -.075, .141], [.039, .009, .008]);
    this.mouth = this.ell(this.head, 'mouth', [0, -.080, .149], [.034, .0035, .004]); this.mouth.name = 'mouth';
    this.lowerLip = this.ell(this.head, 'lip', [0, -.087, .142], [.029, .006, .007]);
    if (look.custom?.mouth === 'grin') {
      this.mouth.scale.x = .042;
      this.ell(this.head, 'trim', [0, -.078, .155], [.032, .005, .003]);
    } else if (look.custom?.mouth === 'smirk') {
      this.mouth.position.x = .014; this.mouth.rotation.z = .20;
    } else if (look.custom?.mouth === 'surprised') {
      this.mouth.scale.x = .017;
    } else if (look.custom?.mouth === 'smile') {
      for (const side of [-1, 1]) this.ell(this.head, 'lip', [side * .029, -.073, .145], [.011, .005, .004]).rotation.z = side * .3;
    }
    this.addOutfit(); this.addAccessories();
    for (const side of [-1, 1]) {
      const thigh = this.bone(this.root, `thigh-${side}`, ANATOMY.thigh, .090, .074, 'pants');
      const knee = this.bone(thigh, `shin-${side}`, ANATOMY.shin, .077, .056, 'pants'); knee.position.y = -ANATOMY.thigh;
      const foot = new THREE.Group(); foot.name = `foot-${side}`; foot.position.y = -ANATOMY.shin; knee.add(foot);
      this.ell(foot, 'shoe', [0, -.033, .064], [.081, .067, .146]);
      this.box(foot, 'sole', [0, -.096, .064], [.158, .038, .26]);
      this.box(foot, 'trim', [0, 0, .111], [.08, .012, .065]); this.legs.push({ thigh, knee, foot });
      const shoulder = this.bone(this.upper, `shoulder-${side}`, .27, .087, .066, 'shirt'); shoulder.position.set(side * .245, .435, 0);
      const elbow = this.bone(shoulder, `forearm-${side}`, .25, .065, .047, 'shirt'); elbow.position.y = -.27;
      const wrist = new THREE.Group(); wrist.position.y = -.25; elbow.add(wrist);
      this.ell(wrist, 'trim', [0, .01, 0], [.05, .018, .05]);
      this.ell(wrist, 'skin', [0, -.045, .008], [.05, .066, .036]);
      this.ell(wrist, 'skin', [-side * .037, -.026, .016], [.024, .038, .025]);
      if (look.access === 'watch' && side < 0) this.box(wrist, 'sole', [0, .005, .047], [.055, .032, .02]);
      this.arms.push({ shoulder, elbow, wrist });
    }
  }
  private mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, key: MaterialKey, p: Point, scale?: Point) {
    const mesh = new THREE.Mesh(geometry, this.materials[key]); mesh.position.set(...p); if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private ell(parent: THREE.Object3D, key: MaterialKey, p: Point, scale: Point) { return this.mesh(parent, new THREE.SphereGeometry(1, 18, 12), key, p, scale); }
  private box(parent: THREE.Object3D, key: MaterialKey, p: Point, size: Point) { return this.mesh(parent, new THREE.BoxGeometry(...size), key, p); }
  private bone(parent: THREE.Object3D, name: string, length: number, top: number, bottom: number, key: MaterialKey) {
    const joint = new THREE.Group(); joint.name = name; parent.add(joint);
    this.mesh(joint, new THREE.CylinderGeometry(top, bottom, length, 14), key, [0, -length / 2, 0]);
    this.ell(joint, key, [0, 0, 0], [top, top, top]); this.ell(joint, key, [0, -length, 0], [bottom, bottom, bottom]); return joint;
  }
  private hairCap() {
    const maxTheta = Math.PI * .53;
    const cap = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, maxTheta);
    const vertices = cap.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      const radius = Math.hypot(x, z);
      const front = radius > 1e-6 ? Math.max(0, z / radius) : 0;
      // A raised hairline over the forehead keeps eyes, brows and spectacles clear.
      const theta = Math.acos(THREE.MathUtils.clamp(y, -1, 1)) / maxTheta * (maxTheta - front * .50);
      const r = Math.sin(theta);
      vertices.setXYZ(i, radius > 1e-6 ? x / radius * r : 0, Math.cos(theta), radius > 1e-6 ? z / radius * r : 0);
    }
    cap.computeVertexNormals();
    return cap;
  }
  private addHair() {
    const p = this.look, h = this.head;
    if (p.hair !== 'bald') {
      this.mesh(h, this.hairCap(), 'hair', [0, .024, -.008], [.15, .17, .142]).name = 'hair-cap';
      if (p.gender === 'f') {
        const length = p.hair === 'shoulder' ? .30 : p.hair === 'layered' ? .37 : .49;
        this.ell(h, 'hair', [0, -length / 2, -.078], [.151, length / 2 + .07, .083]);
        this.ell(h, 'hair', [0, -.045, -.08], [.148, .16, .09]);
        for (const side of [-1, 1]) {
          if (p.hair === 'waves') for (let n = 0; n < 5; n++) this.ell(h, 'hair', [side * (.137 + Math.sin(n * 1.8) * .012), .04 - n * length / 4, .005], [.044, .095, .066]);
          else this.ell(h, 'hair', [side * .137, -length / 2 + .015, .008], [.044, length / 2 + .055, .073]).rotation.z = side * -.035;
        }
        this.ell(h, 'hair', [-.075, .115, .083], [.085, .06, .064]); this.ell(h, 'hair', [.064, .12, .086], [.07, .05, .061]);
      } else {
        const count = p.hair === 'crop' ? 7 : 5;
        for (let i = 0; i < count; i++) {
          const tuft = this.ell(h, 'hair', [-.1 + i * .2 / (count - 1), .112 + (p.hair === 'messy' ? Math.sin(i * 2) * .026 : Math.sin(i * .7) * .018), .082], [p.hair === 'crop' ? .031 : .05, p.hair === 'fade' ? .048 : .06, .05]);
          tuft.rotation.z = p.hair === 'part' ? -.5 : p.hair === 'messy' ? Math.sin(i) * .4 : 0;
        }
      }
    }
    if (p.custom?.hairStyle === 'spiky') for (let i = 0; i < 5; i++) this.mesh(h, new THREE.ConeGeometry(.026, .09, 5), 'hair', [(i - 2) * .04, .19, -.01]);
    if (p.custom?.hairStyle === 'bun') this.ell(h, 'hair', [0, .16, -.14], [.07, .07, .07]);
    if (p.custom?.hairStyle === 'afro') this.ell(h, 'hair', [0, .095, -.065], [.18, .15, .16]);
    if (p.facial === 'beard' || p.facial === 'stubble') this.mesh(h, new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, Math.PI * .56, Math.PI * .44), 'hair', [0, -.022, .006], [.115, p.facial === 'beard' ? .153 : .117, .12]);
    if (p.facial === 'mustache' || p.facial === 'beard') for (const side of [-1, 1]) this.ell(h, 'hair', [side * .019, -.057, .146], [.025, .01, .006]).rotation.z = side * .16;
  }
  /** Curved fabric details follow the torso surface, including in profile and while seated. */
  private patch(x: number, y: number, w: number, h: number, key: MaterialKey = 'trim') {
    const geometry = new THREE.BufferGeometry(), vertices: number[] = [], indices: number[] = [], nx = 12, ny = Math.max(2, Math.ceil(h / .02));
    const rings = [[.91, .21], [.98, .205], [1.12, .215], [1.32, .255], [1.38, .235], [1.42, .11]];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const xx = x - w / 2 + w * i / nx, yy = y - h / 2 + h * j / ny; let r = .21;
      for (let k = 0; k < rings.length - 1; k++) if (yy >= rings[k][0] && yy <= rings[k + 1][0]) { const t = (yy - rings[k][0]) / (rings[k + 1][0] - rings[k][0]); r = rings[k][1] * (1 - t) + rings[k + 1][1] * t; }
      vertices.push(xx, yy - .89, Math.sqrt(Math.max(.0001, r * r - xx * xx)) * .66 + .006);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; indices.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1); }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    return this.mesh(this.upper, geometry, key, [0, 0, 0]);
  }
  private addOutfit() {
    const s = this.look.style, patch = this.patch.bind(this);
    if (['blazer', 'jacket', 'leather', 'moto', 'overshirt', 'plaid', 'work', 'windbreaker', 'chef', 'varsity', 'bomber', 'cardigan', 'utility'].includes(s)) {
      patch(0, 1.16, .012, .39, s === 'leather' ? 'sole' : 'trim');
      for (const side of [-1, 1]) patch(side * .09, 1.33, .075, .17, s === 'blazer' || s === 'cardigan' ? 'trim' : 'accent');
    }
    if (['utility', 'work', 'overshirt', 'moto', 'jacket'].includes(s)) for (const side of [-1, 1]) { patch(side * .125, 1.22, .1, .105, 'accent'); patch(side * .125, 1.255, .1, .014); }
    if (s === 'polo' || s === 'blouse') { for (const side of [-1, 1]) patch(side * .047, 1.365, .065, .067); patch(0, 1.29, .014, .11); }
    if (s === 'hoodie') {
      this.mesh(this.upper, new THREE.TorusGeometry(.105, .034, 8, 24), 'shirt', [0, 1.37 - .89, -.02]).rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) patch(side * .045, 1.29, .009, .13); patch(0, 1.045, .23, .09, 'accent');
    }
    if (s === 'sport' || s === 'windbreaker' || s === 'varsity') { for (const side of [-1, 1]) patch(side * .19, 1.21, .024, .26); patch(0, 1.3, .29, .025, 'accent'); }
    if (s === 'stripe' || s === 'plaid') { for (let i = 0; i < 5; i++) patch(0, .99 + i * .073, .39, .014, 'accent'); if (s === 'plaid') for (const side of [-1, 1]) patch(side * .115, 1.17, .015, .38, 'accent'); }
    if (s === 'patchwork') { patch(-.1, 1.21, .15, .25, 'accent'); patch(.11, 1.09, .13, .12); }
    if (s === 'apron') { patch(0, 1.135, .29, .38, 'accent'); for (const side of [-1, 1]) patch(side * .1, 1.335, .027, .16, 'accent'); patch(0, 1.035, .19, .08, 'shirt'); }
    if (s === 'chef') for (const side of [-1, 1]) for (let i = 0; i < 3; i++) this.ell(this.upper, 'pants', [side * .065, 1.3 - .89 - i * .09, .171], [.009, .009, .005]);
  }
  private addAccessories() {
    const a = this.look.access, h = this.head;
    if (a === 'glasses') { for (const side of [-1, 1]) this.mesh(h, new THREE.TorusGeometry(.039, .006, 6, 20), 'pants', [side * .052, .012, .139]); this.box(h, 'pants', [0, .012, .142], [.031, .006, .008]); }
    if (a === 'headphones' || a === 'beaniephones' || a === 'beanie') {
      if (a !== 'headphones') this.mesh(h, new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * .52), 'pants', [0, .065, -.008], [.16, .17, .15]);
      if (a !== 'beanie') { this.mesh(h, new THREE.TorusGeometry(.161, .016, 7, 24, Math.PI), 'pants', [0, .024, 0]); for (const side of [-1, 1]) this.ell(h, 'pants', [side * .16, -.005, 0], [.025, .061, .049]); }
    }
    if (a === 'cap') { this.mesh(h, new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * .53), 'shirt', [0, .04, 0], [.155, .17, .148]); this.box(h, 'shirt', [0, .03, .15], [.23, .025, .16]); }
    if (a === 'earrings') for (const side of [-1, 1]) this.mesh(h, new THREE.TorusGeometry(.019, .004, 6, 14), 'sole', [side * .153, -.059, .015]);
    if (a === 'pendant' || a === 'chain' || a === 'choker') {
      this.mesh(this.upper, new THREE.TorusGeometry(a === 'choker' ? .083 : .105, a === 'chain' ? .012 : .005, 6, 24), 'sole', [0, 1.397 - .89, .01], [1, a === 'choker' ? .18 : 1, 1]).rotation.x = Math.PI / 2;
      if (a === 'pendant') this.ell(this.upper, 'sole', [0, 1.29 - .89, .169], [.017, .026, .008]);
    }
    if (a === 'camera') {
      this.box(this.upper, 'pants', [0, 1.08 - .89, .2], [.16, .105, .065]); this.mesh(this.upper, new THREE.CylinderGeometry(.043, .043, .06, 16), 'sole', [0, 1.08 - .89, .25]).rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) this.patch(side * .08, 1.26, .012, .24, 'pants');
    }
  }
  /** Hands remain over the keyboard while the seated director works. */
  typeOnLaptop(now: number) {
    this.upper.rotation.x = .08;
    this.arms.forEach((arm, i) => {
      const tap = Math.sin(now / 105 + i * Math.PI) * .035;
      arm.shoulder.rotation.set(-.55, 0, (i ? 1 : -1) * .08);
      arm.elbow.rotation.set(-1.2 + tap, 0, (i ? -1 : 1) * .1);
      arm.wrist.rotation.x = .12 + tap;
    });
    this.head.rotation.x = .12;
  }
  walkCycle(now: number) {
    const phase = now / 155;
    this.legs.forEach((leg, i) => {
      const swing = Math.sin(phase + i * Math.PI);
      leg.thigh.rotation.x += swing * .32;
      leg.knee.rotation.x += Math.max(0, -swing) * .4;
    });
    this.arms.forEach((arm, i) => { arm.shoulder.rotation.x = -Math.sin(phase + i * Math.PI) * .25; });
  }
  reachForFood(now: number) {
    const arm = this.arms[1];
    arm.shoulder.rotation.set(-1.15, 0, -.08);
    arm.elbow.rotation.set(-.25 + Math.sin(now / 190) * .04, 0, 0);
    this.upper.rotation.x = .12;
    this.head.rotation.x = .15;
  }
  pose(amount: number, fit: SeatFit, advance: number, mood: MoodPose, tuck: number, pitch: number) {
    const seated = smooth(amount), stand = 1 - seated;
    const hipY = THREE.MathUtils.lerp(ANATOMY.hip, fit.surface + ANATOMY.pelvisRadius, seated) + (fit.surface > .60 ? .06 * Math.sin(Math.PI * seated) : 0);
    const hipZ = THREE.MathUtils.lerp(advance, fit.hipZ, seated);
    const ankleZ = THREE.MathUtils.lerp(advance + .014, fit.footZ, seated);
    this.upper.position.set(0, hipY, hipZ); this.pelvis.position.set(0, hipY, hipZ);
    // Whole-body tilts would drag planted feet through the floor and backrest.
    const gesture = smooth(stand * 2 - 1);
    this.upper.rotation.set(mood.lean * gesture, 0, mood.sway * gesture);
    this.legs.forEach((leg, i) => {
      const p = legPose(hipY, hipZ, ANATOMY.ankle + tuck * .12, ankleZ + tuck * .12);
      leg.thigh.position.set((i ? 1 : -1) * .14, hipY, hipZ); leg.thigh.rotation.x = p.thighX;
      leg.knee.rotation.x = p.kneeX; leg.foot.rotation.x = p.footX;
    });
    this.arms.forEach((arm, i) => {
      const side = i ? 1 : -1;
      arm.shoulder.rotation.set(THREE.MathUtils.lerp((i ? mood.rightX : mood.leftX) * gesture - tuck * .8, -.28, seated), 0,
        THREE.MathUtils.lerp(side * .12 + (i ? mood.rightZ : mood.leftZ) * gesture, side * .12, seated));
      arm.elbow.rotation.set(THREE.MathUtils.lerp(-.12, -1.07, seated), 0, -side * .12 * seated);
      arm.wrist.rotation.x = .1 * seated;
    });
    this.head.rotation.x = THREE.MathUtils.clamp(pitch + mood.headX, seated > .1 ? -.12 : -.5, seated > .1 ? .12 : .5);
    this.head.rotation.z = mood.headZ * gesture;
    this.brows.forEach((brow, i) => { brow.rotation.z = (i ? -1 : 1) * mood.brow; });
    this.mouth.scale.y = (this.look.custom?.mouth === 'surprised' ? .019 : this.look.custom?.mouth === 'grin' ? .008 : .0035) * (1 + mood.mouthOpen * 5);
    this.lowerLip.position.y = -.087 - mood.mouthOpen * .012;
    return { labelY: hipY + 1.03, hipY, hipZ };
  }
}
