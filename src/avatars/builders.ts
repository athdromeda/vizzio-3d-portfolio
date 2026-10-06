// Placeholder flyers, modelled in code as hard-surface craft with PBR materials,
// procedural surface textures and printed markings.
// Original designs: swap any of them for a GLB through `model` in src/data/avatars.ts.
// Convention: front faces +Z, up is +Y, the model fits a box about 2 units across.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AvatarKind } from '../data/avatars';
import { PALETTE } from '../styles/palette';

const TAU = Math.PI * 2;
type V3 = [number, number, number];

/* ---------- procedural textures ---------- */

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

/** 2x2 twill weave, used as colour and bump for carbon parts. */
const carbonWeave = (repeat: number) =>
  canvasTexture(
    64,
    (ctx, s) => {
      const h = s / 2;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const g = (i + j) % 2 === 0 ? ctx.createLinearGradient(0, j * h, 0, j * h + h) : ctx.createLinearGradient(i * h, 0, i * h + h, 0);
          g.addColorStop(0, '#5a5f68');
          g.addColorStop(0.5, '#c9ced6');
          g.addColorStop(1, '#5a5f68');
          ctx.fillStyle = g;
          ctx.fillRect(i * h, j * h, h, h);
        }
      }
    },
    repeat,
  );

/** Fine noise: breaks up large flat surfaces so highlights look like real paint or cloth. */
const grain = (repeat: number, contrast: number) =>
  canvasTexture(
    128,
    (ctx, s) => {
      const img = ctx.createImageData(s, s);
      let seed = 7;
      for (let i = 0; i < img.data.length; i += 4) {
        seed = (seed * 16807) % 2147483647;
        const v = 128 + ((seed / 2147483647) * 2 - 1) * contrast;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    },
    repeat,
  );

/** Printed marking on a transparent plane, e.g. a call sign or registration. */
function label(parent: THREE.Object3D, text: string, width: number, pos: V3, rot: V3 = [0, 0, 0], color = '#10151d') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.font = "600 64px 'Martian Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 52, 480);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, (width * 96) / 512),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.position.set(...pos);
  m.rotation.set(...rot);
  parent.add(m);
  return m;
}

/* ---------- materials ---------- */

function makeMats() {
  const phys = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(p);
  const weave = carbonWeave(10);
  const paintGrain = grain(6, 26);
  const clothGrain = grain(14, 90);
  /** lamps are far brighter than lit paint, so only they cross the bloom threshold */
  const lit = (color: number, gain: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gain) });
  const paint = phys({
    color: PALETTE.shell,
    roughness: 0.34,
    roughnessMap: paintGrain,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  return {
    /** glossy painted shell */
    paint,
    /** same paint for thin open shells (armour plates) */
    plate: Object.assign(paint.clone(), { side: THREE.DoubleSide }),
    /** anodised dark metal */
    dark: phys({ color: PALETTE.graphite, roughness: 0.4, roughnessMap: paintGrain, metalness: 0.8 }),
    /** carbon fibre: woven, under a lacquer coat */
    carbon: phys({
      color: 0x2a2f38,
      map: weave,
      bumpMap: weave,
      bumpScale: 0.6,
      roughness: 0.42,
      metalness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
    }),
    /** bare machined metal */
    metal: phys({ color: PALETTE.steel, roughness: 0.3, roughnessMap: paintGrain, metalness: 1 }),
    /** flight-suit fabric */
    suit: phys({ color: PALETTE.fabric, roughness: 0.9, bumpMap: clothGrain, bumpScale: 1.2, metalness: 0, sheen: 0.8, sheenRoughness: 0.45, sheenColor: 0x8fa0c0 }),
    /** rubber: soles, hoses, grips */
    rubber: phys({ color: 0x0b0e13, roughness: 0.78, bumpMap: clothGrain, bumpScale: 0.6, metalness: 0 }),
    accent: phys({ color: PALETTE.signal, roughness: 0.26, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 }),
    /** mirrored dark glass: visors, lenses, sensor windows */
    glass: phys({ color: 0x05080f, roughness: 0.03, metalness: 0.95, envMapIntensity: 2.6, clearcoat: 1 }),
    lampBlue: lit(PALETTE.signalSoft, 12),
    lampMint: lit(PALETTE.live, 12),
    /** light strips: bright, but below the bloom threshold so large ones do not flare */
    stripBlue: lit(PALETTE.signalSoft, 2.2),
    stripMint: lit(PALETTE.live, 2.2),
    blur: new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }),
    flame: new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.signal).multiplyScalar(1.6),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  };
}
type Mats = ReturnType<typeof makeMats>;

interface Fx {
  spinners: THREE.Object3D[];
  flames: THREE.Object3D[];
}

/* ---------- geometry helpers ---------- */

const rbox = (w: number, h: number, d: number, r = 0.03, seg = 4) => new RoundedBoxGeometry(w, h, d, seg, r);
const cyl = (rt: number, rb: number, h: number, seg = 40) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number) => new THREE.SphereGeometry(r, 40, 24);
const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 10, 28);
const torus = (R: number, r: number) => new THREE.TorusGeometry(R, r, 14, 48);
const lathe = (pts: [number, number][], phiStart = 0, phiLength = TAU) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 48, phiStart, phiLength);
/** Tapered limb segment hanging down from the origin. */
const limb = (rTop: number, rBot: number, len: number) => cyl(rTop, rBot, len, 32).translate(0, -len / 2, 0);
/** Open curved shell: an armour plate wrapped around the front of a limb (centred on +Z). */
const shell = (rTop: number, rBot: number, len: number, arc: number) =>
  new THREE.CylinderGeometry(rTop, rBot, len, 32, 1, true, -arc / 2, arc);

function add(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: V3 = [0, 0, 0],
  rot: V3 = [0, 0, 0],
  scale: V3 = [1, 1, 1],
) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  parent.add(m);
  return m;
}

/** A round tube between two points. */
function tube(parent: THREE.Object3D, a: V3, b: V3, r: number, mat: THREE.Material) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const m = new THREE.Mesh(cyl(r, r, va.distanceTo(vb), 20), mat);
  m.position.copy(va).lerp(vb, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  parent.add(m);
  return m;
}

/** A flexible hose through a few points. */
function hose(parent: THREE.Object3D, pts: THREE.Vector3[], r: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, r, 10), mat);
  parent.add(m);
  return m;
}

let glowTex: THREE.Texture | null = null;
function glowTexture() {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  return glowTex;
}

/** Soft additive halo for lamps and exhausts. */
function halo(parent: THREE.Object3D, color: number, size: number, pos: V3, opacity = 0.9) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  s.scale.setScalar(size);
  s.position.set(...pos);
  parent.add(s);
  return s;
}

/** Nav lamp: a small lit bead in a dark bezel, with a halo. */
function lamp(parent: THREE.Object3D, m: Mats, mint: boolean, pos: V3, r = 0.013) {
  add(parent, sph(r * 1.35), m.dark, pos, [0, 0, 0], [1, 0.6, 1]);
  add(parent, sph(r), mint ? m.lampMint : m.lampBlue, pos);
  halo(parent, mint ? PALETTE.live : PALETTE.signalSoft, r * 10, pos, 0.5);
}

/** Propeller: hub, pitched tapered blades and a faint motion-blur disc. Spins around its local Y. */
function rotor(m: Mats, fx: Fx, radius: number, blades: number, speed: number) {
  const g = new THREE.Group();
  add(g, cyl(0.024, 0.032, 0.04), m.metal);
  add(g, sph(0.026), m.metal, [0, 0.02, 0], [0, 0, 0], [1, 0.7, 1]);
  for (let i = 0; i < blades; i++) {
    // blade: wide at the root, narrow at the tip, with a raised tip stripe
    const geo = rbox(radius, 0.006, radius * 0.17, 0.003, 2);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const t = p.getX(k) / radius + 0.5;
      p.setZ(k, p.getZ(k) * (1 - 0.55 * t * t) + 0.012 * Math.sin(t * Math.PI));
    }
    geo.translate(radius / 2, 0, 0);
    geo.computeVertexNormals();
    const b = add(g, geo, m.carbon, [0, 0.006, 0]);
    b.rotation.order = 'YXZ';
    b.rotation.set(0.16, (i / blades) * TAU, 0);
    const tip = add(b, rbox(radius * 0.08, 0.007, radius * 0.07, 0.002, 1), m.accent, [radius * 0.95, 0, 0.006]);
    tip.castShadow = false;
  }
  add(g, new THREE.CircleGeometry(radius, 64), m.blur, [0, 0.004, 0], [-Math.PI / 2, 0, 0]);
  g.userData.speed = speed;
  fx.spinners.push(g);
  return g;
}

/** Micro jet turbine pointing down its local -Y: intake lip, compressor cone, bands, nozzle, plume. */
function turbine(m: Mats, fx: Fx, r: number, h: number) {
  const g = new THREE.Group();
  add(g, cyl(r, r * 0.94, h), m.metal);
  add(g, torus(r * 0.98, r * 0.12), m.dark, [0, h / 2, 0], [Math.PI / 2, 0, 0]);
  add(g, cyl(r * 0.8, r * 0.8, 0.01), m.rubber, [0, h / 2 - 0.014, 0]);
  add(g, new THREE.ConeGeometry(r * 0.32, r * 0.7, 24), m.metal, [0, h / 2 + r * 0.05, 0]);
  for (let i = 0; i < 6; i++) {
    // intake guide vanes
    add(g, rbox(r * 0.78, 0.012, 0.006, 0.002, 1), m.dark, [0, h / 2 - 0.005, 0], [0, (i / 6) * Math.PI, 0]);
  }
  add(g, torus(r * 1.0, r * 0.06), m.accent, [0, h * 0.2, 0], [Math.PI / 2, 0, 0]);
  add(g, torus(r * 0.985, r * 0.045), m.dark, [0, -h * 0.12, 0], [Math.PI / 2, 0, 0]);
  add(g, torus(r * 0.96, r * 0.045), m.dark, [0, -h * 0.3, 0], [Math.PI / 2, 0, 0]);
  add(g, cyl(r * 0.84, r * 0.6, h * 0.26), m.dark, [0, -h / 2 - h * 0.13, 0]);
  add(g, torus(r * 0.6, r * 0.05), m.metal, [0, -h / 2 - h * 0.26, 0], [Math.PI / 2, 0, 0]);
  const plume = new THREE.Group();
  plume.position.y = -h / 2 - h * 0.26;
  const len = h * 0.95;
  add(plume, new THREE.ConeGeometry(r * 0.52, len, 24, 1, true), m.flame, [0, -len / 2, 0], [Math.PI, 0, 0]);
  add(plume, new THREE.ConeGeometry(r * 0.28, len * 0.55, 24, 1, true), m.flame, [0, -len * 0.275, 0], [Math.PI, 0, 0]);
  halo(plume, PALETTE.signal, r * 4.5, [0, -r * 0.4, 0], 0.55);
  g.add(plume);
  fx.flames.push(plume);
  return g;
}

/* ---------- Kite: jet-suit pilot ---------- */

function kite(m: Mats, fx: Fx) {
  const g = new THREE.Group();
  const DEPTH = 0.72; // torso is an ellipse, wider than deep

  // torso: one lathed body from crotch to neck, then armour and webbing over it
  const body: [number, number][] = [
    [0, -0.04], [0.12, -0.03], [0.168, 0.04], [0.172, 0.12], [0.152, 0.23], [0.146, 0.3],
    [0.176, 0.42], [0.2, 0.52], [0.202, 0.6], [0.165, 0.67], [0.095, 0.71], [0.072, 0.75], [0, 0.75],
  ];
  add(g, lathe(body), m.suit, [0, 0, 0], [0, 0, 0], [1, 1, DEPTH]);
  const chest: [number, number][] = [[0.172, 0.4], [0.192, 0.44], [0.214, 0.53], [0.215, 0.6], [0.19, 0.655], [0.16, 0.668]];
  add(g, lathe(chest, -1.15, 2.3), m.plate, [0, 0, 0.006], [0, 0, 0], [1, 1, DEPTH]);
  add(g, lathe(chest, Math.PI - 0.9, 1.8), m.plate, [0, 0, -0.006], [0, 0, 0], [1, 1, DEPTH]);
  const abs: [number, number][] = [[0.158, 0.2], [0.162, 0.245], [0.158, 0.29], [0.168, 0.335], [0.176, 0.375]];
  add(g, lathe(abs, -0.75, 1.5), m.dark, [0, 0, 0.004], [0, 0, 0], [1, 1, DEPTH]);
  add(g, rbox(0.11, 0.024, 0.012, 0.005, 2), m.stripBlue, [0, 0.6, 0.158]);
  label(g, 'KITE-01', 0.15, [0, 0.535, 0.1665], [-0.04, 0, 0]);
  // belt, buckle, hip plates
  add(g, torus(0.166, 0.024), m.dark, [0, 0.13, 0], [Math.PI / 2, 0, 0], [1, DEPTH, 1]);
  add(g, rbox(0.075, 0.06, 0.03, 0.01), m.metal, [0, 0.13, 0.13]);
  for (const s of [-1, 1]) {
    add(g, rbox(0.05, 0.13, 0.15, 0.02), m.paint, [s * 0.175, 0.05, 0], [0, 0, s * -0.12]);
    // shoulder webbing over the chest plate
    add(g, rbox(0.05, 0.3, 0.02, 0.008), m.rubber, [s * 0.115, 0.55, 0.138], [-0.1, 0, s * 0.1]);
    add(g, rbox(0.06, 0.03, 0.03, 0.008), m.metal, [s * 0.105, 0.47, 0.142]);
  }
  add(g, torus(0.086, 0.022), m.dark, [0, 0.725, 0], [Math.PI / 2, 0, 0]);

  // helmet: shell, wraparound visor, jaw guard, comms pods, crest
  const head: V3 = [0, 0.875, 0.012];
  const hs: V3 = [0.93, 1.02, 1.12];
  add(g, sph(0.146), m.paint, head, [0, 0, 0], hs);
  add(g, new THREE.SphereGeometry(0.1495, 48, 24, Math.PI / 2 - 1.2, 2.4, 0.92, 0.78), m.glass, head, [0, 0, 0], hs);
  add(g, new THREE.SphereGeometry(0.151, 48, 16, Math.PI / 2 - 1.05, 2.1, 1.7, 0.75), m.dark, head, [0, 0, 0], hs);
  add(g, new THREE.SphereGeometry(0.1505, 48, 8, Math.PI / 2 - 1.25, 2.5, 0.84, 0.09), m.dark, head, [0, 0, 0], hs);
  add(g, rbox(0.03, 0.026, 0.13, 0.011), m.accent, [0, 1.018, 0.0]);
  add(g, rbox(0.09, 0.04, 0.03, 0.012), m.dark, [0, 0.78, 0.136]);
  for (const s of [-1, 1]) {
    add(g, cyl(0.032, 0.038, 0.024), m.dark, [s * 0.134, 0.855, -0.01], [0, 0, Math.PI / 2]);
    add(g, cyl(0.011, 0.011, 0.03), m.metal, [s * 0.136, 0.855, -0.01], [0, 0, Math.PI / 2]);
    add(g, cyl(0.012, 0.012, 0.03), m.rubber, [s * 0.05, 0.775, 0.138], [Math.PI / 2, 0, 0]);
  }
  tube(g, [0.14, 0.88, -0.02], [0.155, 1.02, -0.06], 0.004, m.rubber);
  label(g, '9V', 0.07, [0, 0.988, 0.129], [-0.83, 0, 0]);

  // back unit: frame, main turbine, twin fuel bottles
  add(g, rbox(0.32, 0.42, 0.12, 0.05), m.dark, [0, 0.47, -0.19]);
  add(g, rbox(0.22, 0.07, 0.02, 0.008), m.paint, [0, 0.63, -0.252]);
  const back = turbine(m, fx, 0.09, 0.36);
  back.position.set(0, 0.45, -0.335);
  g.add(back);
  for (const s of [-1, 1]) {
    add(g, cap(0.048, 0.2), m.paint, [s * 0.15, 0.47, -0.285]);
    add(g, torus(0.049, 0.008), m.accent, [s * 0.15, 0.52, -0.285], [Math.PI / 2, 0, 0]);
    add(g, cyl(0.016, 0.016, 0.03), m.metal, [s * 0.15, 0.625, -0.285]);
    lamp(g, m, s > 0, [s * 0.13, 0.67, -0.24]);
  }

  // arms: pauldron, tapered sleeves, gauntlet, and a hand-held pod with two micro turbines
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.25, 0.615, 0);
    arm.rotation.set(-0.2, 0, s * 0.46);
    add(arm, sph(0.094), m.paint, [0, 0.005, 0], [0, 0, 0], [1, 0.92, 1.02]);
    add(arm, torus(0.07, 0.012), m.accent, [0, -0.06, 0], [Math.PI / 2, 0, 0]);
    add(arm, limb(0.068, 0.056, 0.3), m.suit, [0, -0.02, 0]);
    add(arm, sph(0.06), m.dark, [0, -0.33, 0]);
    add(arm, rbox(0.07, 0.08, 0.05, 0.02), m.paint, [0, -0.33, -0.045]);
    add(arm, limb(0.056, 0.047, 0.26), m.suit, [0, -0.34, 0]);
    add(arm, shell(0.066, 0.058, 0.17, 4.6), m.plate, [0, -0.46, 0], [0, (s * Math.PI) / 2, 0]);
    add(arm, torus(0.058, 0.008), m.dark, [0, -0.56, 0], [Math.PI / 2, 0, 0]);
    // thrust pod
    add(arm, rbox(0.12, 0.15, 0.3, 0.04), m.dark, [0, -0.66, 0]);
    add(arm, rbox(0.124, 0.05, 0.12, 0.014), m.paint, [0, -0.64, 0]);
    add(arm, rbox(0.03, 0.02, 0.06, 0.006, 2), m.stripBlue, [s * 0.061, -0.64, 0]);
    for (const z of [-1, 1]) {
      const t = turbine(m, fx, 0.05, 0.22);
      t.position.set(0, -0.67, z * 0.165);
      arm.add(t);
    }
    g.add(arm);
    // fuel line from the back unit to the pod
    arm.updateMatrix();
    const end = new THREE.Vector3(0, -0.6, -0.07).applyMatrix4(arm.matrix);
    const mid = new THREE.Vector3(0, -0.3, -0.12).applyMatrix4(arm.matrix);
    hose(g, [new THREE.Vector3(s * 0.16, 0.36, -0.2), new THREE.Vector3(s * 0.3, 0.3, -0.24), mid, end], 0.011, m.rubber);
  }

  // legs: tapered, with thigh, knee and shin armour, and proper boots
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.095, 0.02, 0);
    leg.rotation.set(0.12, 0, s * 0.06);
    add(leg, sph(0.1), m.suit, [0, -0.02, 0]);
    add(leg, limb(0.1, 0.072, 0.47), m.suit);
    add(leg, shell(0.108, 0.086, 0.26, 2.2), m.plate, [0, -0.2, 0], [0, s * 0.35, 0]);
    add(leg, rbox(0.05, 0.1, 0.09, 0.015), m.rubber, [s * 0.09, -0.22, -0.01]);
    const shin = new THREE.Group();
    shin.position.set(0, -0.48, 0);
    shin.rotation.x = 0.22;
    add(shin, sph(0.074), m.dark);
    add(shin, sph(0.062), m.paint, [0, 0.0, 0.04], [0, 0, 0], [1, 1.15, 0.7]);
    add(shin, limb(0.072, 0.05, 0.4), m.suit);
    add(shin, shell(0.08, 0.06, 0.28, 2.6), m.plate, [0, -0.21, 0]);
    add(shin, cyl(0.058, 0.066, 0.13), m.dark, [0, -0.42, 0]);
    add(shin, torus(0.062, 0.01), m.metal, [0, -0.365, 0], [Math.PI / 2, 0, 0]);
    add(shin, rbox(0.115, 0.085, 0.2, 0.04), m.dark, [0, -0.5, 0.03]);
    add(shin, sph(0.058), m.dark, [0, -0.505, 0.125], [0, 0, 0], [1, 0.72, 1.1]);
    add(shin, rbox(0.12, 0.028, 0.27, 0.012), m.rubber, [0, -0.553, 0.045]);
    add(shin, rbox(0.1, 0.02, 0.02, 0.006, 2), m.accent, [0, -0.47, -0.072]);
    leg.add(shin);
    g.add(leg);
  }

  g.rotation.x = 0.07;
  return g;
}

/* ---------- Scout: survey quadcopter ---------- */

function scout(m: Mats, fx: Fx) {
  const g = new THREE.Group();

  // airframe: painted shell, carbon deck, battery, seams and vents
  add(g, rbox(0.46, 0.17, 0.8, 0.075, 8), m.paint);
  add(g, rbox(0.36, 0.03, 0.56, 0.012), m.carbon, [0, 0.078, -0.02]);
  add(g, rbox(0.36, 0.14, 0.2, 0.04), m.dark, [0, 0.005, -0.37]);
  add(g, rbox(0.14, 0.03, 0.03, 0.01), m.metal, [0, 0.085, -0.4]);
  add(g, rbox(0.2, 0.012, 0.012, 0.005, 2), m.stripMint, [0, 0.03, -0.472]);
  halo(g, PALETTE.live, 0.2, [0, 0.03, -0.48], 0.4);
  add(g, rbox(0.466, 0.012, 0.3, 0.005, 2), m.accent, [0, -0.02, 0.12]);
  add(g, rbox(0.464, 0.004, 0.62, 0.002, 1), m.rubber, [0, 0.04, 0.02]);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) add(g, rbox(0.01, 0.045, 0.012, 0.003, 1), m.rubber, [s * 0.229, 0.0, -0.1 - i * 0.03]);
    label(g, 'SCOUT-02', 0.22, [s * 0.2315, 0.005, 0.2], [0, (s * Math.PI) / 2, 0]);
  }
  label(g, '9V-SCT', 0.2, [0, 0.0945, -0.12], [-Math.PI / 2, 0, Math.PI], '#c9d2e0');

  // forward stereo sensors
  add(g, rbox(0.34, 0.085, 0.03, 0.012), m.glass, [0, 0.012, 0.392]);
  for (const s of [-1, 1]) {
    add(g, cyl(0.025, 0.025, 0.02), m.metal, [s * 0.1, 0.012, 0.408], [Math.PI / 2, 0, 0]);
    add(g, cyl(0.017, 0.017, 0.022), m.glass, [s * 0.1, 0.012, 0.41], [Math.PI / 2, 0, 0]);
    add(g, sph(0.005), m.lampBlue, [s * 0.15, 0.035, 0.409]);
  }

  // lidar puck, GPS mast, twin antennas
  add(g, cyl(0.078, 0.078, 0.03), m.dark, [0, 0.11, 0.14]);
  add(g, cyl(0.072, 0.072, 0.055), m.glass, [0, 0.15, 0.14]);
  add(g, cyl(0.078, 0.07, 0.022), m.dark, [0, 0.188, 0.14]);
  add(g, torus(0.079, 0.006), m.accent, [0, 0.126, 0.14], [Math.PI / 2, 0, 0]);
  tube(g, [0, 0.09, -0.2], [0, 0.25, -0.2], 0.008, m.carbon);
  add(g, cyl(0.05, 0.05, 0.02), m.paint, [0, 0.26, -0.2]);
  for (const s of [-1, 1]) {
    tube(g, [s * 0.15, 0.05, -0.44], [s * 0.2, -0.14, -0.52], 0.006, m.rubber);
    add(g, cyl(0.011, 0.011, 0.03), m.metal, [s * 0.152, 0.045, -0.445], [0.38, 0, s * -0.25]);
  }

  // arms, motors, rotors
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const root: V3 = [sx * 0.2, 0.02, sz * 0.3];
      const tip: V3 = [sx * 0.62, 0.06, sz * 0.62];
      add(g, rbox(0.1, 0.075, 0.1, 0.025), m.dark, root);
      add(g, cyl(0.02, 0.02, 0.085), m.metal, root);
      tube(g, root, tip, 0.027, m.carbon);
      const along = (t: number): V3 => [root[0] + (tip[0] - root[0]) * t, root[1] + (tip[1] - root[1]) * t, root[2] + (tip[2] - root[2]) * t];
      tube(g, along(0.2), along(0.27), 0.031, m.metal);
      tube(g, along(0.86), along(0.93), 0.031, m.dark);
      add(g, cyl(0.045, 0.05, 0.035), m.dark, [tip[0], tip[1] + 0.005, tip[2]]);
      add(g, cyl(0.062, 0.056, 0.07), m.metal, [tip[0], tip[1] + 0.055, tip[2]]);
      for (let i = 0; i < 4; i++) add(g, torus(0.0605, 0.004), m.dark, [tip[0], tip[1] + 0.03 + i * 0.016, tip[2]], [Math.PI / 2, 0, 0]);
      add(g, cyl(0.064, 0.064, 0.012), m.dark, [tip[0], tip[1] + 0.094, tip[2]]);
      const r = rotor(m, fx, 0.35, 2, sx * sz * 11);
      r.position.set(tip[0], tip[1] + 0.12, tip[2]);
      g.add(r);
      lamp(g, m, sz > 0, [tip[0], tip[1] - 0.022, tip[2]], 0.015);
    }
    // landing gear with dampers and rubber feet
    for (const z of [-0.2, 0.2]) {
      tube(g, [sx * 0.16, -0.07, z], [sx * 0.3, -0.4, z], 0.013, m.carbon);
      tube(g, [sx * 0.175, -0.105, z], [sx * 0.205, -0.175, z], 0.019, m.metal);
    }
    tube(g, [sx * 0.3, -0.4, -0.36], [sx * 0.3, -0.4, 0.36], 0.015, m.carbon);
    for (const z of [-0.33, 0.33]) add(g, cap(0.024, 0.07), m.rubber, [sx * 0.3, -0.4, z], [Math.PI / 2, 0, 0]);
  }

  // three-axis camera gimbal
  const gimbal = new THREE.Group();
  gimbal.position.set(0, -0.085, 0.2);
  add(gimbal, cyl(0.045, 0.045, 0.05), m.dark);
  for (const [x, z] of [[-0.03, -0.03], [0.03, -0.03], [-0.03, 0.03], [0.03, 0.03]]) add(gimbal, sph(0.012), m.rubber, [x, 0.03, z]);
  add(gimbal, rbox(0.27, 0.03, 0.045, 0.012), m.dark, [0, -0.04, 0]);
  for (const s of [-1, 1]) {
    add(gimbal, rbox(0.03, 0.17, 0.045, 0.012), m.dark, [s * 0.12, -0.115, 0]);
    add(gimbal, cyl(0.026, 0.026, 0.036), m.metal, [s * 0.12, -0.15, 0], [0, 0, Math.PI / 2]);
  }
  const cam = new THREE.Group();
  cam.position.set(0, -0.15, 0);
  cam.rotation.x = 0.4;
  add(cam, rbox(0.19, 0.13, 0.17, 0.035), m.paint);
  add(cam, rbox(0.192, 0.03, 0.172, 0.008, 2), m.dark, [0, -0.02, 0]);
  add(cam, cyl(0.062, 0.066, 0.08), m.dark, [0, 0, 0.12], [Math.PI / 2, 0, 0]);
  add(cam, torus(0.058, 0.008), m.metal, [0, 0, 0.16]);
  add(cam, torus(0.064, 0.004), m.rubber, [0, 0, 0.12]);
  add(cam, cyl(0.05, 0.05, 0.012), m.glass, [0, 0, 0.158], [Math.PI / 2, 0, 0]);
  add(cam, sph(0.006), m.lampBlue, [0.07, 0.045, 0.086]);
  gimbal.add(cam);
  g.add(gimbal);

  g.rotation.x = 0.12;
  return g;
}

/* ---------- Delta: fixed-wing mapping UAV ---------- */

function delta(m: Mats, fx: Fx) {
  const g = new THREE.Group();

  // blended wing: planform in XY (Y = chord, forward positive), extruded with a soft bevel
  const w = new THREE.Shape();
  w.moveTo(0, 0.5);
  w.lineTo(0.93, -0.27);
  w.quadraticCurveTo(1.02, -0.34, 0.97, -0.45);
  w.lineTo(0.3, -0.37);
  w.quadraticCurveTo(0, -0.44, -0.3, -0.37);
  w.lineTo(-0.97, -0.45);
  w.quadraticCurveTo(-1.02, -0.34, -0.93, -0.27);
  w.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(w, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.026,
    bevelSize: 0.035,
    bevelSegments: 8,
    curveSegments: 20,
  });
  add(g, wingGeo, m.paint, [0, 0.011, 0], [Math.PI / 2, 0, 0]);

  // fuselage pod (lathe along Y, laid along Z), sensor canopy, nose glass, hatch
  const pod: [number, number][] = [
    [0, -0.56], [0.05, -0.53], [0.1, -0.36], [0.132, -0.08], [0.128, 0.16], [0.1, 0.38], [0.06, 0.54], [0.025, 0.61], [0, 0.625],
  ];
  add(g, lathe(pod), m.paint, [0, 0.02, 0], [Math.PI / 2, 0, 0], [1, 1, 0.82]);
  add(g, sph(0.1), m.glass, [0, 0.105, 0.14], [0, 0, 0], [0.82, 0.42, 1.9]);
  add(g, sph(0.103), m.dark, [0, 0.098, 0.14], [0, 0, 0], [0.86, 0.4, 1.96]);
  add(g, sph(0.05), m.glass, [0, 0.02, 0.585], [0, 0, 0], [1, 0.82, 1]);
  add(g, torus(0.047, 0.006), m.dark, [0, 0.02, 0.572], [0, 0, 0], [1, 0.82, 1]);
  add(g, rbox(0.012, 0.006, 0.34, 0.003, 2), m.accent, [0, 0.128, -0.22]);
  add(g, rbox(0.006, 0.07, 0.12, 0.002, 1), m.dark, [0, 0.16, -0.3], [-0.5, 0, 0]);

  for (const s of [-1, 1]) {
    // livery stripe, panel seams, elevon with hinge line and servo fairing
    add(g, rbox(0.075, 0.006, 0.36, 0.003, 2), m.accent, [s * 0.56, 0.04, -0.17]);
    add(g, rbox(0.004, 0.004, 0.5, 0.001, 1), m.rubber, [s * 0.3, 0.04, -0.08]);
    add(g, rbox(0.004, 0.004, 0.3, 0.001, 1), m.rubber, [s * 0.78, 0.04, -0.26]);
    add(g, rbox(0.52, 0.006, 0.07, 0.003, 2), m.dark, [s * 0.62, 0.04, -0.385], [0, s * 0.12, 0]);
    add(g, cap(0.012, 0.07), m.paint, [s * 0.5, 0.048, -0.32], [Math.PI / 2, 0, 0]);
    tube(g, [s * 0.5, 0.052, -0.33], [s * 0.5, 0.052, -0.38], 0.003, m.metal);
    // winglet: swept fin, extruded thin
    const f = new THREE.Shape();
    f.moveTo(0, 0);
    f.lineTo(0.2, 0);
    f.lineTo(0.27, 0.25);
    f.lineTo(0.17, 0.25);
    f.closePath();
    const fin = new THREE.ExtrudeGeometry(f, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelSegments: 3 });
    add(g, fin, m.accent, [s * 0.965 - 0.004, 0.02, -0.25], [0, Math.PI / 2, 0]);
    lamp(g, m, s > 0, [s * 0.965, 0.285, -0.47], 0.011);
    lamp(g, m, s > 0, [s * 0.95, 0.03, -0.3], 0.009);
  }
  label(g, '9V-DLT', 0.24, [0.75, 0.0385, -0.2], [-Math.PI / 2, 0, Math.PI]);
  label(g, 'DELTA-03', 0.24, [-0.75, 0.0385, -0.2], [-Math.PI / 2, 0, Math.PI]);

  // pitot tube, belly camera, landing skid
  tube(g, [0.42, 0.012, 0.13], [0.42, 0.012, 0.36], 0.006, m.metal);
  add(g, cyl(0.055, 0.055, 0.03), m.dark, [0, -0.085, 0.12]);
  add(g, cyl(0.04, 0.04, 0.012), m.glass, [0, -0.1, 0.12]);
  add(g, rbox(0.03, 0.02, 0.5, 0.008), m.rubber, [0, -0.09, -0.2]);

  // pusher motor, spinner and propeller
  add(g, cyl(0.045, 0.06, 0.1), m.dark, [0, 0.02, -0.58], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) add(g, torus(0.052 - i * 0.004, 0.004), m.metal, [0, 0.02, -0.55 - i * 0.02]);
  const prop = rotor(m, fx, 0.2, 2, 14);
  prop.rotation.x = -Math.PI / 2;
  prop.position.set(0, 0.02, -0.645);
  g.add(prop);
  add(g, new THREE.ConeGeometry(0.03, 0.07, 24), m.metal, [0, 0.02, -0.69], [-Math.PI / 2, 0, 0]);

  g.rotation.set(0.2, 0, -0.12);
  return g;
}

const BUILDERS: Record<AvatarKind, (m: Mats, fx: Fx) => THREE.Group> = { kite, scout, delta };

/** Builds a placeholder. Call `object.userData.tick(seconds)` each frame to animate it. */
export function buildPlaceholder(kind: AvatarKind): THREE.Group {
  const fx: Fx = { spinners: [], flames: [] };
  const model = BUILDERS[kind](makeMats(), fx);
  // the builders leave the model in its showroom pose; flight wants it level
  const pose = model.rotation.clone();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(mesh.material as THREE.Material).transparent) mesh.castShadow = true;
  });
  const root = new THREE.Group();
  root.add(model);
  /** true: showroom pose for previews and thumbnails. false: level, for flight. */
  root.userData.setPose = (preview: boolean) => (preview ? model.rotation.copy(pose) : model.rotation.set(0, 0, 0));
  /** 0..1.6, drives exhaust length. Flight sets it from speed. */
  root.userData.throttle = 0.6;
  root.userData.tick = (t: number) => {
    const power = 0.45 + (root.userData.throttle as number) * 0.95;
    for (const s of fx.spinners) s.rotation.y = t * (s.userData.speed as number);
    fx.flames.forEach((f, i) => f.scale.set(1, power * (1 + 0.14 * Math.sin(t * 38 + i * 1.7) + 0.06 * Math.sin(t * 61 + i)), 1));
  };
  return root;
}
