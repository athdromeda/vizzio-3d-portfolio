// Street life around the camera: vehicles, people, cyclists and street lamps as real 3D objects.
// The ground shader paints traffic and lamp glow for the whole city, which is all a distant street needs.
// Close up that reads as flat, so real models follow the camera. Where everyone is comes from traffic.ts
// (a function of the clock, nothing stored); this file turns those positions into instances every frame.
// The lamps are older and simpler: each works out its own place in its vertex shader.
import * as THREE from 'three';
import { BLOCK, GLSL_MAP, GLSL_WARP, ROAD, type ColliderIndex } from './layout';
import { PERSON_BUILDS, buildCyclist, buildPerson, personMaterial } from './people';
import { buildProps } from './props';
import { NOISE, POOL, SHARED, WORLD } from './shaders';
import { eachCyclist, eachVehicle, eachWalker, flow, lights, type PersonAt, type VehicleAt } from './traffic';
import { KINDS, SIZE, buildVehicle, livery, vehicleMaterial, type Kind } from './vehicles';

/** Streets either side of the camera's that carry lamp posts, and how far along each street they reach, in metres. */
export const POOL_LINES = 6;
export const POOL_REACH = 640;
const LAMP_STEP = 27.5;
/** Inside these distances the full models are used; beyond them the coarse ones. */
const FINE_CAR = 130;
const FINE_PERSON = 50;
/** How far out people are drawn at all. */
const PEOPLE = 200;

const STREET = /* glsl */ `
${GLSL_MAP}
${GLSL_WARP}
const float BLOCK = ${BLOCK.toFixed(1)};
const float ROAD = ${ROAD.toFixed(1)};
/** Grid space back to the world: the inverse of p + warp(p). */
vec2 unwarp(vec2 g) {
  vec2 p = g;
  for (int i = 0; i < 5; i++) p = g - warp(p);
  return p;
}
/** 1 where the ground shader draws a street. */
float onStreet(vec2 p, vec2 g) {
  vec2 lim = min(g - vec2(-30.5, -40.5) * BLOCK, vec2(62.5, 18.5) * BLOCK - g);
  return step(0.0, min(lim.x, lim.y)) * step(24.0, landSdf(p)) * step(6.0, parkSdf(p));
}
`;

const VARYINGS = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vFaceN;
varying float vPart;
varying float vPick;
`;

/** Shared tail of both vertex shaders: place a local point on the street, facing along it. */
const PLACE = /* glsl */ `
  vec2 p = unwarp(G);
  vec2 ahead = normalize(unwarp(G + (ns ? vec2(0.0, 2.0) : vec2(2.0, 0.0))) - p);
  vec2 fw = ahead * heading;                 // unit vector the object faces along
  vec3 fwd = vec3(fw.x, 0.0, fw.y), right = vec3(-fw.y, 0.0, fw.x);
  vec3 wp = vec3(p.x, 0.0, p.y) + right * local.x + vec3(0.0, local.y, 0.0) + fwd * local.z;
  vWorld = wp;
  vNormal = normalize(right * normal.x + vec3(0.0, normal.y, 0.0) + fwd * normal.z);
  vLocal = local;
  vFaceN = normal;
  shown *= onStreet(p, G);
  gl_Position = shown > 0.5 ? projectionMatrix * viewMatrix * vec4(wp, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
`;

function boxes(parts: { size: [number, number, number]; at: [number, number, number]; part: number }[]) {
  const pos: number[] = [], nor: number[] = [], part: number[] = [];
  for (const b of parts) {
    const g = new THREE.BoxGeometry(...b.size).translate(...b.at).toNonIndexed();
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
    for (let i = 0; i < g.getAttribute('position').count; i++) part.push(b.part);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  return geo;
}

/** One instance per (street, side, lane or kerb, slot). x: 0 north-south / 1 east-west, y: street offset, z: side, w: slot. */
function slots(perStreet: number, lanes: number) {
  const a: number[] = [], lane: number[] = [];
  for (let axis = 0; axis < 2; axis++) {
    for (let line = -POOL_LINES; line <= POOL_LINES; line++) {
      for (const side of [-1, 1]) {
        for (let l = 0; l < lanes; l++) {
          for (let k = 0; k < perStreet; k++) {
            a.push(axis, line, side, k - Math.floor(perStreet / 2));
            lane.push(l);
          }
        }
      }
    }
  }
  return { slot: new THREE.InstancedBufferAttribute(new Float32Array(a), 4), lane: new THREE.InstancedBufferAttribute(new Float32Array(lane), 1), count: lane.length };
}

const FRAG_HEAD = /* glsl */ `
${VARYINGS}
${NOISE}
${WORLD}
`;

function lampMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: SHARED,
    vertexShader: /* glsl */ `
      attribute vec4 aSlot;
      attribute float aPart;
      ${VARYINGS}
      ${NOISE}
      ${STREET}
      void main() {
        vec2 gc = cameraPosition.xz + warp(cameraPosition.xz);
        bool ns = aSlot.x < 0.5;
        float side = aSlot.z;
        float road = floor((ns ? gc.x : gc.y) / BLOCK) + aSlot.y + 0.5;
        // lamps stand where the ground shader pools their light: every 27.5 m, on both kerbs
        float along = (floor((ns ? gc.y : gc.x) / ${LAMP_STEP.toFixed(1)}) + aSlot.w + 0.5) * ${LAMP_STEP.toFixed(1)};
        float kerb = ROAD * 0.5 + 0.9;
        float across = road * BLOCK - side * kerb;
        vec2 G = ns ? vec2(across, along) : vec2(along, across);
        // none inside a junction: cross streets lie on the half steps too
        float cross = abs(fract(along / BLOCK) - 0.5) * BLOCK;
        float shown = step(ROAD * 0.5 + 4.0, cross);
        // local +X reaches over the carriageway
        float heading = ns ? -side : side;
        vPart = aPart;
        vPick = 0.0;
        vec3 local = position;
        ${PLACE}
      }`,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        float night = 1.0 - uDay;
        vec3 light = ambient(n) + sunRadiance() * max(dot(n, uSun), 0.0) * sunShadow(vWorld.xz, vWorld.y + 1.0);
        vec3 col = vec3(0.2, 0.21, 0.23) * light;
        // the lantern: its underside burns at dusk
        if (vPart > 1.5) col = mix(vec3(0.55, 0.56, 0.58) * light, vec3(1.0, 0.66, 0.32) * 7.0, night * step(vFaceN.y, -0.5) + night * 0.25);
        col = mix(col, hazeColor(-toCam / dist), fogAmount(dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}


/* ---------- instance pools ---------- */

/** An instanced mesh that is refilled every frame: matrices plus a few numbers per instance. */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  n = 0;
  private m: Float32Array;
  private extra: { a: THREE.InstancedBufferAttribute; size: number }[] = [];

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, readonly cap: number, attrs: [string, number][] = []) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false; // the instances are wherever the camera is
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.m = this.mesh.instanceMatrix.array as Float32Array;
    for (const [name, size] of attrs) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      this.extra.push({ a, size });
    }
    this.mesh.count = 0;
  }

  get full() {
    return this.n >= this.cap;
  }

  /** Stand an instance at (x, y, z) facing along (fx, fz), scaled. Returns its index, or -1 when the pool is full. */
  put(x: number, y: number, z: number, fx: number, fz: number, sx = 1, sy = 1, sz = 1) {
    if (this.n >= this.cap) return -1;
    const m = this.m, o = this.n * 16;
    // model +X is the left side, +Z the front
    m[o] = fz * sx;
    m[o + 1] = 0;
    m[o + 2] = -fx * sx;
    m[o + 3] = 0;
    m[o + 4] = 0;
    m[o + 5] = sy;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = fx * sz;
    m[o + 9] = 0;
    m[o + 10] = fz * sz;
    m[o + 11] = 0;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
    return this.n++;
  }

  /** The numbers of attribute `k` for instance `i`. */
  data(k: number) {
    return this.extra[k].a.array as Float32Array;
  }

  begin() {
    this.n = 0;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (!this.n) return;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges();
    im.addUpdateRange(0, this.n * 16);
    im.needsUpdate = true;
    for (const { a, size } of this.extra) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * size);
      a.needsUpdate = true;
    }
  }
}

/** A soft dark patch (shade under a car or a person), or a pool of light on the road. */
function softTexture(kind: 'shade' | 'beam') {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = kind === 'beam' ? 128 : 64;
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const u = (x + 0.5) / c.width * 2 - 1, v = (y + 0.5) / c.height;
      let a: number;
      if (kind === 'shade') {
        // a rounded rectangle with a soft edge
        const w = v * 2 - 1;
        const d = Math.max(Math.abs(u), Math.abs(w));
        const r = Math.hypot(Math.max(Math.abs(u) - 0.55, 0), Math.max(Math.abs(w) - 0.55, 0));
        a = Math.min(1, Math.max(0, (1 - Math.max(d, 0.55 + r)) / 0.3));
        a = a * a * (3 - 2 * a);
      } else {
        // v = 0 at the lamps: bright there, widening and fading down the road
        const wide = 0.25 + 0.75 * v;
        const side = Math.exp(-(u * u) / (wide * wide * 0.32));
        a = side * Math.pow(1 - v, 1.6) * Math.min(1, v * 14);
      }
      // an alpha map is read from the green channel
      const i = (y * c.width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Something on the street the pilot cannot walk or ride through: a box, turned the way the vehicle faces. */
export interface Obstacle {
  x: number;
  z: number;
  fx: number;
  fz: number;
  /** Half length and half width, metres. */
  hl: number;
  hw: number;
  top: number;
  /** Its own velocity, so whoever it runs into is carried along. */
  vx: number;
  vz: number;
}

/** Whoever is on the street under the visitor's control: people step out of the way, vehicles become obstacles. */
export interface Actor {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  /** 1 just after the horn: people give more room. */
  urge?: number;
}

export interface StreetLife {
  group: THREE.Group;
  /** Vehicles close to the actor, refreshed by each update that was given one. */
  obstacles: Obstacle[];
  /**
   * Call once per rendered view. `main` is false for a side view (a camera still): the lamps follow that
   * camera, but the vehicles and people stay where the main view put them.
   */
  update(camera: THREE.Vector3, time: number, actor?: Actor | null, main?: boolean): void;
}

/** `colliders`: the buildings, so that shelters and benches are only put where there is room. */
export function buildStreetLife(colliders: ColliderIndex | null = null): StreetLife {
  const group = new THREE.Group();
  const props = buildProps(colliders);
  group.add(props.group);

  // a lamp: post on the pavement, an arm over the kerb, a lantern at its end
  const lampGeo = boxes([
    { size: [0.2, 8.2, 0.2], at: [0, 4.1, 0], part: 0 },
    { size: [2.5, 0.14, 0.14], at: [1.2, 8.15, 0], part: 1 },
    { size: [0.75, 0.16, 0.36], at: [2.2, 8.02, 0], part: 2 },
  ]);
  const ls = slots(Math.ceil((POOL_REACH * 2) / LAMP_STEP), 1);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMaterial(), ls.count);
  lampGeo.setAttribute('aSlot', ls.slot);
  lamps.frustumCulled = false; // the vertex shader decides where each instance is
  group.add(lamps);

  // vehicles: a full and a coarse pool per kind, one material for all
  const carMat = vehicleMaterial();
  const ATTRS: [string, number][] = [['aPaint', 3], ['aSecond', 3], ['aState', 2]];
  const share: Record<Kind, number> = { sedan: 1, hatch: 1, suv: 1, mpv: 1, taxi: 1, van: 0.5, pickup: 0.35, bus: 0.35, decker: 0.3, truck: 0.3, hauler: 0.2, moto: 0.8 };
  const cars = KINDS.map((kind) => ({
    kind,
    size: SIZE[kind],
    fine: new Pool(buildVehicle(kind, true), carMat, Math.ceil(36 * share[kind]) + 6, ATTRS),
    coarse: new Pool(buildVehicle(kind, false), carMat, Math.ceil(300 * share[kind]), ATTRS),
  }));
  for (const c of cars) group.add(c.fine.mesh, c.coarse.mesh);

  // people: three builds and a cyclist, each full and coarse
  const walkMat = personMaterial(false), rideMat = personMaterial(true);
  const P_ATTRS: [string, number][] = [['aAnim', 3]];
  const walkers = PERSON_BUILDS.map((b) => ({ fine: new Pool(buildPerson(b, true), walkMat, 90, P_ATTRS), coarse: new Pool(buildPerson(b, false), walkMat, 280, P_ATTRS) }));
  const riders = { fine: new Pool(buildCyclist(true), rideMat, 24, P_ATTRS), coarse: new Pool(buildCyclist(false), rideMat, 90, P_ATTRS) };
  for (const p of [...walkers, riders]) group.add(p.fine.mesh, p.coarse.mesh);

  // shade under everything, and at dusk the light vehicles throw on the road
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: softTexture('shade'), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false });
  const shade = new Pool(flat, shadeMat, 1500);
  shade.mesh.renderOrder = 1;
  // the beam texture runs from the lamps (v = 0) down the road: turn the plane so +Z is v
  const beamGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: softTexture('beam'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false });
  const beams = new Pool(beamGeo, beamMat, 900);
  beams.mesh.renderOrder = 2;
  beams.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(900 * 3), 3);
  beams.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  group.add(shade.mesh, beams.mesh);

  const obstacles: Obstacle[] = [];
  const spare: Obstacle[] = [];
  const six = new Float32Array(6);
  const still: PersonAt = { x: 0, z: 0, fx: 0, fz: 1, phase: 0, amount: 0, seed: 0, type: 0 };
  let cam = new THREE.Vector3(), who: Actor | null = null, night = 0, low = true, near = true;

  const vehicle = (v: VehicleAt) => {
    const c = cars[v.kind];
    const d2 = (v.x - cam.x) ** 2 + (v.z - cam.z) ** 2;
    let pool = d2 < FINE_CAR * FINE_CAR && low && !c.fine.full ? c.fine : c.coarse;
    if (pool.full) pool = c.fine;
    const i = pool.put(v.x, 0, v.z, v.fx, v.fz);
    if (i < 0) return;
    livery(c.kind, v.h1, v.h2, six, 0);
    pool.data(0).set(six.subarray(0, 3), i * 3);
    pool.data(1).set(six.subarray(3, 6), i * 3);
    const st = pool.data(2);
    st[i * 2] = v.brake;
    st[i * 2 + 1] = v.h2;
    if (!near) return;
    const s = c.size;
    if (d2 < 260 * 260) shade.put(v.x, 0.03, v.z, v.fx, v.fz, s.wid + 0.7, 1, s.len + 0.9);
    if (night > 0.04 && d2 < 230 * 230) {
      // headlamps on the road ahead, a little red behind
      const front = s.len / 2 - 0.3;
      let b = beams.put(v.x + v.fx * front, 0.05, v.z + v.fz * front, v.fx, v.fz, c.kind === 'moto' ? 2.6 : 4.4, 1, 15);
      if (b >= 0) beams.mesh.instanceColor!.setXYZ(b, 0.075 * night, 0.068 * night, 0.054 * night);
      b = beams.put(v.x - v.fx * front, 0.05, v.z - v.fz * front, -v.fx, -v.fz, 2.6, 1, 3.2);
      if (b >= 0) beams.mesh.instanceColor!.setXYZ(b, (0.014 + 0.022 * v.brake) * night, 0.0012 * night, 0.0006 * night);
    }
    if (who) {
      const dx = v.x - who.x, dz = v.z - who.z;
      if (dx * dx + dz * dz < 32 * 32) {
        const o = spare.pop() ?? { x: 0, z: 0, fx: 0, fz: 1, hl: 1, hw: 1, top: 1, vx: 0, vz: 0 };
        o.x = v.x;
        o.z = v.z;
        o.fx = v.fx;
        o.fz = v.fz;
        o.hl = s.len / 2;
        o.hw = s.wid / 2;
        o.top = s.hgt;
        o.vx = v.fx * v.speed;
        o.vz = v.fz * v.speed;
        obstacles.push(o);
      }
    }
  };

  const person = (p: PersonAt) => {
    let x = p.x, z = p.z, amount = p.amount;
    if (who) {
      // step out of the pilot's way: sideways from where they are heading, further the faster they come
      const dx = x - who.x, dz = z - who.z;
      const speed = Math.hypot(who.vx, who.vz);
      const reach = 1.3 + Math.min(speed, 22) * 0.24 + (who.urge ?? 0) * 3.5;
      const d = Math.hypot(dx, dz);
      if (d < reach && who.y < 2.5) {
        const k = 1 - d / reach, push = k * k * (3 - 2 * k) * Math.min(reach * 0.7, 2.4);
        let ox = dx, oz = dz;
        if (speed > 1.5) {
          const sideways = who.vx * dz - who.vz * dx >= 0 ? 1 : -1;
          ox = (-who.vz / speed) * sideways;
          oz = (who.vx / speed) * sideways;
        } else if (d > 0.01) {
          ox /= d;
          oz /= d;
        } else {
          ox = 1;
          oz = 0;
        }
        x += ox * push;
        z += oz * push;
        amount = Math.max(amount, Math.min(1, k * 2));
      }
    }
    const d2 = (x - cam.x) ** 2 + (z - cam.z) ** 2;
    const set = p.type === 3 ? riders : walkers[Math.min(2, Math.floor(p.seed * 9.99) % 3)];
    let pool = d2 < FINE_PERSON * FINE_PERSON && !set.fine.full ? set.fine : set.coarse;
    if (pool.full) pool = set.fine;
    // height and build vary a little with the same random number that dresses them
    const tall = p.type === 3 ? 1 : 0.9 + 0.18 * ((p.seed * 7.31) % 1), wide = p.type === 3 ? 1 : 0.9 + 0.22 * ((p.seed * 3.17) % 1);
    const i = pool.put(x, 0, z, p.fx, p.fz, wide, tall, wide);
    if (i < 0) return;
    const a = pool.data(0);
    a[i * 3] = p.phase;
    a[i * 3 + 1] = amount;
    a[i * 3 + 2] = p.seed;
    if (d2 < 70 * 70) shade.put(x, 0.03, z, p.fx, p.fz, p.type === 3 ? 0.8 : 0.85, 1, p.type === 3 ? 1.9 : 0.85);
  };

  return {
    group,
    obstacles,
    update(camera, time, actor = null, main = true) {
      // from high up the props are smaller than a pixel: leave the street to the ground shader
      const on = camera.y < 1100;
      group.visible = on;
      SHARED.uPool.value = on ? 1 : 0;
      SHARED.uFlow.value.set(flow(time, 0), flow(time, 1));
      const l = lights(time);
      SHARED.uSignal.value.set(l.car[0], l.car[1], l.walk[0], l.walk[1]);
      if (!main || !on) return;
      cam = camera;
      who = actor;
      night = 1 - SHARED.uDay.value;
      low = camera.y < 260;
      near = camera.y < 520;
      for (const o of obstacles) spare.push(o);
      obstacles.length = 0;
      for (const c of cars) {
        c.fine.begin();
        c.coarse.begin();
      }
      for (const p of [...walkers, riders]) {
        p.fine.begin();
        p.coarse.begin();
      }
      shade.begin();
      beams.begin();
      eachVehicle(camera.x, camera.z, time, POOL, vehicle);
      if (camera.y < 700) props.update(camera);
      props.group.visible = camera.y < 700;
      if (camera.y < 340) {
        eachWalker(camera.x, camera.z, time, PEOPLE, person);
        eachCyclist(camera.x, camera.z, time, PEOPLE + 80, person);
        for (const w of props.waiting) {
          if (Math.abs(w.x - camera.x) > PEOPLE || Math.abs(w.z - camera.z) > PEOPLE) continue;
          still.x = w.x;
          still.z = w.z;
          still.fx = w.fx;
          still.fz = w.fz;
          still.seed = w.seed;
          person(still);
        }
      }
      for (const c of cars) {
        c.fine.end();
        c.coarse.end();
      }
      for (const p of [...walkers, riders]) {
        p.fine.end();
        p.coarse.end();
      }
      shade.end();
      beams.end();
      if (beams.n) {
        const ic = beams.mesh.instanceColor!;
        ic.clearUpdateRanges();
        ic.addUpdateRange(0, beams.n * 3);
        ic.needsUpdate = true;
      }
    },
  };
}
