// Stand-in Marina Bay: a simplified map in metres, used where real 3D tiles are not available.
// Axes: +X east, +Z south, +Y up. North is -Z. Origin is the middle of the bay.
// The same shapes drive the ground shader (as GLSL) and building placement (as JS),
// so coastlines and blocks always agree.

export const BLOCK = 110; // city block pitch, road centre to road centre
export const ROAD = 18; // road width
export const FOG_DENSITY = 0.00014;

const unit = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};
/** Dusk sun: low in the west-south-west, so the CBD skyline sits against the sunset. High enough to rake the facades with warm light. */
export const SUN_DUSK = unit(-0.92, 0.125, 0.38);
/** Day sun: mid-afternoon from the south-west, high enough for clear shadows, low enough to model the facades. */
export const SUN_DAY = unit(-0.58, 0.66, 0.5);

/** Where the flyer appears: over the bay, facing west toward the CBD. */
export const START = { pos: [250, 150, 120] as [number, number, number], yaw: -Math.PI / 2 };

type Ell = { t: 'ell'; c: [number, number]; r: [number, number] };
type Cap = { t: 'cap'; a: [number, number]; b: [number, number]; r: number };

/** Water bodies. Negative distance means "in the water". Overlapping shapes make one outline. */
const WATERS: (Ell | Cap)[] = [
  { t: 'ell', c: [0, 0], r: [330, 470] }, // Marina Bay
  { t: 'ell', c: [-70, 290], r: [300, 250] }, // the bay's broad southern end
  { t: 'ell', c: [60, -270], r: [300, 170] }, // and its mouth toward the channel
  { t: 'cap', a: [200, -305], b: [1500, -305], r: 122 }, // Marina Channel, north of the hotel towers
  { t: 'ell', c: [1700, -700], r: [430, 400] }, // Kallang Basin
  { t: 'ell', c: [1500, -960], r: [260, 200] }, // the basin's north-west arm
  { t: 'cap', a: [1500, -305], b: [2750, 260], r: 140 }, // channel out to sea
  { t: 'cap', a: [-300, -150], b: [-620, -330], r: 38 }, // Singapore River, winding inland
  { t: 'cap', a: [-620, -330], b: [-1010, -250], r: 34 },
  { t: 'cap', a: [-1010, -250], b: [-1500, -520], r: 30 },
  { t: 'cap', a: [-1500, -520], b: [-2300, -430], r: 24 },
  { t: 'cap', a: [1650, -1000], b: [1380, -1700], r: 55 }, // Kallang River
  { t: 'cap', a: [1380, -1700], b: [1560, -2600], r: 46 },
  { t: 'cap', a: [1560, -2600], b: [1300, -3600], r: 36 },
  { t: 'cap', a: [1900, -1060], b: [2450, -1750], r: 40 }, // Geylang River
];
/** Open sea: everything where n . p > k. */
const SEA = { n: [0.35, 0.94] as [number, number], k: 1250 };
/** Islands off the south coast: wooded, no streets. */
const ISLANDS: Ell[] = [
  { t: 'ell', c: [760, 1820], r: [560, 200] },
  { t: 'ell', c: [2420, 1180], r: [230, 120] },
  { t: 'ell', c: [-420, 2260], r: [170, 110] },
];

/** Parks: no roads, no buildings. Negative distance means "in the park". */
const PARKS: Ell[] = [
  ...ISLANDS.map((s): Ell => ({ t: 'ell', c: s.c, r: [s.r[0] + 60, s.r[1] + 60] })),
  { t: 'ell', c: [980, 180], r: [330, 300] }, // Gardens by the Bay
  { t: 'ell', c: [-560, -640], r: [230, 170] }, // Padang
  { t: 'ell', c: [2330, -760], r: [300, 290] }, // stadium precinct
  { t: 'ell', c: [5650, -2050], r: [560, 1200] }, // airfield: grass, runways and terminals, no city blocks
];

const sdEll = (x: number, z: number, s: Ell) => (Math.hypot((x - s.c[0]) / s.r[0], (z - s.c[1]) / s.r[1]) - 1) * Math.min(s.r[0], s.r[1]);
const sdCap = (x: number, z: number, s: Cap) => {
  const pax = x - s.a[0], paz = z - s.a[1], bax = s.b[0] - s.a[0], baz = s.b[1] - s.a[1];
  const h = Math.min(1, Math.max(0, (pax * bax + paz * baz) / (bax * bax + baz * baz)));
  return Math.hypot(pax - bax * h, paz - baz * h) - s.r;
};
const sd = (x: number, z: number, s: Ell | Cap) => (s.t === 'ell' ? sdEll(x, z, s) : sdCap(x, z, s));

/* The shapes above are drawn with a ruler and compasses. Real shores are not: before a point is tested against
   them it is nudged by a few slow waves, which bends every shoreline a little. The nudge fades out around the
   engineered edges that landmarks stand on (the bay front, the container quay). Written as sums of sines so
   the exact same function exists in JS and in GLSL. */
const COAST = {
  x: [[38, 0, 0.0041, 1.3], [17, 0.0087, 0.0061, 4.1], [7, -0.017, 0.023, 2.2]], // amplitude, kx, kz, phase
  z: [[110, 0.0017, 0.0004, 0.7], [32, 0.0046, 0, 0.4], [16, -0.0052, 0.0093, 2.9], [7, 0.021, 0.019, 5.3]],
};
/** Where the shore keeps its drawn line: [centre x, centre z, inner radius, outer radius]. */
const FIRM: [number, number, number, number][] = [
  [520, -160, 520, 1300], // Marina Bay, the channel bridge, the wheel
  [-1775, 1790, 850, 1500], // container quay
];
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function coast(x: number, z: number): [number, number] {
  let k = 1;
  for (const f of FIRM) k = Math.min(k, 0.22 + 0.78 * smooth(f[2], f[3], Math.hypot(x - f[0], z - f[1])));
  let dx = 0, dz = 0;
  for (const w of COAST.x) dx += w[0] * Math.sin(x * w[1] + z * w[2] + w[3]);
  for (const w of COAST.z) dz += w[0] * Math.sin(x * w[1] + z * w[2] + w[3]);
  return [dx * k, dz * k];
}

/** Distance to the nearest shore: positive on land, negative in water. */
export function landSdf(x0: number, z0: number) {
  const c = coast(x0, z0);
  const x = x0 + c[0], z = z0 + c[1];
  let d = SEA.k - (SEA.n[0] * x + SEA.n[1] * z);
  for (const s of ISLANDS) d = Math.max(d, -sdEll(x, z, s));
  for (const w of WATERS) d = Math.min(d, sd(x, z, w));
  return d;
}

export function parkSdf(x: number, z: number) {
  let d = Infinity;
  for (const p of PARKS) d = Math.min(d, sdEll(x, z, p));
  return d;
}

const f = (n: number) => n.toFixed(1);
/** A float literal GLSL accepts, at full precision. */
const g = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const glslShape = (s: Ell | Cap) =>
  s.t === 'ell'
    ? `sdEll(p, vec2(${f(s.c[0])}, ${f(s.c[1])}), vec2(${f(s.r[0])}, ${f(s.r[1])}))`
    : `sdCap(p, vec2(${f(s.a[0])}, ${f(s.a[1])}), vec2(${f(s.b[0])}, ${f(s.b[1])}), ${f(s.r)})`;

/** The same map, generated as GLSL for the ground shader. */
export const GLSL_MAP = /* glsl */ `
float sdEll(vec2 p, vec2 c, vec2 r) { return (length((p - c) / r) - 1.0) * min(r.x, r.y); }
float sdCap(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
vec2 coast(vec2 p) {
  float k = 1.0;
${FIRM.map((c) => `  k = min(k, 0.22 + 0.78 * smoothstep(${f(c[2])}, ${f(c[3])}, length(p - vec2(${f(c[0])}, ${f(c[1])}))));`).join('\n')}
  return k * vec2(
    ${COAST.x.map((w) => `${f(w[0])} * sin(p.x * ${g(w[1])} + p.y * ${g(w[2])} + ${g(w[3])})`).join(' + ')},
    ${COAST.z.map((w) => `${f(w[0])} * sin(p.x * ${g(w[1])} + p.y * ${g(w[2])} + ${g(w[3])})`).join(' + ')});
}
float landSdf(vec2 p0) {
  vec2 p = p0 + coast(p0);
  float d = ${f(SEA.k)} - dot(p, vec2(${SEA.n[0]}, ${SEA.n[1]}));
${ISLANDS.map((w) => `  d = max(d, -${glslShape(w)});`).join('\n')}
${WATERS.map((w) => `  d = min(d, ${glslShape(w)});`).join('\n')}
  return d;
}
float parkSdf(vec2 p) {
  float d = 1e6;
${PARKS.map((w) => `  d = min(d, ${glslShape(w)});`).join('\n')}
  return d;
}
`;

/* ---------- street grid ---------- */

// The street grid is laid out in "grid space" and bent into the world, so streets curve the way they do in
// a real city instead of running dead straight. grid = world + warp(world). Coast, parks and landmarks stay
// in world space. The same warp is emitted as GLSL for the ground shader.
const WARP = { ax: [120, 0.0011, 0.6, 55, 0.0027, 0.0009, 2.1], az: [110, 0.001, 1.9, 50, 0.0024, -0.0011, 0.4] };

export function warp(x: number, z: number): [number, number] {
  const a = WARP.ax, b = WARP.az;
  return [a[0] * Math.sin(z * a[1] + a[2]) + a[3] * Math.sin(z * a[4] + x * a[5] + a[6]), b[0] * Math.sin(x * b[1] + b[2]) + b[3] * Math.sin(x * b[4] + z * b[5] + b[6])];
}

export const GLSL_WARP = /* glsl */ `
vec2 warp(vec2 p) {
  return vec2(
    ${WARP.ax[0].toFixed(1)} * sin(p.y * ${WARP.ax[1]} + ${WARP.ax[2]}) + ${WARP.ax[3].toFixed(1)} * sin(p.y * ${WARP.ax[4]} + p.x * ${WARP.ax[5]} + ${WARP.ax[6]}),
    ${WARP.az[0].toFixed(1)} * sin(p.x * ${WARP.az[1]} + ${WARP.az[2]}) + ${WARP.az[3].toFixed(1)} * sin(p.x * ${WARP.az[4]} + p.y * ${WARP.az[5]} + ${WARP.az[6]}));
}
`;

/** Grid position -> world position, and the angle (about Y) the grid is turned by at that spot. */
export function toWorld(u: number, v: number): [number, number, number] {
  let x = u, z = v;
  for (let i = 0; i < 8; i++) {
    const w = warp(x, z);
    x = u - w[0];
    z = v - w[1];
  }
  // the grid's x axis in the world: solve (I + dW) d = (1, 0) with a numeric Jacobian
  const e = 1;
  const w0 = warp(x, z), wx = warp(x + e, z), wz = warp(x, z + e);
  const a = 1 + (wx[0] - w0[0]) / e, b = (wz[0] - w0[0]) / e, c = (wx[1] - w0[1]) / e, d = 1 + (wz[1] - w0[1]) / e;
  const det = a * d - b * c;
  return [x, z, Math.atan2(c / det, d / det)]; // three.js: rotation.y = t turns +X toward (cos t, 0, -sin t)
}

/**
 * The same as toWorld, for callers that place hundreds of things every frame: two Newton steps on the
 * analytic Jacobian instead of eight fixed-point rounds, and no arrays made. Writes x, z and the unit
 * vectors the grid's +x and +z axes point along in the world: out = [x, z, ax.x, ax.z, az.x, az.z].
 */
export function gridToWorld(u: number, v: number, out: Float64Array | number[]) {
  const a = WARP.ax, b = WARP.az;
  let x = u - (a[0] * Math.sin(v * a[1] + a[2]) + a[3] * Math.sin(v * a[4] + u * a[5] + a[6]));
  let z = v - (b[0] * Math.sin(u * b[1] + b[2]) + b[3] * Math.sin(u * b[4] + v * b[5] + b[6]));
  let j00 = 1, j01 = 0, j10 = 0, j11 = 1, det = 1;
  for (let i = 0; i < 2; i++) {
    const t1 = z * a[1] + a[2], t2 = z * a[4] + x * a[5] + a[6], p1 = x * b[1] + b[2], p2 = x * b[4] + z * b[5] + b[6];
    const c2 = a[3] * Math.cos(t2), d2 = b[3] * Math.cos(p2);
    j00 = 1 + c2 * a[5];
    j01 = a[0] * a[1] * Math.cos(t1) + c2 * a[4];
    j10 = b[0] * b[1] * Math.cos(p1) + d2 * b[4];
    j11 = 1 + d2 * b[5];
    det = j00 * j11 - j01 * j10;
    const fx = x + a[0] * Math.sin(t1) + a[3] * Math.sin(t2) - u, fz = z + b[0] * Math.sin(p1) + b[3] * Math.sin(p2) - v;
    x -= (j11 * fx - j01 * fz) / det;
    z -= (j00 * fz - j10 * fx) / det;
  }
  // columns of the inverse Jacobian: where a step along each grid axis goes in the world
  let ax = j11 / det, az = -j10 / det, l = Math.hypot(ax, az);
  out[0] = x;
  out[1] = z;
  out[2] = ax / l;
  out[3] = az / l;
  ax = -j01 / det;
  az = j00 / det;
  l = Math.hypot(ax, az);
  out[4] = ax / l;
  out[5] = az / l;
}

/* ---------- buildings ---------- */

/** What a box is, which decides its facade and roof in the shader. */
export const KIND = { office: 0, glass: 1, flats: 2, shophouse: 3, shed: 4, containers: 5, plain: 6 } as const;

export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  y0: number;
  h: number;
  /** Rotation about Y, radians. */
  rot: number;
  kind: number;
  color: [number, number, number];
  seed: number;
  /** Height of a tiled gable roof on top, running along the longer side. 0 for a flat roof. */
  gable: number;
}

/** Axis-aligned collider. */
export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y0: number;
  y1: number;
}

/** Landmark footprints: generated buildings keep out of these. [minX, maxX, minZ, maxZ] */
const RESERVED: [number, number, number, number][] = [
  [340, 430, -200, 0], // lotus-shaped museum on the bay front
  [-290, 10, -660, -440], // waterfront theatres
  [430, 710, -310, 340], // Marina Bay Sands
  [780, 1020, -640, -410], // observation wheel
  [640, 760, -470, -30], // channel bridge
];
/** Container port on the south-west shore. */
const PORT: [number, number, number, number] = [-2500, -1050, 1380, 2200];
const inRect = (x: number, z: number, r: [number, number, number, number], m = 0) => x > r[0] - m && x < r[1] + m && z > r[2] - m && z < r[3] + m;

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise, 0..1. Used to zone the city into districts. */
function noise2(x: number, z: number, seed: number) {
  const h = (i: number, j: number) => {
    let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x), j = Math.floor(z);
  let fx = x - i, fz = z - j;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  return (h(i, j) * (1 - fx) + h(i + 1, j) * fx) * (1 - fz) + (h(i, j + 1) * (1 - fx) + h(i + 1, j + 1) * fx) * fz;
}

// facade albedo, linear. Lit by the shader, so these are surface colours, not screen colours.
const GLASS: [number, number, number][] = [[0.1, 0.16, 0.22], [0.08, 0.13, 0.17], [0.14, 0.17, 0.2], [0.1, 0.18, 0.19], [0.16, 0.2, 0.26]];
const SOLID: [number, number, number][] = [[0.56, 0.54, 0.5], [0.66, 0.65, 0.62], [0.52, 0.45, 0.38], [0.45, 0.47, 0.5], [0.7, 0.67, 0.6], [0.6, 0.58, 0.56]];
const FLATS: [number, number, number][] = [[0.78, 0.76, 0.7], [0.8, 0.74, 0.64], [0.72, 0.75, 0.76], [0.82, 0.8, 0.76], [0.76, 0.7, 0.66]];
const SHOP: [number, number, number][] = [[0.8, 0.76, 0.66], [0.74, 0.62, 0.5], [0.66, 0.72, 0.7], [0.82, 0.8, 0.74], [0.78, 0.66, 0.6]];
const SHED: [number, number, number][] = [[0.62, 0.64, 0.66], [0.55, 0.58, 0.62], [0.68, 0.66, 0.6]];

const gauss = (x: number, z: number, cx: number, cz: number, s: number) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));

/** What stands on a city block. Drives buildings, trees and the ground between them. */
export type BlockUse = 'towers' | 'mixed' | 'flats' | 'shophouses' | 'sheds' | 'port' | 'green';
export interface Block {
  i: number;
  j: number;
  /** World position of the centre and the grid's rotation there. */
  x: number;
  z: number;
  rot: number;
  use: BlockUse;
}

export interface Tree {
  x: number;
  z: number;
  /** Canopy radius, metres. */
  r: number;
  seed: number;
}

/** A cargo ship: alongside the quay or at anchor in the roads. */
export interface Ship {
  x: number;
  z: number;
  rot: number;
  len: number;
  /** Tiers of containers on deck; 0 for a tanker or bulk carrier. */
  tiers: number;
  seed: number;
}

interface CityData {
  boxes: Box[];
  blocks: Block[];
  trees: Tree[];
  ships: Ship[];
}

let cached: CityData | null = null;
const city = () => (cached ??= generate());
/** The generated buildings, built once and shared by the 3D scene and the minimap. */
export const getBuildings = () => city().boxes;
export const getBlocks = () => city().blocks;
export const getTrees = () => city().trees;
export const getShips = () => city().ships;

let uses: Map<number, BlockUse> | null = null;
/** What stands on the block centred on grid step (i, j); null where nothing was built (water, parks, landmarks). */
export function blockUse(i: number, j: number): BlockUse | null {
  if (!uses) {
    uses = new Map();
    for (const b of city().blocks) uses.set((b.i + 512) * 4096 + (b.j + 512), b.use);
  }
  return uses.get((i + 512) * 4096 + (j + 512)) ?? null;
}
/** Inside a landmark's plot: street life keeps out, as the generated buildings do. */
export function inLandmark(x: number, z: number, margin = 0) {
  for (const r of RESERVED) if (inRect(x, z, r, margin)) return true;
  return false;
}

const USABLE = BLOCK - ROAD - 10; // block interior after roads and pavements

/** Deterministic city: the same seed gives the same skyline on every load. */
function generate(): CityData {
  const rng = mulberry32(20261005);
  const boxes: Box[] = [];
  const blocks: Block[] = [];
  const trees: Tree[] = [];
  const pick = <T,>(list: T[]) => list[Math.floor(rng() * list.length)];
  const tint = (base: [number, number, number], spread = 0.24): [number, number, number] => {
    const k = 1 - spread / 2 + rng() * spread;
    return [base[0] * k, base[1] * k, base[2] * k];
  };

  for (let i = -30; i <= 62; i++) {
    for (let j = -40; j <= 18; j++) {
      const [cx, cz, rot] = toWorld(i * BLOCK, j * BLOCK);
      const cos = Math.cos(rot), sin = Math.sin(rot);
      /** Block-local metres (along the two streets) -> world. */
      const at = (lx: number, lz: number): [number, number] => [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
      const h2 = USABLE / 2;

      // the whole block must be dry land, outside parks and landmark plots
      let ok = true;
      for (const [ox, oz] of [[-h2, -h2], [h2, -h2], [-h2, h2], [h2, h2], [0, 0]]) {
        const [px, pz] = at(ox, oz);
        if (landSdf(px, pz) < 16 || parkSdf(px, pz) < 8) ok = false;
        for (const r of RESERVED) if (inRect(px, pz, r, 6)) ok = false;
      }
      if (!ok) continue;

      const dist = Math.hypot(cx - 300, cz + 300);
      const reach = Math.min(1, Math.max(0, 1 - dist / 3900));
      const cbd = gauss(cx, cz, -660, 240, 400);
      const centre = gauss(cx, cz, 430, -830, 290); // Marina Centre
      const east = gauss(cx, cz, 1500, 420, 330); // Marina South
      const dens = Math.max(cbd, centre * 0.72, east * 0.5);
      const nFlats = noise2(cx / 1300, cz / 1300, 11);
      const nShop = noise2(cx / 800, cz / 800, 23);
      const nShed = noise2(cx / 1500, cz / 1500, 37);
      const nGreen = noise2(cx / 600, cz / 600, 51);

      let use: BlockUse;
      if (inRect(cx, cz, PORT)) use = 'port';
      else if (dens > 0.3) use = 'towers';
      else if (nGreen > 0.8 - (1 - reach) * 0.2 && dens < 0.12) use = 'green';
      else if (dens > 0.045 && dens < 0.2 && nShop > 0.42) use = 'shophouses'; // the old quarters around the centre
      else if (nFlats > 0.56 && dens < 0.16) use = 'flats';
      else if (nShop > 0.66 && dens < 0.16) use = 'shophouses';
      else if (nShed > 0.7 && reach < 0.5) use = 'sheds';
      else use = 'mixed';
      blocks.push({ i, j, x: cx, z: cz, rot, use });

      const put = (lx: number, lz: number, w: number, d: number, y0: number, h: number, kind: number, color: [number, number, number], seed: number, gable = 0) => {
        const [x, z] = at(lx, lz);
        boxes.push({ x, z, w, d, y0, h, rot, kind, color, seed, gable });
      };
      const tree = (lx: number, lz: number, r: number) => {
        const [x, z] = at(lx, lz);
        if (landSdf(x, z) > 8) trees.push({ x, z, r, seed: rng() });
      };
      /** A row of street trees along each pavement. */
      const streetTrees = (chance: number, step: number) => {
        const e = h2 + 3.5;
        for (let s = -h2 + step / 2; s < h2; s += step) {
          for (const [lx, lz] of [[s, -e], [s, e], [-e, s], [e, s]]) if (rng() < chance) tree(lx + (rng() - 0.5) * 3, lz + (rng() - 0.5) * 1.5, 4.2 + rng() * 2.6);
        }
      };

      if (use === 'green') {
        // a pocket of woodland: trees in clumps, thinner toward the middle
        const n = 16 + Math.floor(rng() * 14);
        for (let k = 0; k < n; k++) tree((rng() - 0.5) * (USABLE + 8), (rng() - 0.5) * (USABLE + 8), 6 + rng() * 5.5);
        continue;
      }

      if (use === 'port') {
        // container yard: long stacks in rows, with lanes for the carriers
        for (let r = 0; r < 6; r++) {
          const lz = -h2 + 8 + r * 13.6;
          if (rng() < 0.12) continue;
          const tiers = 2 + Math.floor(rng() * 4);
          const run = USABLE * (0.6 + rng() * 0.4);
          put((rng() - 0.5) * (USABLE - run), lz, run, 9.8, 0, tiers * 2.6, KIND.containers, [0.5, 0.5, 0.5], Math.floor(rng() * 997) + rng() * 0.99);
        }
        continue;
      }

      if (use === 'flats') {
        // public housing: long slab blocks, 12 to 25 storeys, with a low car park and trees between
        const along = rng() < 0.5;
        const n = 2 + (rng() < 0.45 ? 1 : 0);
        const base = pick(FLATS);
        const storeys = 12 + Math.floor(rng() * 14);
        for (let k = 0; k < n; k++) {
          const off = -h2 + (USABLE / n) * (k + 0.5);
          const len = USABLE * (0.72 + rng() * 0.24);
          const h = (storeys + Math.floor(rng() * 3)) * 2.9;
          const seed = Math.floor(rng() * 997) + rng() * 0.99;
          const slide = (rng() - 0.5) * (USABLE - len);
          if (along) put(slide, off, len, 13, 0, h, KIND.flats, tint(base, 0.1), seed);
          else put(off, slide, 13, len, 0, h, KIND.flats, tint(base, 0.1), seed);
          // lift core standing proud of the slab
          if (along) put(slide + (rng() - 0.5) * len * 0.5, off + 7.5, 7, 4, 0, h + 4, KIND.plain, tint(base, 0.1), 0.2);
          else put(off + 7.5, slide + (rng() - 0.5) * len * 0.5, 4, 7, 0, h + 4, KIND.plain, tint(base, 0.1), 0.2);
          // water tanks on the roof
          for (const t of [-0.3, 0.28]) {
            const a = slide + len * t + (rng() - 0.5) * 6;
            if (along) put(a, off, 9, 6, h, 2.6, KIND.plain, [0.62, 0.62, 0.6], 0.3);
            else put(off, a, 6, 9, h, 2.6, KIND.plain, [0.62, 0.62, 0.6], 0.3);
          }
        }
        for (let k = 0; k < 9; k++) {
          const a = (rng() - 0.5) * USABLE, b = -h2 + (USABLE / n) * (Math.floor(rng() * (n + 1)));
          if (along) tree(a, b + (rng() - 0.5) * 6, 4.5 + rng() * 3);
          else tree(b + (rng() - 0.5) * 6, a, 4.5 + rng() * 3);
        }
        streetTrees(0.7, 22);
        continue;
      }

      if (use === 'shophouses') {
        // terraces of two- and three-storey shophouses under tiled roofs, back to back with a lane between
        const along = rng() < 0.5;
        const rows = 4;
        const depth = (USABLE - 3 * 5) / rows;
        for (let r = 0; r < rows; r++) {
          const off = -h2 + depth / 2 + r * (depth + 5);
          let s = -h2;
          while (s < h2 - 12) {
            const len = Math.min(h2 - s, 22 + rng() * 44);
            if (rng() < 0.9) {
              const h = 7 + Math.floor(rng() * 2) * 3.4 + rng();
              const seed = Math.floor(rng() * 997) + rng() * 0.99;
              const c = tint(pick(SHOP), 0.16);
              if (along) put(s + len / 2, off, len - 1.5, depth, 0, h, KIND.shophouse, c, seed, 3.6);
              else put(off, s + len / 2, depth, len - 1.5, 0, h, KIND.shophouse, c, seed, 3.6);
            }
            s += len;
          }
        }
        streetTrees(0.35, 26);
        continue;
      }

      if (use === 'sheds') {
        const n = rng() < 0.5 ? 1 : 2;
        for (let k = 0; k < n; k++) {
          const w = USABLE / n - 8;
          const d = USABLE * (0.6 + rng() * 0.32);
          put(-h2 + (USABLE / n) * (k + 0.5), (rng() - 0.5) * (USABLE - d), w, d, 0, 9 + rng() * 7, KIND.shed, tint(pick(SHED), 0.14), Math.floor(rng() * 997) + rng() * 0.99, rng() < 0.6 ? 2.4 : 0);
        }
        streetTrees(0.25, 30);
        continue;
      }

      // towers and mixed blocks
      // big plots downtown, finer grain further out: up to nine buildings on a block
      const grain = rng();
      const lots = dens > 0.35 ? (grain < 0.62 ? 1 : 2) : grain < 0.22 ? 2 : grain < 0.55 ? 4 : grain < 0.82 ? 6 : 9;
      const nx = lots === 9 ? 3 : lots === 6 ? (rng() < 0.5 ? 3 : 2) : lots === 4 ? 2 : lots === 2 && rng() < 0.5 ? 2 : 1;
      const nz = lots / nx;
      let open = 0;
      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          const lw = USABLE / nx;
          const ld = USABLE / nz;
          const lx = -h2 + lw * (a + 0.5);
          const lz = -h2 + ld * (b + 0.5);
          if (lots >= 4 && rng() < 0.2) {
            // a small green instead of a building
            open++;
            for (let k = 0; k < 5; k++) tree(lx + (rng() - 0.5) * lw * 0.8, lz + (rng() - 0.5) * ld * 0.8, 4.5 + rng() * 3.5);
            continue;
          }
          const w = lw - 6 - rng() * lw * 0.3;
          const d = ld - 6 - rng() * ld * 0.3;
          const tall = dens > 0.22 && rng() < 0.35 + dens * 0.6;
          const h = tall ? 70 + dens * 215 * (0.5 + rng() * 0.62) + rng() * 30 : 14 + Math.pow(rng(), 1.7) * 78 * (0.35 + reach * 0.75);
          const glass = tall ? rng() < 0.78 : rng() < 0.2;
          const kind = glass ? KIND.glass : KIND.office;
          const color = tint(pick(glass ? GLASS : SOLID));
          const seed = Math.floor(rng() * 997) + rng() * 0.99;

          /** Roof plant: a stair head, and on most roofs a cluster of chillers or tanks. */
          const roofGear = (cx2: number, cz2: number, rw: number, rd: number, top: number) => {
            if (rw < 9 || rd < 9) return;
            put(cx2 + (rng() - 0.5) * rw * 0.5, cz2 + (rng() - 0.5) * rd * 0.5, 4 + rng() * 2, 4 + rng() * 2, top, 2.8 + rng(), KIND.plain, [0.56, 0.56, 0.55], 0.3);
            if (rng() < 0.75) {
              const n2 = 1 + Math.floor(rng() * 3);
              const gx = cx2 + (rng() - 0.5) * rw * 0.45, gz = cz2 + (rng() - 0.5) * rd * 0.45;
              for (let k = 0; k < n2; k++) put(gx + k * 3.4, gz, 2.6, 4.4 + rng() * 2, top, 1.6 + rng() * 1.2, KIND.plain, [0.44, 0.46, 0.48], 0.1);
            }
          };

          if (h > 150 && rng() < 0.3) {
            // a straight shaft with a recessed crown
            put(lx, lz, w * 0.9, d * 0.9, 0, h * 0.94, kind, color, seed);
            put(lx, lz, w * 0.72, d * 0.72, h * 0.94, h * 0.06, KIND.plain, [0.42, 0.44, 0.47], 0.3);
          } else if (h > 110 && rng() < 0.35) {
            // two slabs crossed: a tower with notched corners, on a podium of shops
            const ph = 12 + rng() * 8;
            put(lx, lz, w, d, 0, ph, KIND.office, tint(pick(SOLID)), seed + 1);
            put(lx, lz, w * 0.86, d * 0.52, ph, h - ph, kind, color, seed);
            put(lx, lz, w * 0.52, d * 0.86, ph, h - ph - 3.5, kind, color, seed);
            roofGear(lx, lz, w * 0.5, d * 0.5, h);
            if (rng() < 0.5) put(lx, lz, 2.4, 2.4, h, h * (0.07 + rng() * 0.08), KIND.plain, [0.3, 0.3, 0.32], 0.1);
          } else if (h > 150) {
            // towers step back as they rise, and some carry a mast
            const s1 = 0.74 + rng() * 0.1;
            const s2 = 0.48 + rng() * 0.12;
            put(lx, lz, w, d, 0, h * 0.62, kind, color, seed);
            put(lx, lz, w * s1, d * s1, h * 0.62, h * 0.28, kind, color, seed);
            put(lx, lz, w * s2, d * s2, h * 0.9, h * 0.1, kind, color, seed);
            if (rng() < 0.45) put(lx, lz, 3, 3, h, h * (0.08 + rng() * 0.1), KIND.plain, [0.3, 0.3, 0.32], 0.1);
          } else if (h > 60 && rng() < 0.55) {
            // podium and tower
            const ph = 14 + rng() * 10;
            const ox = (rng() - 0.5) * w * 0.2, oz = (rng() - 0.5) * d * 0.2;
            put(lx, lz, w, d, 0, ph, KIND.office, tint(pick(SOLID)), seed);
            put(lx + ox, lz + oz, w * 0.66, d * 0.66, ph, h - ph, kind, color, seed);
            roofGear(lx + ox, lz + oz, w * 0.6, d * 0.6, h);
            continue;
          } else if (h > 26 && h <= 60 && w > 24 && d > 24 && rng() < 0.3) {
            // a mid-rise that steps back for a terrace on its top floors
            const cut = 2 + Math.floor(rng() * 3);
            put(lx, lz, w, d, 0, h - cut * 3.6, kind, color, seed);
            put(lx + w * 0.08, lz, w * 0.8, d * 0.78, h - cut * 3.6, cut * 3.6, kind, color, seed);
            roofGear(lx + w * 0.08, lz, w * 0.7, d * 0.7, h);
            continue;
          } else if (h < 22 && lots >= 6 && rng() < 0.45) {
            // small houses and shops under a pitched roof
            put(lx, lz, w, d, 0, 6 + rng() * 6, KIND.shophouse, tint(pick(SHOP), 0.16), seed, 3);
            continue;
          } else if (h < 40 && w > 34 && d > 34 && rng() < 0.3) {
            // an L: two wings round a corner yard
            put(lx - w * 0.2, lz, w * 0.6, d, 0, h, kind, color, seed);
            put(lx + w * 0.3, lz - d * 0.25, w * 0.4, d * 0.5, 0, h * (0.6 + rng() * 0.4), kind, color, seed);
            tree(lx + w * 0.3, lz + d * 0.25, 5 + rng() * 2);
          } else {
            put(lx, lz, w, d, 0, h, kind, color, seed);
          }
          // plant on the roofs
          if (h > 30 && h <= 150 && rng() < 0.7) {
            put(lx + (rng() - 0.5) * w * 0.3, lz + (rng() - 0.5) * d * 0.3, w * (0.18 + rng() * 0.2), d * (0.18 + rng() * 0.2), h, 3 + rng() * 3.5, KIND.plain, [0.5, 0.5, 0.52], 0.3);
          } else if (h > 12 && h <= 150 && rng() < 0.8) {
            roofGear(lx, lz, w * 0.8, d * 0.8, h);
          }
        }
      }
      if (open === 0 || dens < 0.3) streetTrees(dens > 0.3 ? 0.4 : 0.62, 24);
    }
  }

  // parks: groves with lawns between them
  const grove = mulberry32(77);
  for (const p of PARKS) {
    const airfield = p.r[1] > 1000;
    const area = Math.PI * p.r[0] * p.r[1];
    const tries = Math.floor(area / (airfield ? 2600 : 150));
    for (let k = 0; k < tries; k++) {
      const a = grove() * Math.PI * 2, rr = Math.sqrt(grove());
      const x = p.c[0] + Math.cos(a) * rr * p.r[0], z = p.c[1] + Math.sin(a) * rr * p.r[1];
      const edge = rr > 0.86;
      if (airfield && !edge) continue; // the airfield itself stays clear
      if (!edge && noise2(x / 90, z / 90, 5) < 0.5) continue; // lawn
      if (landSdf(x, z) < 10) continue;
      if (TREE_FREE.some((r) => inRect(x, z, r))) continue;
      trees.push({ x, z, r: 5 + grove() * 5, seed: grove() });
    }
  }
  // shipping: two vessels working the quay, and the anchorage offshore that every view of this coast has
  const ships: Ship[] = [];
  const sea = mulberry32(4411);
  const nrm = Math.hypot(SEA.n[0], SEA.n[1]);
  const along = Math.atan2(SEA.n[0], SEA.n[1]); // heading parallel to the coast (a box's length runs along its local X)
  const quayAt = (x: number, off: number): [number, number] => [x + (SEA.n[0] / nrm) * off, (SEA.k - SEA.n[0] * x) / SEA.n[1] + (SEA.n[1] / nrm) * off];
  for (const [x, len] of [[-2120, 250], [-1560, 210]] as const) {
    const [sx, sz] = quayAt(x, 58);
    ships.push({ x: sx, z: sz, rot: along, len, tiers: 3 + Math.floor(sea() * 3), seed: sea() });
  }
  for (let tries = 0; tries < 400 && ships.length < 34; tries++) {
    const x = -3400 + sea() * 9800, off = 330 + sea() * 2700;
    const [sx, sz] = quayAt(x, off);
    const len = 120 + sea() * 190;
    if (landSdf(sx, sz) > -230) continue; // clear of shores and islands
    if (ships.some((o) => Math.hypot(o.x - sx, o.z - sz) < 330)) continue;
    // ships at anchor swing to the tide: all much the same way, none exactly
    ships.push({ x: sx, z: sz, rot: along + 0.35 + (sea() - 0.5) * 0.5, len, tiers: sea() < 0.55 ? 2 + Math.floor(sea() * 4) : 0, seed: sea() });
  }
  for (const sh of ships) {
    if (!sh.tiers) continue;
    // deck cargo, in three bays forward of the bridge
    const cos = Math.cos(sh.rot), sin = Math.sin(sh.rot);
    for (const k of [-0.2, 0.03, 0.26]) {
      boxes.push({ x: sh.x + cos * sh.len * k, z: sh.z - sin * sh.len * k, w: sh.len * 0.2, d: sh.len * 0.11, y0: 9.5, h: sh.tiers * 2.6 - (k > 0.2 ? 2.6 : 0), rot: sh.rot, kind: KIND.containers, color: [0.5, 0.5, 0.5], seed: Math.floor(sh.seed * 900) + k + 0.5, gable: 0 });
    }
  }
  return { boxes, blocks, trees, ships };
}

/** Places inside parks that carry buildings or paving, so no trees. [minX, maxX, minZ, maxZ] */
const TREE_FREE: [number, number, number, number][] = [
  [2330 - 190, 2330 + 190, -760 - 190, -760 + 190], // stadium and its plaza
  [720, 940, 300, 500], // conservatory 1
  [950, 1110, 350, 490], // conservatory 2
];

/* ---------- baked maps for the shaders ---------- */

/** World rectangle covered by the baked maps. */
export const MAP_BOX = { x0: -4100, z0: -5400, w: 12400, h: 7900 };

export interface HeightField {
  data: Uint8Array;
  w: number;
  h: number;
  /** Metres per unit of stored height. */
  step: number;
}

export interface HeightExtra {
  /** Boxes outside the generated set (landmarks). */
  boxes?: { x: number; z: number; w: number; d: number; h: number }[];
  /** Half-ellipsoid domes. */
  domes?: { x: number; z: number; rx: number; rz: number; h: number }[];
}

/**
 * Top-down height map of everything that casts a shadow, about 4 m per texel. The shaders march it toward
 * the sun, which gives every building and tree a shadow on the ground and on its neighbours without shadow maps.
 */
export function bakeHeights(extra: HeightExtra = {}): HeightField {
  const MPP = 4, STEP = 2;
  const w = Math.round(MAP_BOX.w / MPP), h = Math.round(MAP_BOX.h / MPP);
  const data = new Uint8Array(w * h);
  const set = (i: number, j: number, y: number) => {
    if (i < 0 || j < 0 || i >= w || j >= h) return;
    const v = Math.min(255, Math.round(y / STEP));
    const k = j * w + i;
    if (v > data[k]) data[k] = v;
  };
  const rect = (x: number, z: number, bw: number, bd: number, rot: number, top: number) => {
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const ex = (Math.abs(cos) * bw + Math.abs(sin) * bd) / 2, ez = (Math.abs(sin) * bw + Math.abs(cos) * bd) / 2;
    const i0 = Math.floor((x - ex - MAP_BOX.x0) / MPP), i1 = Math.ceil((x + ex - MAP_BOX.x0) / MPP);
    const j0 = Math.floor((z - ez - MAP_BOX.z0) / MPP), j1 = Math.ceil((z + ez - MAP_BOX.z0) / MPP);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = MAP_BOX.x0 + (i + 0.5) * MPP - x, dz = MAP_BOX.z0 + (j + 0.5) * MPP - z;
        const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
        if (Math.abs(lx) <= bw / 2 + 0.5 && Math.abs(lz) <= bd / 2 + 0.5) set(i, j, top);
      }
    }
  };
  for (const b of getBuildings()) rect(b.x, b.z, b.w, b.d, b.rot, b.y0 + b.h + b.gable * 0.5);
  for (const b of extra.boxes ?? []) rect(b.x, b.z, b.w, b.d, 0, b.h);
  for (const d of extra.domes ?? []) {
    const i0 = Math.floor((d.x - d.rx - MAP_BOX.x0) / MPP), i1 = Math.ceil((d.x + d.rx - MAP_BOX.x0) / MPP);
    const j0 = Math.floor((d.z - d.rz - MAP_BOX.z0) / MPP), j1 = Math.ceil((d.z + d.rz - MAP_BOX.z0) / MPP);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const u = (MAP_BOX.x0 + (i + 0.5) * MPP - d.x) / d.rx, v = (MAP_BOX.z0 + (j + 0.5) * MPP - d.z) / d.rz;
        const q = 1 - u * u - v * v;
        if (q > 0) set(i, j, Math.sqrt(q) * d.h);
      }
    }
  }
  for (const t of getTrees()) {
    const i = Math.floor((t.x - MAP_BOX.x0) / MPP), j = Math.floor((t.z - MAP_BOX.z0) / MPP);
    const n = Math.ceil(t.r / MPP);
    for (let b = -n; b <= n; b++) for (let a = -n; a <= n; a++) if (a * a + b * b <= n * n) set(i + a, j + b, t.r * 2);
  }
  return { data, w, h, step: STEP };
}

/**
 * Shadow volume for one sun direction: for every texel, the height below which a point is in shadow.
 * Each line of texels running down-sun is swept once, carrying the tallest shadow along as it sinks with
 * the sun's elevation. The shaders then need a single lookup instead of marching the height map.
 */
export function bakeShadow(hf: HeightField, sun: [number, number, number]): Float32Array {
  const { step } = hf;
  const hz = Math.hypot(sun[0], sun[2]);
  const dx = sun[0] / hz, dz = sun[2] / hz, rise = sun[1] / hz;
  // work in a frame where the sun lies mostly along the first axis: swap the axes if it does not
  const swap = Math.abs(dz) > Math.abs(dx);
  const n1 = swap ? hf.h : hf.w, n2 = swap ? hf.w : hf.h; // length along the sweep, number of rows across it
  const at = (a: number, b: number) => (swap ? a * hf.w + b : b * hf.w + a);
  const d1 = swap ? dz : dx, d2 = swap ? dx : dz;
  const dir = Math.sign(d1), slope = d2 / Math.abs(d1); // rows gained per texel walked toward the sun
  const drop = rise * (MAP_BOX.w / hf.w) * Math.hypot(1, slope);
  const S = new Float32Array(hf.w * hf.h);
  const H = (a: number, b: number) => (b < 0 || b >= n2 ? 0 : hf.data[at(a, b)] * step);
  // a sheared line: row = l + slope * k, where k counts texels from the leeward end toward the sun
  const k0 = dir > 0 ? 0 : n1 - 1; // leeward end
  const shear = (a: number) => slope * (dir > 0 ? a : n1 - 1 - a);
  const lMin = Math.floor(-Math.max(0, slope * (n1 - 1))) - 1, lMax = Math.ceil(n2 - Math.min(0, slope * (n1 - 1))) + 1;
  let prev = new Float32Array(n1), cur = new Float32Array(n1);
  for (let l = lMin; l <= lMax; l++) {
    // walk from the sunward end to the leeward end
    let run = 0;
    for (let n = 0; n < n1; n++) {
      const a = dir > 0 ? n1 - 1 - n : n;
      const bf = l + shear(a), b0 = Math.floor(bf), f = bf - b0;
      const top = H(a, b0) * (1 - f) + H(a, b0 + 1) * f;
      run = Math.max(top, run - drop);
      cur[a] = run;
    }
    // write the texels that lie between the previous line and this one
    if (l > lMin) {
      for (let a = 0; a < n1; a++) {
        const sft = shear(a);
        const b = Math.ceil(l - 1 + sft);
        if (b < 0 || b >= n2) continue;
        const f = b - sft - (l - 1);
        S[at(a, b)] = prev[a] * (1 - f) + cur[a] * f;
      }
    }
    const t = prev;
    prev = cur;
    cur = t;
  }
  void k0;
  return S;
}

/**
 * Low-resolution map of what the ground is between the streets. R: how green (0 paved, 255 grass),
 * G: hard-standing yards (port, industry), B: old-quarter paving.
 */
export function bakeGround(): { data: Uint8Array; w: number; h: number } {
  const MPP = 10;
  const w = Math.round(MAP_BOX.w / MPP), h = Math.round(MAP_BOX.h / MPP);
  const data = new Uint8Array(w * h * 4);
  const key = (i: number, j: number) => (i + 512) * 4096 + (j + 512);
  const byCell = new Map<number, BlockUse>();
  for (const b of getBlocks()) byCell.set(key(b.i, b.j), b.use);
  const GREEN: Record<BlockUse, number> = { towers: 20, mixed: 70, flats: 170, shophouses: 15, sheds: 25, port: 0, green: 255 };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = MAP_BOX.x0 + (i + 0.5) * MPP, z = MAP_BOX.z0 + (j + 0.5) * MPP;
      const wp = warp(x, z);
      const use = byCell.get(key(Math.floor((x + wp[0]) / BLOCK + 0.5), Math.floor((z + wp[1]) / BLOCK + 0.5)));
      const k = (j * w + i) * 4;
      // land outside the built-up area is open country: all green
      data[k] = use ? GREEN[use] : 235;
      data[k + 1] = use === 'port' || use === 'sheds' ? 255 : 0;
      data[k + 2] = use === 'shophouses' ? 255 : 0;
      data[k + 3] = 255;
    }
  }
  return { data, w, h };
}

/* ---------- collisions ---------- */

/** Rotated boxes get an upright collider between the inscribed and the enclosing one: close enough for flight. */
export const toCollider = (b: Box): Collider => {
  const c = Math.abs(Math.cos(b.rot)), s = Math.abs(Math.sin(b.rot));
  const ex = (b.w + (c * b.w + s * b.d)) / 4, ez = (b.d + (s * b.w + c * b.d)) / 4;
  return { minX: b.x - ex, maxX: b.x + ex, minZ: b.z - ez, maxZ: b.z + ez, y0: b.y0, y1: b.y0 + b.h + b.gable };
};

/** Colliders bucketed by city block, so a lookup only touches the flyer's neighbourhood. */
export class ColliderIndex {
  private cells = new Map<number, Collider[]>();
  private key = (i: number, j: number) => (i + 512) * 4096 + (j + 512);
  private cell = (v: number) => Math.floor(v / BLOCK + 0.5);

  add(c: Collider) {
    for (let i = this.cell(c.minX); i <= this.cell(c.maxX); i++) {
      for (let j = this.cell(c.minZ); j <= this.cell(c.maxZ); j++) {
        const k = this.key(i, j);
        const list = this.cells.get(k);
        if (list) list.push(c);
        else this.cells.set(k, [c]);
      }
    }
  }

  /** Colliders in the block at (x, z) and its eight neighbours. */
  near(x: number, z: number, out: Collider[]) {
    out.length = 0;
    const ci = this.cell(x), cj = this.cell(z);
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const list = this.cells.get(this.key(i, j));
        if (list) for (const c of list) if (!out.includes(c)) out.push(c);
      }
    }
    return out;
  }
}
