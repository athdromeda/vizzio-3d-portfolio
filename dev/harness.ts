// Development only: renders the city on its own, without the app around it, so a look can be checked quickly.
// Built by `npx vite build -c vite.harness.config.ts`, driven by scripts/shot-city-views.mjs.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { buildPlaceholder } from '../src/avatars/builders';
import { SEAT, buildBike, buildParked, spotsNear } from '../src/city/bike';
import { buildCity } from '../src/city/buildCity';
import type { TimeOfDay } from '../src/city/timeOfDay';
import { KINDS, SIZE, buildVehicle, livery, vehicleMaterial } from '../src/city/vehicles';

const W = window.innerWidth, H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // what React Three Fiber sets by default
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, W / H, 1, 42000);
const t0 = performance.now();
const city = buildCity();
const buildMs = Math.round(performance.now() - t0);
scene.add(city.group);
scene.fog = city.fog;
const pmrem = new THREE.PMREMGenerator(renderer);
let env: THREE.WebGLRenderTarget | null = null;
const bakeEnv = () => {
  env?.dispose();
  env = pmrem.fromScene(city.envScene, 0, 1, 1000);
  scene.environment = env.texture;
};

const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.26, 0.45, 1.15);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.setSize(W, H);

// the pilot on the street: on foot or on a bike, posed the way CityScreen poses him
const pilot = buildPlaceholder('kite');
(pilot.userData.setPose as (p: boolean) => void)(false);
const rigYaw = new THREE.Group(), rigBank = new THREE.Group(), rigLean = new THREE.Group();
rigYaw.add(rigBank);
rigBank.add(rigLean);
rigLean.add(pilot);
rigYaw.visible = false;
const bike = buildBike();
const parked = buildParked();
scene.add(rigYaw, parked.group);

// a line-up of every vehicle, full and coarse, for a look at the models on their own
const showroom = new THREE.Group();
scene.add(showroom);
const carMat = vehicleMaterial();
function lineup(x: number, z: number, seed = 0) {
  showroom.clear();
  let along = 0;
  KINDS.forEach((kind, i) => {
    const s = SIZE[kind];
    for (const fine of [true, false]) {
      const geo = buildVehicle(kind, fine);
      const mesh = new THREE.InstancedMesh(geo, carMat, 1);
      const col = new Float32Array(6);
      const h = (n: number) => { const v = Math.sin((i + 1) * 12.9898 + n * 78.233 + seed * 3.7) * 43758.5453; return v - Math.floor(v); };
      livery(kind, h(1), h(2), col, 0);
      geo.setAttribute('aPaint', new THREE.InstancedBufferAttribute(col.slice(0, 3), 3));
      geo.setAttribute('aSecond', new THREE.InstancedBufferAttribute(col.slice(3, 6), 3));
      geo.setAttribute('aState', new THREE.InstancedBufferAttribute(new Float32Array([i % 2, h(3)]), 2));
      // nose to the east, in a row running east; the coarse twins stand 9 m behind
      const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x + along + s.len / 2, 0, z + (fine ? 0 : -9));
      mesh.setMatrixAt(0, m);
      mesh.frustumCulled = false;
      showroom.add(mesh);
      if (fine) console.log(kind, geo.getAttribute('position').count, 'vertices');
      else console.log(kind, 'coarse', geo.getAttribute('position').count);
    }
    along += s.len + 1.6;
  });
  return along;
}
(window as unknown as { lineup: typeof lineup }).lineup = lineup;

declare global {
  interface Window {
    rider: (mode: 'walk' | 'ride' | 'off', x: number, z: number, yaw: number, phase?: number, lean?: number) => number;
    shot: (pos: number[], look: number[], timeOfDay: TimeOfDay, time?: number) => number;
    buildMs: number;
  }
}
window.buildMs = buildMs;
window.rider = (mode, x, z, yaw, phase = 1.2, lean = 0) => {
  rigYaw.visible = mode !== 'off';
  const spots = spotsNear(x, z);
  parked.set(spots, mode !== 'ride');
  parked.update(3);
  rigYaw.position.set(x, 0, z);
  rigYaw.rotation.y = Math.PI - yaw;
  rigBank.rotation.z = lean;
  const stance = pilot.userData.setStance as (s: { mode: string; phase?: number; amount?: number }, flames: boolean) => void;
  if (mode === 'ride') {
    rigBank.add(bike.group);
    bike.paint.color.setHex(0xc8242b);
    rigLean.position.set(0, SEAT.y, SEAT.z);
    rigLean.rotation.x = SEAT.lean;
    stance({ mode: 'ride' }, false);
  } else {
    rigBank.remove(bike.group);
    rigLean.position.set(0, 1.03, 0);
    rigLean.rotation.x = 0.15;
    stance({ mode: 'walk', phase, amount: 0.8 }, false);
  }
  return spots.length;
};
// someone on the street for people to step round: set by window.actorAt(x, z, vx, vz), cleared with no arguments
let actor: { x: number; y: number; z: number; vx: number; vz: number; urge: number } | null = null;
(window as unknown as { actorAt: (x?: number, z?: number, vx?: number, vz?: number, urge?: number) => void }).actorAt = (x, z, vx = 0, vz = 0, urge = 0) => {
  actor = x === undefined || z === undefined ? null : { x, y: 0, z, vx, vz, urge };
};
window.shot = (pos, look, timeOfDay, time = 12) => {
  city.setTimeOfDay(timeOfDay, true);
  bakeEnv();
  bloom.strength = timeOfDay === 'day' ? 0.12 : timeOfDay === 'night' ? 0.32 : 0.26;
  bloom.threshold = timeOfDay === 'day' ? 1.6 : timeOfDay === 'night' ? 1.05 : 1.15;
  camera.position.set(pos[0], pos[1], pos[2]);
  camera.lookAt(look[0], look[1], look[2]);
  camera.updateMatrixWorld();
  city.update(time, camera.position, actor);
  const s = performance.now();
  composer.render(0.016);
  renderer.getContext().finish();
  return Math.round(performance.now() - s);
};

// how much the street life adds to a frame: instances and vertices per kind of thing
(window as unknown as { tally: () => unknown }).tally = () => {
  let calls = 0, instances = 0, vertices = 0;
  city.group.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || !m.visible || !m.count) return;
    if (!m.geometry.getAttribute('aPart')) return; // street life only: its models all carry part numbers
    calls++;
    instances += m.count;
    vertices += m.count * m.geometry.getAttribute('position').count;
  });
  return { calls, instances, vertices };
};
