// Shaders for the stand-in city: sky, water + land in one ground pass, buildings, roofs and trees.
// Every material shares one set of uniforms (sun, time-of-day blend, time, baked maps), so the whole city
// changes light together. All output linear HDR; tone mapping and bloom happen in <Effects>.
import * as THREE from 'three';
import { BLOCK, FOG_DENSITY, GLSL_MAP, GLSL_WARP, MAP_BOX, ROAD, SUN_DAY } from './layout';
import { BUSY, FRONT0, SLOT, STOP_LINE } from './trafficRules';

/** Half-width of the square around the camera, in street-grid metres, where traffic is 3D (see street.ts). */
export const POOL = 480;

/** Shared by every city material. Dusk is the base look; `uDay` and `uNight` blend away from it. */
export const SHARED = {
  uSun: { value: new THREE.Vector3(...SUN_DAY) },
  uDay: { value: 1 },
  uNight: { value: 0 },
  uTime: { value: 0 },
  uHeight: { value: null as THREE.Texture | null },
  /** The same heights at an eighth of the resolution, each texel the tallest thing in its patch. For long rays. */
  uHeightFar: { value: null as THREE.Texture | null },
  uShadowDay: { value: null as THREE.Texture | null },
  uShadowDusk: { value: null as THREE.Texture | null },
  uGroundMap: { value: null as THREE.Texture | null },
  /** 1 while 3D cars and lamps are drawn around the camera (see street.ts): the painted cars step aside there. */
  uPool: { value: 0 },
  /** Metres the traffic on north-south (x) and east-west (y) streets has moved so far: one block per green (traffic.ts). */
  uFlow: { value: new THREE.Vector2() },
  /** Signal lamps: x, y the traffic lamp per axis (0 green, 1 amber, 2 red); z, w whether people may cross a street of that axis. */
  uSignal: { value: new THREE.Vector4(0, 2, 0, 0) },
};

export const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}
`;

/** Sky colour for a direction, light colours, haze and shadows. Shared by every city shader. */
export const WORLD = /* glsl */ `
uniform vec3 uSun;
uniform float uDay;
uniform float uNight;
uniform float uTime;
uniform sampler2D uHeight;
uniform sampler2D uHeightFar;
uniform sampler2D uShadowDay;
uniform sampler2D uShadowDusk;
uniform sampler2D uGroundMap;
const vec4 MAPBOX = vec4(${MAP_BOX.x0.toFixed(1)}, ${MAP_BOX.z0.toFixed(1)}, ${(1 / MAP_BOX.w).toExponential(6)}, ${(1 / MAP_BOX.h).toExponential(6)});

vec3 duskSky(vec3 d) {
  float y = max(d.y, 0.0);
  float az = max(dot(normalize(d.xz + 1e-5), normalize(uSun.xz)), 0.0); // 1 when facing the sun
  vec3 zenith = vec3(0.02, 0.045, 0.115);
  vec3 mid = vec3(0.1, 0.135, 0.27);
  // away from the sun the horizon is a dusty rose-grey, not violet
  vec3 horizon = mix(vec3(0.3, 0.26, 0.31), vec3(1.2, 0.5, 0.17), pow(az, 2.4));
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.2, y));
  c = mix(c, zenith, smoothstep(0.12, 0.72, y));
  c += vec3(1.0, 0.58, 0.22) * 0.55 * pow(az, 6.0) * exp(-y * 13.0);
  float sd = max(dot(d, uSun), 0.0);
  c += vec3(1.0, 0.5, 0.2) * pow(sd, 26.0) * 0.38;
  c += vec3(1.0, 0.78, 0.5) * pow(sd, 500.0) * 0.6;
  return c;
}
vec3 daySky(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 zenith = vec3(0.07, 0.2, 0.56);
  vec3 horizon = vec3(0.5, 0.62, 0.8);
  vec3 c = mix(horizon, zenith, 1.0 - exp(-y * 3.2));
  float sd = max(dot(d, uSun), 0.0);
  c += vec3(1.0, 0.9, 0.72) * (pow(sd, 6.0) * 0.12 + pow(sd, 90.0) * 0.45);
  return c;
}
vec3 nightSky(vec3 d) {
  float y = max(d.y, 0.0);
  return mix(vec3(0.018, 0.026, 0.055), vec3(0.004, 0.012, 0.035), smoothstep(0.0, 0.65, y));
}
vec3 skyColor(vec3 d) { return mix(mix(duskSky(d), daySky(d), uDay), nightSky(d), uNight); }
vec3 hazeColor(vec3 viewDir) { return skyColor(normalize(vec3(viewDir.x, 0.03, viewDir.z))); }
float fogAmount(float dist) { float f = dist * ${FOG_DENSITY} * mix(mix(0.68, 0.42, uDay), 0.56, uNight); return 1.0 - exp(-f * f); }

vec3 sunRadiance() { return mix(vec3(1.0, 0.55, 0.27) * 1.35, vec3(1.0, 0.93, 0.82) * 1.55, uDay) * (1.0 - uNight); }
/** Light from the sky above and the ground below. */
vec3 ambient(vec3 n) {
  vec3 up = mix(vec3(0.36, 0.42, 0.64) * 0.5, vec3(0.3, 0.42, 0.7) * 0.5, uDay);
  vec3 down = mix(vec3(0.1, 0.085, 0.08), vec3(0.17, 0.16, 0.14), uDay);
  return mix(mix(down, up, n.y * 0.5 + 0.5), mix(vec3(0.12, 0.17, 0.3), vec3(0.28, 0.4, 0.68), n.y * 0.5 + 0.5), uNight);
}

float heightAt(vec2 p) { return texture2D(uHeight, (p - MAPBOX.xy) * MAPBOX.zw).r * 510.0; }
float heightFar(vec2 p) { return texture2D(uHeightFar, (p - MAPBOX.xy) * MAPBOX.zw).r * 510.0; }

/**
 * 1 in sunlight, 0 in shadow. The baked shadow maps hold, for each spot, the height below which the sun
 * is blocked; one for the day sun and one for the dusk sun, cross-faded while the light changes.
 */
float sunShadow(vec2 p, float y) {
  vec2 uv = (p - MAPBOX.xy) * MAPBOX.zw;
  float a = smoothstep(-2.5, -0.5, y - texture2D(uShadowDay, uv).r);
  float b = smoothstep(-7.0, -0.5, y - texture2D(uShadowDusk, uv).r);
  return mix(b, a, uDay);
}

/** Slow patches of cloud shadow drifting over the city by day. */
float cloudShade(vec2 p) {
  float c = fbm(p * 0.00045 + vec2(uTime * 0.004, 0.0));
  return 1.0 - 0.26 * uDay * smoothstep(0.42, 0.78, c);
}
`;

/* ---------- sky dome ---------- */

export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: SHARED,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      ${NOISE}
      ${WORLD}
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = skyColor(d);
        float sd = max(dot(d, uSun), 0.0);
        c += mix(vec3(6.0, 3.0, 1.2), vec3(22.0, 20.0, 17.0), uDay) * smoothstep(0.99955, 0.9998, sd) * (1.0 - uNight); // sun disc
        if (d.y > 0.015) {
          vec2 uv = d.xz / (d.y + 0.14);
          float az = max(dot(normalize(d.xz), normalize(uSun.xz)), 0.0);
          // dusk: high streaks lit from below near the sun
          float streak = fbm(uv * vec2(0.9, 1.7) + vec2(uTime * 0.003, 0.0));
          streak = smoothstep(0.5, 0.82, streak) * smoothstep(0.015, 0.14, d.y) * (1.0 - uNight);
          vec3 streakCol = mix(vec3(0.1, 0.09, 0.17), vec3(1.35, 0.5, 0.26), pow(az, 1.8) * exp(-d.y * 2.6));
          // day: scattered fair-weather cumulus, bright on top, grey-blue beneath
          vec2 cu = uv * 1.5 + vec2(uTime * 0.004, 0.0);
          float puff = fbm(cu) * 0.7 + fbm(cu * 3.1 + 7.0) * 0.3;
          float cover = smoothstep(0.52, 0.68, puff) * smoothstep(0.015, 0.1, d.y);
          float thick = smoothstep(0.52, 0.8, puff);
          vec3 puffCol = mix(vec3(1.05, 1.05, 1.04), vec3(0.62, 0.68, 0.8), thick * 0.75);
          puffCol = mix(puffCol, hazeColor(d), exp(-d.y * 9.0) * 0.8);
          c = mix(mix(c, streakCol, streak * 0.75), mix(c, puffCol, cover * 0.92), uDay * (1.0 - uNight));
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/* ---------- ground: water and land in one pass ---------- */

export function makeGroundMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: SHARED,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      ${NOISE}
      ${WORLD}
      ${GLSL_MAP}
      ${GLSL_WARP}
      const float BLOCK = ${BLOCK.toFixed(1)};
      const float ROAD = ${ROAD.toFixed(1)};
      uniform float uPool;
      uniform vec2 uFlow;

      void main() {
        vec2 p = vWorld.xz;
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        float d = landSdf(p);
        float land = smoothstep(-1.5, 1.5, d);
        float t = uTime;
        float night = 1.0 - uDay;
        vec3 up = vec3(0.0, 1.0, 0.0);

        float sh = sunShadow(p, 0.0);
        float cs = cloudShade(p);
        vec3 sunL = sunRadiance() * max(uSun.y, 0.0) * sh * cs;
        vec3 amb = ambient(up);
        // ground darkens where tall things stand close by
        float near = heightAt(p + vec2(7.0, 0.0)) + heightAt(p - vec2(7.0, 0.0)) + heightAt(p + vec2(0.0, 7.0)) + heightAt(p - vec2(0.0, 7.0));
        float ao = 1.0 - 0.55 * clamp(near / 150.0, 0.0, 1.0);

        // --- water: rippled mirror of the sky over a coloured body, with a sun-glitter path
        float calm = exp(-dist * 0.0012);
        vec2 w1 = p * 0.09 + vec2(t * 0.22, t * 0.13);
        vec2 w2 = p * 0.31 - vec2(t * 0.2, t * 0.3);
        vec2 w3 = p * 0.012 + vec2(t * 0.02, -t * 0.015);
        float gust = 0.35 + 0.9 * smoothstep(0.3, 0.75, vnoise(w3)); // wind lanes: glassy water beside ruffled water
        vec3 wn = vec3(
          (vnoise(w1) - 0.5) * 0.1 + (vnoise(w2) - 0.5) * 0.07,
          1.0,
          (vnoise(w1 + 19.0) - 0.5) * 0.1 + (vnoise(w2 + 41.0) - 0.5) * 0.07);
        wn = normalize(mix(up, wn, (0.12 + 0.88 * calm) * gust));
        vec3 R = reflect(-V, wn);
        R.y = abs(R.y);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(V, wn), 0.0), 5.0);
        // the mirror image itself comes from the flat surface: ripples only stretch it up and down
        vec3 Rm = reflect(-V, up);
        float wobble = (vnoise(w1 * 1.7) - 0.5) * gust;
        // min(): on land d runs to thousands, exp() would overflow to inf and poison the bloom pass with NaN
        float shallow = exp(min(d, 0.0) * 0.022);
        vec3 body = mix(vec3(0.004, 0.01, 0.022), mix(vec3(0.012, 0.06, 0.085), vec3(0.05, 0.16, 0.15), shallow), uDay);
        body *= mix(1.0, (0.72 + 0.28 * sh) * (0.6 + 0.4 * cs), uDay);
        // what the water mirrors: the sky, or whatever stands on the far shore. The mirrored ray is walked
        // over the height map in a few growing steps; the ripples smear the picture.
        float flatR = max(length(Rm.xz), 1e-3);
        vec2 rd = Rm.xz / flatR;
        float slope = max(Rm.y / flatR + wobble * 0.1, 0.004);
        // Steps grow with distance and are nudged by the ripples, so a far tower arrives as a stack of dashes.
        vec2 vd = normalize(V.xz + 1e-5);
        float across = dot(p, vec2(-vd.y, vd.x));
        float jit = vnoise(vec2(across * 0.07, dot(p, vd) * 0.45 - t * 0.7));
        float hit = 0.0, hitH = 0.0;
        for (int i = 0; i < 12; i++) {
          float s = 10.0 * pow(1.5, float(i) + jit);      // 10 m to about 1.3 km
          vec2 q = p + rd * s + vec2(-rd.y, rd.x) * wobble * 5.0;
          float h = s < 110.0 ? heightAt(q) : heightFar(q);
          float k = smoothstep(0.0, 5.0, h - s * slope) * (1.0 - hit);
          hitH += k * h;
          hit += k;
        }
        vec3 refl = skyColor(R) * mix(0.8, 0.9, uDay);
        vec3 shoreDay = mix(vec3(0.05, 0.09, 0.045), vec3(0.34, 0.35, 0.37), smoothstep(10.0, 24.0, hitH)) * (amb * 1.7 + sunRadiance() * 0.3);
        // at dusk the city's lights stand in the water as long trembling columns
        float ac = across / 3.5;
        float pick = hash12(vec2(floor(ac), 3.0));
        // each light is a narrow column, chopped by the ripples into a stack of short dashes
        float dash = smoothstep(0.38, 0.72, vnoise(vec2(across * 0.22, dot(p, vd) * 0.6 - t * 0.9)));
        float column = step(0.58, pick) * (1.0 - abs(fract(ac) - 0.5) * 2.0) * dash;
        vec3 shoreDusk = vec3(0.035, 0.035, 0.05) + vec3(0.5, 0.4, 0.27) * 0.3 * smoothstep(30.0, 130.0, hitH) * (0.6 + 0.4 * dash) + mix(vec3(1.0, 0.68, 0.36), vec3(0.75, 0.85, 1.0), step(0.88, pick)) * column * 0.75;
        refl = mix(refl, mix(shoreDusk, shoreDay, uDay), hit * 0.92);
        vec3 water = mix(body, refl, clamp(fres + 0.06, 0.0, 1.0));
        water += sunRadiance() * pow(max(dot(R, uSun), 0.0), mix(220.0, 420.0, uDay)) * mix(3.0, 5.0, uDay) * mix(1.0, sh * cs, uDay);
        water += vec3(1.0, 0.6, 0.28) * 0.14 * night * shallow * (0.45 + 0.55 * vnoise(p * 0.18 + vec2(0.0, t * 0.5)));

        // --- streets: the grid lives in bent "grid space", so the streets curve
        vec2 g = p + warp(p);
        vec2 b = g / BLOCK;
        vec2 lc = fract(b + 0.5) - 0.5;             // position inside the block, -0.5..0.5
        vec2 edge = (0.5 - abs(lc)) * BLOCK;        // metres to the road centre line on each axis
        bool ns = edge.x < edge.y;                  // nearest road runs north-south
        float roadD = ns ? edge.x : edge.y;
        float other = ns ? edge.y : edge.x;         // metres to the centre of the crossing road
        float along = ns ? g.y : g.x;
        float side = ns ? sign(lc.x) : sign(lc.y);  // which half of the road: sets traffic direction
        float roadId = ns ? floor(b.x + 0.5) + 0.5 * side : floor(b.y + 0.5) + 0.5 * side + 300.0;
        float park = 1.0 - smoothstep(-6.0, 6.0, parkSdf(p));
        float aw = fwidth(roadD) + 0.001;
        // the street grid ends at the city limits; beyond them the land is wooded country
        vec2 lim = min(g - vec2(-30.5, -40.5) * BLOCK, vec2(62.5, 18.5) * BLOCK - g);
        float inCity = smoothstep(-20.0, 20.0, min(lim.x, lim.y));
        float road = (1.0 - smoothstep(ROAD * 0.5 - aw, ROAD * 0.5 + aw, roadD)) * (1.0 - park) * smoothstep(10.0, 26.0, d) * inCity;
        float fine = clamp((fwidth(along) + aw) * 0.22, 0.0, 1.0); // 1 when street detail is sub-pixel

        // --- what the ground is made of
        vec4 gm = texture2D(uGroundMap, (p - MAPBOX.xy) * MAPBOX.zw);
        float n1 = vnoise(p * 0.06), n2 = vnoise(p * 0.9);
        vec3 pave = mix(vec3(0.3, 0.29, 0.27), vec3(0.4, 0.38, 0.35), n1) * (0.9 + 0.2 * n2);
        // paving laid in bays, parking bays on the yards: fine lines that give the ground its scale
        vec2 tile = abs(fract(g / 4.0) - 0.5);
        float lines = 1.0 - smoothstep(0.3, 0.9, fwidth(g.x) + fwidth(g.y));
        pave *= 1.0 - 0.1 * smoothstep(0.47, 0.49, max(tile.x, tile.y)) * lines;
        float bays = step(fract(g.x / 2.6), 0.07) * step(fract(g.y / 17.0), 0.32) * step(0.5, hash12(floor(g / vec2(52.0, 17.0))));
        pave = mix(pave, vec3(0.6, 0.6, 0.57), bays * lines * 0.5);
        pave = mix(pave, vec3(0.3, 0.31, 0.33) * (0.85 + 0.3 * n1), gm.g);
        pave = mix(pave, vec3(0.36, 0.29, 0.24), gm.b * 0.6);
        vec3 grass = mix(vec3(0.045, 0.085, 0.03), vec3(0.095, 0.14, 0.05), vnoise(p * 0.03)) * (0.78 + 0.44 * vnoise(p * 0.45));
        float turf = smoothstep(0.34, 0.62, gm.r + (vnoise(p * 0.05) - 0.5) * 0.5);
        vec3 blockCol = mix(pave, grass, turf);
        float walk = (1.0 - smoothstep(ROAD * 0.5 + 3.6, ROAD * 0.5 + 4.2, roadD)) * smoothstep(10.0, 26.0, d) * inCity;
        vec2 slab = abs(fract(g / 1.5) - 0.5);
        vec3 walkCol = vec3(0.44, 0.43, 0.41) * (0.9 + 0.2 * n2) * (1.0 - 0.13 * smoothstep(0.44, 0.48, max(slab.x, slab.y)) * lines);
        // kerb stone along the carriageway
        walkCol = mix(walkCol, vec3(0.62, 0.61, 0.58), 1.0 - smoothstep(0.25, 0.25 + aw, abs(roadD - ROAD * 0.5 - 0.2)));
        blockCol = mix(blockCol, walkCol, walk);
        // footpaths wind through the parks; the airfield is mown grass with no paths
        float airfield = 1.0 - smoothstep(-10.0, 10.0, sdEll(p, vec2(5650.0, -2050.0), vec2(560.0, 1200.0)));
        float pathLine = (1.0 - smoothstep(0.012, 0.03, abs(vnoise(p * 0.011) - 0.5))) * (1.0 - airfield);
        vec3 parkCol = mix(grass * 1.12, vec3(0.46, 0.41, 0.33), pathLine * 0.85);
        parkCol = mix(parkCol, vec3(0.11, 0.14, 0.06) * (0.9 + 0.2 * vnoise(p * 0.02)), airfield);
        vec3 landA = mix(blockCol, parkCol, park);
        float crowns = vnoise(p * 0.11) * 0.6 + vnoise(p * 0.29) * 0.4;
        vec3 woods = mix(vec3(0.022, 0.05, 0.018), vec3(0.06, 0.1, 0.03), crowns) * (0.75 + 0.5 * vnoise(p * 0.004));
        woods = mix(woods, vec3(0.13, 0.15, 0.07), smoothstep(0.6, 0.7, fbm(p * 0.0011)) * 0.8); // clearings and fields
        landA = mix(woods, landA, inCity);
        // sea wall and beach along the shore
        landA = mix(landA, mix(vec3(0.45, 0.44, 0.42), vec3(0.55, 0.5, 0.4), park), (1.0 - smoothstep(4.0, 7.0, d)));

        // road surface: asphalt, centre line, lane dashes, zebra crossings before each junction
        vec3 asphalt = vec3(0.07, 0.072, 0.08) * (0.8 + 0.4 * n2) * (0.9 + 0.2 * n1);
        asphalt *= 1.0 - 0.22 * smoothstep(0.62, 0.7, vnoise(g * 0.045 + 31.0));            // resurfaced patches
        asphalt *= 1.0 + 0.16 * (1.0 - smoothstep(0.5, 1.3, abs(abs(roadD - 4.5) - 2.2)));   // lanes polished by tyres
        float junction = 1.0 - smoothstep(ROAD * 0.5 - 0.5, ROAD * 0.5 + 0.5, other);
        float centre = 1.0 - smoothstep(0.14, 0.14 + aw, roadD);
        float dashes = (1.0 - smoothstep(0.1, 0.1 + aw, abs(roadD - 4.4))) * step(fract(along / 10.0), 0.4);
        float zebra = smoothstep(ROAD * 0.5 + 1.2, ROAD * 0.5 + 1.6, other) * (1.0 - smoothstep(ROAD * 0.5 + 4.8, ROAD * 0.5 + 5.2, other)) * step(fract(roadD / 1.3), 0.5);
        // keep left: on a north-south street the west half runs north, on an east-west one the north half runs east
        float dir = ns ? -side : side;
        float u = along * dir;                                   // metres along the direction of travel
        float toJunction = BLOCK * 0.5 - mod(u, BLOCK);          // distance to the centre of the crossing road ahead
        float stopLine = 1.0 - smoothstep(0.22, 0.22 + aw, abs(toJunction - ${STOP_LINE.toFixed(2)}));
        float edgeLine = 1.0 - smoothstep(0.08, 0.08 + aw, abs(roadD - (ROAD * 0.5 - 0.45)));
        float mark = max((centre + dashes + edgeLine * 0.6) * (1.0 - junction), max(zebra, stopLine * (1.0 - junction))) * (1.0 - smoothstep(0.25, 0.7, fine));
        asphalt = mix(asphalt, vec3(0.62, 0.62, 0.58), mark * 0.85);
        // every third street is an avenue with a planted strip down the middle
        float avenue = step(mod(ns ? floor(b.x + 0.5) : floor(b.y + 0.5), 3.0), 0.5);
        float median = avenue * (1.0 - smoothstep(0.9, 0.9 + aw, roadD)) * (1.0 - smoothstep(ROAD * 0.5 + 5.0, ROAD * 0.5 + 6.0, 0.0) ) * smoothstep(ROAD * 0.5 + 5.5, ROAD * 0.5 + 6.5, other);
        asphalt = mix(asphalt, grass * 1.15, median * (1.0 - smoothstep(0.4, 0.9, fine)));
        asphalt = mix(asphalt, vec3(0.55, 0.54, 0.51), avenue * (1.0 - smoothstep(0.16, 0.16 + aw, abs(roadD - 1.0))) * smoothstep(ROAD * 0.5 + 5.5, ROAD * 0.5 + 6.5, other) * (1.0 - smoothstep(0.25, 0.7, fine)));

        // traffic: two lanes each way, moving a block at a time with the signals (traffic.ts has the rules).
        // Far off a car is a painted box by day and a pair of lights at dusk; around the camera real 3D
        // vehicles take over (street.ts) and nothing is painted.
        float laneI = step(4.4, roadD);
        float laneC = 2.2 + 4.3 * laneI;
        float lid = roadId * 4.0 + laneI * 2.0 + step(side, 0.0);
        float cu = (u - (ns ? uFlow.x : uFlow.y) - ${FRONT0.toFixed(2)}) / ${SLOT.toFixed(2)};
        float carN = floor(cu) + 1.0;                 // the car whose nose is next ahead of this spot
        float back = carN - cu;                       // slots from that nose back to here
        float has = step(hash12(vec2(carN, lid)), ${BUSY.toFixed(2)}) * (1.0 - step(abs(mod(carN, 4.0) - 2.0), 0.5));
        float hasBehind = step(hash12(vec2(carN - 1.0, lid)), ${BUSY.toFixed(2)}) * (1.0 - step(abs(mod(carN - 1.0, 4.0) - 2.0), 0.5));
        float inLane = 1.0 - smoothstep(0.85, 1.0, abs(roadD - laneC));
        float carBody = has * step(back, 0.165) * inLane;
        float paint = hash12(vec2(carN, lid + 7.0));
        vec3 carA = paint < 0.4 ? vec3(0.7, 0.7, 0.7) : paint < 0.62 ? vec3(0.06, 0.06, 0.07) : paint < 0.8 ? vec3(0.34, 0.36, 0.4) : paint < 0.9 ? vec3(0.45, 0.07, 0.05) : vec3(0.08, 0.16, 0.42);
        vec2 gcam = cameraPosition.xz + warp(cameraPosition.xz);
        float pool = uPool * (1.0 - smoothstep(${(POOL - 40).toFixed(1)}, ${POOL.toFixed(1)}, max(abs(g.x - gcam.x), abs(g.y - gcam.y))));
        asphalt = mix(asphalt, carA, carBody * uDay * (1.0 - smoothstep(0.3, 0.8, fine)) * (1.0 - pool));
        landA = mix(landA, asphalt, road);

        vec3 landCol = landA * (amb * ao + sunL) * mix(1.0, 2.4, uNight);

        // --- dusk only: street lamps, head and tail lights, promenade lights
        vec3 lampCol = vec3(1.0, 0.6, 0.26);
        float cell = abs(fract(along / 27.5) - 0.5) * 27.5;
        float kerb = roadD - (ROAD * 0.5 - 1.5);
        float lamp = exp(-(cell * cell + kerb * kerb) / 22.0);
        // a car throws white light on the road ahead of it and a little red behind
        float spread = exp(-pow(roadD - laneC, 2.0) / 1.6);
        float aheadL = hasBehind * pow(1.0 - smoothstep(0.0, 0.42, 1.0 - back), 2.0);
        float behindL = has * smoothstep(0.34, 0.165, back) * step(0.165, back);
        float self = has * smoothstep(0.0, 0.03, back) * smoothstep(0.2, 0.12, back);   // far off, the car itself is the light
        vec3 beamCol = side > 0.0 ? vec3(1.0, 0.1, 0.04) : vec3(1.0, 0.9, 0.75);
        vec3 glowNear = lampCol * lamp * 1.1 + (vec3(1.0, 0.92, 0.78) * aheadL * 0.5 + vec3(1.0, 0.08, 0.03) * behindL * 0.3 + beamCol * self * 1.6) * spread * (1.0 - pool);
        vec3 glowFar = lampCol * 0.045 + vec3(0.9, 0.4, 0.25) * 0.012;
        landCol += mix(glowNear, glowFar, fine) * road * night;
        // lit windows and shopfronts spill a little warm light onto the ground at their feet
        landCol += landA * vec3(1.0, 0.72, 0.46) * 0.55 * clamp(near / 220.0, 0.0, 1.0) * night;
        landCol += vec3(1.0, 0.7, 0.4) * 0.05 * step(0.93, vnoise(p * 0.09)) * park * night; // park path lights
        float prom = exp(-pow(d - 7.0, 2.0) / 9.0) * mix(0.35 + 0.65 * step(0.5, fract((p.x + p.y) / 11.0)), 0.6, fine);
        landCol += vec3(1.0, 0.68, 0.36) * prom * 0.8 * night;

        vec3 col = mix(water, landCol, land);
        col = mix(col, hazeColor(-V), fogAmount(dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/* ---------- buildings ---------- */

/**
 * Facade and roof shader. Windows are computed from each wall's size in metres, so a floor is the same
 * height on a shophouse and on a 280 m tower. `kind` (see KIND in layout.ts) picks the facade: office,
 * curtain-wall glass, flats, shophouse, shed, container stack, plain, or 7 for a tiled gable roof.
 * Works for instanced geometry (per-instance aColor/aSeed/aKind) and for single meshes (uniforms).
 */
export function makeBuildingMaterial(single?: { color: [number, number, number]; seed: number; kind: number }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...SHARED,
      uColor: { value: new THREE.Vector3(...(single?.color ?? [0.3, 0.3, 0.3])) },
      uSeed: { value: single?.seed ?? 0 },
      uKind: { value: single?.kind ?? 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSeed;
      attribute float aKind;
      uniform vec3 uColor;
      uniform float uSeed;
      uniform float uKind;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vFace;
      varying vec3 vColor;
      varying vec3 vLocal;
      varying vec3 vSize;
      varying float vSeed;
      varying float vKind;
      void main() {
        mat4 m = modelMatrix;
        vColor = uColor;
        vSeed = uSeed;
        vKind = uKind;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
          vColor = aColor;
          vSeed = aSeed;
          vKind = aKind;
        #endif
        vec4 wp = m * vec4(position, 1.0);
        vWorld = wp.xyz;
        vSize = vec3(length(m[0].xyz), length(m[1].xyz), length(m[2].xyz));
        // normals must survive the box's stretch: divide by the scale twice (inverse transpose)
        vNormal = normalize(mat3(m) * (normal / (vSize * vSize)));
        vFace = normal;                            // which side of the box, whatever way it is turned
        vLocal = position * vSize;                 // metres from the box centre (y from the base)
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vFace;
      varying vec3 vColor;
      varying vec3 vLocal;
      varying vec3 vSize;
      varying float vSeed;
      varying float vKind;
      ${NOISE}
      ${WORLD}

      vec3 boxColor(float h) {
        return h < 0.16 ? vec3(0.5, 0.1, 0.07) : h < 0.34 ? vec3(0.08, 0.2, 0.42) : h < 0.5 ? vec3(0.1, 0.32, 0.2) : h < 0.64 ? vec3(0.58, 0.3, 0.06) : h < 0.8 ? vec3(0.5, 0.5, 0.5) : h < 0.9 ? vec3(0.55, 0.5, 0.12) : vec3(0.16, 0.17, 0.2);
      }

      void main() {
        vec3 n = normalize(vNormal);
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        int kind = int(vKind + 0.5);
        float id0 = floor(vSeed);
        float night = 1.0 - uDay;

        bool top = vFace.y > 0.5;
        // walls look the shadow up a few metres out from the facade, clear of the building's own footprint;
        // roofs test a little above themselves
        float sh = (top || kind == 7) ? sunShadow(vWorld.xz, vWorld.y + 1.6) : sunShadow(vWorld.xz + normalize(n.xz + 1e-5) * 6.5, vWorld.y);
        float cs = cloudShade(vWorld.xz);
        vec3 sunL = sunRadiance() * max(dot(n, uSun), 0.0) * sh * cs;
        vec3 amb = ambient(n);
        // walls get less sky where something taller stands across the street, and at their own feet
        vec2 out2 = normalize(n.xz + 1e-5);
        float canyon = top ? 0.0 : clamp((heightAt(vWorld.xz + out2 * 16.0) - vWorld.y) / 45.0, 0.0, 1.0);
        float aoW = top ? 1.0 : (1.0 - 0.45 * canyon) * (0.78 + 0.22 * smoothstep(0.0, 5.0, vWorld.y));
        amb *= aoW;
        // daylight thrown back up by the street
        amb += vec3(0.1, 0.095, 0.085) * uDay * max(uSun.y, 0.0) * (1.0 - smoothstep(0.0, 40.0, vWorld.y)) * float(!top);
        vec3 emit = vec3(0.0);
        vec3 albedo;

        if (kind == 7) {
          // tiled or sheet-metal gable roof: courses run along the slope
          float course = fract((abs(vFace.z) > 0.2 ? vLocal.y : vLocal.x) / 0.9);
          float fade = clamp(1.0 - fwidth(vLocal.y) * 1.2, 0.0, 1.0);
          albedo = vColor * (0.8 + 0.2 * hash12(vec2(id0, 4.0)) + (course - 0.5) * 0.16 * fade) * (0.82 + 0.3 * vnoise(vWorld.xz * 0.4));
          if (abs(vFace.x) > 0.9) albedo = vec3(0.6, 0.57, 0.5); // gable end wall
        } else if (top) {
          vec2 q = abs(vLocal.xz) / (vSize.xz * 0.5);
          float rim = smoothstep(0.9, 0.955, max(q.x, q.y));
          if (kind == 5) {
            // tops of the containers, each its own colour
            vec2 c = floor(vec2(vLocal.x / 6.1, vLocal.z / 2.45));
            vec2 f = fract(vec2(vLocal.x / 6.1, vLocal.z / 2.45));
            float gapLine = step(0.04, f.x) * step(0.06, f.y);
            albedo = boxColor(hash12(c + id0)) * (0.5 + 0.5 * gapLine);
          } else if (kind == 4) {
            // sheet-metal roof with ribs and roof lights
            float rib = 0.92 + 0.08 * step(0.5, fract(vLocal.x / 1.4));
            float sky = step(0.9, fract(vLocal.z / 9.0)) * step(0.3, fract(vLocal.x / 14.0));
            float sheet = hash12(vec2(id0, 6.0));
            vec3 metal = sheet < 0.5 ? vColor * 0.62 : sheet < 0.75 ? vec3(0.2, 0.28, 0.36) : sheet < 0.9 ? vec3(0.36, 0.2, 0.15) : vec3(0.2, 0.3, 0.22);
            albedo = mix(metal * rib * (0.85 + 0.3 * vnoise(vWorld.xz * 0.2)), vec3(0.6, 0.66, 0.68), sky * 0.6);
          } else {
            // flat roof: screed, a lighter parapet, and plant scattered over it
            vec2 cellP = vLocal.xz / 7.0;
            vec2 cf = fract(cellP);
            float plant = step(0.72, hash12(floor(cellP) + id0)) * step(0.18, cf.x) * step(cf.x, 0.82) * step(0.18, cf.y) * step(cf.y, 0.82) * (1.0 - rim) * step(max(q.x, q.y), 0.8);
            float dk = hash12(vec2(id0, 6.0));
            vec3 deck = (dk < 0.25 ? vec3(0.1, 0.1, 0.11) : dk < 0.6 ? vec3(0.22, 0.22, 0.23) : dk < 0.88 ? vec3(0.34, 0.33, 0.31) : vec3(0.3, 0.2, 0.16)) * (0.85 + 0.3 * vnoise(vWorld.xz * 0.35));
            deck = mix(deck, vec3(0.08, 0.14, 0.06), step(0.93, hash12(vec2(id0, 8.0))) * (1.0 - rim) * 0.85); // a few green roofs
            albedo = mix(mix(deck, vec3(0.5, 0.51, 0.52), plant), vec3(0.5, 0.49, 0.47), rim);
          }
        } else {
          bool xFace = abs(vFace.x) > 0.5;
          float u = (xFace ? vLocal.z : vLocal.x) + (xFace ? vSize.z : vSize.x) * 0.5;
          float y = vLocal.y;
          float grime = 0.9 + 0.14 * vnoise(vec2(u * 0.08 + id0, y * 0.02)) - 0.1 * smoothstep(8.0, 0.0, y);

          if (kind == 6 || kind == 4) {
            // plain wall; sheds get vertical cladding ribs
            float rib = kind == 4 ? 0.94 + 0.06 * step(0.5, fract(u / 1.1)) : 1.0;
            albedo = vColor * rib * grime;
          } else if (kind == 5) {
            vec2 c = floor(vec2(u / 6.1, y / 2.6));
            vec2 f = fract(vec2(u / 6.1, y / 2.6));
            float ribs = 0.9 + 0.1 * step(0.5, fract(u / 0.28));
            float fade = clamp(1.0 - fwidth(u) * 2.0, 0.0, 1.0);
            albedo = boxColor(hash12(c + id0 + (xFace ? 0.0 : 31.0))) * mix(1.0, ribs, fade) * (0.55 + 0.45 * step(0.03, f.x) * step(0.05, f.y));
          } else {
            // windowed facades
            float floorH = kind == 1 ? 4.1 : kind == 2 ? 2.9 : kind == 3 ? 3.4 : 3.6;
            float bayW = kind == 1 ? 1.5 + 1.1 * hash12(vec2(id0, 5.0)) : kind == 2 ? 3.1 : kind == 3 ? 2.3 : 3.3;
            vec2 mlo = kind == 1 ? vec2(0.07, 0.1) : kind == 2 ? vec2(0.12, 0.4) : kind == 3 ? vec2(0.24, 0.3) : vec2(0.23, 0.3);
            vec2 mhi = kind == 1 ? vec2(0.07, 0.1) : kind == 2 ? vec2(0.12, 0.08) : kind == 3 ? vec2(0.24, 0.18) : vec2(0.23, 0.3);
            // offices and towers come in a few facade types: punched windows, ribbon windows, or tall strips
            float style = hash12(vec2(id0, 29.0));
            if (kind == 0 && style > 0.62) { mlo = vec2(0.0, 0.36); mhi = vec2(0.0, 0.14); }
            else if (kind == 0 && style < 0.2) { mlo = vec2(0.3, 0.02); mhi = vec2(0.3, 0.02); bayW = 2.6; }
            else if (kind == 1 && style > 0.6) { mlo = vec2(0.02, 0.27); mhi = vec2(0.02, 0.03); }
            else if (kind == 1 && style < 0.22) { mlo = vec2(0.16, 0.0); mhi = vec2(0.16, 0.0); bayW = 2.2; }
            vec2 g = vec2(u / bayW, y / floorH);
            vec2 cellId = floor(g);
            vec2 f = fract(g);
            vec2 aa = clamp(fwidth(g) * 1.2, 0.001, 0.5);
            float win = smoothstep(mlo.x - aa.x, mlo.x + aa.x, f.x) * smoothstep(mhi.x - aa.x, mhi.x + aa.x, 1.0 - f.x)
                      * smoothstep(mlo.y - aa.y, mlo.y + aa.y, f.y) * smoothstep(mhi.y - aa.y, mhi.y + aa.y, 1.0 - f.y);
            float cover = (1.0 - mlo.x - mhi.x) * (1.0 - mlo.y - mhi.y);
            float r = hash12(cellId + id0 * 0.37);
            // far away a window is smaller than a pixel: the detail below fades out with it
            float farAway = smoothstep(0.3, 0.85, max(fwidth(g.x), fwidth(g.y)));
            float close = 1.0 - farAway;
            // where we are inside the window opening, 0..1 both ways
            vec2 wq = clamp((f - mlo) / max(1.0 - mlo - mhi, vec2(0.05)), 0.0, 1.0);
            float wallW = xFace ? vSize.z : vSize.x;

            // the wall between the windows
            vec3 wall = vColor * grime;
            wall *= 0.9 + 0.14 * vnoise(vec2(u * 0.7 + id0 * 3.0, y * 0.035));        // rain streaks
            wall *= 0.86 + 0.14 * smoothstep(0.0, 0.9, min(u, wallW - u));             // corners catch less light
            if (kind == 2) {
              // flats: painted bands, a coloured stripe up each stair core, pale slab edges at every floor
              float hue = hash12(vec2(id0, 13.0));
              vec3 accent = hue < 0.3 ? vec3(0.5, 0.2, 0.12) : hue < 0.55 ? vec3(0.12, 0.3, 0.42) : hue < 0.8 ? vec3(0.2, 0.36, 0.2) : vec3(0.55, 0.42, 0.14);
              float stripe = step(mod(cellId.x + floor(hue * 7.0), 7.0), 0.5);
              wall = mix(wall, accent, stripe * 0.85);
              wall *= 0.94 + 0.06 * step(0.5, f.y);
              wall = mix(wall, vec3(0.8, 0.79, 0.76), 0.4 * step(0.93, f.y) * close);
            } else if (kind == 3) {
              // shophouses: each bay painted its own pastel, shopfront shade at street level
              float bay = hash12(vec2(floor(u / 4.6), id0));
              wall = mix(wall, wall * mix(vec3(1.0, 0.86, 0.72), vec3(0.78, 0.95, 0.92), bay), 0.6);
            } else if (kind == 0) {
              wall *= 0.93 + 0.07 * step(0.75, f.y); // spandrel line under each window band
            }
            if (kind == 0 || kind == 2) {
              // panel joints
              float joint = max(1.0 - smoothstep(0.0, aa.x * 1.5 + 0.012, min(f.x, 1.0 - f.x)), 1.0 - smoothstep(0.0, aa.y * 1.5 + 0.02, min(f.y, 1.0 - f.y)));
              wall *= 1.0 - 0.12 * joint * close;
            }

            // glass by day. No pane sits perfectly true, so a glazed wall breaks its reflection into facets.
            vec3 tx = normalize(vec3(n.z, 0.0, -n.x) + 1e-5);
            vec2 tilt = vec2(hash12(cellId * 1.31 + id0), hash12(cellId.yx * 1.77 + id0 + 9.0)) - 0.5;
            vec3 nG = normalize(n + (tx * tilt.x + vec3(0.0, 1.0, 0.0) * tilt.y) * (kind == 1 ? 0.05 : 0.025) * close);
            vec3 R = reflect(-V, nG);
            float fres = 0.24 + 0.76 * pow(1.0 - max(dot(V, n), 0.0), 3.0);
            // what a pane mirrors: the sky, or the block across the street when that stands in the way
            float flatR = max(length(R.xz), 1e-3);
            vec2 rd = R.xz / flatR;
            float slope = R.y / flatR;
            float blocked = max(
              smoothstep(-4.0, 6.0, heightAt(vWorld.xz + rd * 45.0) - (vWorld.y + slope * 45.0)),
              smoothstep(-4.0, 8.0, heightAt(vWorld.xz + rd * 130.0) - (vWorld.y + slope * 130.0)));
            vec3 skyR = R.y > 0.0 ? skyColor(R) : hazeColor(R);
            vec3 oppDay = vec3(0.3, 0.32, 0.35) * (ambient(-n) * 1.7 + sunRadiance() * 0.4 * max(dot(-n, uSun), 0.0));
            float spark = step(0.8, hash12(floor(vec2(dot(vWorld.xz, tx.xz) * 0.4 + rd.x * 37.0, (vWorld.y + slope * 60.0) * 0.3))));
            vec3 oppDusk = vec3(0.03, 0.035, 0.05) + vec3(1.0, 0.72, 0.42) * 0.55 * spark;
            vec3 seen = mix(skyR, mix(oppDusk, oppDay, uDay), blocked);
            seen = mix(seen, vec3(0.17, 0.17, 0.17) * (amb + sunRadiance() * 0.4), smoothstep(0.0, -0.3, R.y) * (1.0 - blocked)); // the street below
            float th = hash12(vec2(id0, 21.0));
            vec3 tintG = kind != 1 ? vec3(0.8) : th < 0.3 ? vec3(0.5, 0.68, 0.9) : th < 0.52 ? vec3(0.5, 0.78, 0.72) : th < 0.68 ? vec3(0.84, 0.7, 0.52) : th < 0.86 ? vec3(0.85, 0.88, 0.92) : vec3(0.42, 0.46, 0.52);
            vec3 glass = mix(vec3(0.02, 0.03, 0.04), seen * tintG, fres * (kind == 1 ? 0.92 : 0.6));
            glass = mix(glass, vec3(0.5, 0.48, 0.42) * (amb + sunL), step(0.84, r) * 0.6 * float(kind != 1)); // blinds
            if (kind == 3) {
              // timber shutters, mostly closed
              vec3 shutter = hash12(vec2(id0, 15.0)) < 0.5 ? vec3(0.1, 0.24, 0.2) : vec3(0.3, 0.2, 0.12);
              glass = mix(glass, shutter * (amb + sunL), step(r, 0.7));
            }
            glass += sunRadiance() * pow(max(dot(R, uSun), 0.0), 60.0) * 0.6 * sh * float(kind == 1); // sun flash on curtain walls
            // curtain walls: an opaque spandrel panel hides each floor slab
            float span = (kind == 1 && style >= 0.22 && style <= 0.6) ? 1.0 - smoothstep(0.22, 0.22 + aa.y * 2.0, wq.y) : 0.0;
            glass = mix(glass, tintG * vColor * 1.5 * (amb + sunL) + seen * 0.12, span);
            // punched windows sit back in the wall: the head and the jambs shade the glass
            float head = 1.0 - smoothstep(0.0, kind == 2 ? 0.32 : 0.15, 1.0 - wq.y);
            float jamb = 1.0 - smoothstep(0.0, 0.1, min(wq.x, 1.0 - wq.x));
            float recess = kind == 1 ? 0.0 : max(head * (0.4 + 0.5 * max(uSun.y, 0.0)), jamb * 0.3);
            glass *= 1.0 - 0.75 * recess * close;

            // lit windows at dusk: offices in runs of bays, homes one at a time
            float litRatio = mix(0.05, 0.3, hash12(vec2(id0, 9.0))) * (kind == 2 ? 1.5 : 1.0);
            float run = kind == 1 ? 2.0 + floor(4.0 * hash12(vec2(id0, 17.0))) : 1.0;
            float rr = hash12(vec2(floor(cellId.x / run), cellId.y) + id0 * 0.37);
            float wholeFloor = step(0.93, hash12(vec2(cellId.y, id0))) * float(kind < 2);
            float lit = max(step(1.0 - litRatio, rr), wholeFloor * step(0.2, rr)) * night * (1.0 - span);
            vec3 lightCol = mix(vec3(1.0, 0.7, 0.4), vec3(0.72, 0.84, 1.0), step(0.55, hash12(vec2(id0, 2.0)) + (rr - 0.5) * 0.25));
            float bright = 0.3 + 0.9 * hash12(vec2(floor(cellId.x / run), cellId.y) * 1.7 + 3.1);
            // a lit room is brightest under its ceiling, and many have a blind part-way down
            float drawn = hash12(cellId * 2.3 + id0 + 5.0);
            float blind = step(1.0 - drawn * 0.6, wq.y) * step(0.45, drawn);
            float room = mix(1.0, mix(0.55, 1.2, wq.y) * (1.0 - 0.45 * blind), close);

             vec3 wallLit = wall * (amb + sunL) * mix(1.0, 2.4, uNight);
            vec3 pane = mix(glass, lightCol * bright * room, lit);
            vec3 average = mix(wallLit, mix(glass, lightCol * 0.88, (litRatio * 0.9 + 0.05) * night), cover);
            vec3 face = mix(mix(wallLit, pane, win), average, farAway);
            // a solid band crowns the block: parapet or plant floor
            face = mix(face, wallLit * 0.9, step(vSize.y - (kind == 3 ? 0.8 : 3.2), y) * float(vSize.y > 12.0));
            // street level: shopfronts between piers, under an awning. In shade by day, lit bay by bay at dusk.
            float street = step(vWorld.y, 4.4) * step(y, 4.4) * float(kind != 2);
            float bayS = floor(u / 5.5), inBay = fract(u / 5.5);
            float pier = step(0.07, inBay) * step(inBay, 0.93);
            float awning = step(3.3, y);
            float ah = hash12(vec2(bayS, id0 + 4.0));
            vec3 awnCol = (ah < 0.3 ? vec3(0.42, 0.12, 0.09) : ah < 0.55 ? vec3(0.1, 0.24, 0.32) : ah < 0.75 ? vec3(0.5, 0.46, 0.38) : vec3(0.12, 0.26, 0.16)) * (amb + sunL);
            vec3 shopDay = mix(mix(wallLit, vec3(0.05, 0.055, 0.06) + seen * 0.14, pier * 0.85), awnCol, awning);
            float open = step(0.38, hash12(vec2(bayS, id0 + 3.0)));
            vec3 shopCol = mix(vec3(1.0, 0.74, 0.44), vec3(0.8, 0.9, 1.0), step(0.72, hash12(vec2(bayS, id0 + 8.0))));
            // a lit shop: glazing bars, a darker stall riser, brightest at eye level
            float bars = 0.75 + 0.25 * step(0.08, fract(u / 1.35));
            float display = bars * mix(0.45, 1.0, smoothstep(0.5, 1.4, y)) * (0.5 + 0.45 * ah);
            vec3 shopDusk = mix(wallLit, mix(vec3(0.03, 0.03, 0.04), shopCol * display, open), pier * (1.0 - awning));
            face = mix(face, mix(shopDusk, shopDay, uDay), street * mix(1.0, 0.75, farAway));
            // the flats stand on an open ground floor: dark between the columns
            face = mix(face, wallLit * mix(0.28, 1.0, step(0.82, fract(u / 6.2))), step(vWorld.y, 3.2) * step(y, 3.2) * float(kind == 2) * close);
            face += vec3(1.0, 0.68, 0.38) * 0.2 * smoothstep(9.0, 0.0, y) * step(vWorld.y, 9.5) * night;
            vec3 colW = mix(face, hazeColor(-V), fogAmount(dist));
            gl_FragColor = vec4(colW, 1.0);
            return;
          }
        }
         vec3 col = albedo * (amb + sunL) * mix(1.0, 2.4, uNight) + emit;
        col = mix(col, hazeColor(-V), fogAmount(dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/* ---------- trees ---------- */

/** Canopy blobs: one low-polygon ball per tree, shaded as a soft, mottled volume. */
export function makeTreeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: SHARED,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vUp;
      varying float vTop;
      varying float vSeed;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vTop = instanceMatrix[3].y + length(instanceMatrix[1].xyz);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(instanceMatrix) * normalize(position));
        vUp = position.y;
        vSeed = aSeed;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vUp;
      varying float vTop;
      varying float vSeed;
      ${NOISE}
      ${WORLD}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        // leaf clumps: break the ball's smooth shading up, less so far away
        float clump = vnoise(vWorld.xz * 0.9 + vWorld.y * 0.7) - 0.5;
        float detail = clamp(1.0 - dist / 1400.0, 0.0, 1.0);
        // species differ: from deep rain-tree green to the yellower green of young leaves
        vec3 leaf = vSeed < 0.55 ? mix(vec3(0.06, 0.13, 0.04), vec3(0.1, 0.19, 0.055), vSeed / 0.55) : mix(vec3(0.11, 0.19, 0.05), vec3(0.16, 0.22, 0.07), (vSeed - 0.55) / 0.45);
        float fleck = vnoise(vWorld.xz * 3.1 + vWorld.y * 2.3) - 0.5;
        vec3 albedo = leaf * (1.0 + clump * 0.75 * detail + fleck * 0.5 * detail * detail);
        albedo = mix(vec3(0.16, 0.12, 0.09), albedo, smoothstep(-0.62, -0.5, vUp)); // the stem
        float wrap = max((dot(n, uSun) + 0.45) / 1.45, 0.0);
        // a tree is in the shadow map itself, so test from just above its crown
        float sh = sunShadow(vWorld.xz, vTop + 1.5);
        float cs = cloudShade(vWorld.xz);
        vec3 light = ambient(n) * mix(0.75, 1.7, smoothstep(-0.6, 0.7, vUp)) + sunRadiance() * wrap * sh * cs * mix(0.7, 1.0, uDay);
        // leaves glow when the sun stands behind them
        light += sunRadiance() * vec3(0.7, 1.0, 0.3) * 0.3 * uDay * pow(max(dot(-toCam / dist, uSun), 0.0), 3.0) * sh * cs;
        vec3 col = albedo * light;
        col = mix(col, hazeColor(-toCam / dist), fogAmount(dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
