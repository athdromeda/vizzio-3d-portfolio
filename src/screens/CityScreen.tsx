import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadAvatar } from '../avatars/loadAvatar';
import { buildCity, type City } from '../city/buildCity';
import { GROUND_Y, REAL, place } from '../city/geo';
import { FLIGHT_KEYS, Flight } from '../city/flight';
import { START, getBuildings } from '../city/layout';
import { drawMinimap, makeMinimapBase } from '../city/minimap';
import { buildAssetScene, buildOverlays, cameraWall } from '../city/overlays';
import { Console } from '../console/Console';
import { NO_OVERLAY, type Anchor, type InspectCam, type SceneOverlay, type SnapJob } from '../console/engine';
import { Effects } from '../components/Effects';
import type { Avatar } from '../data/avatars';
import type { Country } from '../data/countries';
import { LANDMARKS } from '../data/landmarks';
import { MAP_LIMITS, MAP_MENUS, type MapMenuId, type MapPoint } from '../data/citymap';
import { OPS } from '../data/ops';
import { CityMap } from './CityMap';
import { CityToolbar } from './CityToolbar';
import { CityTour } from './CityTour';
import { LoadingScreen } from './LoadingScreen';

/** Opening shot: east of the hotel towers, looking over the sky deck toward the bay and the sunset. */
const INTRO_CAM = new THREE.Vector3(...place([980, 330, 60]));
/** Landmark marker positions, in whichever city is on screen. */
const LM_POS = LANDMARKS.map((l) => place(l.pos));
/** Real tiles sit on the ellipsoid, a little below sea level: camera heights are lifted to match. */
const LIFT = REAL ? GROUND_Y : 0;
const INTRO_SECONDS = 3.4;
const DEG_PX = 4; // compass tape: pixels per degree
const TAG_STEM = 12; // console tags: length of the leader line, matches .tag3d in app.css
const MAP_PX = 168;
const FOV = 58;
/** City map camera: how far above the horizon it looks from, tilted and straight down (a hair off vertical so "up" stays north). */
const MAP_TILT = 0.92, MAP_FLAT = 1.5;
const MENU_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const metres = (d: number) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`);

/** DOM nodes the frame loop writes to directly. */
interface Hud {
  speed: HTMLElement | null;
  alt: HTMLElement | null;
  hdg: HTMLElement | null;
  tape: HTMLElement | null;
  boost: HTMLElement | null;
  /** Real tiles: Google's data attribution, which must stay visible. */
  credits: HTMLElement | null;
  map: HTMLCanvasElement | null;
  markers: (HTMLElement | null)[];
  dists: (HTMLElement | null)[];
  ticks: (HTMLElement | null)[];
}

interface SceneProps {
  avatar: Avatar;
  hud: React.RefObject<Hud>;
  /** False while the loading screen is up: the scene renders, the flyer waits. */
  live: React.RefObject<boolean>;
  /** Set while a landmark console is open: the camera leaves the flyer and goes where the console points it. */
  cam: React.RefObject<InspectCam | null>;
  /** Console tags pinned to places in the city. */
  /** Builds the city: the generated stand-in, or the real tiles when a key is configured. */
  makeCity: () => City;
  day: boolean;
  /** City tour camera. While it is set the flyer is hidden and the arrival waits. */
  tour: React.RefObject<InspectCam | null>;
  anchors: React.RefObject<Map<string, Anchor>>;
  overlay: React.RefObject<SceneOverlay>;
  /** Stills waiting to be rendered from the scene, one per frame. */
  jobs: React.RefObject<SnapJob[]>;
  visited: React.RefObject<Set<string>>;
  flightRef: React.RefObject<Flight | null>;
  onReady: () => void;
  /** Called when the landmark in range changes. */
  onNear: (id: string | null) => void;
  /** The light has settled after a change between day and dusk. */
  onLight: () => void;
}

function CityScene({ makeCity, avatar, day, hud, live, cam, tour, anchors, overlay, jobs, visited, flightRef, onReady, onNear, onLight }: SceneProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const city = useMemo(makeCity, [makeCity]);
  const flight = useMemo(() => {
    const f = new Flight(avatar, city.colliders);
    f.pos.set(...place(START.pos));
    if (REAL) {
      // the real city is far wider than the stand-in: the airport alone is 16 km from the bay
      f.centre.set(7000, -4000);
      f.radius = 16000;
      f.terrain = city.surfaceBelow ?? null;
    }
    return f;
  }, [avatar, city]);
  useEffect(() => city.attach?.(camera, gl), [city, camera, gl]);
  // yaw -> bank -> lean, so a roll is always around the direction of travel
  const rig = useMemo(() => {
    const yaw = new THREE.Group(), bank = new THREE.Group(), lean = new THREE.Group();
    yaw.add(bank);
    bank.add(lean);
    return { yaw, bank, lean };
  }, []);
  const mapBase = useMemo(makeMinimapBase, []);
  const model = useRef<THREE.Object3D | null>(null);
  const frames = useRef(0);
  const intro = useRef(0);
  const shown = useRef({ speed: -1, alt: -1, hdg: -1, near: null as string | null, dist: LANDMARKS.map(() => ''), spots: LANDMARKS.map(() => [0, 0]) });
  const fps = useRef({ frames: 0, since: 0 });
  const tagArea = useRef({ left: 0, right: 0, top: 0, bottom: 0 });
  const tagRects = useRef<[number, number, number, number][]>([]);
  const orbit = useRef({
    blend: 0,
    angle: 0,
    radius: 300,
    height: 200,
    target: new THREE.Vector3(),
    open: false,
    cut: undefined as number | undefined,
    // a camera turning on the spot (CCTV): where it stands and which way it looks
    fixed: false,
    eye: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    fov: FOV,
  });
  const overlays = useMemo(buildOverlays, []);
  // stills: a small off-screen target, a spare camera, and the equipment model's own scene
  const snap = useMemo(() => {
    const W = 384, H = 216;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    return {
      W,
      H,
      canvas,
      target: new THREE.WebGLRenderTarget(W, H),
      camera: new THREE.PerspectiveCamera(55, W / H, 1, 42000),
      pixels: new Uint8Array(W * H * 4),
      asset: buildAssetScene(),
      clear: new THREE.Color(),
    };
  }, []);
  useEffect(() => () => snap.target.dispose(), [snap]);
  const pointMats = useMemo(() => {
    const out: THREE.PointsMaterial[] = [];
    city.group.traverse((o) => {
      if ((o as THREE.Points).isPoints) out.push((o as THREE.Points).material as THREE.PointsMaterial);
    });
    return out;
  }, [city]);
  const v = useMemo(
    () => ({
      aim: new THREE.Vector3(),
      chase: new THREE.Vector3(),
      chaseCam: new THREE.Vector3().copy(INTRO_CAM),
      look: new THREE.Vector3(),
      at: new THREE.Vector3(),
      p: new THREE.Vector3(),
      q: new THREE.Vector3(),
    }),
    [],
  );

  useEffect(() => {
    flightRef.current = flight;
    return () => {
      flightRef.current = null;
    };
  }, [flight, flightRef]);

  // reflections on the flyer come from this scene's own sky, baked again whenever the light has changed
  const env = useRef<{ pmrem: THREE.PMREMGenerator; target: THREE.WebGLRenderTarget | null; version: number } | null>(null);
  useEffect(() => {
    env.current = { pmrem: new THREE.PMREMGenerator(gl), target: null, version: -1 };
    scene.environmentIntensity = 1;
    scene.fog = city.fog;
    return () => {
      scene.environment = null;
      scene.fog = null;
      env.current?.target?.dispose();
      env.current?.pmrem.dispose();
      env.current = null;
      city.dispose();
    };
  }, [gl, scene, city]);
  const firstLight = useRef(true);
  useEffect(() => {
    city.setDay(day, firstLight.current);
    firstLight.current = false;
  }, [city, day]);

  useEffect(() => {
    let alive = true;
    loadAvatar(avatar).then((obj) => {
      if (!alive) return;
      (obj.userData.setPose as ((preview: boolean) => void) | undefined)?.(false);
      rig.lean.add(obj);
      model.current = obj;
    });
    return () => {
      alive = false;
      const obj = model.current;
      if (!obj) return;
      rig.lean.remove(obj);
      (obj.userData.setPose as ((preview: boolean) => void) | undefined)?.(true);
      obj.userData.throttle = 0.6;
    };
  }, [avatar, rig]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    if (++frames.current === 4) onReady();
    const e0 = env.current;
    if (e0 && e0.version !== city.lightVersion) {
      if (e0.version >= 0) onLight();
      e0.version = city.lightVersion;
      e0.target?.dispose();
      e0.target = e0.pmrem.fromScene(city.envScene, 0, 1, 1000);
      scene.environment = e0.target.texture;
    }
    const touring = tour.current;
    if (live.current && !touring) intro.current = Math.min(1, intro.current + dt / INTRO_SECONDS);
    const e = ease(intro.current);
    const want = cam.current ?? touring;
    rig.yaw.visible = !touring;

    flight.update(dt, live.current === true && intro.current > 0.7 && !want);

    const pace = clamp(flight.speed / (avatar.flight.topSpeed / 3.6 / 1.3), 0, 1);
    rig.yaw.position.copy(flight.pos);
    rig.yaw.position.y += Math.sin(t * 1.6) * 0.18 * (1 - pace);
    rig.yaw.rotation.y = Math.PI - flight.yaw;
    rig.bank.rotation.z = flight.bank;
    rig.lean.rotation.x = avatar.cruiseLean * pace - flight.pitch * 0.85;
    const obj = model.current;
    if (obj) {
      obj.userData.throttle = 0.3 + flight.throttle;
      (obj.userData.tick as ((s: number) => void) | undefined)?.(t);
    }

    // chase camera: sits behind the aim direction, so it answers the mouse at once
    Flight.forward(flight.aimYaw, flight.aimPitch, v.aim);
    v.chase.copy(flight.pos).addScaledVector(v.aim, -avatar.chase.back * (1 + 0.35 * flight.boost));
    v.chase.y = Math.max(3, v.chase.y + avatar.chase.up);
    v.look.copy(flight.pos).addScaledVector(v.aim, 40);
    v.look.y += 1;
    if (e < 1) {
      v.chaseCam.lerpVectors(INTRO_CAM, v.chase, e);
      v.at.lerpVectors(flight.pos, v.look, e);
    } else {
      v.chaseCam.lerp(v.chase, 1 - Math.exp(-dt * 14));
      v.at.copy(v.look);
    }
    camera.position.copy(v.chaseCam);

    // inspect: blend from the chase camera to wherever the console points, and back when it closes
    const o = orbit.current;
    if (want?.eye) {
      // a camera that turns on the spot: ease where it stands and where it looks, then express that as an orbit
      // pose, so leaving it again is one smooth move
      v.q.set(...place(want.eye));
      const yaw = want.yaw ?? 0, pitch = want.pitch ?? 0;
      if (!o.fixed) {
        // arriving from the circling view: start from the camera as it is now
        camera.getWorldDirection(v.p);
        o.eye.copy(camera.position);
        o.yaw = Math.atan2(v.p.z, v.p.x);
        o.pitch = Math.asin(clamp(v.p.y, -1, 1));
        o.cut = want.cut;
      } else if (want.cut !== o.cut) {
        // another camera: cut to it
        o.cut = want.cut;
        o.eye.copy(v.q);
        o.yaw = yaw;
        o.pitch = pitch;
      }
      o.fixed = true;
      o.open = true;
      const k = 1 - Math.exp(-dt * (want.ease ?? 9));
      o.eye.lerp(v.q, k);
      o.yaw += Math.atan2(Math.sin(yaw - o.yaw), Math.cos(yaw - o.yaw)) * k;
      o.pitch += (pitch - o.pitch) * k;
      const reach = 200, flat = Math.cos(o.pitch) * reach;
      o.target.set(o.eye.x + Math.cos(o.yaw) * flat, o.eye.y + Math.sin(o.pitch) * reach, o.eye.z + Math.sin(o.yaw) * flat);
      o.radius = flat;
      o.height = o.eye.y;
      o.angle = o.yaw + Math.PI;
    } else if (want) {
      o.fixed = false;
      v.q.set(...place(want.target));
      const wantH = want.height + LIFT;
      if (want.cut !== undefined && want.cut !== o.cut) {
        // a new shot: jump there, no glide across the city
        o.cut = want.cut;
        o.open = true;
        o.blend = 1;
        o.target.copy(v.q);
        o.radius = want.radius;
        o.height = wantH;
        o.angle = want.angle ?? o.angle;
      } else if (!o.open) {
        // just opened: start circling from where the camera already is, so the move is one smooth arc
        o.open = true;
        o.target.copy(v.q);
        o.radius = want.radius;
        o.height = wantH;
        o.angle = Math.atan2(camera.position.z - v.q.z, camera.position.x - v.q.x);
      }
      const k = 1 - Math.exp(-dt * (want.ease ?? 2.2));
      o.target.lerp(v.q, k);
      o.radius += (want.radius - o.radius) * k;
      o.height += (wantH - o.height) * k;
      if (want.angle !== undefined && want.cut === undefined) o.angle += Math.atan2(Math.sin(want.angle - o.angle), Math.cos(want.angle - o.angle)) * k;
      else o.angle += dt * (want.spin ?? 0.1);
    } else {
      o.open = false;
      o.fixed = false;
      o.cut = undefined;
    }
    o.fov += ((want?.fov ?? FOV) - o.fov) * (1 - Math.exp(-dt * 8));
    o.blend += ((want ? 1 : 0) - o.blend) * (1 - Math.exp(-dt * 2.6));
    if (o.blend > 0.002) {
      v.p.set(o.target.x + Math.cos(o.angle) * o.radius, o.height, o.target.z + Math.sin(o.angle) * o.radius);
      const b = ease(clamp(o.blend, 0, 1));
      camera.position.lerp(v.p, b);
      v.at.lerp(o.target, b);
    }
    camera.lookAt(v.at);
    const held = clamp(o.blend, 0, 1);
    const fov = (FOV + 16 * flight.boost) * (1 - held) + o.fov * held;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();

    const ov = overlay.current ?? NO_OVERLAY;
    overlays.setRoutes(ov.routes, ov.route);
    overlays.setFence(ov.fence);
    overlays.setLine(ov.line);
    overlays.setMap(ov.map, ov.layers);

    // one still per frame, so opening a console never stalls the view
    const job = jobs.current?.shift();
    if (job) {
      const { W, H, canvas, pixels } = snap;
      snap.camera.fov = job.fov ?? 55;
      snap.camera.position.set(...(job.asset ? job.pos : place(job.pos)));
      snap.camera.lookAt(...(job.asset ? job.look : place(job.look)));
      snap.camera.updateProjectionMatrix();
      snap.camera.updateMatrixWorld();
      const alpha = gl.getClearAlpha();
      gl.getClearColor(snap.clear);
      if (job.asset) gl.setClearColor(0x000000, 0);
      else city.update(t, snap.camera.position); // the sky dome follows whichever camera is rendering
      const so = job.overlay ?? NO_OVERLAY;
      overlays.setRoutes(so.routes, so.route);
      overlays.setFence(so.fence);
      overlays.setLine(so.line);
      overlays.setMap(so.map, so.layers);
      // point lights are sized for the screen; shrink them to the still's height while it renders
      const shrink = H / (state.size.height * state.viewport.dpr);
      for (const m of pointMats) m.size *= shrink;
      gl.setRenderTarget(snap.target);
      gl.clear();
      gl.render(job.asset ? snap.asset : scene, snap.camera);
      gl.readRenderTargetPixels(snap.target, 0, 0, W, H, pixels);
      gl.setRenderTarget(null);
      for (const m of pointMats) m.size /= shrink;
      overlays.setRoutes(ov.routes, ov.route);
      overlays.setFence(ov.fence);
      overlays.setLine(ov.line);
      overlays.setMap(ov.map, ov.layers);
      gl.setClearColor(snap.clear, alpha);
      // the target holds linear light, bottom row first: flip it and encode for display
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(W, H);
      for (let row = 0; row < H; row++) {
        const src = (H - 1 - row) * W * 4, dst = row * W * 4;
        for (let i = 0; i < W * 4; i += 4) {
          for (let c = 0; c < 3; c++) img.data[dst + i + c] = 255 * Math.pow(pixels[src + i + c] / 255, 1 / 2.2);
          img.data[dst + i + 3] = job.asset ? pixels[src + i + 3] : 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      job.done(canvas.toDataURL(job.asset ? 'image/png' : 'image/jpeg', 0.82));
    }
    city.update(t, camera.position);

    // console tags and map pins: pinned to their place in the city. One that would sit under a side column
    // or off screen is hidden; ones that would overlap are raised on a longer leader line.
    const pins = anchors.current;
    if (pins && pins.size) {
      const area = tagArea.current;
      if (frames.current % 20 === 0 || area.right === 0) {
        const r = document.querySelector('[data-tag-area]')?.getBoundingClientRect();
        area.left = r ? r.left : 0;
        area.right = r ? r.right : state.size.width;
        area.top = r ? r.top : 60;
        area.bottom = state.size.height - 40;
      }
      const placed = tagRects.current;
      placed.length = 0;
      const ease2 = 1 - Math.exp(-dt * 8);
      pins.forEach((a) => {
        v.p.set(...place(a.pos));
        const behind = v.q.copy(v.p).applyMatrix4(camera.matrixWorldInverse).z > 0;
        v.p.project(camera);
        const ax = (v.p.x * 0.5 + 0.5) * state.size.width, ay = (-v.p.y * 0.5 + 0.5) * state.size.height;
        const w = (a.w ??= a.el.offsetWidth), h = (a.h ??= a.el.offsetHeight);
        const half = w / 2 + 4;
        if (behind || ax - half < area.left || ax + half > area.right || ay > area.bottom || ay - h - TAG_STEM < area.top) {
          a.el.style.visibility = 'hidden';
          a.lift = undefined;
          return;
        }
        let lift = 0;
        for (let pass = 0; pass < 8; pass++) {
          const bottom = ay - TAG_STEM - lift, top = bottom - h;
          const hit = placed.find((r) => ax - half < r[2] && ax + half > r[0] && top < r[3] && bottom > r[1]);
          if (!hit) break;
          lift = ay - TAG_STEM - hit[1] + 4;
        }
        if (ay - h - TAG_STEM - lift < area.top) {
          a.el.style.visibility = 'hidden';
          a.lift = undefined;
          return;
        }
        placed.push([ax - half, ay - TAG_STEM - lift - h, ax + half, ay - TAG_STEM - lift]);
        a.lift = a.lift === undefined ? lift : a.lift + (lift - a.lift) * ease2;
        a.el.style.transform = `translate(${ax.toFixed(1)}px, ${(ay - a.lift).toFixed(1)}px)`;
        const stem = Math.round(TAG_STEM + a.lift);
        if (stem !== a.shown) a.el.style.setProperty('--stem', `${(a.shown = stem)}px`);
        a.el.style.visibility = 'visible';
      });
    }

    // --- HUD: write to the DOM only when a shown value changes
    const h = hud.current;
    const s = shown.current;
    if (!h) return;
    const speed = Math.round(flight.speed * 3.6);
    const alt = Math.round(flight.pos.y);
    const hdg = Math.round(flight.heading) % 360;
    if (h.speed && speed !== s.speed) h.speed.textContent = String((s.speed = speed));
    if (h.alt && alt !== s.alt) h.alt.textContent = String((s.alt = alt));
    if (h.hdg && hdg !== s.hdg) h.hdg.textContent = String((s.hdg = hdg)).padStart(3, '0');
    if (h.tape) h.tape.style.transform = `translateX(${(-(flight.heading + 180) * DEG_PX).toFixed(1)}px)`;
    if (h.boost) h.boost.style.transform = `scaleX(${flight.boost.toFixed(3)})`;

    // landmark markers: projected to the screen, pinned to the edge when out of view
    const W = state.size.width, H = state.size.height;
    let near: string | null = null;
    let nearDist = Infinity;
    LANDMARKS.forEach((lm, i) => {
      const at = LM_POS[i];
      v.p.set(...at);
      const dist = v.p.distanceTo(flight.pos);
      const flat = Math.hypot(at[0] - flight.pos.x, at[2] - flight.pos.z);
      if (flat < lm.range && flat < nearDist) {
        near = lm.id;
        nearDist = flat;
      }
      const behind = v.q.copy(v.p).applyMatrix4(camera.matrixWorldInverse).z > 0;
      v.p.project(camera);
      let x = (v.p.x * 0.5 + 0.5) * W;
      let y = (-v.p.y * 0.5 + 0.5) * H;
      if (behind) {
        x = W - x;
        y = H; // a target behind you is shown along the bottom edge
      }
      let cy = clamp(y, 150, H - 130);
      let cx = clamp(x, 90, W - 90);
      // HUD panels fill the corners: beside them a marker would be hidden, so it moves to the middle column
      if (W >= 900 && !(cy > 330 && cy < H - 390)) cx = clamp(cx, 380, W - 460);
      // the toolbar stands along the right edge, below the key list
      else if (W >= 900) cx = Math.min(cx, W - 300);
      // two markers pinned to the same spot would overprint: stack the later one above
      for (let j = 0; j < i; j++) {
        const o = s.spots[j];
        if (Math.abs(o[0] - cx) < 210 && Math.abs(o[1] - cy) < 48) cy = o[1] - 50;
      }
      s.spots[i][0] = cx;
      s.spots[i][1] = cy;
      const el = h.markers[i];
      if (el) {
        el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
        el.classList.toggle('is-edge', behind || cx !== x || cy !== y);
        el.classList.toggle('is-near', flat < lm.range);
      }
      const label = metres(dist);
      const de = h.dists[i];
      if (de && label !== s.dist[i]) de.textContent = s.dist[i] = label;
      const tick = h.ticks[i];
      if (tick) {
        const bearing = (Math.atan2(at[0] - flight.pos.x, -(at[2] - flight.pos.z)) * 180) / Math.PI;
        const delta = ((bearing - flight.heading + 540) % 360) - 180;
        tick.style.transform = `translateX(${(delta * DEG_PX).toFixed(1)}px)`;
        tick.style.opacity = Math.abs(delta) < 50 ? '1' : '0';
      }
    });
    if (near !== s.near) onNear((s.near = near));

    if (h.map && frames.current % 2 === 0) {
      const ctx = h.map.getContext('2d');
      if (ctx) {
        const scale = h.map.width / MAP_PX;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawMinimap(ctx, MAP_PX, mapBase, flight.pos.x, flight.pos.z, flight.aimYaw, LANDMARKS, visited.current ?? new Set());
      }
    }

    // twice a second: slow-changing text
    const f = fps.current;
    f.frames++;
    if (t - f.since >= 0.5) {
      if (h.credits && city.credits) h.credits.textContent = city.credits();
      f.frames = 0;
      f.since = t;
    }
  });

  return (
    <>
      {/* dusk: facades and ground stay under 1; lit windows, lamps and the sun cross it and glow.
          By day only the sun and its glints on glass and water do. */}
      <Effects threshold={day ? 1.6 : 1.15} strength={day ? 0.12 : 0.26} radius={0.45} />
      <primitive object={city.group} />
      <primitive object={rig.yaw} />
      <primitive object={overlays.group} />
    </>
  );
}

/** Compass tape marks from -180 to 540 degrees, so any heading has marks on both sides. */
const MARKS = Array.from({ length: 49 }, (_, i) => {
  const deg = -180 + i * 15;
  const n = ((deg % 360) + 360) % 360;
  const label = n === 0 ? 'N' : n === 90 ? 'E' : n === 180 ? 'S' : n === 270 ? 'W' : n % 45 === 0 ? String(n) : '';
  return { deg, label, major: n % 90 === 0 };
});

const CONTROLS: { keys: string[]; label: string }[] = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
  { keys: ['Mouse'], label: 'Look around' },
  { keys: ['Shift'], label: 'Boost' },
  { keys: ['Space'], label: 'Ascend' },
  { keys: ['C'], label: 'Descend' },
  { keys: ['E'], label: 'Open a landmark' },
  { keys: ['M'], label: 'Open the city map' },
  { keys: ['Esc'], label: 'Free the cursor' },
];

const Diamond = () => (
  <svg className="lm-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M8 1.5 14.5 8 8 14.5 1.5 8z" />
  </svg>
);

interface Props {
  country: Country;
  avatar: Avatar;
  /** Day or dusk light over the city. */
  day: boolean;
  onChangeFlyer: () => void;
  onGlobe: () => void;
  /** Tells the shell what the visitor is doing, so the control hint can follow. */
  onMode: (mode: CityMode) => void;
}

export type CityMode = 'fly' | 'tour' | 'console' | 'map';

export function CityScreen({ country, avatar, day, onChangeFlyer, onGlobe, onMode }: Props) {
  // the real-tiles code is only fetched when a key is configured; the stand-in city is always at hand
  const [makeCity, setMakeCity] = useState<(() => City) | null>(() => (import.meta.env.VITE_GOOGLE_MAPS_KEY ? null : buildCity));
  useEffect(() => {
    if (import.meta.env.VITE_GOOGLE_MAPS_KEY) import('../city/realCity').then((m) => setMakeCity(() => m.buildRealCity));
  }, []);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [touched, setTouched] = useState(false);
  const [nearId, setNearId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [visitedIds, setVisitedIds] = useState<string[]>([]);
  /** The city statistics tour plays first; it can be replayed from the toolbar. */
  const [touring, setTouring] = useState(true);
  const tourCam = useRef<InspectCam | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<Flight | null>(null);
  const hud = useRef<Hud>({ speed: null, alt: null, hdg: null, tape: null, boost: null, credits: null, map: null, markers: [], dists: [], ticks: [] });
  const live = useRef(false);
  live.current = !loading;

  const open = LANDMARKS.find((l) => l.id === openId) ?? null;
  /** City map: the open menu, which layers each menu shows, the place whose card is open, and the camera. */
  const [mapId, setMapId] = useState<MapMenuId | null>(null);
  const [layersOn, setLayersOn] = useState(() => Object.fromEntries(MAP_MENUS.map((m) => [m.id, m.layers.filter((l) => l.on).map((l) => l.id)])) as Record<MapMenuId, string[]>);
  const [mapSel, setMapSel] = useState<string | null>(null);
  const [flat, setFlat] = useState(false);
  const mapView = useRef({ x: 0, z: 0, dist: 2600, flat: false });
  const lastMap = useRef<MapMenuId>(MAP_MENUS[0].id);
  const mode: CityMode = touring ? 'tour' : openId !== null ? 'console' : mapId !== null ? 'map' : 'fly';
  useEffect(() => {
    onMode(mode);
    return () => onMode('fly');
  }, [mode, onMode]);
  const near = LANDMARKS.find((l) => l.id === nearId) ?? null;
  const cam = useRef<InspectCam | null>(null);
  const anchors = useRef(new Map<string, Anchor>());
  const overlay = useRef<SceneOverlay>(NO_OVERLAY);
  const jobs = useRef<SnapJob[]>([]);
  /** Stills per landmark and camera id, rendered once on first open and kept. */
  const [shots, setShots] = useState<Record<string, Record<string, string>>>({});
  const [assetShot, setAssetShot] = useState<string | null>(null);
  const asked = useRef(new Set<string>());
  const visited = useRef(new Set<string>());
  visited.current = new Set(visitedIds);
  const buildingCount = useMemo(() => getBuildings().filter((b) => b.y0 === 0).length, []);

  // latest values for the key handler, which is bound once
  const state = useRef({ nearId, openId, touring, mapId });
  state.current = { nearId, openId, touring, mapId };

  /** Point the scene camera at the map view. North is up: the camera stands south of its target. */
  const aimMap = () => {
    const m = mapView.current;
    const up = m.flat ? MAP_FLAT : MAP_TILT;
    cam.current = { target: [m.x, 0, m.z], radius: m.dist * Math.cos(up), height: m.dist * Math.sin(up), angle: Math.PI / 2, ease: 7 };
  };
  const moveMap = (x: number, z: number, dist: number) => {
    const m = mapView.current;
    m.x = clamp(x, MAP_LIMITS.x[0], MAP_LIMITS.x[1]);
    m.z = clamp(z, MAP_LIMITS.z[0], MAP_LIMITS.z[1]);
    m.dist = clamp(dist, MAP_LIMITS.dist[0], MAP_LIMITS.dist[1]);
    aimMap();
  };
  /** Drag by screen pixels: the ground follows the cursor. */
  const panMap = (dx: number, dy: number) => {
    const m = mapView.current;
    const perPx = (2 * m.dist * Math.tan((FOV * Math.PI) / 360)) / window.innerHeight;
    moveMap(m.x - dx * perPx, m.z - (dy * perPx) / Math.sin(m.flat ? MAP_FLAT : MAP_TILT), m.dist);
  };
  const zoomMap = (factor: number) => moveMap(mapView.current.x, mapView.current.z, mapView.current.dist * factor);
  const openMap = (id: MapMenuId) => {
    if (state.current.mapId !== id) {
      const menu = MAP_MENUS.find((m) => m.id === id)!;
      mapView.current = { ...menu.view };
      setFlat(menu.view.flat);
      setMapSel(null);
    }
    lastMap.current = id;
    setMapId(id);
    aimMap();
    flightRef.current?.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
  };
  const closeMap = () => {
    setMapId(null);
    setMapSel(null);
    cam.current = null;
  };
  const toggleFlat = () => {
    mapView.current.flat = !mapView.current.flat;
    setFlat(mapView.current.flat);
    aimMap();
  };
  /** Open a place's card and bring it to the middle of the view, close enough to read its surroundings. */
  const selectPoint = (p: MapPoint | null) => {
    setMapSel(p ? p.id : null);
    if (p) moveMap(p.at[0], p.at[1], Math.min(mapView.current.dist, 2600));
  };
  const toggleLayer = (id: string) => {
    if (!mapId) return;
    setMapSel(null);
    setLayersOn((all) => ({ ...all, [mapId]: all[mapId].includes(id) ? all[mapId].filter((l) => l !== id) : [...all[mapId], id] }));
  };
  // the map's lines and volumes; a landmark console writes its own drawings while it is open
  useEffect(() => {
    if (openId) return;
    overlay.current = mapId ? { ...NO_OVERLAY, map: mapId, layers: layersOn[mapId] } : NO_OVERLAY;
  }, [mapId, layersOn, openId]);

  const startTour = () => {
    flightRef.current?.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    setTouring(true);
  };

  /** Queue a landmark's camera stills (and the equipment shot), once per landmark and light. */
  const queueStills = (id: string) => {
    if (!asked.current.has(id)) {
      asked.current.add(id);
      const lm = LANDMARKS.find((l) => l.id === id)!;
      const keep = (camId: string) => (url: string) => setShots((all) => ({ ...all, [id]: { ...all[id], [camId]: url } }));
      for (const g of cameraWall(lm.orbit.target, lm.orbit.radius, lm.orbit.height)) {
        for (const shot of g.shots) jobs.current.push({ pos: shot.pos, look: shot.look, done: keep(shot.id) });
      }
      const al = OPS[id].alerts;
      if (al) {
        const [a, b] = al.line;
        const line: [number, number, number] = [(a[0] + b[0]) / 2, 6, (a[1] + b[1]) / 2];
        jobs.current.push({ pos: [al.focus[0] - 150, 60, al.focus[2] + 190], look: al.focus, fov: 45, overlay: { ...NO_OVERLAY, fence: true }, done: keep('alert-fence') });
        jobs.current.push({ pos: [line[0] - 120, 48, line[2] + 170], look: line, fov: 45, overlay: { ...NO_OVERLAY, line: true }, done: keep('alert-line') });
      }
    }
    if (!asked.current.has('asset')) {
      asked.current.add('asset');
      jobs.current.push({ pos: [3.1, 2.1, 3.7], look: [0.2, 1.05, 0], fov: 34, asset: true, done: setAssetShot });
    }
  };
  // the stills show the city's light: when it changes, drop them and render the open landmark's again
  const lightSeen = useRef(day);
  useEffect(() => {
    if (lightSeen.current === day) return;
    lightSeen.current = day;
    jobs.current.length = 0;
    asked.current = new Set(asked.current.has('asset') ? ['asset'] : []);
    setShots({});
  }, [day]);
  /** Once the new light has settled, render the open landmark's stills again. */
  const onLight = () => {
    if (state.current.openId) queueStills(state.current.openId);
  };

  const openLandmark = (id: string) => {
    setOpenId(id);
    setVisitedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    queueStills(id);
    flightRef.current?.keys.clear();
    // the panel is read with the mouse, so hand the cursor back
    if (document.pointerLockElement) document.exitPointerLock();
  };
  const actions = useRef({ openLandmark, openMap, closeMap, panMap, zoomMap, clearSel: () => setMapSel(null) });
  actions.current = { openLandmark, openMap, closeMap, panMap, zoomMap, clearSel: () => setMapSel(null) };

  useEffect(() => {
    const el = viewRef.current!;
    let dragging = false;
    const key = (down: boolean) => (e: KeyboardEvent) => {
      if (state.current.touring) return; // the tour has its own keys
      const s = state.current;
      const typing = Boolean((e.target as HTMLElement | null)?.closest?.('input, textarea'));
      if (down && !e.repeat && live.current && !s.openId && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // the city map: a number opens a menu, M opens the last one or closes the map
        const n = MENU_KEYS.indexOf(e.code);
        if (n >= 0) return actions.current.openMap(MAP_MENUS[n].id);
        if (e.code === 'KeyM') return s.mapId ? actions.current.closeMap() : actions.current.openMap(lastMap.current);
      }
      if (s.mapId) return; // the map handles Esc itself, and flight keys rest while it is open
      if (down && !e.repeat && live.current && (e.code === 'KeyE' || e.code === 'Escape')) {
        // while a console is open it handles E and Esc itself
        if (!s.openId && e.code === 'KeyE' && s.nearId) actions.current.openLandmark(s.nearId);
        return;
      }
      if (!FLIGHT_KEYS.has(e.code)) return;
      // Space on a focused button should press the button, not climb
      if ((e.target as HTMLElement | null)?.closest?.('button, a, input')) return;
      e.preventDefault();
      const f = flightRef.current;
      if (!f) return;
      if (down) f.keys.add(e.code);
      else f.keys.delete(e.code);
    };
    const onDown = key(true);
    const onUp = key(false);
    const onMove = (e: MouseEvent) => {
      if (!live.current || state.current.openId || state.current.touring) return;
      if (state.current.mapId) {
        if (dragging) actions.current.panMap(e.movementX, e.movementY);
        return;
      }
      if (document.pointerLockElement === el || dragging) flightRef.current?.look(e.movementX, e.movementY);
    };
    const onPress = () => {
      dragging = true;
      (document.activeElement as HTMLElement | null)?.blur?.();
      setTouched(true);
      if (state.current.mapId) actions.current.clearSel(); // a press on the map itself puts the open card away
      if (state.current.openId || state.current.touring || state.current.mapId) return; // while a panel, the tour or the map is up the cursor stays free
      // pointer lock is optional: where it is refused, dragging still steers
      try {
        (el.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
      } catch {
        /* drag fallback */
      }
    };
    const onRelease = () => (dragging = false);
    const onWheel = (e: WheelEvent) => {
      if (!state.current.mapId) return;
      e.preventDefault();
      actions.current.zoomMap(Math.exp(clamp(e.deltaY, -240, 240) * 0.0016));
    };
    const onLock = () => setLocked(document.pointerLockElement === el);
    const onBlur = () => flightRef.current?.keys.clear();

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('pointerup', onRelease);
    window.addEventListener('blur', onBlur);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('pointerlockchange', onLock);
    el.addEventListener('pointerdown', onPress);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('pointerlockchange', onLock);
      el.removeEventListener('pointerdown', onPress);
      el.removeEventListener('wheel', onWheel);
      if (document.pointerLockElement === el) document.exitPointerLock();
    };
  }, []);

  const mapRef = (el: HTMLCanvasElement | null) => {
    hud.current.map = el;
    if (el && el.width !== MAP_PX * 2) el.width = el.height = MAP_PX * 2; // drawn at 2x for sharp lines
  };

  const prompt = open ? null : near ? `E · Open ${near.name}` : locked ? null : touched ? 'Click the view to steer' : 'Click the view to take control';

  return (
    <main className={`main main--city${REAL ? ' main--real' : ''}${mapId ? ' is-map' : ''}`}>
      <div className="city-view" ref={viewRef}>
        <Canvas
          dpr={[1, 1.25]}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
          camera={{ fov: 58, near: 1, far: 42000, position: INTRO_CAM.toArray() }}
        >
          {makeCity && <CityScene makeCity={makeCity} avatar={avatar} day={day} hud={hud} live={live} cam={cam} tour={tourCam} anchors={anchors} overlay={overlay} jobs={jobs} visited={visited} flightRef={flightRef} onReady={() => setReady(true)} onNear={setNearId} onLight={onLight} />}
        </Canvas>
      </div>

      {/* landmark markers live in screen space, over the whole view */}
      <div className={`lm-layer${loading || open || touring || mapId ? ' is-hidden' : ''}`}>
        {LANDMARKS.map((lm, i) => (
          <button
            key={lm.id}
            id={`marker-${lm.id}`}
            className={`lm${visitedIds.includes(lm.id) ? ' is-visited' : ''}`}
            ref={(el) => void (hud.current.markers[i] = el)}
            onClick={() => openLandmark(lm.id)}
          >
            <Diamond />
            <span className="lm-name">{lm.name}</span>
            <span className="lm-dist" ref={(el) => void (hud.current.dists[i] = el)} />
          </button>
        ))}
      </div>

      <div className={`hud${loading || open || touring || mapId ? ' is-hidden' : ''}`}>
        <section className="hud-panel hud-place" aria-label="Location">
          <p className="eyebrow eyebrow--live">
            <span className="live-dot" aria-hidden="true" />
            {country.name} · {country.coords}
          </p>
          <h1>{country.city}</h1>
          <dl className="stats stats--bare stats--sm">
            <div className="stat">
              <dd>
                {visitedIds.length}
                <span className="stat-unit">of {LANDMARKS.length}</span>
              </dd>
              <dt>Landmarks visited</dt>
            </div>
            {REAL ? (
              <div className="stat">
                <dd>3D Tiles</dd>
                <dt>Photorealistic, by Google</dt>
              </div>
            ) : (
              <div className="stat">
                <dd>{buildingCount.toLocaleString('en')}</dd>
                <dt>Buildings generated</dt>
              </div>
            )}
          </dl>
        </section>

        <div className="hud-compass" aria-hidden="true">
          <div className="compass-window">
            <div className="compass-tape" ref={(el) => void (hud.current.tape = el)}>
              {MARKS.map((m) => (
                <span key={m.deg} className={`mark${m.major ? ' mark--major' : ''}`} style={{ left: (m.deg + 180) * DEG_PX }}>
                  {m.label}
                </span>
              ))}
            </div>
            {LANDMARKS.map((lm, i) => (
              <span key={lm.id} className="compass-lm" ref={(el) => void (hud.current.ticks[i] = el)}>
                <Diamond />
              </span>
            ))}
          </div>
          <span className="compass-needle" />
        </div>

        <ul className="hud-panel hud-keys" aria-label="Controls">
          {CONTROLS.map((c) => (
            <li key={c.label}>
              <span className="keys">
                {c.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
              {c.label}
            </li>
          ))}
        </ul>

        <div className="hud-bl">
          <div className="hud-panel hud-map" aria-hidden="true">
            <canvas ref={mapRef} />
          </div>
          <section className="hud-panel hud-flight" aria-label="Flight data">
            <dl className="stats stats--bare">
              <div className="stat">
                <dd>
                  <span ref={(el) => void (hud.current.speed = el)}>0</span>
                  <span className="stat-unit">km/h</span>
                </dd>
                <dt>Speed</dt>
              </div>
              <div className="stat">
                <dd>
                  <span ref={(el) => void (hud.current.alt = el)}>150</span>
                  <span className="stat-unit">m</span>
                </dd>
                <dt>Altitude</dt>
              </div>
              <div className="stat">
                <dd>
                  <span ref={(el) => void (hud.current.hdg = el)}>270</span>
                  <span className="stat-unit">°</span>
                </dd>
                <dt>Heading</dt>
              </div>
            </dl>
            <div className="boost" aria-hidden="true">
              <span className="eyebrow">Boost</span>
              <span className="boost-track">
                <span ref={(el) => void (hud.current.boost = el)} />
              </span>
            </div>
          </section>
        </div>

        <p className={`hud-prompt${prompt ? '' : ' is-off'}`} role="status">
          {prompt}
        </p>

        <p className="hud-narrow">Flying needs a keyboard and a mouse. You can still open each landmark by tapping its marker.</p>
      </div>

      {mapId && !open && !touring && (
        <CityMap menu={MAP_MENUS.find((m) => m.id === mapId)!} layers={layersOn[mapId]} onLayer={toggleLayer} selected={mapSel} onSelect={selectPoint} anchors={anchors} onClose={closeMap} />
      )}

      {!loading && !open && !touring && (
        <CityToolbar mapId={mapId} flat={flat} onMenu={openMap} onFlat={toggleFlat} onZoom={zoomMap} onFly={closeMap} onStats={startTour} onFlyer={onChangeFlyer} onGlobe={onGlobe} />
      )}

      {open && <Console key={open.id} landmark={open} shots={shots[open.id] ?? {}} assetShot={assetShot} cam={cam} overlay={overlay} anchors={anchors} onClose={() => setOpenId(null)} />}

      {REAL && <p className="credits" ref={(el) => void (hud.current.credits = el)} />}

      {touring && <CityTour country={country} cam={tourCam} paused={loading} onDone={() => setTouring(false)} />}

      {loading && <LoadingScreen country={country} avatar={avatar} ready={ready} onDone={() => setLoading(false)} />}
    </main>
  );
}
