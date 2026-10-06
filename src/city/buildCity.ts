// Assembles the stand-in Marina Bay scene: sky, ground, generated buildings, trees and hand-built landmarks.
import * as THREE from 'three';
import { PALETTE } from '../styles/palette';
import { ColliderIndex, FOG_DENSITY, KIND, SUN_DAY, SUN_DUSK, bakeGround, bakeHeights, bakeShadow, getBuildings, getShips, getTrees, toCollider, type Collider, type HeightExtra } from './layout';
import { SHARED, makeBuildingMaterial, makeGroundMaterial, makeSkyMaterial, makeTreeMaterial } from './shaders';
import { buildStreetLife } from './street';

const WARM = 0xffb070;

/** Self-lit pieces (lamps, rims, the pool) glow at dusk and fall back to a plain surface colour by day. */
interface Glow {
  mat: THREE.MeshBasicMaterial | THREE.LineBasicMaterial | THREE.PointsMaterial;
  dusk: THREE.Color;
  day: THREE.Color;
}
const glows: Glow[] = [];
const scaled = (color: number, gain: number) => new THREE.Color(color).multiplyScalar(gain);
function lit(color: number, gain: number, day: [number, number] = [0xb9bec8, 0.8]) {
  const mat = new THREE.MeshBasicMaterial({ color: scaled(color, gain) });
  glows.push({ mat, dusk: scaled(color, gain), day: scaled(day[0], day[1]) });
  return mat;
}
function litLine(color: number, gain: number, day: [number, number]) {
  const mat = new THREE.LineBasicMaterial({ color: scaled(color, gain) });
  glows.push({ mat, dusk: scaled(color, gain), day: scaled(day[0], day[1]) });
  return mat;
}

export interface City {
  group: THREE.Group;
  colliders: ColliderIndex;
  /** Sky-only scene, used to bake reflections for the flyer. */
  envScene: THREE.Scene;
  fog: THREE.FogExp2;
  /** Goes up each time the light has settled after a change, so reflections can be re-baked. */
  lightVersion: number;
  /** Whether the day/dusk switch does anything. False for the real tiles, which carry their own daylight. */
  lit: boolean;
  /** Switch between day and dusk. The change eases over a second or two unless `instant`. */
  setDay(day: boolean, instant?: boolean): void;
  /** Real tiles only: the camera whose view decides which tiles to load. */
  attach?(camera: THREE.Camera, renderer: THREE.WebGLRenderer): void;
  /** Real tiles only: height of the highest surface under a point, or null where nothing has loaded yet. */
  surfaceBelow?(x: number, y: number, z: number): number | null;
  /** Real tiles only: the data attribution that must stay on screen. */
  credits?(): string;
  update(time: number, camera: THREE.Vector3): void;
  dispose(): void;
}

function box(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  parent.add(m);
  return m;
}

/** A facade-shaded block (windows and all) outside the instanced set, plus its collider. */
function tower(
  parent: THREE.Object3D,
  colliders: Collider[],
  geo: THREE.BufferGeometry,
  o: { x: number; z: number; w: number; d: number; y0?: number; h: number; color: [number, number, number]; seed: number; kind?: number; rot?: number },
) {
  const m = new THREE.Mesh(geo, makeBuildingMaterial({ color: o.color, seed: o.seed, kind: o.kind ?? KIND.glass }));
  m.position.set(o.x, o.y0 ?? 0, o.z);
  m.scale.set(o.w, o.h, o.d);
  m.rotation.y = o.rot ?? 0;
  parent.add(m);
  colliders.push(toCollider({ x: o.x, z: o.z, w: o.w, d: o.d, y0: o.y0 ?? 0, h: o.h, rot: o.rot ?? 0, kind: 0, color: o.color, seed: 0, gable: 0 }));
}

/** Three hotel towers carrying a long sky deck, with a low podium on the bay side. */
function marinaBaySands(parent: THREE.Object3D, colliders: Collider[], unit: THREE.BufferGeometry) {
  const g = new THREE.Group();
  const glass: [number, number, number] = [0.12, 0.17, 0.22];
  // each tower in side view: two legs that lean together and merge a third of the way up
  const side = new THREE.Shape();
  const pts: [number, number][] = [[-17, 0], [-6, 0], [-3, 38], [2, 62], [7, 38], [16, 0], [34, 0], [25, 52], [19, 104], [17, 150], [16, 195], [-16, 195], [-16, 60]];
  side.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) side.lineTo(x, y);
  side.closePath();
  const towerGeo = new THREE.ExtrudeGeometry(side, { depth: 88, bevelEnabled: false }).translate(0, 0, -44);
  for (const z of [-125, 0, 125]) {
    const m = new THREE.Mesh(towerGeo, makeBuildingMaterial({ color: glass, seed: 41.82, kind: KIND.glass }));
    m.position.set(560, 0, z);
    g.add(m);
    colliders.push({ minX: 543, maxX: 577, minZ: z - 44, maxZ: z + 44, y0: 0, y1: 195 });
    colliders.push({ minX: 577, maxX: 594, minZ: z - 44, maxZ: z + 44, y0: 0, y1: 60 });
  }
  tower(g, colliders, unit, { x: 462, z: 20, w: 64, d: 400, h: 24, color: [0.14, 0.2, 0.24], seed: 12.82, kind: KIND.glass });
  box(g, new THREE.MeshStandardMaterial({ color: 0xd4d6da, roughness: 0.6 }), 70, 1.6, 406, 462, 24, 20); // roof slab oversailing the glass

  // sky deck: a boat-shaped slab cantilevered past the north tower
  const deck = new THREE.Shape();
  const hw = 23, n = -240, s = 182;
  deck.moveTo(-hw, n + 46);
  deck.quadraticCurveTo(0, n - 14, hw, n + 46);
  deck.lineTo(hw, s - 34);
  deck.quadraticCurveTo(0, s + 12, -hw, s - 34);
  deck.closePath();
  const deckGeo = new THREE.ExtrudeGeometry(deck, { depth: 7, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 3, curveSegments: 16 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9bcc4, roughness: 0.55, metalness: 0.1 });
  const slab = new THREE.Mesh(deckGeo, concrete);
  slab.rotation.x = Math.PI / 2;
  slab.position.set(566, 205, 0);
  g.add(slab);
  box(g, lit(PALETTE.signalSoft, 1.6, [0x4fb4c8, 0.75]), 9, 0.6, 150, 556, 206.2, -70); // infinity pool
  box(g, lit(WARM, 2.2), 40, 0.5, 1.2, 566, 195.6, 0); // underside lights
  for (let i = 0; i < 9; i++) box(g, new THREE.MeshStandardMaterial({ color: 0x1d3a26, roughness: 1 }), 7, 4, 7, 574, 206, 20 + i * 17);
  colliders.push({ minX: 541, maxX: 591, minZ: -252, maxZ: 196, y0: 194, y1: 211 });
  parent.add(g);
}

/** Observation wheel on the north shore of the channel. Returns the part that turns. */
function wheel(parent: THREE.Object3D) {
  const g = new THREE.Group();
  g.position.set(900, 92, -525);
  const steel = new THREE.MeshStandardMaterial({ color: 0xaab2c0, roughness: 0.35, metalness: 0.9 });
  const turning = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(75, 1.1, 8, 96), lit(PALETTE.signalSoft, 2.4, [0xc8ccd4, 0.8]));
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(72, 0.6, 8, 96), steel);
  turning.add(rim, rim2);
  const pts: number[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    pts.push(0, 0, 0, Math.cos(a) * 74, Math.sin(a) * 74, 0);
    const cab = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 4.5, 4, 8), lit(WARM, 1.5, [0xe6eaf0, 0.9]));
    cab.rotation.z = Math.PI / 2;
    cab.position.set(Math.cos(a) * 79, Math.sin(a) * 79, 0);
    turning.add(cab);
  }
  const spokes = new THREE.BufferGeometry();
  spokes.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  turning.add(new THREE.LineSegments(spokes, new THREE.LineBasicMaterial({ color: 0x8892a6, transparent: true, opacity: 0.55 })));
  turning.rotation.y = Math.PI / 2; // wheel stands in the YZ plane, face-on to the bay
  g.add(turning);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 14, 20), steel);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 100, 12), steel);
    leg.position.set(0, -46, sz * 22);
    leg.rotation.x = sz * -0.44;
    g.add(leg);
  }
  box(g, new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.7 }), 60, 12, 90, 0, -92, 0);
  parent.add(g);
  return turning;
}

/** Tree-shaped light towers and two glass conservatories in the bayside gardens. */
function gardens(parent: THREE.Object3D, colliders: Collider[]) {
  const trunk = new THREE.MeshStandardMaterial({ color: 0x2a2630, roughness: 0.8 });
  const lattice = litLine(PALETTE.signalSoft, 2.2, [0x8a6f86, 0.9]);
  const warmLattice = litLine(WARM, 1.8, [0x9a7a66, 0.9]);
  const spots: [number, number, number][] = [[860, 110, 46], [905, 170, 38], [950, 105, 50], [1000, 180, 34], [925, 245, 30], [1045, 110, 42], [870, 215, 32]];
  spots.forEach(([x, z, h], i) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 4.5, h, 12), trunk);
    t.position.set(x, h / 2, z);
    parent.add(t);
    const canopy = new THREE.ConeGeometry(h * 0.36, h * 0.3, 14, 3, true);
    const lines = new THREE.LineSegments(new THREE.WireframeGeometry(canopy), i % 3 === 0 ? warmLattice : lattice);
    lines.rotation.x = Math.PI;
    lines.position.set(x, h * 0.92, z);
    parent.add(lines);
    colliders.push({ minX: x - 6, maxX: x + 6, minZ: z - 6, maxZ: z + 6, y0: 0, y1: h + 4 });
  });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.12, metalness: 0.95 });
  const ribs = new THREE.LineBasicMaterial({ color: 0xc8d4f0, transparent: true, opacity: 0.16 });
  for (const [x, z, r] of [[830, 400, 95], [1030, 420, 70]] as const) {
    const geo = new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(geo, glass);
    dome.position.set(x, 0, z);
    dome.scale.set(1, 0.42, 0.7);
    parent.add(dome);
    const rib = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(r * 1.003, 18, 5, 0, Math.PI * 2, 0, Math.PI / 2)), ribs);
    rib.position.copy(dome.position);
    rib.scale.copy(dome.scale);
    parent.add(rib);
    colliders.push({ minX: x - r * 0.8, maxX: x + r * 0.8, minZ: z - r * 0.55, maxZ: z + r * 0.55, y0: 0, y1: r * 0.4 });
  }
}

/** Domed national stadium with a lit rim and a roof opening. */
function stadium(parent: THREE.Object3D, colliders: Collider[]) {
  const g = new THREE.Group();
  g.position.set(2330, 0, -760);
  const shell = new THREE.MeshStandardMaterial({ color: 0xd9dde6, roughness: 0.45, metalness: 0.15 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(155, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), shell);
  dome.scale.set(1, 0.44, 1);
  g.add(dome);
  const ribs = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(155.6, 24, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
    new THREE.LineBasicMaterial({ color: 0x5a6274, transparent: true, opacity: 0.5 }),
  );
  ribs.scale.copy(dome.scale);
  g.add(ribs);
  // roof opening: a dark oculus over the top of the dome, with the lit pitch showing through
  const oculus = new THREE.Mesh(new THREE.SphereGeometry(155.9, 40, 6, 0, Math.PI * 2, 0, 0.5), new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 0.9 }));
  oculus.scale.copy(dome.scale);
  g.add(oculus);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(86, 52), lit(0x4f9a66, 0.7, [0x3f8a4c, 0.8]));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 68.9;
  g.add(pitch);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(156, 1.6, 8, 96), lit(WARM, 2.2));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 6;
  g.add(rim);
  parent.add(g);
  colliders.push({ minX: 2330 - 150, maxX: 2330 + 150, minZ: -760 - 150, maxZ: -760 + 150, y0: 0, y1: 40 });
  colliders.push({ minX: 2330 - 100, maxX: 2330 + 100, minZ: -760 - 100, maxZ: -760 + 100, y0: 0, y1: 62 });
}

function bridge(parent: THREE.Object3D, colliders: Collider[]) {
  const deck = new THREE.MeshStandardMaterial({ color: 0x4a4e58, roughness: 0.8 });
  box(parent, deck, 26, 3, 400, 700, 14, -265);
  for (const z of [-410, -340, -270, -200]) box(parent, deck, 8, 14, 10, 700, 0, z);
  for (const sx of [-1, 1]) box(parent, lit(WARM, 2), 0.8, 0.8, 400, 700 + sx * 12.6, 17.6, -265);
  colliders.push({ minX: 687, maxX: 713, minZ: -465, maxZ: -65, y0: 0, y1: 19 });
}

/** Airport on the east coast: two runways with lighting, a taxiway, terminals with piers, a control tower and a glass dome. */
function airport(parent: THREE.Object3D, colliders: Collider[], unit: THREE.BufferGeometry) {
  const g = new THREE.Group();
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.92 });
  const marking = lit(0xdfe6f2, 0.8, [0xdfe6f2, 0.75]);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9aa0ac, roughness: 0.7 });
  const RUNWAYS: [number, number, number][] = [[5700, -3050, -1050], [6050, -3000, -1150]]; // x, north end, south end
  const TAXI_X = 5560;

  const strip = (x: number, z0: number, z1: number, w: number) => box(g, asphalt, w, 0.4, z1 - z0, x, 0.05, (z0 + z1) / 2);
  for (const [x, z0, z1] of RUNWAYS) {
    strip(x, z0, z1, 60);
    for (let z = z0 + 60; z < z1 - 60; z += 60) box(g, marking, 1.2, 0.1, 30, x, 0.5, z);
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      box(g, marking, 2.4, 0.1, 40, x + i * 6, 0.5, z0 + 34); // threshold "piano keys"
      box(g, marking, 2.4, 0.1, 40, x + i * 6, 0.5, z1 - 34);
    }
  }
  strip(TAXI_X, -3050, -1050, 26);
  for (const z of [-2950, -2450, -1950, -1450, -1180]) box(g, asphalt, 520, 0.4, 24, 5805, 0.05, z);
  box(g, asphalt, 160, 0.4, 1560, 5465, 0.04, -2050); // apron

  // airfield lighting: white runway edges and centre lines, green/red thresholds, blue taxiway edges, approach bars
  const pos: number[] = [], col: number[] = [];
  const light = (x: number, z: number, c: [number, number, number], gain: number) => {
    pos.push(x, 0.9, z);
    col.push(c[0] * gain, c[1] * gain, c[2] * gain);
  };
  const WHITE: [number, number, number] = [1, 0.93, 0.8], GREEN: [number, number, number] = [0.2, 1, 0.5], RED: [number, number, number] = [1, 0.15, 0.1], BLUE: [number, number, number] = [0.3, 0.45, 1];
  for (const [x, z0, z1] of RUNWAYS) {
    for (let z = z0; z <= z1; z += 60) {
      light(x - 31, z, WHITE, 3);
      light(x + 31, z, WHITE, 3);
    }
    for (let z = z0 + 15; z < z1; z += 30) light(x, z, WHITE, 1.6);
    for (let i = -5; i <= 5; i++) {
      light(x + i * 5.5, z1 + 2, GREEN, 3.4); // landing threshold at the seaward end
      light(x + i * 5.5, z0 - 2, RED, 3.4);
    }
    for (let k = 1; k <= 9; k++) {
      light(x, z1 + k * 45, WHITE, 3.4);
      if (k % 3 === 0) for (const dx of [-14, -7, 7, 14]) light(x + dx, z1 + k * 45, WHITE, 3);
    }
  }
  for (let z = -3050; z <= -1050; z += 40) {
    light(TAXI_X - 13, z, BLUE, 3);
    light(TAXI_X + 13, z, BLUE, 3);
  }
  const lights = new THREE.BufferGeometry();
  lights.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lights.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const lampMat = new THREE.PointsMaterial({ size: 7, sizeAttenuation: true, vertexColors: true });
  glows.push({ mat: lampMat, dusk: new THREE.Color(1, 1, 1), day: new THREE.Color(0.28, 0.28, 0.28) });
  g.add(new THREE.Points(lights, lampMat));

  // terminals and piers
  const glass: [number, number, number] = [0.12, 0.17, 0.22];
  for (const z of [-2620, -2050, -1480]) tower(g, colliders, unit, { x: 5330, z, w: 110, d: 440, h: 30, color: glass, seed: 61.74 });
  const PIERS = [-2760, -2480, -2190, -1910, -1620, -1340];
  for (const z of PIERS) tower(g, colliders, unit, { x: 5440, z, w: 120, d: 22, h: 13, color: [0.6, 0.61, 0.63], seed: 8.3, kind: KIND.office });

  // parked aircraft: one shared model, nose toward the pier
  const white = new THREE.MeshStandardMaterial({ color: 0xe9edf4, roughness: 0.4, metalness: 0.2 });
  const plane = new THREE.Group();
  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 30, 6, 14), white);
  fuselage.rotation.x = Math.PI / 2;
  const wings = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5, 5), white);
  wings.position.z = 1;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 5), new THREE.MeshStandardMaterial({ color: PALETTE.signal, roughness: 0.4 }));
  fin.position.set(0, 5, 14);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 3.5), white);
  stab.position.set(0, 1.4, 15);
  plane.add(fuselage, wings, fin, stab);
  for (const z of PIERS) {
    for (const x of [5415, 5470]) {
      for (const side of [-1, 1]) {
        const p = plane.clone();
        p.position.set(x, 4.2, z + side * 33);
        p.rotation.y = side > 0 ? 0 : Math.PI; // nose (-Z of the model) faces the pier
        g.add(p);
      }
    }
  }

  // control tower
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 8, 80, 20), concrete);
  shaft.position.set(5440, 40, -2330);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(15, 11, 10, 24), new THREE.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.1, metalness: 0.95 }));
  cab.position.set(5440, 85, -2330);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 2, 24), concrete);
  cap.position.set(5440, 91, -2330);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), lit(PALETTE.live, 6, [PALETTE.live, 1.5]));
  beacon.position.set(5440, 96, -2330);
  g.add(shaft, cab, cap, beacon);
  colliders.push({ minX: 5424, maxX: 5456, minZ: -2346, maxZ: -2314, y0: 0, y1: 98 });

  // glass dome with an opening at the top
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.12, metalness: 0.95 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(105, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.position.set(5170, 0, -2050);
  dome.scale.set(1, 0.36, 0.78);
  const ribs = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(105.4, 22, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
    new THREE.LineBasicMaterial({ color: 0xc8d4f0, transparent: true, opacity: 0.16 }),
  );
  ribs.position.copy(dome.position);
  ribs.scale.copy(dome.scale);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(14, 1.2, 8, 40), lit(WARM, 2.2));
  eye.rotation.x = Math.PI / 2;
  eye.scale.set(1, 0.78, 1);
  eye.position.set(5170, 38, -2050);
  g.add(dome, ribs, eye);
  colliders.push({ minX: 5080, maxX: 5260, minZ: -2120, maxZ: -1980, y0: 0, y1: 36 });

  parent.add(g);
}

/** Container port: gantry cranes along the quay. The stacks and the ships are generated (see layout.ts). */
function port(parent: THREE.Object3D, colliders: Collider[]) {
  const SEA_N: [number, number] = [0.35 / Math.hypot(0.35, 0.94), 0.94 / Math.hypot(0.35, 0.94)];
  const turn = Math.atan2(SEA_N[0], SEA_N[1]); // local +Z faces the open sea
  const quay = (x: number, off: number): [number, number] => {
    const z = (1250 - 0.35 * x) / 0.94; // the shore line
    return [x + SEA_N[0] * off, z + SEA_N[1] * off];
  };
  const paint = new THREE.MeshStandardMaterial({ color: 0xb5482a, roughness: 0.6, metalness: 0.3 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8f959e, roughness: 0.6, metalness: 0.4 });
  for (let x = -2300; x <= -1250; x += 150) {
    const [cx, cz] = quay(x, -16);
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = turn;
    for (const sx of [-11, 11]) for (const sz of [-9, 9]) box(g, paint, 1.6, 46, 1.6, sx, 0, sz);
    box(g, paint, 24, 2.2, 20, 0, 44, 0); // portal
    box(g, grey, 3, 2.4, 96, 0, 47, 22); // boom, out over the ship
    box(g, grey, 5, 4, 6, 0, 43, 18); // trolley
    box(g, paint, 1.4, 14, 1.4, 0, 49, -6); // mast
    parent.add(g);
    colliders.push({ minX: cx - 16, maxX: cx + 16, minZ: cz - 16, maxZ: cz + 16, y0: 0, y1: 64 });
  }
}

/** Ships: hulls, decks and bridges as three instanced meshes; their deck cargo is in the generated boxes. */
function shipping(parent: THREE.Object3D, colliders: Collider[]) {
  const ships = getShips();
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const hull = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.75 }), ships.length);
  const deck = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: 0x6a3a2c, roughness: 0.85 }), ships.length);
  const house = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.5 }), ships.length);
  const funnel = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.6 }), ships.length);
  const HULLS = [0x1c2a3d, 0x16181c, 0x5a1f1a, 0x1d3f38, 0x26364f];
  const FUNNELS = [0xc8442c, 0x1e4f86, 0xd9a521, 0x2b2d31];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), scl = new THREE.Vector3(), c = new THREE.Color();
  const lamps: number[] = [];
  ships.forEach((s, i) => {
    const beam = s.len * 0.14;
    const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
    const place = (mesh: THREE.InstancedMesh, fwd: number, y: number, l: number, h: number, w: number) => {
      m.compose(at.set(s.x + cos * fwd, y, s.z - sin * fwd), q.setFromAxisAngle(up, s.rot), scl.set(l, h, w));
      mesh.setMatrixAt(i, m);
    };
    place(hull, 0, 3.5, s.len, 11, beam);
    place(deck, 0, 9.3, s.len - 8, 0.6, beam - 2);
    place(house, -s.len / 2 + 20, 20, 15, 21, beam - 4); // the bridge, aft
    place(funnel, -s.len / 2 + 9, 24, 5, 12, 6);
    hull.setColorAt(i, c.setHex(HULLS[Math.floor(s.seed * 97) % HULLS.length]));
    funnel.setColorAt(i, c.setHex(FUNNELS[Math.floor(s.seed * 53) % FUNNELS.length]));
    // riding lights: the bridge windows, a masthead light forward and one aft
    for (const [fwd, y] of [[-s.len / 2 + 20, 31.5], [s.len / 2 - 10, 16], [-s.len / 2 + 9, 33]]) lamps.push(s.x + cos * fwd, y, s.z - sin * fwd);
    const ex = (Math.abs(cos) * s.len + Math.abs(sin) * beam) / 2, ez = (Math.abs(sin) * s.len + Math.abs(cos) * beam) / 2;
    colliders.push({ minX: s.x - ex, maxX: s.x + ex, minZ: s.z - ez, maxZ: s.z + ez, y0: 0, y1: 32 });
  });
  const lights = new THREE.BufferGeometry();
  lights.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
  const lampMat = new THREE.PointsMaterial({ size: 9, sizeAttenuation: true });
  glows.push({ mat: lampMat, dusk: new THREE.Color(3, 2.4, 1.6), day: new THREE.Color(0.5, 0.5, 0.5) });
  for (const mesh of [hull, deck, house, funnel]) mesh.frustumCulled = false;
  parent.add(hull, deck, house, funnel, new THREE.Points(lights, lampMat));
}

/** A lotus of ten white fingers on the bay front, and the two spiked domes of the theatres across the water. */
function waterfront(parent: THREE.Object3D, colliders: Collider[]) {
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e9ea, roughness: 0.42, metalness: 0.05 });
  const lotus = new THREE.Group();
  lotus.position.set(385, 0, -110);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const reach = 26 + 14 * Math.abs(Math.sin(i * 1.9 + 0.6)); // fingers of different lengths
    const finger = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 3.2, reach, 10, 1), white);
    finger.geometry.translate(0, reach / 2, 0);
    finger.scale.set(1, 1, 0.62);
    finger.rotation.order = 'YXZ';
    finger.rotation.y = -a + Math.PI / 2;
    finger.rotation.x = 0.82; // leaning out and up, like a cupped hand
    finger.position.set(Math.cos(a) * 9, 5, Math.sin(a) * 9);
    lotus.add(finger);
  }
  box(lotus, new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.7 }), 30, 6, 30, 0, 0, 0);
  parent.add(lotus);
  colliders.push({ minX: 345, maxX: 425, minZ: -150, maxZ: -70, y0: 0, y1: 44 });

  const shell = new THREE.MeshStandardMaterial({ color: 0x8b9199, roughness: 0.36, metalness: 0.7, flatShading: true });
  const base = new THREE.MeshStandardMaterial({ color: 0x8f9296, roughness: 0.8 });
  for (const [x, z, r, turn] of [[-200, -545, 64, 0.5], [-85, -590, 54, -0.3]] as const) {
    // a faceted shell reads as the theatres' cladding of pointed sunshades
    const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 4), shell);
    dome.scale.set(1.25, 0.5, 0.82);
    dome.rotation.y = turn;
    dome.position.set(x, 4, z);
    parent.add(dome);
    box(parent, base, r * 2.3, 8, r * 1.6, x, 0, z).rotation.y = turn;
    colliders.push({ minX: x - r * 1.2, maxX: x + r * 1.2, minZ: z - r * 0.85, maxZ: z + r * 0.85, y0: 0, y1: r * 0.5 + 6 });
  }
}

/** Gable roof for a unit box: ridge along X, eaves at y = 0, ridge at y = 1. */
function gableGeometry() {
  const g = new THREE.BufferGeometry();
  const A = [-0.5, 0, 0.5], B = [0.5, 0, 0.5], C = [0.5, 0, -0.5], D = [-0.5, 0, -0.5], E = [-0.5, 1, 0], F = [0.5, 1, 0];
  const pos: number[] = [], nor: number[] = [];
  const tri = (a: number[], b: number[], c: number[], n: number[]) => {
    pos.push(...a, ...b, ...c);
    nor.push(...n, ...n, ...n);
  };
  const s = 1 / Math.hypot(0.5, 1);
  tri(A, B, F, [0, 0.5 * s, s]); tri(A, F, E, [0, 0.5 * s, s]); // south slope
  tri(C, D, E, [0, 0.5 * s, -s]); tri(C, E, F, [0, 0.5 * s, -s]); // north slope
  tri(D, A, E, [-1, 0, 0]); // gable ends
  tri(B, C, F, [1, 0, 0]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

const ROOF_TILE: [number, number, number][] = [[0.46, 0.17, 0.09], [0.52, 0.22, 0.11], [0.4, 0.2, 0.14], [0.5, 0.26, 0.15], [0.36, 0.33, 0.3]];
const ROOF_METAL: [number, number, number][] = [[0.4, 0.42, 0.44], [0.22, 0.3, 0.38], [0.44, 0.42, 0.38], [0.34, 0.2, 0.15]];

export function buildCity(): City {
  const group = new THREE.Group();
  const extra: Collider[] = [];
  glows.length = 0;

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), makeSkyMaterial());
  sky.scale.setScalar(20000);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70000, 70000).rotateX(-Math.PI / 2), makeGroundMaterial());
  ground.position.set(1500, 0, -400);
  group.add(ground);

  // generated buildings: one draw call for the boxes, one for the gable roofs
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const boxes = getBuildings();
  const material = makeBuildingMaterial();
  const colliders = new ColliderIndex();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const instanced = (geo: THREE.BufferGeometry, count: number) => {
    const mesh = new THREE.InstancedMesh(geo, material, count);
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  const fill = (mesh: THREE.InstancedMesh, i: number, color: [number, number, number], seed: number, kind: number) => {
    mesh.setMatrixAt(i, m);
    (mesh.geometry.getAttribute('aColor') as THREE.BufferAttribute).setXYZ(i, ...color);
    (mesh.geometry.getAttribute('aSeed') as THREE.BufferAttribute).setX(i, seed);
    (mesh.geometry.getAttribute('aKind') as THREE.BufferAttribute).setX(i, kind);
  };
  const gabled = boxes.filter((b) => b.gable > 0);
  const walls = instanced(unit.clone(), boxes.length);
  const roofs = instanced(gableGeometry(), gabled.length);
  boxes.forEach((b, i) => {
    m.compose(pos.set(b.x, b.y0, b.z), q.setFromAxisAngle(up, b.rot), scl.set(b.w, b.h, b.d));
    fill(walls, i, b.color, b.seed, b.kind);
    colliders.add(toCollider(b));
  });
  gabled.forEach((b, i) => {
    // the ridge follows the longer side; a little overhang at the eaves
    const alongX = b.w >= b.d;
    m.compose(pos.set(b.x, b.y0 + b.h, b.z), q.setFromAxisAngle(up, b.rot + (alongX ? 0 : Math.PI / 2)), scl.set((alongX ? b.w : b.d) + 0.6, b.gable, (alongX ? b.d : b.w) + 1.2));
    const palette = b.kind === KIND.shed ? ROOF_METAL : ROOF_TILE;
    fill(roofs, i, palette[Math.floor(b.seed) % palette.length], b.seed, 7);
  });

  // trees: one canopy ball each, in chunks. Near chunks use a rounder ball, far ones a rough one.
  const canopy = (detail: number) => {
    const ball = new THREE.IcosahedronGeometry(1, detail); // already unindexed: one position per corner
    const gp = ball.getAttribute('position');
    const out: number[] = [];
    // close up a crown is a main mass with two smaller boughs; far away one ball is enough
    const lobes: [number, number, number, number][] = detail > 0 ? [[0, 0, 0, 1], [0.52, 0.18, 0.22, 0.62], [-0.38, 0.3, -0.42, 0.56]] : [[0, 0, 0, 1]];
    for (const [ox, oy, oz, r] of lobes) {
      for (let i = 0; i < gp.count; i++) {
        const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i);
        const k = (0.84 + 0.3 * Math.abs(Math.sin(x * 5.1 + y * 7.3 + z * 3.7 + ox * 9)) * (y < -0.3 ? 0.5 : 1)) * r;
        out.push(ox + x * k, oy + Math.max(y, -0.55) * k, oz + z * k); // flat underside
      }
    }
    // a stem under the crown: three thin sides are enough at this size
    const T = 0.075, y0 = -1.42, y1 = -0.4;
    for (let a = 0; a < 3; a++) {
      const a0 = (a / 3) * Math.PI * 2, a1 = ((a + 1) / 3) * Math.PI * 2;
      const p0 = [Math.cos(a0) * T, Math.sin(a0) * T], p1 = [Math.cos(a1) * T, Math.sin(a1) * T];
      out.push(p0[0], y0, p0[1], p1[0], y1, p1[1], p1[0], y0, p1[1], p0[0], y0, p0[1], p0[0], y1, p0[1], p1[0], y1, p1[1]);
    }
    ball.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    return geo;
  };
  const treeMat = makeTreeMaterial();
  const CHUNK = 1200;
  const chunks = new Map<string, ReturnType<typeof getTrees>>();
  for (const t of getTrees()) {
    const key = `${Math.floor(t.x / CHUNK)},${Math.floor(t.z / CHUNK)}`;
    const list = chunks.get(key);
    if (list) list.push(t);
    else chunks.set(key, [t]);
  }
  const groves: { near: THREE.InstancedMesh; far: THREE.InstancedMesh; x: number; z: number }[] = [];
  chunks.forEach((list, key) => {
    const [ci, cj] = key.split(',').map(Number);
    const seeds = new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1);
    const make = (detail: number) => {
      const geo = canopy(detail);
      geo.setAttribute('aSeed', seeds);
      return new THREE.InstancedMesh(geo, treeMat, list.length);
    };
    const near = make(1), far = make(0);
    list.forEach((t, i) => {
      const squash = 0.75 + t.seed * 0.3;
      m.compose(pos.set(t.x, t.r * squash * 1.38, t.z), q.setFromAxisAngle(up, t.seed * 40), scl.set(t.r, t.r * squash, t.r * (0.9 + ((t.seed * 7) % 1) * 0.25)));
      near.setMatrixAt(i, m);
      seeds.setX(i, (t.seed * 13) % 1);
    });
    far.instanceMatrix = near.instanceMatrix;
    near.computeBoundingSphere();
    far.boundingSphere = near.boundingSphere;
    near.visible = false;
    group.add(near, far);
    groves.push({ near, far, x: (ci + 0.5) * CHUNK, z: (cj + 0.5) * CHUNK });
  });

  marinaBaySands(group, extra, unit);
  const turning = wheel(group);
  gardens(group, extra);
  stadium(group, extra);
  bridge(group, extra);
  airport(group, extra, unit);
  port(group, extra);
  waterfront(group, extra);
  extra.forEach((c) => colliders.add(c));
  // ships are obstacles but not shadow casters: their upright colliders would throw square shadows on the sea
  const afloat: Collider[] = [];
  shipping(group, afloat);
  afloat.forEach((c) => colliders.add(c));

  const street = buildStreetLife();
  group.add(street.group);

  // baked maps: heights for shadows, ground cover for the streets and yards
  const casters: HeightExtra = {
    boxes: extra.filter((c) => c.y0 === 0).map((c) => ({ x: (c.minX + c.maxX) / 2, z: (c.minZ + c.maxZ) / 2, w: c.maxX - c.minX, d: c.maxZ - c.minZ, h: c.y1 })),
    domes: [
      { x: -200, z: -545, rx: 80, rz: 52, h: 36 },
      { x: -85, z: -590, rx: 67, rz: 44, h: 31 },
      { x: 2330, z: -760, rx: 155, rz: 155, h: 68 },
      { x: 830, z: 400, rx: 95, rz: 66, h: 40 },
      { x: 1030, z: 420, rx: 70, rz: 49, h: 29 },
      { x: 5170, z: -2050, rx: 105, rz: 82, h: 38 },
    ],
  };
  // the stadium's box colliders would cast a square shadow; the dome above replaces them
  casters.boxes = casters.boxes!.filter((b) => Math.hypot(b.x - 2330, b.z + 760) > 10);
  const hf = bakeHeights(casters);
  const heightTex = new THREE.DataTexture(hf.data, hf.w, hf.h, THREE.RedFormat, THREE.UnsignedByteType);
  heightTex.minFilter = heightTex.magFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;
  // the same map, max-pooled: thin towers stay findable by rays that take long steps
  const POOL = 8;
  const fw = Math.ceil(hf.w / POOL), fh = Math.ceil(hf.h / POOL);
  const far = new Uint8Array(fw * fh);
  for (let j = 0; j < hf.h; j++) {
    for (let i = 0; i < hf.w; i++) {
      const k = Math.floor(j / POOL) * fw + Math.floor(i / POOL);
      const v = hf.data[j * hf.w + i];
      if (v > far[k]) far[k] = v;
    }
  }
  const heightFarTex = new THREE.DataTexture(far, fw, fh, THREE.RedFormat, THREE.UnsignedByteType);
  heightFarTex.minFilter = heightFarTex.magFilter = THREE.LinearFilter;
  heightFarTex.needsUpdate = true;
  SHARED.uHeightFar.value = heightFarTex;
  const shadowTex = (sun: [number, number, number]) => {
    const tex = new THREE.DataTexture(bakeShadow(hf, sun), hf.w, hf.h, THREE.RedFormat, THREE.FloatType);
    tex.internalFormat = 'R16F'; // half floats filter linearly everywhere; full floats need an extension
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  };
  const shadowDay = shadowTex(SUN_DAY), shadowDusk = shadowTex(SUN_DUSK);
  SHARED.uShadowDay.value = shadowDay;
  SHARED.uShadowDusk.value = shadowDusk;
  const gm = bakeGround();
  const groundTex = new THREE.DataTexture(gm.data, gm.w, gm.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  groundTex.minFilter = groundTex.magFilter = THREE.LinearFilter;
  groundTex.needsUpdate = true;
  SHARED.uHeight.value = heightTex;
  SHARED.uGroundMap.value = groundTex;

  // lights for the standard-material pieces (landmarks, flyer)
  const sunLight = new THREE.DirectionalLight();
  const skyLight = new THREE.HemisphereLight();
  group.add(sunLight, skyLight);

  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), makeSkyMaterial()));
  const fog = new THREE.FogExp2(0, FOG_DENSITY);

  const DUSK = { sun: new THREE.Vector3(...SUN_DUSK), sunCol: new THREE.Color(1, 0.56, 0.3), sunI: 2.0, sky: new THREE.Color(0.36, 0.46, 0.85), gnd: new THREE.Color(0.12, 0.09, 0.07), skyI: 1.1, fog: new THREE.Color(0.3, 0.24, 0.34) };
  const DAY = { sun: new THREE.Vector3(...SUN_DAY), sunCol: new THREE.Color(1, 0.95, 0.86), sunI: 3.2, sky: new THREE.Color(0.5, 0.62, 0.9), gnd: new THREE.Color(0.34, 0.31, 0.27), skyI: 1.25, fog: new THREE.Color(0.5, 0.62, 0.8) };
  let day = 1, target = 1, last = 0;
  const apply = () => {
    const k = day * day * (3 - 2 * day);
    SHARED.uDay.value = k;
    SHARED.uSun.value.copy(DUSK.sun).lerp(DAY.sun, k).normalize();
    sunLight.position.copy(SHARED.uSun.value).multiplyScalar(1000);
    sunLight.color.copy(DUSK.sunCol).lerp(DAY.sunCol, k);
    sunLight.intensity = DUSK.sunI + (DAY.sunI - DUSK.sunI) * k;
    skyLight.color.copy(DUSK.sky).lerp(DAY.sky, k);
    skyLight.groundColor.copy(DUSK.gnd).lerp(DAY.gnd, k);
    skyLight.intensity = DUSK.skyI + (DAY.skyI - DUSK.skyI) * k;
    fog.color.copy(DUSK.fog).lerp(DAY.fog, k);
    for (const g of glows) g.mat.color.copy(g.dusk).lerp(g.day, k);
  };
  apply();

  const city: City = {
    group,
    colliders,
    envScene,
    fog,
    lightVersion: 0,
    lit: true,
    setDay(on, instant) {
      target = on ? 1 : 0;
      if (instant && day !== target) {
        day = target;
        apply();
        city.lightVersion++;
      }
    },
    update(t, camera) {
      const dt = Math.min(Math.max(t - last, 0), 0.25); // a generous cap: the light change should take seconds, not frames
      last = t;
      SHARED.uTime.value = t;
      if (day !== target) {
        day = target > day ? Math.min(target, day + dt / 1.8) : Math.max(target, day - dt / 1.8);
        apply();
        if (day === target) city.lightVersion++;
      }
      sky.position.copy(camera);
      street.update(camera);
      turning.rotation.z = t * 0.03;
      for (const g of groves) {
        const close = Math.hypot(g.x - camera.x, g.z - camera.z) < 1700 && camera.y < 1400;
        g.near.visible = close;
        g.far.visible = !close;
      }
    },
    dispose() {
      heightTex.dispose();
      heightFarTex.dispose();
      shadowDay.dispose();
      shadowDusk.dispose();
      groundTex.dispose();
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    },
  };
  return city;
}
