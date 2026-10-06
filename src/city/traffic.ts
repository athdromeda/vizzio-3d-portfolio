// Who is where in the streets. Nothing here is simulated step by step: the position of every vehicle, walker
// and cyclist is a function of the clock, so the same second always shows the same street, anywhere in the
// city, with nothing stored. What makes that possible is one signal cycle the whole city keeps:
//
//   north-south streets get green, every car on them moves up exactly one block and stops again;
//   then the east-west streets do the same. While a street's cars stand, people cross it.
//
// A block is four car slots long, so a car always comes to rest in the same place relative to the junction:
// three slots queue behind the stop line and the fourth, which would sit on the far crossing, stays empty.
// The ground shader paints the distant traffic from the same numbers (see `traffic` in shaders.ts).
import { BLOCK, ROAD, gridToWorld, inLandmark, landSdf, parkSdf, warp } from './layout';
import { AMBER, BUSY, CYCLE, FRONT0, GREEN, LANES, SLOT, STOP_FRONT, STOP_LINE, ZEBRA } from './trafficRules';
import { KINDS, SIZE, type Kind } from './vehicles';

export { AMBER, BUSY, CYCLE, FRONT0, GREEN, LANES, SLOT, STOP_FRONT, STOP_LINE, ZEBRA };
const CYCLE_LANE = 8.35;
/** Two lines of walkers on each pavement, metres from the road's centre line. */
const WALKS = [10.6, 12.7];

const fract = (v: number) => v - Math.floor(v);
const mod = (v: number, m: number) => v - m * Math.floor(v / m);
/** The ground shader's hash, near enough: only the look of the randomness has to match, not each number. */
export function hash12(x: number, y: number) {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = a;
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return fract((a + b) * c);
}

/* ---------- the signal cycle ---------- */

const RAMP = 0.28; // share of a move spent pulling away, and again braking
const profile = (x: number) => (x < RAMP ? (x * x) / (2 * RAMP * (1 - RAMP)) : x < 1 - RAMP ? (2 * x - RAMP) / (2 * (1 - RAMP)) : 1 - ((1 - x) * (1 - x)) / (2 * RAMP * (1 - RAMP)));
const pace = (x: number) => (x <= 0 || x >= 1 ? 0 : x < RAMP ? x / RAMP : x < 1 - RAMP ? 1 : (1 - x) / RAMP);

/**
 * Metres a vehicle has covered by time t, when it pulls away `delay` seconds after its axis turns green and
 * takes `dur` seconds over the block. Axis 0 is the north-south streets, 1 the east-west ones.
 */
export function advance(t: number, axis: number, delay: number, dur: number) {
  const tt = t - (axis * CYCLE) / 2 - delay;
  const k = Math.floor(tt / CYCLE);
  const x = (tt - k * CYCLE) / dur;
  return BLOCK * (k + (x >= 1 ? 1 : profile(x)));
}
/** The same move as a speed in m/s, and whether the brake lamps are on. */
function moving(t: number, axis: number, delay: number, dur: number, out: { speed: number; brake: number }) {
  const x = mod(t - (axis * CYCLE) / 2 - delay, CYCLE) / dur;
  out.speed = (pace(x) * BLOCK) / dur / (1 - RAMP);
  out.brake = x > 1 - RAMP ? 1 : 0;
}

/** What the ground shader needs for the painted, far-away traffic: how far each axis has moved. */
export const flow = (t: number, axis: number) => advance(t, axis, 0.9, 9.6);

const lamps = { car: [0, 2], walk: [0, 0] };
/**
 * The lamps at time t. car[axis]: 0 green, 1 amber, 2 red for the traffic on that axis.
 * walk[axis]: 1 while people may cross a street of that axis, 0.5 while their green man flashes, else 0.
 */
export function lights(t: number) {
  for (let axis = 0; axis < 2; axis++) {
    const tc = mod(t - (axis * CYCLE) / 2, CYCLE);
    lamps.car[axis] = tc < GREEN ? 0 : tc < GREEN + AMBER ? 1 : 2;
    lamps.walk[axis] = tc >= WALK_AT && tc < 23 ? 1 : tc >= 23 && tc < 28.5 ? 0.5 : 0;
  }
  return lamps;
}
/** Seconds into a street's own cycle at which people start across it: its cars have all come to rest. */
const WALK_AT = GREEN + AMBER + 0.5;

/* ---------- lanes and pavements as lines in the world ---------- */

// A lane is a straight line in grid space and a curve in the world. Each line keeps the world position of
// points along it, worked out once; a vehicle is placed between the two nearest. That costs a few numbers
// per vehicle instead of unbending the street grid for each one, every frame.
const STEP = SLOT / 2;
const WINDOW = 256;
const tmp = new Float64Array(6);
const LIMITS = [-30.5 * BLOCK, 62.5 * BLOCK, -40.5 * BLOCK, 18.5 * BLOCK];

class Line {
  private base = 0;
  private state = new Uint8Array(WINDOW); // 0 unknown, 1 no street here, 2 street
  private p = new Float64Array(WINDOW * 4);
  constructor(private ns: boolean, private across: number) {}

  private fill(i: number, k: number) {
    if (this.state[i]) return;
    const along = k * STEP;
    const gx = this.ns ? this.across : along, gz = this.ns ? along : this.across;
    gridToWorld(gx, gz, tmp);
    const x = tmp[0], z = tmp[1];
    this.p[i * 4] = x;
    this.p[i * 4 + 1] = z;
    this.p[i * 4 + 2] = this.ns ? tmp[4] : tmp[2];
    this.p[i * 4 + 3] = this.ns ? tmp[5] : tmp[3];
    // a street only where the ground shader draws one: on dry land, outside parks, inside the city
    const street = gx > LIMITS[0] && gx < LIMITS[1] && gz > LIMITS[2] && gz < LIMITS[3] && landSdf(x, z) > 24 && parkSdf(x, z) > 6 && !inLandmark(x, z, 8);
    this.state[i] = street ? 2 : 1;
  }

  /** World position at `along` and the unit vector toward +along: out = [x, z, tx, tz]. False where there is no street. */
  at(along: number, out: Float64Array) {
    const f = along / STEP, k = Math.floor(f), t = f - k;
    let a = k - this.base;
    if (a < 0 || a >= WINDOW - 1) {
      // out of the remembered stretch: start a new one around here
      this.base = k - WINDOW / 2;
      this.state.fill(0);
      a = WINDOW / 2;
    }
    this.fill(a, k);
    this.fill(a + 1, k + 1);
    const p = this.p, i = a * 4, j = i + 4;
    out[0] = p[i] + (p[j] - p[i]) * t;
    out[1] = p[i + 1] + (p[j + 1] - p[i + 1]) * t;
    out[2] = p[i + 2] + (p[j + 2] - p[i + 2]) * t;
    out[3] = p[i + 3] + (p[j + 3] - p[i + 3]) * t;
    return this.state[a] === 2 && this.state[a + 1] === 2;
  }
}

const lines = new Map<number, Line>();
function line(ns: boolean, m: number, code: number, across: number) {
  const key = ((ns ? 0 : 4096) + m + 1024) * 64 + code;
  let l = lines.get(key);
  if (!l) {
    if (lines.size > 4000) lines.clear();
    l = new Line(ns, across);
    lines.set(key, l);
  }
  return l;
}

/* ---------- vehicles ---------- */

const KIND_INDEX = Object.fromEntries(KINDS.map((k, i) => [k, i])) as Record<Kind, number>;
// [share, kind] per lane. The kerb lane carries the buses and lorries.
const MIX: [number, Kind][][] = [
  [[0.14, 'taxi'], [0.09, 'moto'], [0.05, 'van'], [0.03, 'pickup'], [0.19, 'sedan'], [0.16, 'hatch'], [0.19, 'suv'], [0.15, 'mpv']],
  [[0.08, 'bus'], [0.05, 'decker'], [0.05, 'truck'], [0.02, 'hauler'], [0.08, 'van'], [0.04, 'pickup'], [0.13, 'taxi'], [0.11, 'moto'], [0.13, 'sedan'], [0.11, 'hatch'], [0.11, 'suv'], [0.09, 'mpv']],
];
function kindFor(h: number, lane: number) {
  let acc = 0;
  for (const [w, k] of MIX[lane]) {
    acc += w;
    if (h < acc) return k;
  }
  return 'sedan';
}

export interface VehicleAt {
  kind: number;
  x: number;
  z: number;
  /** Unit vector the nose points along. */
  fx: number;
  fz: number;
  /** Two random numbers that stay with this vehicle: its colours and small differences. */
  h1: number;
  h2: number;
  speed: number;
  brake: number;
}
const V: VehicleAt = { kind: 0, x: 0, z: 0, fx: 0, fz: 1, h1: 0, h2: 0, speed: 0, brake: 0 };
const o4 = new Float64Array(4);
const mv = { speed: 0, brake: 0 };

/** Every vehicle within `half` metres (a square, in street-grid space) of a point, at time t. */
export function eachVehicle(cx: number, cz: number, t: number, half: number, emit: (v: VehicleAt) => void) {
  const w = warp(cx, cz);
  const gx = cx + w[0], gz = cz + w[1];
  for (let axis = 0; axis < 2; axis++) {
    const ns = axis === 0;
    const gAcross = ns ? gx : gz, gAlong = ns ? gz : gx;
    const f0 = BLOCK * Math.floor((t - (axis * CYCLE) / 2) / CYCLE); // every vehicle has covered between f0 and f0 + BLOCK
    const m0 = Math.ceil((gAcross - half - ROAD) / BLOCK - 0.5), m1 = Math.floor((gAcross + half + ROAD) / BLOCK - 0.5);
    for (let m = m0; m <= m1; m++) {
      const road = m + 0.5;
      for (let si = 0; si < 2; si++) {
        const side = si ? -1 : 1;
        // keep left: on a north-south street the west half (side +1) runs north, on an east-west one the north half runs east
        const dir = ns ? -side : side;
        const uC = dir * gAlong;
        for (let lane = 0; lane < 2; lane++) {
          const across = road * BLOCK - side * LANES[lane];
          if (Math.abs(across - gAcross) > half) continue;
          const lid = (ns ? road : road + 300) * 4 + lane * 2 + si;
          const L = line(ns, m, si * 2 + lane, across);
          const n0 = Math.ceil((uC - half - FRONT0 - f0 - BLOCK) / SLOT), n1 = Math.floor((uC + half + 16 - FRONT0 - f0) / SLOT);
          for (let n = n0; n <= n1; n++) {
            const place = mod(n, 4);
            if (place === 2) continue; // the slot on the far crossing
            if (hash12(n, lid) > BUSY) continue;
            const queue = place === 1 ? 0 : place === 0 ? 1 : 2;
            const h2 = hash12(n, lid + 3.7);
            const delay = 0.4 + 0.75 * queue + 0.5 * h2, dur = 9 + hash12(n, lid + 5.3);
            const h1 = hash12(n, lid + 11.1);
            const kind = kindFor(h1, lane);
            const len = SIZE[kind].len;
            const u = SLOT * n + FRONT0 + advance(t, axis, delay, dur) - len / 2;
            if (Math.abs(u - uC) > half + len / 2) continue;
            if (!L.at(u * dir, o4)) continue;
            V.kind = KIND_INDEX[kind];
            V.fx = o4[2] * dir;
            V.fz = o4[3] * dir;
            // a motorbike keeps to one side of its lane
            const off = kind === 'moto' ? (h2 - 0.5) * 1.5 : 0;
            V.x = o4[0] + V.fz * off;
            V.z = o4[1] - V.fx * off;
            V.h1 = fract(h1 * 37.7);
            V.h2 = h2;
            moving(t, axis, delay, dur, mv);
            V.speed = mv.speed;
            V.brake = mv.brake;
            emit(V);
          }
        }
      }
    }
  }
}

/* ---------- people ---------- */

export interface PersonAt {
  x: number;
  z: number;
  fx: number;
  fz: number;
  /** Stride phase in radians, and how hard the legs work: 0 standing, 1 walking, about 1.7 running. */
  phase: number;
  amount: number;
  /** A random number that stays with this person: clothes, build, height. */
  seed: number;
  /** 0 walker, 1 slow walker, 2 runner, 3 cyclist. */
  type: number;
}
const Q: PersonAt = { x: 0, z: 0, fx: 0, fz: 1, phase: 0, amount: 0, seed: 0, type: 0 };
const PER_LEG = 7; // walkers that may share one block of one line
const KERB = ROAD / 2;

/**
 * Everyone on foot within `half` metres. A walker's life is one block long and repeats: cross the street when
 * its cars have stopped, walk the block at their own pace, wait at the next kerb for the lamp. How long
 * they wait is whatever their pace leaves over, so the corners fill up before each change.
 */
export function eachWalker(cx: number, cz: number, t: number, half: number, emit: (p: PersonAt) => void) {
  const w = warp(cx, cz);
  const gx = cx + w[0], gz = cz + w[1];
  for (let axis = 0; axis < 2; axis++) {
    const ns = axis === 0;
    const gAcross = ns ? gx : gz, gAlong = ns ? gz : gx;
    // walking along this axis means crossing streets of the other one; their walk lamp comes on here in the cycle
    const walkAt = mod(WALK_AT + ((1 - axis) * CYCLE) / 2, CYCLE);
    const m0 = Math.ceil((gAcross - half - 14) / BLOCK - 0.5), m1 = Math.floor((gAcross + half + 14) / BLOCK - 0.5);
    for (let m = m0; m <= m1; m++) {
      const road = m + 0.5;
      for (let si = 0; si < 2; si++) {
        const side = si ? -1 : 1;
        for (let k = 0; k < 2; k++) {
          const across = road * BLOCK - side * WALKS[k];
          if (Math.abs(across - gAcross) > half) continue;
          const way = (k === 0) === (side > 0) ? 1 : -1;
          const tid = (ns ? road : road + 300) * 8 + k * 2 + si + 0.25;
          const busy = 0.3 + 0.62 * hash12(tid, 1.7); // some streets are busier than others
          const L = line(ns, m, 8 + si * 2 + k, across);
          // s runs the way they walk, with the centre of each crossed street at a multiple of BLOCK
          const sC = way * gAlong - BLOCK / 2;
          const l0 = Math.floor((sC - half) / BLOCK) - 1, l1 = Math.floor((sC + half) / BLOCK) + 1;
          for (let leg = l0; leg <= l1; leg++) {
            for (let i = 0; i < PER_LEG; i++) {
              const type = i < 5 ? 0 : i === 5 ? 1 : 2;
              const period = type === 0 ? 90 : type === 1 ? 120 : 60;
              const q0 = Math.floor(t / period);
              for (let j = leg - q0; j <= leg - q0 + 2; j++) {
                const id = j * PER_LEG + i;
                const h = hash12(id, tid);
                if (h > busy * (type === 2 ? 0.45 : 1)) continue;
                const start = CYCLE * Math.floor(hash12(id, tid + 2.3) * (period / CYCLE)) + walkAt + 0.3 + 2.9 * hash12(id, tid + 4.1);
                const lap = Math.floor((t - start) / period);
                if (j + lap !== leg) continue;
                const tau = t - start - lap * period;
                const h3 = hash12(id, tid + 6.9);
                const wait = -(KERB + 0.9 + 1.9 * hash12(id, tid + 8.3));
                const far = KERB + 0.6;
                const vc = type === 2 ? 2.7 + 0.5 * h3 : type === 1 ? 1.46 + 0.08 * h3 : 1.52 + 0.22 * h3;
                const v = type === 2 ? vc : type === 1 ? 0.92 + 0.16 * h3 : 1.26 + 0.34 * h3;
                const tCross = (far - wait) / vc, tWalk = (BLOCK + wait - far) / v;
                let s: number, going: number;
                if (tau < tCross) {
                  s = wait + vc * tau;
                  going = Math.min(1, tau / 0.4);
                } else if (tau < tCross + tWalk) {
                  s = far + v * (tau - tCross);
                  going = Math.min(1, (tCross + tWalk - tau) / 0.4);
                } else {
                  s = BLOCK + wait;
                  going = 0;
                }
                const sAbs = BLOCK * leg + s;
                if (Math.abs(sAbs - sC) > half) continue;
                if (!L.at(way * (sAbs + BLOCK / 2), o4)) continue;
                Q.fx = o4[2] * way;
                Q.fz = o4[3] * way;
                const off = (h3 - 0.5) * 0.7;
                Q.x = o4[0] + Q.fz * off;
                Q.z = o4[1] - Q.fx * off;
                Q.phase = sAbs * (type === 2 ? 3.3 : 4.2) + h * 40;
                Q.amount = going * (type === 2 ? 1.7 : type === 1 ? 0.8 : 1);
                Q.seed = h3;
                Q.type = type;
                emit(Q);
              }
            }
          }
        }
      }
    }
  }
}

/** Cyclists keep to the edge of the carriageway and ride with the traffic: one block per green, at their own speed. */
export function eachCyclist(cx: number, cz: number, t: number, half: number, emit: (p: PersonAt) => void) {
  const w = warp(cx, cz);
  const gx = cx + w[0], gz = cz + w[1];
  for (let axis = 0; axis < 2; axis++) {
    const ns = axis === 0;
    const gAcross = ns ? gx : gz, gAlong = ns ? gz : gx;
    const f0 = BLOCK * Math.floor((t - (axis * CYCLE) / 2) / CYCLE);
    const m0 = Math.ceil((gAcross - half - ROAD) / BLOCK - 0.5), m1 = Math.floor((gAcross + half + ROAD) / BLOCK - 0.5);
    for (let m = m0; m <= m1; m++) {
      const road = m + 0.5;
      for (let si = 0; si < 2; si++) {
        const side = si ? -1 : 1;
        const dir = ns ? -side : side;
        const across = road * BLOCK - side * CYCLE_LANE;
        if (Math.abs(across - gAcross) > half) continue;
        const lid = (ns ? road : road + 300) * 4 + si + 0.5;
        const L = line(ns, m, 16 + si, across);
        const uC = dir * gAlong;
        const n0 = Math.ceil((uC - half - f0 - BLOCK * 1.5) / BLOCK), n1 = Math.floor((uC + half - f0) / BLOCK) + 1;
        for (let n = n0; n <= n1; n++) {
          for (let second = 0; second < 2; second++) {
            const id = n * 2 + second;
            const h = hash12(id, lid);
            if (h > (second ? 0.12 : 0.34)) continue;
            const h2 = hash12(id, lid + 3.1);
            const delay = 0.7 + 1.1 * h2 + second * 0.9, dur = 20 + 3.5 * hash12(id, lid + 5.9);
            const gone = advance(t, axis, delay, dur);
            const u = BLOCK * n + BLOCK / 2 - STOP_FRONT - 0.9 - second * 2.7 + gone;
            if (Math.abs(u - uC) > half) continue;
            if (!L.at(u * dir, o4)) continue;
            Q.fx = o4[2] * dir;
            Q.fz = o4[3] * dir;
            const off = (h2 - 0.5) * 0.3;
            Q.x = o4[0] + Q.fz * off;
            Q.z = o4[1] - Q.fx * off;
            moving(t, axis, delay, dur, mv);
            Q.phase = gone * 2.4 + h * 30;
            Q.amount = mv.speed > 0.05 ? 1 : 0;
            Q.seed = h2;
            Q.type = 3;
            emit(Q);
          }
        }
      }
    }
  }
}
