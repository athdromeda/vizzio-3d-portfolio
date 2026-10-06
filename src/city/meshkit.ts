// A small mesh builder for the street props (vehicles, people, furniture): quads, boxes, wheels and lofted
// bodies, each face tagged with a "part" number the shader turns into paint, glass, rubber, a lamp and so on.
import * as THREE from 'three';

export type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface FaceOpt {
  /** Faces of the same non-zero group share normals where they meet: a rounded edge instead of a crease. */
  smooth?: number;
  /** [u0, v0, u1, v1] across the quad, a to b is u, a to d is v. The shader draws window frames from it. */
  uv?: [number, number, number, number];
  /** Extra per-vertex number (which limb a vertex belongs to, for the walk cycle). */
  limb?: number;
  /** Which way is out. Default: away from the builder's `centre`. */
  out?: V3;
}

/** A 3x4 transform as rows: rotate about X then Y, then move. Enough to pose a limb or lean a rider. */
export interface Pose {
  at?: V3;
  /** Radians about X (pitch), applied about `pivot`. */
  rx?: number;
  /** Radians about Y. */
  ry?: number;
  /** Radians about Z (roll). */
  rz?: number;
  pivot?: V3;
}

export class MeshKit {
  private pos: number[] = [];
  private nor: number[] = [];
  private part: number[] = [];
  private uv: number[] = [];
  private limb: number[] = [];
  private group: number[] = [];
  /** Faces point away from here unless told otherwise. */
  centre: V3 = [0, 0.8, 0];
  private pose: Pose | null = null;

  /** Everything added inside `fn` is posed: turned about a pivot, then moved. */
  posed(pose: Pose, fn: () => void) {
    const before = this.pose;
    this.pose = pose;
    fn();
    this.pose = before;
  }

  private place(p: V3): V3 {
    const q = this.pose;
    if (!q) return p;
    const pv = q.pivot ?? [0, 0, 0];
    let x = p[0] - pv[0], y = p[1] - pv[1], z = p[2] - pv[2];
    if (q.rz) {
      const c = Math.cos(q.rz), s = Math.sin(q.rz);
      [x, y] = [x * c - y * s, x * s + y * c];
    }
    if (q.rx) {
      const c = Math.cos(q.rx), s = Math.sin(q.rx);
      [y, z] = [y * c - z * s, y * s + z * c];
    }
    if (q.ry) {
      const c = Math.cos(q.ry), s = Math.sin(q.ry);
      [x, z] = [x * c + z * s, -x * s + z * c];
    }
    const at = q.at ?? [0, 0, 0];
    return [x + pv[0] + at[0], y + pv[1] + at[1], z + pv[2] + at[2]];
  }

  tri(a0: V3, b0: V3, c0: V3, part: number, o: FaceOpt = {}, uvs?: [number, number][]) {
    let a = this.place(a0), b = this.place(b0), c = this.place(c0);
    let n = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) return;
    const mid: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const out = o.out ?? sub(mid, this.pose ? this.place(this.centre) : this.centre);
    let u = uvs;
    if (dot(n, out) < 0) {
      [b, c] = [c, b];
      n = [-n[0], -n[1], -n[2]];
      if (u) u = [u[0], u[2], u[1]];
    }
    // area-weighted, so a sliver cannot swing a shared normal
    for (const [i, p] of [a, b, c].entries()) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.part.push(part);
      this.uv.push(u ? u[i][0] : 0.25, u ? u[i][1] : 0.25);
      this.limb.push(o.limb ?? 0);
      this.group.push(o.smooth ?? 0);
    }
  }

  /** a, b, c, d in order round the face. */
  quad(a: V3, b: V3, c: V3, d: V3, part: number, o: FaceOpt = {}) {
    const r = o.uv;
    const ua: [number, number] | undefined = r && [r[0], r[1]], ub: [number, number] | undefined = r && [r[2], r[1]];
    const uc: [number, number] | undefined = r && [r[2], r[3]], ud: [number, number] | undefined = r && [r[0], r[3]];
    // one outward test for both halves, so a bent quad cannot fold
    const out = o.out ?? sub([(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4], this.centre);
    const oo = { ...o, out: this.pose ? undefined : out };
    this.tri(a, b, c, part, oo, r ? [ua!, ub!, uc!] : undefined);
    this.tri(a, c, d, part, oo, r ? [ua!, uc!, ud!] : undefined);
  }

  /** An upright box: centre, size. `skip` leaves faces out: any of 'x+','x-','y+','y-','z+','z-'. */
  box(c: V3, s: V3, part: number, o: FaceOpt & { skip?: string[]; parts?: Partial<Record<string, number>> } = {}) {
    const [x, y, z] = c, [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const p = (sx: number, sy: number, sz: number): V3 => [x + sx * hx, y + sy * hy, z + sz * hz];
    const faces: [string, V3, V3, V3, V3, V3][] = [
      ['x+', p(1, -1, -1), p(1, -1, 1), p(1, 1, 1), p(1, 1, -1), [1, 0, 0]],
      ['x-', p(-1, -1, 1), p(-1, -1, -1), p(-1, 1, -1), p(-1, 1, 1), [-1, 0, 0]],
      ['y+', p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1), [0, 1, 0]],
      ['y-', p(-1, -1, 1), p(1, -1, 1), p(1, -1, -1), p(-1, -1, -1), [0, -1, 0]],
      ['z+', p(1, -1, 1), p(-1, -1, 1), p(-1, 1, 1), p(1, 1, 1), [0, 0, 1]],
      ['z-', p(-1, -1, -1), p(1, -1, -1), p(1, 1, -1), p(-1, 1, -1), [0, 0, -1]],
    ];
    const keep = this.centre;
    this.centre = c;
    for (const [name, a, b, cc, d, out] of faces) {
      if (o.skip?.includes(name)) continue;
      this.quad(a, b, cc, d, o.parts?.[name] ?? part, { smooth: o.smooth, limb: o.limb, uv: o.uv, out: this.pose ? undefined : out });
    }
    this.centre = keep;
  }

  /** A box whose top is a different size from its bottom: a torso, a skirt, a truck's nose. */
  taper(c: V3, bottom: [number, number], top: [number, number], h: number, part: number, o: FaceOpt = {}) {
    const [x, y, z] = c;
    const b = (sx: number, sz: number): V3 => [x + (sx * bottom[0]) / 2, y, z + (sz * bottom[1]) / 2];
    const t = (sx: number, sz: number): V3 => [x + (sx * top[0]) / 2, y + h, z + (sz * top[1]) / 2];
    const keep = this.centre;
    this.centre = [x, y + h / 2, z];
    this.quad(b(1, -1), b(1, 1), t(1, 1), t(1, -1), part, o);
    this.quad(b(-1, 1), b(-1, -1), t(-1, -1), t(-1, 1), part, o);
    this.quad(b(1, 1), b(-1, 1), t(-1, 1), t(1, 1), part, o);
    this.quad(b(-1, -1), b(1, -1), t(1, -1), t(-1, -1), part, o);
    this.quad(t(-1, -1), t(1, -1), t(1, 1), t(-1, 1), part, o);
    this.quad(b(-1, 1), b(1, 1), b(1, -1), b(-1, -1), part, o);
    this.centre = keep;
  }

  /**
   * A wheel lying along X: tread, a tyre wall with the wheel itself set in it on the sides that are seen
   * ('both', or only the 'out' side with a plain disc closing the back), and with `arch` a dark ring round
   * it that reads as the wheel housing in the body.
   */
  wheel(c: V3, r: number, width: number, seg: number, tread: number, cap: number, sides: 'both' | 'out' = 'both', hub = -1, arch = 0) {
    const [x, y, z] = c;
    const sgn = x >= 0 ? 1 : -1;
    const ring = (px: number, k: number, rr = r): V3 => [px, y + Math.cos((k / seg) * Math.PI * 2) * rr, z + Math.sin((k / seg) * Math.PI * 2) * rr];
    const keep = this.centre;
    this.centre = [x, y, z];
    for (let k = 0; k < seg; k++) {
      this.quad(ring(x - width / 2, k), ring(x + width / 2, k), ring(x + width / 2, k + 1), ring(x - width / 2, k + 1), tread, { smooth: 9 });
      for (const sx of [-1, 1]) {
        const o: V3 | undefined = this.pose ? undefined : [sx, 0, 0];
        const px = x + (sx * width) / 2;
        const shown = sides === 'both' || sx === sgn;
        if (hub >= 0 && shown) {
          this.quad(ring(px, k), ring(px, k + 1), ring(px, k + 1, r * 0.62), ring(px, k, r * 0.62), cap, { out: o });
          this.tri([px + sx * 0.012, y, z], ring(px + sx * 0.012, k, r * 0.62), ring(px + sx * 0.012, k + 1, r * 0.62), hub, { out: o });
          if (arch > 0) this.quad(ring(px - sx * 0.008, k, r), ring(px - sx * 0.008, k + 1, r), ring(px - sx * 0.008, k + 1, r + arch), ring(px - sx * 0.008, k, r + arch), cap, { out: o });
        } else {
          this.tri([px, y, z], ring(px, k), ring(px, k + 1), cap, { out: o });
        }
      }
    }
    this.centre = keep;
  }

  /** A low ball: a head, a helmet, a lamp globe. `from`/`to` (0 top .. 1 bottom) cut a cap or a band out of it. */
  ball(c: V3, r: V3, seg: number, rings: number, part: number, o: FaceOpt & { from?: number; to?: number } = {}) {
    const p = (i: number, j: number): V3 => {
      const v = (o.from ?? 0) + ((o.to ?? 1) - (o.from ?? 0)) * (j / rings);
      const th = v * Math.PI, ph = (i / seg) * Math.PI * 2;
      return [c[0] + Math.sin(th) * Math.cos(ph) * r[0], c[1] + Math.cos(th) * r[1], c[2] + Math.sin(th) * Math.sin(ph) * r[2]];
    };
    const keep = this.centre;
    this.centre = c;
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) this.quad(p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1), part, { ...o, smooth: o.smooth ?? 8 });
    this.centre = keep;
  }

  get vertices() {
    return this.pos.length / 3;
  }

  build() {
    const n = this.pos.length / 3;
    const nor = new Float32Array(n * 3);
    // faces of one smooth group share a normal wherever they meet
    const sums = new Map<string, V3>();
    const key = (i: number) => `${this.group[i]}|${Math.round(this.pos[i * 3] * 500)}|${Math.round(this.pos[i * 3 + 1] * 500)}|${Math.round(this.pos[i * 3 + 2] * 500)}`;
    for (let i = 0; i < n; i++) {
      if (!this.group[i]) continue;
      const k = key(i);
      const s = sums.get(k) ?? [0, 0, 0];
      s[0] += this.nor[i * 3];
      s[1] += this.nor[i * 3 + 1];
      s[2] += this.nor[i * 3 + 2];
      sums.set(k, s);
    }
    for (let i = 0; i < n; i++) {
      const s: V3 = this.group[i] ? sums.get(key(i))! : [this.nor[i * 3], this.nor[i * 3 + 1], this.nor[i * 3 + 2]];
      const l = Math.hypot(s[0], s[1], s[2]) || 1;
      nor[i * 3] = s[0] / l;
      nor[i * 3 + 1] = s[1] / l;
      nor[i * 3 + 2] = s[2] / l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aLimb', new THREE.Float32BufferAttribute(this.limb, 1));
    return g;
  }
}

/** One cross-section of a lofted body, looking along it. Mirrored left to right. */
export interface Station {
  z: number;
  /** Half width at the waist (belt line), and the height of that line. */
  w: number;
  yb: number;
  /** Roof height here. Equal (or nearly) to `yb` where there is no cabin: bonnet, boot, load bed. */
  yr: number;
  /** Underside. */
  c: number;
  /** No side window in the panel that starts here (a van's load space). */
  blind?: boolean;
  /** Part number for the top surface that starts here, instead of paint (a pickup's bed cover). */
  top?: number;
}

export interface LoftParts {
  paint: number;
  glass: number;
  /** Leave out the two extra edge rows: the far-away version. */
  coarse?: boolean;
  /** How far the cabin leans in from waist to roof. */
  lean?: number;
}

/** Skin a row of stations: sides, windows where two cabin stations meet, screens where cabin meets deck. */
export function loft(k: MeshKit, st: Station[], parts: LoftParts) {
  const lean = parts.lean ?? 0.17;
  const cabin = (s: Station) => s.yr - s.yb > 0.3;
  const ring = (s: Station): V3[] => {
    const cab = cabin(s);
    const half: [number, number][] = parts.coarse
      ? [[s.w - 0.04, s.c], [s.w, s.yb], cab ? [s.w - lean - 0.05, s.yr] : [s.w - 0.08, s.yr]]
      : [
          [s.w - 0.06, s.c],
          [s.w, s.c + Math.min(0.2, (s.yb - s.c) * 0.4)],
          [s.w, s.yb],
          cab ? [s.w - lean, s.yr - 0.07] : [s.w - 0.03, s.yb + (s.yr - s.yb) * 0.5],
          cab ? [s.w - lean - 0.09, s.yr] : [s.w - 0.11, s.yr],
        ];
    const left: V3[] = half.map(([x, y]) => [x, y, s.z]);
    const right: V3[] = half.map(([x, y]): V3 => [-x, y, s.z]).reverse();
    return [...left, ...right];
  };
  const h = parts.coarse ? 3 : 5; // points per side
  const zMid = (st[0].z + st[st.length - 1].z) / 2;
  const keep = k.centre;
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], b = st[i + 1], ra = ring(a), rb = ring(b);
    const both = cabin(a) && cabin(b), one = cabin(a) !== cabin(b);
    k.centre = [0, (a.c + Math.max(a.yb, b.yb)) / 2, (a.z + b.z) / 2];
    for (let s = 0; s < ra.length - 1; s++) {
      const top = s === h - 1;
      const window = s === h - (parts.coarse ? 2 : 3) || s === h + (parts.coarse ? 0 : 1);
      let part = parts.paint, uv: FaceOpt['uv'], smooth = 1;
      if (top && one) {
        part = parts.glass; // windscreen or rear screen
        uv = [0, 0, 1, 1];
        smooth = 0;
      } else if (top && a.top !== undefined) {
        part = a.top;
        smooth = 0;
      } else if (window && both && !a.blind) {
        part = parts.glass;
        uv = [0, 0, 1, 1];
        smooth = 0;
      }
      // u runs along the car, v up the glass
      if (top) k.quad(ra[s], ra[s + 1], rb[s + 1], rb[s], part, { smooth, uv, out: [0, 1, 0] });
      else k.quad(ra[s], rb[s], rb[s + 1], ra[s + 1], part, { smooth, uv });
    }
  }
  // the two ends, flat
  for (const [s, dir] of [[st[0], -1], [st[st.length - 1], 1]] as [Station, number][]) {
    const r = ring(s);
    k.centre = [0, s.yb / 2, zMid];
    for (let i = 1; i < r.length - 1; i++) k.tri(r[0], r[i], r[i + 1], parts.paint, { out: [0, 0, dir], smooth: 1 });
  }
  k.centre = keep;
}
