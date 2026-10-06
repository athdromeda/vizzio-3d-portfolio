// Street life around the camera: cars and street lamps as real 3D objects.
// The ground shader paints traffic and lamp glow for the whole city, which is all a distant street needs.
// Close up that reads as flat, so a pool of instances follows the camera: every instance works out, in its
// vertex shader, which lane or kerb position near the camera it stands for. The formulas are the ground
// shader's own (see `traffic` in shaders.ts), so a 3D car drives exactly where its painted twin would be.
import * as THREE from 'three';
import { BLOCK, GLSL_MAP, GLSL_WARP, ROAD } from './layout';
import { NOISE, SHARED, WORLD } from './shaders';

/** Streets either side of the camera's that carry 3D props, and how far along each street they reach, in metres. */
export const POOL_LINES = 6;
export const POOL_REACH = 640;
const CAR_SLOT = 30; // metres of lane per car slot, as in the ground shader
const LAMP_STEP = 27.5;

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

function carMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: SHARED,
    vertexShader: /* glsl */ `
      attribute vec4 aSlot;
      attribute float aLane;
      attribute float aPart;
      uniform float uTime;
      ${VARYINGS}
      ${NOISE}
      ${STREET}
      void main() {
        vec2 gc = cameraPosition.xz + warp(cameraPosition.xz);
        bool ns = aSlot.x < 0.5;
        float side = aSlot.z, laneI = aLane;
        // blocks are centred on whole grid steps, so streets run along the half steps
        float road = floor((ns ? gc.x : gc.y) / BLOCK) + aSlot.y + 0.5;
        // the ground shader's traffic, lane for lane. Both halves of a street share its id; 'side' picks the half.
        float laneC = 2.2 + 4.3 * laneI;
        float lid = (ns ? road : road + 300.0) * 2.0 + laneI;
        float speed = 0.34 + 0.1 * laneI;
        float h0 = hash12(vec2(lid, 3.0)) * 20.0;
        float n = floor((ns ? gc.y : gc.x) * side / ${CAR_SLOT.toFixed(1)} + uTime * speed + h0) + aSlot.w;
        float shown = step(0.55, hash12(vec2(n, lid)));
        float along = side * ${CAR_SLOT.toFixed(1)} * (n + 0.115 - uTime * speed - h0);
        float across = road * BLOCK - side * laneC;
        vec2 G = ns ? vec2(across, along) : vec2(along, across);
        float heading = -side;                 // a lane's traffic runs against its 'along' on the + side
        vPick = hash12(vec2(n, lid + 7.0));
        vPart = aPart;
        // one vehicle in twelve is a bus: longer and taller
        float bus = step(0.915, hash12(vec2(n, lid + 11.0)));
        vec3 local = position * mix(vec3(1.0), vec3(1.25, 1.9, 2.5), bus);
        ${PLACE}
      }`,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        float night = 1.0 - uDay;
        vec3 paint = vPick < 0.4 ? vec3(0.7, 0.7, 0.7) : vPick < 0.62 ? vec3(0.06, 0.06, 0.07) : vPick < 0.8 ? vec3(0.34, 0.36, 0.4) : vPick < 0.9 ? vec3(0.45, 0.07, 0.05) : vec3(0.08, 0.16, 0.42);
        float sh = sunShadow(vWorld.xz, vWorld.y + 1.0);
        vec3 light = ambient(n) * 0.9 + sunRadiance() * max(dot(n, uSun), 0.0) * sh * cloudShade(vWorld.xz);
        vec3 col;
        if (vPart > 0.5) {
          // the glasshouse: dark glass mirroring the sky, pillars at the corners
          vec3 R = reflect(-V, n);
          float fres = 0.12 + 0.88 * pow(1.0 - max(dot(V, n), 0.0), 4.0);
          vec3 glass = mix(vec3(0.02, 0.025, 0.03), skyColor(vec3(R.x, abs(R.y), R.z)), fres);
          col = vFaceN.y > 0.5 ? paint * light : glass;
        } else {
          col = paint * light;
          col = mix(col, vec3(0.02) * light, step(vLocal.y, 0.42));                     // wheels and sills in shadow
          // lamps: white ahead, red behind. Faint by day, bright at dusk.
          float lampBand = step(0.52, vLocal.y) * step(vLocal.y, 0.86) * step(0.45, abs(vLocal.x));
          col = mix(col, vec3(1.0, 0.93, 0.8) * (0.5 + 5.5 * night), lampBand * step(0.5, vFaceN.z));
          col = mix(col, vec3(1.0, 0.07, 0.03) * (0.25 + 2.6 * night), lampBand * step(0.5, -vFaceN.z));
        }
        col = mix(col, hazeColor(-V), fogAmount(dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

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

export interface StreetLife {
  group: THREE.Group;
  /** Call once per rendered view with that view's camera position. */
  update(camera: THREE.Vector3): void;
}

export function buildStreetLife(): StreetLife {
  const group = new THREE.Group();

  // a car: body, then a narrower glasshouse set back from the nose. Front is +Z.
  const carGeo = boxes([
    { size: [1.8, 0.78, 4.4], at: [0, 0.6, 0], part: 0 },
    { size: [1.62, 0.52, 2.3], at: [0, 1.25, -0.25], part: 1 },
  ]);
  const cs = slots(Math.ceil((POOL_REACH * 2) / CAR_SLOT), 2);
  const cars = new THREE.InstancedMesh(carGeo, carMaterial(), cs.count);
  carGeo.setAttribute('aSlot', cs.slot);
  carGeo.setAttribute('aLane', cs.lane);

  // a lamp: post on the pavement, an arm over the kerb, a lantern at its end
  const lampGeo = boxes([
    { size: [0.2, 8.2, 0.2], at: [0, 4.1, 0], part: 0 },
    { size: [2.5, 0.14, 0.14], at: [1.2, 8.15, 0], part: 1 },
    { size: [0.75, 0.16, 0.36], at: [2.2, 8.02, 0], part: 2 },
  ]);
  const ls = slots(Math.ceil((POOL_REACH * 2) / LAMP_STEP), 1);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMaterial(), ls.count);
  lampGeo.setAttribute('aSlot', ls.slot);

  for (const m of [cars, lamps]) {
    m.frustumCulled = false; // the vertex shader decides where each instance is
    group.add(m);
  }
  return {
    group,
    update(camera) {
      // from high up the props are smaller than a pixel: leave the street to the ground shader
      const on = camera.y < 1100;
      group.visible = on;
      SHARED.uPool.value = on ? 1 : 0;
    },
  };
}
