// Motorbikes: an original sport bike built in code, the bikes parked along the kerbs, and the one being ridden.
// Front is +Z, the wheels stand on y = 0. No brand, no badge: the shape is a generic faired sport bike.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../styles/palette';
import { BLOCK, ROAD, landSdf, parkSdf, toWorld, warp } from './layout';

/** Where the rider's hips sit, in the bike's frame, and how far the torso leans forward (radians). */
export const SEAT = { y: 0.9, z: -0.28, lean: 0.6 };
const WHEEL_R = 0.32, AXLE = 0.7;

const mats = () => ({
  paint: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6, metalness: 0.4 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xa4aab3, roughness: 0.3, metalness: 0.95 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.92 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.78 }),
  head: new THREE.MeshBasicMaterial({ color: 0xfff3dc }),
  tail: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
});
type Mats = ReturnType<typeof mats>;

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  parent.add(m);
  return m;
}
/** A round bar between two points. */
function bar(parent: THREE.Object3D, a: [number, number, number], b: [number, number, number], r: number, mat: THREE.Material) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 14), mat);
  m.position.copy(va).lerp(vb, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
  parent.add(m);
  return m;
}
/** A side profile in (z, y), extruded across the bike with rounded edges. */
function slab(profile: [number, number][], width: number, bevel: number) {
  const s = new THREE.Shape();
  profile.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
  // the shape was drawn in (x, y) and extruded along z: turn it so the drawing's x becomes the bike's z
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

function wheel(m: Mats) {
  const g = new THREE.Group();
  part(g, new THREE.TorusGeometry(WHEEL_R - 0.07, 0.07, 14, 36), m.rubber, [0, 0, 0], [0, Math.PI / 2, 0]);
  part(g, new THREE.CylinderGeometry(WHEEL_R - 0.1, WHEEL_R - 0.1, 0.035, 28), m.dark, [0, 0, 0], [0, 0, Math.PI / 2]);
  part(g, new THREE.TorusGeometry(WHEEL_R - 0.115, 0.018, 8, 32), m.metal, [0, 0, 0], [0, Math.PI / 2, 0]);
  part(g, new THREE.CylinderGeometry(0.15, 0.15, 0.012, 24), m.metal, [0.055, 0, 0], [0, 0, Math.PI / 2]); // brake disc
  for (let i = 0; i < 5; i++) part(g, new THREE.BoxGeometry(0.03, 0.4, 0.035), m.metal, [0, 0, 0], [(i / 5) * Math.PI, 0, 0]); // spokes
  part(g, new THREE.CylinderGeometry(0.045, 0.045, 0.12, 16), m.metal, [0, 0, 0], [0, 0, Math.PI / 2]);
  return g;
}

export interface Bike {
  group: THREE.Group;
  /** Front end: turns with the bars. */
  steer: THREE.Group;
  wheels: THREE.Group[];
  paint: THREE.MeshStandardMaterial;
  head: THREE.MeshBasicMaterial;
}

export function buildBike(): Bike {
  const m = mats();
  const group = new THREE.Group();

  // bodywork: nose, screen cowl, tank, seat unit and a kicked-up tail, in one profile
  const body: [number, number][] = [
    [1.02, 0.78], [0.9, 0.99], [0.62, 1.07], [0.45, 1.0], [0.2, 1.03], [-0.08, 0.87], [-0.42, 0.85], [-0.78, 0.98], [-1.0, 1.02],
    [-0.8, 0.86], [-0.45, 0.72], [-0.12, 0.6], [0.02, 0.3], [0.3, 0.25], [0.37, 0.5], [0.5, 0.68], [0.86, 0.7],
  ];
  part(group, slab(body, 0.34, 0.05), m.paint);
  // engine and frame showing through the fairing, belly pan
  part(group, new THREE.BoxGeometry(0.3, 0.3, 0.52), m.dark, [0, 0.47, 0.06]);
  part(group, slab([[0.3, 0.24], [0.02, 0.28], [-0.2, 0.34], [-0.2, 0.42], [0.34, 0.42]], 0.3, 0.03), m.dark);
  // seat pad, pillion pad, screen
  part(group, new THREE.BoxGeometry(0.25, 0.05, 0.36), m.dark, [0, 0.875, -0.26], [0.03, 0, 0]);
  part(group, new THREE.BoxGeometry(0.18, 0.04, 0.2), m.dark, [0, 0.975, -0.72], [-0.3, 0, 0]);
  part(group, new THREE.BoxGeometry(0.26, 0.012, 0.3), m.glass, [0, 1.09, 0.74], [0.62, 0, 0]);
  // lamps: twin headlights in the nose, a strip at the tail
  for (const s of [-1, 1]) part(group, new THREE.SphereGeometry(0.045, 14, 10), m.head, [s * 0.075, 0.82, 0.985]).scale.set(1.3, 0.7, 0.6);
  part(group, new THREE.BoxGeometry(0.14, 0.03, 0.03), m.tail, [0, 0.985, -1.005]);
  part(group, new THREE.BoxGeometry(0.16, 0.1, 0.012), m.dark, [0, 0.8, -1.0], [0.35, 0, 0]); // plate holder
  // swingarm, rear hugger, exhaust, pegs
  for (const s of [-1, 1]) {
    bar(group, [s * 0.11, WHEEL_R, -AXLE], [s * 0.13, 0.44, -0.16], 0.03, m.metal);
    bar(group, [s * 0.2, 0.37, -0.3], [s * 0.1, 0.42, -0.26], 0.014, m.metal);
    part(group, new THREE.BoxGeometry(0.07, 0.02, 0.05), m.rubber, [s * 0.21, 0.37, -0.3]);
  }
  part(group, new THREE.TorusGeometry(WHEEL_R + 0.03, 0.035, 8, 20, 1.5), m.dark, [0, WHEEL_R, -AXLE], [0, -Math.PI / 2, 0.75]);
  bar(group, [0.15, 0.32, 0.05], [0.19, 0.52, -0.78], 0.05, m.metal);
  bar(group, [0.19, 0.52, -0.78], [0.195, 0.545, -0.86], 0.058, m.dark);

  // front end: fork, mudguard, bars, mirrors, and the wheel
  const steer = new THREE.Group();
  for (const s of [-1, 1]) {
    bar(steer, [s * 0.1, WHEEL_R, AXLE], [s * 0.1, 0.98, 0.47], 0.024, m.metal);
    bar(steer, [s * 0.1, 0.98, 0.47], [s * 0.3, 0.97, 0.43], 0.016, m.dark); // clip-on bar
    part(steer, new THREE.CylinderGeometry(0.02, 0.02, 0.11, 10), m.rubber, [s * 0.27, 0.972, 0.436], [0, 0, Math.PI / 2 + s * 0.05]);
    bar(steer, [s * 0.14, 1.02, 0.66], [s * 0.26, 1.13, 0.7], 0.008, m.dark);
    part(steer, new THREE.BoxGeometry(0.1, 0.055, 0.02), m.dark, [s * 0.28, 1.14, 0.7]);
  }
  part(steer, new THREE.TorusGeometry(WHEEL_R + 0.03, 0.04, 8, 20, 1.7), m.paint, [0, WHEEL_R, AXLE], [0, -Math.PI / 2, 0.55]);
  group.add(steer);

  const wheels = [wheel(m), wheel(m)];
  wheels[0].position.set(0, WHEEL_R, AXLE);
  wheels[1].position.set(0, WHEEL_R, -AXLE);
  steer.add(wheels[0]);
  group.add(wheels[1]);
  return { group, steer, wheels, paint: m.paint, head: m.head };
}

/* ---------- parked bikes ---------- */

export interface Spot {
  key: string;
  x: number;
  z: number;
  /** Heading: forward is (sin yaw, 0, -cos yaw), as everywhere in the city. */
  yaw: number;
  colour: number;
}

const hash = (i: number, j: number, k: number) => {
  let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const COLOURS = [0xc8242b, 0xf2f3f5, 0x1b3f9c, 0x1a1b1e, 0xe0b414, 0x1d7a4c];
/** How far in from the street's centre line a parked bike stands: on the pavement, behind the lamps. */
const KERB = ROAD / 2 + 2.6;

/**
 * Bikes parked around the block that (x, z) is in and its eight neighbours. Each side of each block has
 * at most one, at a fixed spot, so the same bike is always in the same place.
 */
export function spotsNear(x: number, z: number, out: Spot[] = []) {
  out.length = 0;
  const w = warp(x, z);
  const bi = Math.floor((x + w[0]) / BLOCK + 0.5), bj = Math.floor((z + w[1]) / BLOCK + 0.5);
  for (let i = bi - 1; i <= bi + 1; i++) {
    for (let j = bj - 1; j <= bj + 1; j++) {
      if (i < -30 || i > 62 || j < -40 || j > 18) continue;
      for (let side = 0; side < 4; side++) {
        const h = hash(i, j, side + 1);
        if (h > 0.62) continue;
        const along = (hash(i, j, side + 11) - 0.5) * 44; // metres from mid-block, clear of the junctions
        const edge = BLOCK / 2 - KERB;
        // sides: 0 south, 1 north, 2 east, 3 west of the block
        const u = side < 2 ? i * BLOCK + along : i * BLOCK + (side === 2 ? edge : -edge);
        const v = side < 2 ? j * BLOCK + (side === 0 ? edge : -edge) : j * BLOCK + along;
        const [wx, wz, rot] = toWorld(u, v);
        if (landSdf(wx, wz) < 26 || parkSdf(wx, wz) < 8) continue;
        // along the street, nose turned in toward the buildings
        const street = side < 2 ? Math.PI / 2 - rot : Math.PI - rot;
        const turnIn = side === 0 || side === 3 ? 0.55 : -0.55;
        out.push({ key: `${i},${j},${side}`, x: wx, z: wz, yaw: street + turnIn + (h < 0.3 ? Math.PI : 0), colour: COLOURS[Math.floor(hash(i, j, side + 21) * COLOURS.length)] });
      }
    }
  }
  return out;
}

export interface Parked {
  group: THREE.Group;
  /** Show these bikes; `markers` adds the floating pointer above each one. */
  set(spots: Spot[], markers: boolean): void;
  update(t: number): void;
}

const MAX = 40;

/** The parked bikes: the model merged by material and drawn as instances. */
export function buildParked(): Parked {
  const src = buildBike();
  src.group.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  src.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const list = byMat.get(mesh.material as THREE.Material);
    if (list) list.push(g);
    else byMat.set(mesh.material as THREE.Material, [g]);
  });
  const group = new THREE.Group();
  const meshes: THREE.InstancedMesh[] = [];
  let painted: THREE.InstancedMesh | null = null;
  byMat.forEach((list, mat) => {
    const mesh = new THREE.InstancedMesh(mergeGeometries(list), mat, MAX);
    mesh.count = 0;
    mesh.frustumCulled = false;
    if (mat === src.paint) painted = mesh;
    meshes.push(mesh);
    group.add(mesh);
    list.forEach((g) => g.dispose());
  });
  // a pointer over each bike, so they can be found from across the street
  const marker = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.signalSoft).multiplyScalar(2.4) }), MAX);
  marker.count = 0;
  marker.frustumCulled = false;
  group.add(marker);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
  let shown: Spot[] = [], withMarkers = false;
  return {
    group,
    set(spots, markers) {
      shown = spots.slice(0, MAX);
      withMarkers = markers;
      shown.forEach((s, i) => {
        // on the side stand: leaned a little to the left
        m.compose(p.set(s.x, 0, s.z), q.setFromEuler(e.set(0, Math.PI - s.yaw, -0.17, 'YXZ')), one);
        for (const mesh of meshes) mesh.setMatrixAt(i, m);
        painted?.setColorAt(i, c.setHex(s.colour));
      });
      for (const mesh of meshes) {
        mesh.count = shown.length;
        mesh.instanceMatrix.needsUpdate = true;
      }
      const paintedMesh = painted as THREE.InstancedMesh | null;
      if (paintedMesh?.instanceColor) paintedMesh.instanceColor.needsUpdate = true;
      marker.count = markers ? shown.length : 0;
    },
    update(t) {
      if (!withMarkers) return;
      shown.forEach((s, i) => {
        m.compose(p.set(s.x, 2.1 + Math.sin(t * 2.2 + i) * 0.12, s.z), q.setFromEuler(e.set(0, t * 1.4, 0)), one);
        marker.setMatrixAt(i, m);
      });
      marker.instanceMatrix.needsUpdate = true;
    },
  };
}
