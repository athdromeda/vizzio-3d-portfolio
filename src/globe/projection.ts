// Mirrors cobe 2.x's internal projection so DOM tags can follow WebGL markers
// in every browser (no dependency on CSS anchor positioning).

const { PI, sin, cos } = Math;
const GLOBE_RADIUS = 0.8; // cobe constant, in clip space

export type Vec3 = [number, number, number];

export function latLngToVec3([lat, lng]: [number, number]): Vec3 {
  const r = (lat * PI) / 180;
  const a = (lng * PI) / 180 - PI;
  const o = cos(r);
  return [-o * cos(a), sin(r), o * sin(a)];
}

/** Returns x/y in 0..1 of the (square) canvas, plus depth: > 0 means facing the viewer. */
export function project(v: Vec3, phi: number, theta: number, elevation = 0) {
  const k = GLOBE_RADIUS + elevation;
  const [x, y, z] = [v[0] * k, v[1] * k, v[2] * k];
  const cp = cos(phi), sp = sin(phi), ct = cos(theta), st = sin(theta);
  const c = cp * x + sp * z;
  const s = sp * st * x + ct * y - cp * st * z;
  const depth = -sp * ct * x + st * y + cp * ct * z;
  return { x: (c + 1) / 2, y: (-s + 1) / 2, depth: depth / k };
}

/** phi/theta that bring a location to the centre of the globe. */
export function focusAngles([lat, lng]: [number, number]) {
  return { phi: (3 * PI) / 2 - (lng * PI) / 180, theta: (lat * PI) / 180 };
}

/** Shortest signed distance between two angles. */
export function angleDelta(from: number, to: number) {
  let d = (to - from) % (2 * PI);
  if (d > PI) d -= 2 * PI;
  if (d < -PI) d += 2 * PI;
  return d;
}
