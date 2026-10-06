// The vehicles in the streets: original, generic shapes built in code. No make, no badge, no livery of a real
// operator. Front is +Z, left is +X (left-hand traffic: the kerb and a bus's doors are on the left).
// Every model exists twice: a full one for the cars around the camera and a coarse one for the rest.
import * as THREE from 'three';
import { MeshKit, loft, type Station } from './meshkit';
import { NOISE, SHARED, WORLD } from './shaders';

export const PART = {
  paint: 0,
  glass: 1,
  dark: 2, // tyres, grilles, rubber
  head: 3,
  tail: 4,
  metal: 5,
  white: 6,
  amber: 7,
  sign: 8, // lit at dusk: a taxi's roof sign, a bus's destination board
  skin: 9,
  cloth: 10, // a rider's clothes: colour picked per vehicle
  cargo: 11, // a second colour picked per vehicle: a truck's box, a container
  trim: 12, // unpainted grey plastic
  second: 13, // the lower half of a two-tone bus
} as const;

export const KINDS = ['sedan', 'hatch', 'suv', 'mpv', 'taxi', 'van', 'pickup', 'bus', 'decker', 'truck', 'hauler', 'moto'] as const;
export type Kind = (typeof KINDS)[number];

/** Outer size in metres: what the traffic code spaces vehicles by and what the pilot runs into. */
export const SIZE: Record<Kind, { len: number; wid: number; hgt: number }> = {
  sedan: { len: 4.6, wid: 1.82, hgt: 1.45 },
  hatch: { len: 4.0, wid: 1.78, hgt: 1.5 },
  suv: { len: 4.7, wid: 1.92, hgt: 1.72 },
  mpv: { len: 4.8, wid: 1.86, hgt: 1.76 },
  taxi: { len: 4.6, wid: 1.82, hgt: 1.62 },
  van: { len: 5.3, wid: 1.96, hgt: 2.15 },
  pickup: { len: 5.3, wid: 1.9, hgt: 1.8 },
  bus: { len: 12, wid: 2.55, hgt: 3.15 },
  decker: { len: 12, wid: 2.55, hgt: 4.4 },
  truck: { len: 8.6, wid: 2.5, hgt: 3.5 },
  hauler: { len: 16, wid: 2.55, hgt: 4.0 },
  moto: { len: 2.05, wid: 0.8, hgt: 1.62 },
};

const P = PART;

function wheels(k: MeshKit, at: [number, number][], r: number, width: number, fine: boolean, twin = false, arch = 0.07) {
  for (const [x, z] of at) {
    for (const sx of [-1, 1]) {
      const cx = sx * (x - width / 2 + 0.014);
      if (fine) k.wheel([cx, r, z], r, width, 12, P.dark, P.dark, 'out', P.metal, arch);
      else k.box([cx, r, z], [width, r * 1.9, r * 1.8], P.dark, { skip: ['y-'] });
      if (twin && fine) k.wheel([sx * (x - width * 1.6), r, z], r, width, 8, P.dark, P.dark);
    }
  }
}

/** Lamps, plates and grille on the flat ends of a lofted car. */
function carEnds(k: MeshKit, front: Station, rear: Station, fine: boolean, o: { grille?: boolean } = {}) {
  const e = 0.012;
  const fz = front.z + e, rz = rear.z - e;
  const lampY = front.yb - 0.2, tailY = rear.yb - 0.22;
  for (const sx of [-1, 1]) {
    const x0 = sx * front.w * 0.5, x1 = sx * (front.w - 0.07);
    k.quad([x0, lampY, fz], [x1, lampY, fz], [x1, lampY + 0.14, fz], [x0, lampY + 0.14, fz], P.head, { out: [0, 0, 1] });
    const t0 = sx * rear.w * 0.46, t1 = sx * (rear.w - 0.05);
    k.quad([t0, tailY, rz], [t1, tailY, rz], [t1, tailY + 0.15, rz], [t0, tailY + 0.15, rz], P.tail, { out: [0, 0, -1] });
  }
  if (!fine) return;
  if (o.grille !== false) k.quad([-front.w * 0.44, front.c + 0.08, fz], [front.w * 0.44, front.c + 0.08, fz], [front.w * 0.44, lampY - 0.02, fz], [-front.w * 0.44, lampY - 0.02, fz], P.dark, { out: [0, 0, 1] });
  // plates: white in front, yellow behind, no characters
  k.quad([-0.25, front.c + 0.1, fz + e], [0.25, front.c + 0.1, fz + e], [0.25, front.c + 0.21, fz + e], [-0.25, front.c + 0.21, fz + e], P.white, { out: [0, 0, 1] });
  k.quad([-0.25, rear.c + 0.16, rz - e], [0.25, rear.c + 0.16, rz - e], [0.25, rear.c + 0.27, rz - e], [-0.25, rear.c + 0.27, rz - e], P.amber, { out: [0, 0, -1] });
}

function mirrors(k: MeshKit, w: number, y: number, z: number) {
  for (const sx of [-1, 1]) k.box([sx * (w + 0.09), y, z], [0.17, 0.11, 0.07], P.paint, { parts: { 'z-': P.glass } });
}

interface CarShape {
  st: Station[];
  wheel: { r: number; front: number; rear: number };
  mirror: [number, number];
  lean?: number;
}

function car(shape: CarShape, fine: boolean, extra?: (k: MeshKit) => void) {
  const k = new MeshKit();
  const st = fine ? shape.st : shape.st;
  loft(k, st, { paint: P.paint, glass: P.glass, coarse: !fine, lean: shape.lean });
  const w = Math.max(...st.map((s) => s.w));
  wheels(k, [[w, shape.wheel.front], [w, shape.wheel.rear]], shape.wheel.r, 0.23, fine);
  carEnds(k, st[st.length - 1], st[0], fine);
  if (fine) mirrors(k, w, shape.mirror[0], shape.mirror[1]);
  extra?.(k);
  return k.build();
}

const S = (z: number, w: number, yb: number, yr: number, c = 0.2, more: Partial<Station> = {}): Station => ({ z, w, yb, yr, c, ...more });

const SEDAN: CarShape = {
  st: [S(-2.3, 0.8, 0.8, 0.82, 0.28), S(-2.14, 0.9, 0.93, 0.96), S(-1.42, 0.91, 0.96, 0.99), S(-0.78, 0.91, 0.96, 1.43), S(-0.08, 0.91, 0.95, 1.45), S(0.52, 0.91, 0.94, 1.42), S(1.22, 0.91, 0.9, 0.93), S(2.08, 0.88, 0.8, 0.83), S(2.3, 0.78, 0.64, 0.66, 0.28)],
  wheel: { r: 0.32, front: 1.4, rear: -1.36 },
  mirror: [1.0, 0.98],
};
const HATCH: CarShape = {
  st: [S(-2.0, 0.8, 0.84, 0.86, 0.28), S(-1.86, 0.88, 0.97, 1.0), S(-1.38, 0.89, 0.98, 1.46), S(-0.42, 0.89, 0.97, 1.5), S(0.42, 0.89, 0.96, 1.47), S(1.08, 0.89, 0.92, 0.95), S(1.8, 0.86, 0.82, 0.85), S(2.0, 0.76, 0.66, 0.68, 0.28)],
  wheel: { r: 0.31, front: 1.24, rear: -1.24 },
  mirror: [1.03, 0.86],
};
const SUV: CarShape = {
  st: [S(-2.35, 0.86, 0.96, 0.98, 0.34), S(-2.22, 0.95, 1.1, 1.13, 0.26), S(-1.8, 0.96, 1.1, 1.7, 0.26), S(-0.9, 0.96, 1.09, 1.72, 0.26), S(-0.05, 0.96, 1.08, 1.72, 0.26), S(0.62, 0.96, 1.07, 1.68, 0.26), S(1.26, 0.96, 1.04, 1.07, 0.26), S(2.14, 0.94, 0.96, 0.99, 0.26), S(2.35, 0.86, 0.78, 0.8, 0.34)],
  wheel: { r: 0.37, front: 1.42, rear: -1.4 },
  mirror: [1.16, 1.04],
  lean: 0.14,
};
const MPV: CarShape = {
  st: [S(-2.4, 0.86, 0.92, 0.94, 0.3), S(-2.3, 0.92, 1.02, 1.05, 0.22), S(-2.02, 0.93, 1.03, 1.72, 0.22), S(-1.1, 0.93, 1.02, 1.76, 0.22), S(-0.15, 0.93, 1.01, 1.76, 0.22), S(0.72, 0.93, 1.0, 1.7, 0.22), S(1.62, 0.93, 0.95, 0.98, 0.22), S(2.24, 0.9, 0.84, 0.87, 0.22), S(2.4, 0.8, 0.66, 0.68, 0.3)],
  wheel: { r: 0.33, front: 1.5, rear: -1.42 },
  mirror: [1.1, 1.3],
  lean: 0.13,
};
const VAN: CarShape = {
  st: [S(-2.65, 0.94, 1.1, 2.08, 0.26), S(-2.6, 0.98, 1.1, 2.15, 0.26, { blind: true }), S(-0.2, 0.98, 1.1, 2.15, 0.26, { blind: true }), S(0.62, 0.98, 1.1, 2.15, 0.26), S(1.5, 0.98, 1.1, 2.1, 0.26), S(2.12, 0.98, 1.06, 1.09, 0.26), S(2.52, 0.96, 0.96, 0.99, 0.26), S(2.65, 0.88, 0.74, 0.76, 0.32)],
  wheel: { r: 0.35, front: 1.72, rear: -1.6 },
  mirror: [1.28, 1.72],
  lean: 0.06,
};
const PICKUP: CarShape = {
  st: [S(-2.65, 0.9, 1.0, 1.02, 0.34), S(-2.58, 0.94, 1.12, 1.15, 0.28, { top: P.dark }), S(-0.86, 0.94, 1.12, 1.15, 0.28), S(-0.74, 0.95, 1.1, 1.76, 0.28), S(0.1, 0.95, 1.09, 1.8, 0.28), S(0.74, 0.95, 1.08, 1.76, 0.28), S(1.4, 0.95, 1.05, 1.08, 0.28), S(2.42, 0.93, 0.98, 1.01, 0.28), S(2.65, 0.85, 0.8, 0.82, 0.36)],
  wheel: { r: 0.39, front: 1.66, rear: -1.62 },
  mirror: [1.18, 1.18],
  lean: 0.12,
};

/** A flat band of glass on a body side, divided into `n` windows. */
function band(k: MeshKit, x: number, y0: number, y1: number, z0: number, z1: number, n: number, part: number = P.glass) {
  const sx = Math.sign(x);
  k.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], part, { uv: [0, 0, n, 1], out: [sx, 0, 0] });
}

function bus(decks: 1 | 2, fine: boolean) {
  const k = new MeshKit();
  const L = 12, w = 1.275, h = decks === 1 ? 3.05 : 4.3, c = 0.34, e = 0.012;
  // body: lower half in the second colour, upper in the first
  const split = 1.02;
  k.box([0, (c + split) / 2, 0], [w * 2, split - c, L], P.second, { skip: ['y+'] });
  k.box([0, (split + h) / 2, 0], [w * 2, h - split, L], P.paint, { skip: ['y-'], smooth: 0 });
  // glazing: one band per deck, the left side broken by two doors
  const bands: [number, number][] = decks === 1 ? [[1.22, 2.36]] : [[1.22, 2.3], [2.72, 3.72]];
  bands.forEach(([y0, y1], deck) => {
    band(k, -w - e, y0, y1, -5.6, 4.9, 8); // right side, towards the road
    if (deck === 0) {
      band(k, w + e, y0, y1, -5.6, -1.6, 3);
      band(k, w + e, y0, y1, 0.1, 3.2, 2);
      // doors: front and middle
      for (const [z0, z1] of [[3.5, 4.9], [-1.4, -0.1]]) band(k, w + e, c + 0.12, y1, z0, z1, 2, P.glass);
    } else band(k, w + e, y0, y1, -5.6, 4.9, 8);
    // windscreen and rear window
    k.quad([-w + 0.12, y0 - (deck === 0 ? 0.2 : 0), L / 2 + e], [w - 0.12, y0 - (deck === 0 ? 0.2 : 0), L / 2 + e], [w - 0.12, y1 + 0.05, L / 2 + e], [-w + 0.12, y1 + 0.05, L / 2 + e], P.glass, { uv: [0, 0, 1, 1], out: [0, 0, 1] });
    k.quad([-w + 0.2, y0 + 0.1, -L / 2 - e], [w - 0.2, y0 + 0.1, -L / 2 - e], [w - 0.2, y1, -L / 2 - e], [-w + 0.2, y1, -L / 2 - e], P.glass, { uv: [0, 0, 1, 1], out: [0, 0, -1] });
  });
  // destination board above the windscreen, and one on the kerb side
  const top = bands[bands.length - 1][1];
  k.quad([-0.85, top + 0.12, L / 2 + e], [0.85, top + 0.12, L / 2 + e], [0.85, top + 0.42, L / 2 + e], [-0.85, top + 0.42, L / 2 + e], P.sign, { out: [0, 0, 1] });
  if (fine) k.quad([w + e, bands[0][1] + 0.08, 1.2], [w + e, bands[0][1] + 0.08, 2.8], [w + e, bands[0][1] + 0.3, 2.8], [w + e, bands[0][1] + 0.3, 1.2], P.sign, { out: [1, 0, 0] });
  // lamps, bumpers, plates
  for (const sx of [-1, 1]) {
    k.quad([sx * 0.7, 0.62, L / 2 + e], [sx * 1.12, 0.62, L / 2 + e], [sx * 1.12, 0.82, L / 2 + e], [sx * 0.7, 0.82, L / 2 + e], P.head, { out: [0, 0, 1] });
    k.quad([sx * 0.86, 0.9, -L / 2 - e], [sx * 1.16, 0.9, -L / 2 - e], [sx * 1.16, 1.3, -L / 2 - e], [sx * 0.86, 1.3, -L / 2 - e], P.tail, { out: [0, 0, -1] });
  }
  if (fine) {
    k.quad([-w, c, L / 2 + e], [w, c, L / 2 + e], [w, c + 0.22, L / 2 + e], [-w, c + 0.22, L / 2 + e], P.dark, { out: [0, 0, 1] });
    k.quad([-0.26, 0.6, L / 2 + e * 2], [0.26, 0.6, L / 2 + e * 2], [0.26, 0.71, L / 2 + e * 2], [-0.26, 0.71, L / 2 + e * 2], P.white, { out: [0, 0, 1] });
    k.quad([-0.26, 0.62, -L / 2 - e * 2], [0.26, 0.62, -L / 2 - e * 2], [0.26, 0.73, -L / 2 - e * 2], [-0.26, 0.73, -L / 2 - e * 2], P.amber, { out: [0, 0, -1] });
    // roof plant, mirrors on stalks
    k.box([0, h + 0.11, -1.5], [1.7, 0.22, 3.2], P.trim, { skip: ['y-'] });
    for (const sx of [-1, 1]) k.box([sx * (w + 0.2), bands[0][1] - 0.3, L / 2 - 0.1], [0.12, 0.42, 0.08], P.dark);
  }
  wheels(k, [[w, 3.4], [w, -3.3]], 0.5, 0.3, fine, false, 0.09);
  return k.build();
}

/** A cab-over lorry cab: upright front, big screen. Front face at z = z1. */
function cab(k: MeshKit, w: number, z0: number, z1: number, h: number, c: number, fine: boolean) {
  const e = 0.012;
  loft(k, [S(z0, w, 1.42, h - 0.02, c, { blind: true }), S(z0 + 0.5, w, 1.42, h, c), S(z1 - 0.62, w, 1.4, h - 0.04, c), S(z1 - 0.1, w, 1.32, 1.35, c), S(z1, w - 0.06, 1.2, 1.22, c + 0.08)], { paint: P.paint, glass: P.glass, coarse: !fine, lean: 0.07 });
  for (const sx of [-1, 1]) k.quad([sx * 0.62, 0.72, z1 + e], [sx * (w - 0.08), 0.72, z1 + e], [sx * (w - 0.08), 0.92, z1 + e], [sx * 0.62, 0.92, z1 + e], P.head, { out: [0, 0, 1] });
  if (!fine) return;
  k.quad([-w * 0.6, c + 0.12, z1 + e], [w * 0.6, c + 0.12, z1 + e], [w * 0.6, 1.12, z1 + e], [-w * 0.6, 1.12, z1 + e], P.dark, { out: [0, 0, 1] });
  k.quad([-0.26, c + 0.16, z1 + e * 2], [0.26, c + 0.16, z1 + e * 2], [0.26, c + 0.27, z1 + e * 2], [-0.26, c + 0.27, z1 + e * 2], P.white, { out: [0, 0, 1] });
  for (const sx of [-1, 1]) k.box([sx * (w + 0.16), 1.9, z1 - 0.3], [0.1, 0.5, 0.08], P.dark);
}

function truck(fine: boolean) {
  const k = new MeshKit();
  const w = 1.22, e = 0.012;
  cab(k, w, 2.1, 4.3, 2.72, 0.46, fine);
  // chassis rails, then the box body
  k.box([0, 0.72, -1.2], [1.0, 0.3, 6.2], P.dark);
  k.box([0, 2.3, -1.25], [2.5, 2.4, 6.1], P.cargo, { skip: ['y-'] });
  k.quad([-1.05, 1.18, -4.3 - e], [1.05, 1.18, -4.3 - e], [1.05, 3.4, -4.3 - e], [-1.05, 3.4, -4.3 - e], P.trim, { uv: [0, 0, 2, 1], out: [0, 0, -1] });
  for (const sx of [-1, 1]) k.quad([sx * 0.85, 0.72, -4.3 - e], [sx * 1.15, 0.72, -4.3 - e], [sx * 1.15, 0.94, -4.3 - e], [sx * 0.85, 0.94, -4.3 - e], P.tail, { out: [0, 0, -1] });
  if (fine) k.quad([-0.26, 0.62, -4.3 - e], [0.26, 0.62, -4.3 - e], [0.26, 0.73, -4.3 - e], [-0.26, 0.73, -4.3 - e], P.amber, { out: [0, 0, -1] });
  wheels(k, [[w + 0.02, 3.3], [w + 0.02, -2.6]], 0.48, 0.3, fine, true);
  return k.build();
}

/** A tractor unit and a trailer carrying one long container. */
function hauler(fine: boolean) {
  const k = new MeshKit();
  const w = 1.22, e = 0.012;
  cab(k, w, 5.8, 8.0, 2.95, 0.5, fine);
  k.box([0, 0.86, 4.5], [1.1, 0.34, 3.4], P.dark);
  // trailer bed and the container on it
  k.box([0, 1.16, -1.6], [2.44, 0.26, 12.6], P.dark);
  k.box([0, 2.6, -1.6], [2.44, 2.6, 12.2], P.cargo, { skip: ['y-'], uv: [0, 0, 34, 1] });
  // the container's doors and its ribbed sides
  k.quad([-1.1, 1.4, -7.7 - e], [1.1, 1.4, -7.7 - e], [1.1, 3.8, -7.7 - e], [-1.1, 3.8, -7.7 - e], P.trim, { uv: [0, 0, 2, 1], out: [0, 0, -1] });
  for (const sx of [-1, 1]) {
    k.quad([sx * 0.8, 0.86, -7.9 - e], [sx * 1.14, 0.86, -7.9 - e], [sx * 1.14, 1.04, -7.9 - e], [sx * 0.8, 1.04, -7.9 - e], P.tail, { out: [0, 0, -1] });
  }
  k.box([0, 0.94, -7.86], [2.3, 0.2, 0.1], P.dark);
  if (fine) k.quad([-0.26, 0.6, -7.92 - e], [0.26, 0.6, -7.92 - e], [0.26, 0.71, -7.92 - e], [-0.26, 0.71, -7.92 - e], P.amber, { out: [0, 0, -1] });
  wheels(k, [[w + 0.02, 7.0], [w + 0.02, 3.6], [w + 0.02, -5.2], [w + 0.02, -6.5]], 0.5, 0.3, fine, true);
  return k.build();
}

/** A commuter motorbike with its rider. Rides upright: the traffic here never leans. */
function moto(fine: boolean) {
  const k = new MeshKit();
  const r = 0.29;
  // wheels and the machine
  for (const z of [0.68, -0.66]) {
    if (fine) k.wheel([0, r, z], r, 0.12, 12, P.dark, P.dark, 'both', P.metal);
    else k.box([0, r, z], [0.12, r * 1.9, r * 1.8], P.dark);
  }
  k.box([0, 0.5, 0.0], [0.3, 0.34, 0.74], P.dark); // engine
  k.taper([0, 0.6, 0.1], [0.3, 0.6], [0.26, 0.42], 0.24, P.paint, { smooth: 2 }); // tank
  k.box([0, 0.78, -0.42], [0.3, 0.1, 0.7], P.dark); // seat
  k.taper([0, 0.62, -0.84], [0.26, 0.4], [0.2, 0.3], 0.2, P.paint, { smooth: 2 }); // tail
  k.box([0, 0.5, -0.7], [0.14, 0.1, 0.52], P.metal); // exhaust side
  k.posed({ rx: -0.42, pivot: [0, r, 0.68] }, () => {
    for (const sx of [-1, 1]) k.box([sx * 0.09, r + 0.36, 0.68], [0.05, 0.74, 0.06], P.metal);
  });
  k.box([0, 1.02, 0.4], [0.62, 0.04, 0.05], P.dark); // bars
  k.box([0, 0.9, 0.52], [0.2, 0.18, 0.1], P.paint, { parts: { 'z+': P.head } });
  k.box([0, 0.66, -1.0], [0.16, 0.07, 0.03], P.tail);
  if (fine) k.box([0, 0.5, -1.02], [0.2, 0.1, 0.02], P.amber);
  // the rider: helmet, jacket, legs on the pegs, arms to the bars
  const hip: [number, number, number] = [0, 0.86, -0.36];
  k.posed({ rx: 0.34, pivot: hip }, () => {
    k.taper([0, 0.84, -0.36], [0.32, 0.2], [0.38, 0.22], 0.52, P.cloth, { smooth: 3 });
    k.ball([0, 1.52, -0.36], [0.125, 0.135, 0.14], fine ? 8 : 5, fine ? 5 : 3, P.paint);
    if (fine) k.quad([-0.1, 1.5, -0.22], [0.1, 1.5, -0.22], [0.1, 1.57, -0.225], [-0.1, 1.57, -0.225], P.glass, { out: [0, 0, 1] });
  });
  {
    // arms from the leaning shoulders to the bars
    const sy = hip[1] + 0.46 * Math.cos(0.34), sz = hip[2] + 0.46 * Math.sin(0.34);
    for (const sx of [-1, 1]) {
      k.posed({ rx: -1.147, pivot: [sx * 0.21, 1.32, -0.36], at: [0, sy - 1.32, sz + 0.36] }, () => k.box([sx * 0.21, 1.0, -0.36], [0.09, 0.64, 0.1], P.cloth));
    }
  }
  for (const sx of [-1, 1]) {
    k.posed({ rx: -1.25, pivot: [sx * 0.11, 0.86, -0.36] }, () => k.box([sx * 0.13, 0.64, -0.36], [0.13, 0.46, 0.14], P.dark));
    k.posed({ rx: 0.35, pivot: [sx * 0.13, 0.72, 0.06] }, () => k.box([sx * 0.15, 0.5, 0.06], [0.11, 0.46, 0.12], P.dark));
  }
  return k.build();
}

function taxi(fine: boolean) {
  return car(SEDAN, fine, (k) => {
    k.box([0, 1.53, -0.1], [0.5, 0.15, 0.2], P.sign, { skip: ['y-'] });
  });
}

function suv(fine: boolean) {
  return car(SUV, fine, (k) => {
    if (fine) for (const sx of [-1, 1]) k.box([sx * 0.7, 1.76, -0.6], [0.05, 0.05, 2.1], P.dark);
  });
}

export function buildVehicle(kind: Kind, fine: boolean): THREE.BufferGeometry {
  switch (kind) {
    case 'sedan':
      return car(SEDAN, fine);
    case 'hatch':
      return car(HATCH, fine);
    case 'suv':
      return suv(fine);
    case 'mpv':
      return car(MPV, fine);
    case 'taxi':
      return taxi(fine);
    case 'van':
      return car(VAN, fine);
    case 'pickup':
      return car(PICKUP, fine);
    case 'bus':
      return bus(1, fine);
    case 'decker':
      return bus(2, fine);
    case 'truck':
      return truck(fine);
    case 'hauler':
      return hauler(fine);
    case 'moto':
      return moto(fine);
  }
}

/* ---------- colours ---------- */

type RGB = [number, number, number];
// linear albedo. Mostly the whites, silvers and greys real streets are full of, with a few colours among them.
const CAR_PAINT: [number, RGB][] = [
  [0.24, [0.74, 0.74, 0.73]],
  [0.16, [0.42, 0.44, 0.46]],
  [0.14, [0.16, 0.17, 0.19]],
  [0.14, [0.03, 0.03, 0.035]],
  [0.07, [0.36, 0.03, 0.03]],
  [0.07, [0.03, 0.09, 0.26]],
  [0.05, [0.5, 0.46, 0.38]],
  [0.04, [0.05, 0.14, 0.1]],
  [0.04, [0.14, 0.24, 0.34]],
  [0.03, [0.5, 0.2, 0.04]],
  [0.02, [0.32, 0.3, 0.05]],
];
const TAXI_PAINT: RGB[] = [[0.02, 0.12, 0.46], [0.62, 0.42, 0.02], [0.55, 0.56, 0.57], [0.4, 0.03, 0.03], [0.03, 0.3, 0.2]];
const BUS_PAINT: [RGB, RGB][] = [
  [[0.2, 0.42, 0.1], [0.2, 0.42, 0.1]],
  [[0.72, 0.72, 0.7], [0.45, 0.04, 0.05]],
  [[0.7, 0.71, 0.7], [0.04, 0.26, 0.3]],
  [[0.5, 0.3, 0.03], [0.5, 0.3, 0.03]],
];
const CARGO: RGB[] = [[0.7, 0.7, 0.68], [0.5, 0.1, 0.05], [0.05, 0.16, 0.34], [0.08, 0.26, 0.14], [0.52, 0.34, 0.06], [0.36, 0.37, 0.38], [0.4, 0.42, 0.1]];
const CLOTH: RGB[] = [[0.03, 0.03, 0.04], [0.1, 0.12, 0.2], [0.3, 0.05, 0.04], [0.25, 0.27, 0.28], [0.45, 0.32, 0.05], [0.06, 0.2, 0.12]];

const pickW = (list: [number, RGB][], h: number) => {
  let acc = 0;
  for (const [w, c] of list) {
    acc += w;
    if (h < acc) return c;
  }
  return list[0][1];
};
const pick = <T,>(list: T[], h: number) => list[Math.min(list.length - 1, Math.floor(h * list.length))];

/** Body colour and second colour (cargo, clothes, a bus's lower half) for one vehicle, from two random numbers. */
export function livery(kind: Kind, h1: number, h2: number, out: Float32Array, at: number) {
  let a: RGB, b: RGB;
  if (kind === 'taxi') {
    a = pick(TAXI_PAINT, h1);
    b = a;
  } else if (kind === 'bus' || kind === 'decker') [a, b] = pick(BUS_PAINT, h1);
  else if (kind === 'truck' || kind === 'hauler') {
    a = pick([[0.72, 0.72, 0.7], [0.1, 0.2, 0.42], [0.42, 0.06, 0.04], [0.5, 0.4, 0.06], [0.2, 0.22, 0.24]] as RGB[], h1);
    b = pick(CARGO, h2);
  } else if (kind === 'moto') {
    a = pick([[0.03, 0.03, 0.04], [0.4, 0.04, 0.04], [0.7, 0.7, 0.68], [0.04, 0.1, 0.36], [0.5, 0.34, 0.03]] as RGB[], h1);
    b = pick(CLOTH, h2);
  } else if (kind === 'van' || kind === 'pickup') {
    a = pickW(CAR_PAINT.slice(0, 6), h1 * 0.82);
    b = a;
  } else {
    a = pickW(CAR_PAINT, h1);
    b = a;
  }
  out[at] = a[0];
  out[at + 1] = a[1];
  out[at + 2] = a[2];
  out[at + 3] = b[0];
  out[at + 4] = b[1];
  out[at + 5] = b[2];
}

/* ---------- material ---------- */

/**
 * One material for every vehicle. Per instance: aPaint, aSecond (colours) and aState (x: brake light 0..1,
 * y: a random number for small differences). Lit by the shared sun and sky like everything else in the city.
 */
export function vehicleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: SHARED,
    vertexShader: /* glsl */ `
      attribute float aPart;
      attribute vec2 aUv;
      attribute vec3 aPaint;
      attribute vec3 aSecond;
      attribute vec2 aState;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vPart;
      varying vec2 vUv;
      varying vec3 vPaint;
      varying vec3 vSecond;
      varying vec2 vState;
      void main() {
        vec4 wp = instanceMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(instanceMatrix) * normal);
        vPart = aPart;
        vUv = aUv;
        vPaint = aPaint;
        vSecond = aSecond;
        vState = aState;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vPart;
      varying vec2 vUv;
      varying vec3 vPaint;
      varying vec3 vSecond;
      varying vec2 vState;
      ${NOISE}
      ${WORLD}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        float night = 1.0 - uDay;
        float sh = sunShadow(vWorld.xz, vWorld.y + 0.6) * cloudShade(vWorld.xz);
        // street lamps and shop windows: at dusk the street is lit from above and from the sides in warm light
        vec3 lampL = vec3(1.0, 0.62, 0.3) * night * (0.16 + 0.34 * max(n.y, 0.0));
        vec3 light = ambient(n) + sunRadiance() * max(dot(n, uSun), 0.0) * sh + lampL;
        vec3 R = reflect(-V, n);
        vec3 sky = skyColor(vec3(R.x, abs(R.y) + 0.02, R.z));
        float fres = pow(1.0 - max(dot(V, n), 0.0), 4.0);
        int part = int(vPart + 0.5);
        vec3 col;
        if (part == 1) {
          // glass: dark, mirroring the sky; a rubber frame round each pane
          vec2 f = fract(vUv);
          float frame = step(f.x, 0.055) + step(0.945, f.x) + step(f.y, 0.07) + step(0.93, f.y);
          vec3 glass = mix(vec3(0.012, 0.016, 0.02), sky, 0.1 + 0.8 * fres) + lampL * 0.03;
          col = frame > 0.5 ? vec3(0.02) * light : glass;
        } else if (part == 3) {
          col = vec3(1.0, 0.94, 0.82) * (0.8 + 7.0 * night);
        } else if (part == 4) {
          col = vec3(1.0, 0.05, 0.02) * (0.16 + (0.5 + 3.4 * vState.x) * (0.3 + 0.7 * night));
        } else if (part == 8) {
          col = vec3(1.0, 0.72, 0.3) * (0.5 + 3.0 * night);
        } else {
          vec3 base = vPaint;
          float gloss = 0.0;
          if (part == 0) gloss = 1.0;
          else if (part == 2) base = vec3(0.016);
          else if (part == 5) { base = vec3(0.42, 0.43, 0.45); gloss = 0.6; }
          else if (part == 6) base = vec3(0.74);
          else if (part == 7) base = vec3(0.62, 0.42, 0.03);
          else if (part == 9) base = vec3(0.5, 0.32, 0.22);
          else if (part == 10) base = vSecond;
          else if (part == 11) { base = vSecond * (0.84 + 0.16 * smoothstep(0.2, 0.3, abs(fract(vUv.x) - 0.5))); }
          else if (part == 12) base = vec3(0.3, 0.31, 0.32) * (1.0 - 0.5 * step(abs(fract(vUv.x) - 0.5), 0.02));
          else if (part == 13) { base = vSecond; gloss = 1.0; }
          col = base * light;
          // clear coat: the sky in the paint, stronger at a glancing angle
          col += sky * gloss * (0.035 + 0.5 * fres) * (0.35 + 0.65 * sh);
          col += sunRadiance() * gloss * pow(max(dot(R, uSun), 0.0), 60.0) * 0.9 * sh;
        }
        col = mix(col, hazeColor(-V), fogAmount(dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
