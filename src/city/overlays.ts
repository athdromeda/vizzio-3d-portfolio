// Things the landmark console and the city map draw into the 3D scene: patrol routes around the stadium,
// a restricted-area fence and a tripwire at the airport, expressways, rail corridors and planned
// building volumes for the map, and the equipment model for asset views.
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { MAP_MENUS } from '../data/citymap';
import { OPS, type Tone, type V3 } from '../data/ops';
import { LANDMARKS } from '../data/landmarks';
import { place } from './geo';

/** Categorical colours from tokens.css (--cat-1..4), brightened so they read against the city. */
const CAT = [0x3987e5, 0xd95926, 0x9085e9, 0xd55181];
const ROUTE_COLORS = CAT;
const ALERT = 0xe66767;
/** Status colours from tokens.css (--live, --warn, --crit, --signal-soft). The map panel names each state in words. */
const TONE: Record<Tone, number> = { ok: 0x3ddca0, warn: 0xf0b34a, crit: 0xe66767, info: 0x7fa0ff };

const glow = (color: number, gain: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gain), transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide });

export interface Overlays {
  group: THREE.Group;
  /** Show the patrol routes; `active` (a route id) is drawn at full strength, the others dimmed. */
  setRoutes(visible: boolean, active: string | null): void;
  setFence(visible: boolean): void;
  setLine(visible: boolean): void;
  /** City map: draw one menu's lines and volumes (null hides them all). Volumes follow their layer's switch. */
  setMap(menu: string | null, layers: readonly string[]): void;
}

/** A line that keeps its width on screen however far the camera is, drawn over the buildings like a map overlay. */
function mapLine(path: [number, number][], color: number, width: number) {
  const curve = new THREE.CatmullRomCurve3(path.map(([x, z]) => new THREE.Vector3(...place([x, 14, z]))), false, 'catmullrom', 0.35);
  const geo = new LineGeometry();
  geo.setPositions(curve.getPoints(path.length * 14).flatMap((p) => [p.x, p.y, p.z]));
  const mat = new LineMaterial({ color: new THREE.Color(color).multiplyScalar(1.5).getHex(), linewidth: width, transparent: true, depthTest: false, depthWrite: false });
  const line = new Line2(geo, mat);
  line.renderOrder = 20;
  line.frustumCulled = false;
  return line;
}

/** A planned building as a see-through block with bright edges. */
function volume(at: [number, number], site: { w: number; d: number; h: number }, color: number) {
  const g = new THREE.Group();
  const box = new THREE.BoxGeometry(site.w, site.h, site.d);
  const fill = new THREE.Mesh(box, glow(color, 1.1, 0.2));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6) }));
  g.add(fill, edges);
  g.position.set(...place([at[0], site.h / 2 + 0.5, at[1]]));
  return g;
}

/** The drawings are built in stand-in coordinates; this moves one to where its landmark really is. */
function shift(g: THREE.Object3D, at: V3) {
  const r = place(at);
  g.position.set(r[0] - at[0], r[1] - at[1], r[2] - at[2]);
}

export function buildOverlays(): Overlays {
  const group = new THREE.Group();

  // --- patrol routes: tubes hugging the stadium, with a bead at every stop
  const stadium = LANDMARKS.find((l) => l.id === 'stadium')!.orbit.target;
  const routes = new Map<string, THREE.Group>();
  OPS.stadium.patrol?.routes.forEach((r, i) => {
    const g = new THREE.Group();
    const a0 = r.stops[0].angle, a1 = r.stops[r.stops.length - 1].angle;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 48; k++) {
      const a = a0 + ((a1 - a0) * k) / 48;
      pts.push(new THREE.Vector3(stadium[0] + Math.cos(a) * r.radius, 9, stadium[2] + Math.sin(a) * r.radius));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 1.6, 8), glow(ROUTE_COLORS[i], 2.2)));
    for (const s of r.stops) {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(4.5, 14, 10), glow(ROUTE_COLORS[i], 3));
      bead.position.set(stadium[0] + Math.cos(s.angle) * r.radius, 9, stadium[2] + Math.sin(s.angle) * r.radius);
      g.add(bead);
    }
    g.visible = false;
    shift(g, stadium);
    routes.set(r.id, g);
    group.add(g);
  });

  // --- airport: restricted-area fence (see-through red walls with a bright top rail) and a tripwire
  const alerts = OPS.airport.alerts!;
  const fence = new THREE.Group();
  const H = 16;
  const corners = alerts.fence.map(([x, z]) => new THREE.Vector3(x, 0.6, z));
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length];
    const len = a.distanceTo(b);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, H), glow(ALERT, 1.4, 0.16));
    wall.position.set((a.x + b.x) / 2, H / 2 + 0.6, (a.z + b.z) / 2);
    wall.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    fence.add(wall);
    for (const y of [0.8, H + 0.6]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, len, 8), glow(ALERT, 3));
      rail.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
      rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      fence.add(rail);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, H, 8), glow(ALERT, 3));
    post.position.set(a.x, H / 2 + 0.6, a.z);
    fence.add(post);
  });
  fence.visible = false;
  shift(fence, alerts.focus);
  group.add(fence);

  const wire = new THREE.Group();
  const [p, q] = alerts.line.map(([x, z]) => new THREE.Vector3(x, 1.2, z));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, p.distanceTo(q), 8), glow(ALERT, 3.2));
  beam.position.copy(p).lerp(q, 0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
  wire.add(beam);
  for (const end of [p, q]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 10, 8), glow(ALERT, 3));
    post.position.set(end.x, 5, end.z);
    wire.add(post);
  }
  wire.visible = false;
  shift(wire, alerts.focus);
  group.add(wire);

  // --- city map: per menu, its routes; per layer, its planned volumes
  const menus = new Map<string, { root: THREE.Group; layers: Map<string, THREE.Group> }>();
  for (const menu of MAP_MENUS) {
    const root = new THREE.Group();
    for (const r of menu.routes ?? []) root.add(mapLine(r.path, TONE[r.tone], r.tone === 'info' ? 3 : 4.5));
    const layers = new Map<string, THREE.Group>();
    menu.layers.forEach((layer) => {
      const sites = layer.points.filter((p) => p.site);
      if (!sites.length) return;
      const g = new THREE.Group();
      for (const p of sites) g.add(volume(p.at, p.site!, CAT[layer.cat - 1]));
      layers.set(layer.id, g);
      root.add(g);
    });
    root.visible = false;
    menus.set(menu.id, { root, layers });
    group.add(root);
  }

  return {
    group,
    setMap(menu, on) {
      menus.forEach((m, id) => {
        m.root.visible = id === menu;
        if (m.root.visible) m.layers.forEach((g, layer) => (g.visible = on.includes(layer)));
      });
    },
    setRoutes(visible, active) {
      routes.forEach((g, id) => {
        g.visible = visible && (active === null || active === id);
      });
    },
    setFence: (v) => void (fence.visible = v),
    setLine: (v) => void (wire.visible = v),
  };
}

/* ---------- equipment model for the asset view ---------- */

/** A generic air handling unit: a panelled cabinet with fan openings and a control box. Lit like a product shot. */
export function buildAssetScene() {
  const scene = new THREE.Scene();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.45, metalness: 0.75 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x8a909b, roughness: 0.5, metalness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.6, metalness: 0.5 });
  const g = new THREE.Group();
  const part = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  part(steel, 3.2, 2.0, 1.5, 0, 1.1, 0); // cabinet
  part(frame, 3.3, 0.12, 1.6, 0, 0.06, 0); // skid
  part(frame, 3.3, 0.08, 1.6, 0, 2.14, 0); // top frame
  for (const x of [-1.6, -0.53, 0.53, 1.6]) part(frame, 0.08, 2.0, 1.56, x, 1.1, 0); // vertical members
  part(frame, 3.3, 0.06, 1.56, 0, 1.1, 0); // mid rail
  for (const x of [-1.06, 0, 1.06]) {
    for (const y of [0.6, 1.6]) {
      part(dark, 0.72, 0.72, 0.06, x, y, 0.76); // fan opening
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 10, 32), frame);
      ring.position.set(x, y, 0.8);
      g.add(ring);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), steel);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(x, y, 0.8);
      g.add(hub);
      for (let b = 0; b < 5; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.01), steel);
        const a = (b / 5) * Math.PI * 2;
        blade.position.set(x + Math.cos(a) * 0.15, y + Math.sin(a) * 0.15, 0.79);
        blade.rotation.z = a;
        g.add(blade);
      }
    }
  }
  part(steel, 0.5, 1.2, 0.3, 1.9, 1.0, 0.3); // control box
  part(dark, 0.3, 0.2, 0.02, 1.9, 1.3, 0.46);
  scene.add(g);
  scene.add(new THREE.HemisphereLight(0xeaf0ff, 0x1a2030, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(3, 5, 6);
  const rim = new THREE.DirectionalLight(0x7fa0ff, 2.4);
  rim.position.set(-5, 2, -3);
  scene.add(key, rim);
  return scene;
}

/** Camera placements for a landmark's camera wall: two views from each side plus the entrance. */
export function cameraWall(target: V3, radius: number, height: number) {
  const groups: { name: string; code: string; angle: number }[] = [
    { name: 'East', code: 'E', angle: 0 },
    { name: 'West', code: 'W', angle: Math.PI },
    { name: 'South', code: 'S', angle: Math.PI / 2 },
    { name: 'North', code: 'N', angle: -Math.PI / 2 },
    { name: 'Entrance', code: 'G', angle: 0.9 },
  ];
  return groups.map((g) => ({
    name: g.name,
    shots: [0, 1].map((k) => {
      const a = g.angle + (k ? 0.32 : -0.2);
      const r = radius * (k ? 0.5 : 0.72);
      const h = Math.max(18, target[1] + (height - target[1]) * (k ? 0.22 : 0.5));
      const pos: V3 = [target[0] + Math.cos(a) * r, h, target[2] + Math.sin(a) * r];
      return { id: `${g.code}-0${k + 1}`, pos, look: target };
    }),
  }));
}
