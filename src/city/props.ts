// Street furniture: signal poles at the junctions, bus shelters, benches, bins and signs along the pavements.
// Like the parked motorbikes, none of it is stored: what stands where follows from the block grid, so it is
// the same on every visit. The signal lamps read the same cycle the traffic moves by (traffic.ts).
import * as THREE from 'three';
import { BLOCK, ROAD, type Collider, type ColliderIndex, gridToWorld, inLandmark, landSdf, parkSdf, warp } from './layout';
import { MeshKit } from './meshkit';
import { NOISE, SHARED, WORLD } from './shaders';
import { hash12 } from './traffic';

const R = { pole: 0, housing: 1, glass: 2, roof: 3, wood: 4, bin: 5, flag: 6, advert: 7, blade: 8, blue: 9, white: 10, red: 11, carRed: 20, carAmber: 21, carGreen: 22, ownRed: 23, ownGreen: 24, crossRed: 25, crossGreen: 26 } as const;

/** A signal pole for one corner. +Z faces the traffic it controls; +X looks along that traffic's stop line. */
function signalPole() {
  const k = new MeshKit();
  k.centre = [0, 2, 0];
  k.box([0, 2.15, 0], [0.14, 4.3, 0.14], R.pole);
  k.box([0, 0.12, 0], [0.3, 0.24, 0.3], R.pole);
  // the three-lamp head, with a backing board
  k.box([0, 3.78, 0.17], [0.36, 1.06, 0.22], R.housing);
  k.box([0, 3.78, 0.05], [0.56, 1.3, 0.03], R.housing);
  [[4.12, R.carRed], [3.78, R.carAmber], [3.44, R.carGreen]].forEach(([y, part]) => {
    k.quad([-0.11, y - 0.11, 0.285], [0.11, y - 0.11, 0.285], [0.11, y + 0.11, 0.285], [-0.11, y + 0.11, 0.285], part, { out: [0, 0, 1], uv: [0, 0, 1, 1] });
  });
  // the two heads for people on foot: one along the stop line, one facing back down the pavement
  k.box([0.17, 2.5, 0], [0.2, 0.56, 0.26], R.housing);
  k.quad([0.275, 2.54, -0.09], [0.275, 2.54, 0.09], [0.275, 2.72, 0.09], [0.275, 2.72, -0.09], R.ownRed, { out: [1, 0, 0], uv: [0, 0, 1, 1] });
  k.quad([0.275, 2.28, -0.09], [0.275, 2.28, 0.09], [0.275, 2.46, 0.09], [0.275, 2.46, -0.09], R.ownGreen, { out: [1, 0, 0], uv: [0, 0, 1, 1] });
  k.box([0, 2.5, -0.17], [0.26, 0.56, 0.2], R.housing);
  k.quad([-0.09, 2.54, -0.275], [0.09, 2.54, -0.275], [0.09, 2.72, -0.275], [-0.09, 2.72, -0.275], R.crossRed, { out: [0, 0, -1], uv: [0, 0, 1, 1] });
  k.quad([-0.09, 2.28, -0.275], [0.09, 2.28, -0.275], [0.09, 2.46, -0.275], [-0.09, 2.46, -0.275], R.crossGreen, { out: [0, 0, -1], uv: [0, 0, 1, 1] });
  // a street-name blade, blank
  k.box([0.5, 3.1, 0], [0.9, 0.2, 0.03], R.blade);
  return k.build();
}

/** A bus shelter, open towards +Z (the road), with a flag pole at one end. */
function shelter() {
  const k = new MeshKit();
  k.centre = [0, 1.3, 0];
  k.box([0, 2.56, 0.1], [4.4, 0.1, 1.8], R.roof);
  for (const x of [-2.05, 2.05]) k.box([x, 1.28, -0.7], [0.09, 2.56, 0.09], R.pole);
  // glass back, in three panes
  k.quad([-2.0, 0.5, -0.7], [2.0, 0.5, -0.7], [2.0, 2.3, -0.7], [-2.0, 2.3, -0.7], R.glass, { out: [0, 0, 1], uv: [0, 0, 3, 1] });
  k.quad([-2.0, 0.5, -0.71], [2.0, 0.5, -0.71], [2.0, 2.3, -0.71], [-2.0, 2.3, -0.71], R.glass, { out: [0, 0, -1], uv: [0, 0, 3, 1] });
  // a bench along the back, and a lit panel at the downstream end
  k.box([-0.5, 0.46, -0.42], [2.6, 0.06, 0.38], R.wood);
  for (const x of [-1.6, 0.6]) k.box([x, 0.22, -0.42], [0.06, 0.44, 0.34], R.pole);
  k.box([2.05, 1.3, -0.1], [0.1, 1.9, 1.2], R.housing, { parts: { 'x+': R.advert, 'x-': R.advert } });
  // the stop's flag
  k.box([-2.7, 1.4, 0.6], [0.08, 2.8, 0.08], R.pole);
  k.box([-2.7, 2.5, 0.6], [0.06, 0.5, 0.56], R.flag);
  return k.build();
}

/** A bench facing +Z. */
function bench() {
  const k = new MeshKit();
  k.centre = [0, 0.4, 0];
  for (const z of [-0.14, 0, 0.14]) k.box([0, 0.45, z], [1.8, 0.05, 0.12], R.wood);
  k.posed({ rx: -0.2, pivot: [0, 0.48, -0.22] }, () => {
    for (const y of [0.62, 0.8]) k.box([0, y, -0.22], [1.8, 0.12, 0.04], R.wood);
  });
  for (const x of [-0.75, 0.75]) {
    k.box([x, 0.22, 0], [0.06, 0.44, 0.42], R.pole);
    k.box([x, 0.66, -0.25], [0.06, 0.5, 0.05], R.pole);
  }
  return k.build();
}

function bin() {
  const k = new MeshKit();
  k.centre = [0, 0.45, 0];
  k.taper([0, 0, 0], [0.38, 0.38], [0.44, 0.44], 0.86, R.bin);
  k.box([0, 0.9, 0], [0.48, 0.08, 0.48], R.housing);
  return k.build();
}

/** A round road sign on a post, facing +Z. `face`: the disc's colour part, with a white rim or a red one. */
function sign(face: number, rim: number) {
  const k = new MeshKit();
  k.centre = [0, 1.3, 0];
  k.box([0, 1.3, 0], [0.07, 2.6, 0.07], R.pole);
  const n = 12, y = 2.4;
  const p = (i: number, r: number, z: number): [number, number, number] => [Math.cos((i / n) * Math.PI * 2) * r, y + Math.sin((i / n) * Math.PI * 2) * r, z];
  for (let i = 0; i < n; i++) {
    k.tri([0, y, 0.05], p(i, 0.2, 0.05), p(i + 1, 0.2, 0.05), face, { out: [0, 0, 1] });
    k.quad(p(i, 0.2, 0.05), p(i + 1, 0.2, 0.05), p(i + 1, 0.29, 0.05), p(i, 0.29, 0.05), rim, { out: [0, 0, 1] });
    k.tri([0, y, 0.04], p(i, 0.29, 0.04), p(i + 1, 0.29, 0.04), R.pole, { out: [0, 0, -1] });
  }
  return k.build();
}

function propMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: SHARED,
    vertexShader: /* glsl */ `
      attribute float aPart;
      attribute vec2 aUv;
      attribute vec2 aProp;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vPart;
      varying vec2 vUv;
      varying vec2 vProp;
      void main() {
        vec4 wp = instanceMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(instanceMatrix) * normal);
        vPart = aPart;
        vUv = aUv;
        vProp = aProp;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vPart;
      varying vec2 vUv;
      varying vec2 vProp;
      uniform vec4 uSignal;
      ${NOISE}
      ${WORLD}
      // a round lamp in its square: lit, or the dark lens
      vec3 lamp(vec3 colour, float on) {
        float disc = 1.0 - smoothstep(0.38, 0.46, length(vUv - 0.5));
        return mix(vec3(0.012), mix(colour * 0.05, colour * (2.2 + 2.4 * (1.0 - uDay)), on), disc);
      }
      void main() {
        vec3 n = normalize(vNormal);
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        float night = 1.0 - uDay;
        float sh = sunShadow(vWorld.xz, vWorld.y + 0.5) * cloudShade(vWorld.xz);
        vec3 lampL = vec3(1.0, 0.62, 0.3) * night * (0.18 + 0.3 * max(n.y, 0.0));
        vec3 light = ambient(n) + sunRadiance() * max(dot(n, uSun), 0.0) * sh + lampL;
        int part = int(vPart + 0.5);
        // this pole's own traffic, the people crossing that traffic's street, and the people crossing the other one
        bool ew = vProp.x > 0.5;
        float car = ew ? uSignal.y : uSignal.x;
        float own = ew ? uSignal.w : uSignal.z;
        float cross = ew ? uSignal.z : uSignal.w;
        float blink = step(0.5, fract(uTime * 2.2));
        vec3 col;
        if (part >= 20) {
          vec3 red = vec3(1.0, 0.06, 0.03), amber = vec3(1.0, 0.5, 0.04), green = vec3(0.08, 1.0, 0.35);
          if (part == 20) col = lamp(red, step(1.5, car));
          else if (part == 21) col = lamp(amber, step(0.5, car) * step(car, 1.5));
          else if (part == 22) col = lamp(green, step(car, 0.5));
          else if (part == 23) col = lamp(red, step(own, 0.25));
          else if (part == 24) col = lamp(green, own > 0.75 ? 1.0 : own > 0.25 ? blink : 0.0);
          else if (part == 25) col = lamp(red, step(cross, 0.25));
          else col = lamp(green, cross > 0.75 ? 1.0 : cross > 0.25 ? blink : 0.0);
        } else if (part == 2) {
          vec2 f = fract(vUv);
          float frame = step(f.x, 0.03) + step(0.97, f.x) + step(f.y, 0.04) + step(0.96, f.y);
          vec3 R = reflect(-V, n);
          float fres = pow(1.0 - max(dot(V, n), 0.0), 3.0);
          col = frame > 0.5 ? vec3(0.2, 0.21, 0.23) * light : mix(vec3(0.05, 0.07, 0.08) * (0.5 + light), skyColor(vec3(R.x, abs(R.y) + 0.02, R.z)), 0.12 + 0.6 * fres);
        } else if (part == 7) {
          // the lit panel in a shelter: a block of colour, different at every stop, no words
          float h = fract(vProp.y * 7.31);
          vec3 a = h < 0.25 ? vec3(0.9, 0.5, 0.12) : h < 0.5 ? vec3(0.1, 0.5, 0.75) : h < 0.75 ? vec3(0.75, 0.16, 0.2) : vec3(0.2, 0.62, 0.35);
          col = mix(a, vec3(0.85), step(0.62, vUv.y)) * (0.5 * (0.4 + light) + 1.6 * night);
        } else {
          vec3 base = vec3(0.17, 0.18, 0.2);
          if (part == 1) base = vec3(0.02);
          else if (part == 3) base = vec3(0.52, 0.53, 0.54);
          else if (part == 4) base = vec3(0.3, 0.19, 0.1);
          else if (part == 5) base = vec3(0.04, 0.16, 0.09);
          else if (part == 6) base = vec3(0.7, 0.5, 0.05);
          else if (part == 8) base = vec3(0.03, 0.22, 0.12);
          else if (part == 9) base = vec3(0.03, 0.14, 0.5);
          else if (part == 10) base = vec3(0.75);
          else if (part == 11) base = vec3(0.6, 0.04, 0.03);
          col = base * light;
        }
        col = mix(col, hazeColor(-V), fogAmount(dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Someone standing at a bus stop. */
export interface Waiting {
  x: number;
  z: number;
  fx: number;
  fz: number;
  seed: number;
}

export interface Props {
  group: THREE.Group;
  /** People waiting at the stops currently placed. */
  waiting: Waiting[];
  /** Re-place the furniture when the camera has moved far enough. */
  update(camera: THREE.Vector3): void;
}

const REACH = 300;
const KERB = ROAD / 2;

export function buildProps(colliders: ColliderIndex | null): Props {
  const group = new THREE.Group();
  const mat = propMaterial();
  const make = (geo: THREE.BufferGeometry, cap: number) => {
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    const prop = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    geo.setAttribute('aProp', prop);
    mesh.count = 0;
    group.add(mesh);
    return { mesh, prop, cap, n: 0 };
  };
  const poles = make(signalPole(), 260);
  const shelters = make(shelter(), 60);
  const benches = make(bench(), 120);
  const bins = make(bin(), 260);
  const signsA = make(sign(R.blue, R.white), 140);
  const signsB = make(sign(R.white, R.red), 140);
  const all = [poles, shelters, benches, bins, signsA, signsB];
  const waiting: Waiting[] = [];
  const m4 = new THREE.Matrix4();
  const o = new Float64Array(6);
  const hit: Collider[] = [];
  const last = new THREE.Vector3(1e9, 0, 1e9);

  /** Is there street here: dry land, no park, no landmark. */
  const street = (x: number, z: number) => landSdf(x, z) > 24 && parkSdf(x, z) > 6 && !inLandmark(x, z, 8);
  /** Is a patch of ground free of buildings. */
  const clear = (x: number, z: number, r: number) => {
    if (!colliders) return true;
    for (const c of colliders.near(x, z, hit)) if (c.y0 < 3 && x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return false;
    return true;
  };
  /** Stand one at a grid position, its +Z along (fx, fz) given in grid axes. Returns false if it could not go there. */
  const put = (pool: ReturnType<typeof make>, gx: number, gz: number, fgx: number, fgz: number, a = 0, seed = 0, room = 0) => {
    if (pool.n >= pool.cap) return false;
    gridToWorld(gx, gz, o);
    const x = o[0], z = o[1];
    if (!street(x, z) || (room > 0 && !clear(x, z, room))) return false;
    // grid direction -> world direction, through the two grid axes at this spot
    let fx = o[2] * fgx + o[4] * fgz, fz = o[3] * fgx + o[5] * fgz;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    m4.set(fz, 0, fx, x, 0, 1, 0, 0, -fx, 0, fz, z, 0, 0, 0, 1);
    pool.mesh.setMatrixAt(pool.n, m4);
    pool.prop.setXY(pool.n, a, seed);
    pool.n++;
    Q.x = x;
    Q.z = z;
    Q.fx = fx;
    Q.fz = fz;
    return true;
  };
  const Q = { x: 0, z: 0, fx: 0, fz: 1 };

  function place(cx: number, cz: number) {
    for (const p of all) p.n = 0;
    waiting.length = 0;
    const i0 = Math.floor((cx - REACH) / BLOCK), i1 = Math.ceil((cx + REACH) / BLOCK);
    const j0 = Math.floor((cz - REACH) / BLOCK), j1 = Math.ceil((cz + REACH) / BLOCK);
    const c = KERB + 0.6;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        // the junction at this block's south-east corner: one pole per corner, each facing its own traffic
        const jx = (i + 0.5) * BLOCK, jz = (j + 0.5) * BLOCK;
        put(poles, jx - c, jz + c, 0, 1, 0, 0); // south-west: northbound traffic
        put(poles, jx + c, jz - c, 0, -1, 0, 0); // north-east: southbound
        put(poles, jx - c, jz - c, -1, 0, 1, 0); // north-west: eastbound
        put(poles, jx + c, jz + c, 1, 0, 1, 0); // south-east: westbound
        // the four pavements round this block
        const bx = i * BLOCK, bz = j * BLOCK, half = BLOCK / 2;
        for (let s = 0; s < 4; s++) {
          const h = hash12(i * 4 + s + 0.5, j + 77.3), h2 = hash12(i * 4 + s + 0.5, j + 191.7);
          // s: 0 west side (faces west, the road to the west), 1 east, 2 north, 3 south
          const nx = s === 0 ? -1 : s === 1 ? 1 : 0, nz = s === 2 ? -1 : s === 3 ? 1 : 0; // towards the road
          const tx = nz, tz = nx; // along the pavement
          const at = (along: number, fromRoad: number): [number, number] => [bx + nx * (half - fromRoad) + tx * along, bz + nz * (half - fromRoad) + tz * along];
          if (h < 0.2) {
            const [gx, gz] = at((h2 - 0.5) * 20, KERB + 5.2);
            if (put(shelters, gx, gz, nx, nz, 0, h2, 2.4)) {
              // two to five people waiting under it, looking for the bus
              const n = 2 + Math.floor(h2 * 3.99);
              const right = { x: Q.fz, z: -Q.fx };
              for (let k = 0; k < n; k++) {
                const a = (hash12(k + 3.3, h * 91) - 0.5) * 3.2, b = hash12(k + 5.1, h * 57) * 0.7;
                const turn = (hash12(k + 9.7, h2 * 33) - 0.5) * 1.2;
                const fx = Q.fx * Math.cos(turn) - Q.fz * Math.sin(turn), fz = Q.fx * Math.sin(turn) + Q.fz * Math.cos(turn);
                waiting.push({ x: Q.x + right.x * a + Q.fx * b, z: Q.z + right.z * a + Q.fz * b, fx, fz, seed: hash12(k + 1.9, h * 13 + h2) });
              }
            }
          } else if (h < 0.6) {
            const [gx, gz] = at((h2 - 0.5) * 50, KERB + 4.9);
            put(benches, gx, gz, nx, nz, 0, h2, 1.2);
          }
          // a bin by one of the lamp posts, a sign past each junction
          {
            const [gx, gz] = at(-half + 13.75 + 27.5 * Math.floor(h2 * 3.99) + 1.4, KERB + 0.85);
            put(bins, gx, gz, nx, nz, 0, h2);
          }
          const [sx, sz] = at((h2 < 0.5 ? -1 : 1) * (half - 24), KERB + 0.7);
          put(h < 0.5 ? signsA : signsB, sx, sz, h2 < 0.5 ? tx : -tx, h2 < 0.5 ? tz : -tz, 0, h);
        }
      }
    }
    for (const p of all) {
      p.mesh.count = p.n;
      p.mesh.visible = p.n > 0;
      p.mesh.instanceMatrix.needsUpdate = true;
      p.prop.needsUpdate = true;
    }
  }

  return {
    group,
    waiting,
    update(camera) {
      if (Math.abs(camera.x - last.x) < 45 && Math.abs(camera.z - last.z) < 45) return;
      last.copy(camera);
      // the camera's place in grid space: grid = world + warp(world)
      const w = warp(camera.x, camera.z);
      place(camera.x + w[0], camera.z + w[1]);
    },
  };
}
