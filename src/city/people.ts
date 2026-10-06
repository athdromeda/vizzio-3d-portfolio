// The people in the streets: low figures that walk. One geometry per build (plain, with a rucksack, in a
// dress) plus a cyclist; clothes, skin, hair and height come from one random number per person in the shader,
// and the walk cycle is done in the vertex shader from a stride phase, so a crowd costs a few numbers each.
import * as THREE from 'three';
import { MeshKit, type V3 } from './meshkit';
import { NOISE, SHARED, WORLD } from './shaders';

const PP = { skin: 0, shirt: 1, legs: 2, shin: 3, shoe: 4, hair: 5, bag: 6, forearm: 7, frame: 8, tyre: 9, metal: 10, helmet: 11 } as const;
/** Limb numbers the vertex shader swings. Left is +X. */
const LIMB = { thighL: 1, shinL: 2, thighR: 3, shinR: 4, armL: 5, armR: 6 } as const;

export const PERSON_BUILDS = ['plain', 'pack', 'dress'] as const;
export type PersonBuild = (typeof PERSON_BUILDS)[number];

const HIP = 0.93, KNEE = 0.5, SHOULDER = 1.42;

function legs(k: MeshKit, hipY: number, hipZ: number, bare: boolean, fine = true) {
  for (const sx of [1, -1]) {
    const x = sx * 0.095;
    const thigh = sx > 0 ? LIMB.thighL : LIMB.thighR, shin = sx > 0 ? LIMB.shinL : LIMB.shinR;
    if (!fine) {
      // far away: one piece per leg, swinging from the hip
      k.taper([x, hipY - HIP, hipZ], [0.1, 0.16], [0.155, 0.165], HIP, bare ? PP.skin : PP.legs, { limb: thigh });
      continue;
    }
    k.taper([x, hipY - (HIP - KNEE), hipZ], [0.125, 0.13], [0.155, 0.165], HIP - KNEE, bare ? PP.skin : PP.legs, { limb: thigh, smooth: 3 });
    k.taper([x, hipY - HIP + 0.09, hipZ], [0.095, 0.1], [0.12, 0.125], KNEE - 0.09, bare ? PP.skin : PP.shin, { limb: shin, smooth: 4 });
    k.box([x, hipY - HIP + 0.045, hipZ + 0.045], [0.105, 0.09, 0.25], PP.shoe, { limb: shin });
  }
}

function head(k: MeshKit, c: V3, fine: boolean, helmet = false) {
  if (fine) {
    k.ball(c, [0.098, 0.118, 0.108], 8, 6, PP.skin);
    // hair: a cap over the top and back of the head
    k.ball([c[0], c[1] + 0.012, c[2] - 0.014], [0.106, 0.124, 0.116], 8, 4, helmet ? PP.helmet : PP.hair, { from: 0, to: 0.5 });
  } else {
    k.box([c[0], c[1] - 0.02, c[2]], [0.17, 0.17, 0.18], PP.skin);
    k.box([c[0], c[1] + 0.08, c[2] - 0.01], [0.19, 0.08, 0.2], helmet ? PP.helmet : PP.hair);
  }
}

export function buildPerson(build: PersonBuild, fine: boolean) {
  const k = new MeshKit();
  k.centre = [0, 1, 0];
  legs(k, HIP, 0, build === 'dress', fine);
  if (build === 'dress') k.taper([0, 0.5, 0], [0.42, 0.3], [0.3, 0.19], 0.53, PP.shirt, { smooth: 5 });
  else if (fine) k.taper([0, 0.9, 0], [0.31, 0.19], [0.3, 0.18], 0.14, PP.legs);
  k.taper([0, 1.03, 0], [0.3, 0.18], [0.38, 0.21], 0.42, PP.shirt, { smooth: 5 });
  if (fine) k.box([0, 1.48, 0], [0.1, 0.08, 0.1], PP.skin, { skip: ['y+', 'y-'] });
  head(k, [0, 1.61, 0.01], fine);
  if (fine) {
    for (const sx of [1, -1]) {
      const limb = sx > 0 ? LIMB.armL : LIMB.armR;
      k.box([sx * 0.228, 1.31, 0], [0.09, 0.25, 0.105], PP.shirt, { limb });
      k.box([sx * 0.228, 1.01, 0], [0.074, 0.36, 0.084], PP.forearm, { limb });
    }
    if (build === 'pack') k.box([0, 1.24, -0.165], [0.27, 0.36, 0.13], PP.bag);
  } else if (build === 'pack') k.box([0, 1.24, -0.165], [0.27, 0.36, 0.13], PP.bag);
  return k.build();
}

/** A box along a line in the plane of the bicycle. */
function beam(k: MeshKit, a: [number, number], b: [number, number], th: number, part: number, x = 0) {
  const dy = b[0] - a[0], dz = b[1] - a[1];
  const mid: V3 = [x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  k.posed({ rx: Math.atan2(dz, dy), pivot: mid }, () => k.box(mid, [th, Math.hypot(dy, dz), th], part));
}

/** Where the cyclist's legs hinge: the vertex shader needs these. */
export const CYCLIST_RIG = { hipY: 0.97, hipZ: -0.22 };

export function buildCyclist(fine: boolean) {
  const k = new MeshKit();
  k.centre = [0, 0.8, 0];
  const r = 0.34;
  for (const z of [0.54, -0.52]) {
    if (fine) k.wheel([0, r, z], r, 0.04, 12, PP.tyre, PP.tyre);
    else k.box([0, r, z], [0.04, r * 1.9, r * 1.8], PP.tyre);
  }
  const bb: [number, number] = [0.3, -0.04], seat: [number, number] = [0.9, -0.22], headT: [number, number] = [0.88, 0.4];
  beam(k, bb, seat, 0.035, PP.frame);
  beam(k, [0.84, -0.2], headT, 0.035, PP.frame);
  beam(k, bb, [0.8, 0.39], 0.04, PP.frame);
  beam(k, bb, [r, -0.52], 0.03, PP.frame);
  beam(k, [0.8, -0.19], [r, -0.52], 0.025, PP.frame);
  beam(k, [1.0, 0.36], [r, 0.54], 0.03, PP.metal);
  k.box([0, 1.0, 0.36], [0.44, 0.03, 0.03], PP.tyre);
  k.box([0, 0.93, -0.24], [0.12, 0.04, 0.25], PP.tyre);
  // the rider: legs hang from the saddle for the shader to pedal with; the body leans to the bars
  const { hipY, hipZ } = CYCLIST_RIG;
  legs(k, hipY, hipZ, false);
  k.posed({ rx: 0.55, pivot: [0, hipY, hipZ] }, () => {
    k.taper([0, hipY - 0.04, hipZ], [0.3, 0.18], [0.37, 0.2], 0.5, PP.shirt, { smooth: 5 });
    k.box([0, hipY + 0.5, hipZ], [0.1, 0.08, 0.1], PP.skin, { skip: ['y+', 'y-'] });
  });
  if (fine) {
    // arms from the leaning shoulders down to the bars
    const drop = 0.42, sy = hipY + drop * Math.cos(0.55), sz = hipZ + drop * Math.sin(0.55);
    for (const sx of [1, -1]) {
      k.posed({ rx: -0.83, pivot: [sx * 0.22, hipY + drop, hipZ], at: [0, sy - (hipY + drop), sz - hipZ] }, () => {
        k.box([sx * 0.22, hipY + drop - 0.12, hipZ], [0.085, 0.25, 0.1], PP.shirt);
        k.box([sx * 0.22, hipY + drop - 0.4, hipZ], [0.07, 0.32, 0.08], PP.forearm);
      });
    }
  }
  // the head sits upright on the leaning neck
  const top = hipY + 0.5 + 0.13;
  head(k, [0, hipY + Math.cos(0.55) * (top - hipY), hipZ + Math.sin(0.55) * (top - hipY) + 0.02], fine, true);
  return k.build();
}

/**
 * Per person: aAnim (x: stride phase, y: how hard the legs work, z: the random number that dresses them).
 * `cyclist` switches the leg motion from a walk to pedalling.
 */
export function personMaterial(cyclist: boolean) {
  const rig = cyclist ? [CYCLIST_RIG.hipY, CYCLIST_RIG.hipZ] : [HIP, 0];
  return new THREE.ShaderMaterial({
    uniforms: SHARED,
    vertexShader: /* glsl */ `
      attribute float aPart;
      attribute float aLimb;
      attribute vec3 aAnim;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vPart;
      varying float vSeed;
      const vec2 HIP = vec2(${rig[0].toFixed(3)}, ${rig[1].toFixed(3)});
      const float THIGH = ${(HIP - KNEE).toFixed(3)};
      const float SHOULDER = ${SHOULDER.toFixed(3)};
      // turn the (y, z) part of a point about a pivot; a positive angle swings a hanging limb backwards
      void swing(inout vec3 p, inout vec3 n, vec2 pivot, float a) {
        float c = cos(a), s = sin(a);
        vec2 d = p.yz - pivot;
        p.yz = pivot + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
        n.yz = vec2(n.y * c - n.z * s, n.y * s + n.z * c);
      }
      void main() {
        vec3 p = position, n = normal;
        float ph = aAnim.x, amt = aAnim.y;
        int limb = int(aLimb + 0.5);
        if (limb >= 1 && limb <= 4) {
          float side = limb <= 2 ? 0.0 : 3.14159;
          float thigh, knee;
          ${
            cyclist
              ? `thigh = -1.02 + 0.42 * sin(ph + side); knee = 1.3 - 0.5 * sin(ph + side + 0.9);`
              : `thigh = sin(ph + side) * 0.42 * min(amt, 1.5); knee = max(0.0, -cos(ph + side)) * 0.8 * min(amt, 1.7) + 0.04;`
          }
          if (limb == 2 || limb == 4) swing(p, n, vec2(HIP.x - THIGH, HIP.y), knee);
          swing(p, n, HIP, thigh);
        } else if (limb >= 5) {
          float side = limb == 5 ? 3.14159 : 0.0;
          swing(p, n, vec2(SHOULDER, 0.0), sin(ph + side) * 0.36 * min(amt, 1.6) - 0.25 * max(amt - 1.0, 0.0));
        }
        ${cyclist ? '' : 'p.y += abs(sin(ph)) * 0.035 * min(amt, 1.2);'}
        vec4 wp = instanceMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(instanceMatrix) * n);
        vPart = aPart;
        vSeed = aAnim.z;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vPart;
      varying float vSeed;
      ${NOISE}
      ${WORLD}
      float rnd(float k) { return fract(sin(vSeed * 91.7 + k * 37.3) * 4375.85); }
      vec3 shirt(float h) {
        // what a crowd wears: a lot of white, navy, grey and black, and the odd colour
        if (h < 0.2) return vec3(0.72, 0.72, 0.7);
        if (h < 0.34) return vec3(0.03, 0.05, 0.13);
        if (h < 0.46) return vec3(0.04, 0.04, 0.045);
        if (h < 0.56) return vec3(0.3, 0.31, 0.33);
        if (h < 0.64) return vec3(0.45, 0.06, 0.06);
        if (h < 0.72) return vec3(0.1, 0.24, 0.5);
        if (h < 0.79) return vec3(0.55, 0.42, 0.1);
        if (h < 0.85) return vec3(0.1, 0.3, 0.18);
        if (h < 0.91) return vec3(0.5, 0.25, 0.32);
        if (h < 0.96) return vec3(0.42, 0.52, 0.6);
        return vec3(0.6, 0.3, 0.06);
      }
      vec3 legsCol(float h) {
        if (h < 0.32) return vec3(0.025, 0.035, 0.07);
        if (h < 0.55) return vec3(0.03, 0.03, 0.035);
        if (h < 0.72) return vec3(0.16, 0.17, 0.19);
        if (h < 0.86) return vec3(0.32, 0.27, 0.19);
        return vec3(0.07, 0.12, 0.22);
      }
      vec3 skinCol(float h) {
        if (h < 0.3) return vec3(0.62, 0.42, 0.3);
        if (h < 0.55) return vec3(0.5, 0.33, 0.22);
        if (h < 0.75) return vec3(0.36, 0.22, 0.14);
        if (h < 0.9) return vec3(0.22, 0.13, 0.08);
        return vec3(0.68, 0.5, 0.4);
      }
      void main() {
        vec3 n = normalize(vNormal);
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        float night = 1.0 - uDay;
        float sh = sunShadow(vWorld.xz, vWorld.y + 0.4) * cloudShade(vWorld.xz);
        vec3 lampL = vec3(1.0, 0.62, 0.3) * night * (0.2 + 0.3 * max(n.y, 0.0));
        vec3 light = ambient(n) + sunRadiance() * max(dot(n, uSun), 0.0) * sh + lampL;
        int part = int(vPart + 0.5);
        vec3 skin = skinCol(rnd(1.0));
        vec3 top = shirt(rnd(2.0));
        vec3 bottom = legsCol(rnd(3.0));
        vec3 base = skin;
        if (part == 1) base = top;
        else if (part == 2) base = bottom;
        else if (part == 3) base = rnd(4.0) < 0.3 ? skin : bottom;        // shorts
        else if (part == 4) base = rnd(5.0) < 0.4 ? vec3(0.6) : vec3(0.02);
        else if (part == 5) base = rnd(6.0) < 0.8 ? vec3(0.012, 0.01, 0.01) : rnd(6.0) < 0.92 ? vec3(0.1, 0.06, 0.03) : vec3(0.4, 0.4, 0.4);
        else if (part == 6) base = shirt(rnd(7.0)) * 0.6;
        else if (part == 7) base = rnd(8.0) < 0.3 ? top : skin;           // long sleeves
        else if (part == 8) base = shirt(rnd(9.0) * 0.99) * 0.8;
        else if (part == 9) base = vec3(0.015);
        else if (part == 10) base = vec3(0.4, 0.41, 0.43);
        else if (part == 11) base = rnd(10.0) < 0.5 ? vec3(0.7) : shirt(rnd(11.0));
        vec3 col = base * light;
        col = mix(col, hazeColor(-toCam / dist), fogAmount(dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
