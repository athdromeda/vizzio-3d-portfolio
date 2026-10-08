# Real-city ground mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the pilot land from the real Google 3D tiles into the generated simplified city, behind a confirm that warns the ground view is simplified 3D, and take off back to the tiles at the same spot.

**Architecture:** Add a runtime active world (`'real' | 'simple'`) beside the compile-time `REAL` capability flag. Build both cities once and keep them alive; a `world` state picks the active one. `place()` becomes frame-aware and a new `unplace()` converts a real-world position back to stand-in coordinates. One `Flight`/`Ground` instance persists across the swap and rebinds to the active city's colliders/terrain via a frame setter.

**Tech Stack:** React 19, TypeScript, Three.js via React Three Fiber, `3d-tiles-renderer` / Cesium ion (real tiles), Vite.

## Global Constraints

- `npm run typecheck` (tsc --noEmit) and `npm run build` (typecheck + vite build) must pass after every task.
- The owner asked for **no git commits** on this work: every task ends with a typecheck/build checkpoint, not a commit.
- No hardcoded colours or font sizes outside `src/styles/tokens.css`; use `--glass`, `--line`, `--line-strong`, `--signal`, `--signal-ink`, `--ink`, `--ink-2`, `--ink-3`, `--s-*`, `--t-*`.
- Square corners, hairline borders, no drop shadows (CLAUDE.md design rules).
- Per-frame animation state lives in refs, never React state.
- The real-tiles code stays behind the `REAL` / env check so the preview and artifact builds leave it out.
- Do not change the `!REAL` ground experience.
- The spec is the source of truth: `docs/superpowers/specs/2026-10-07-real-city-ground-mode-design.md`.

---

### Task 1: Active world + `unplace` in geo.ts

**Files:**
- Modify: `src/city/geo.ts`

**Interfaces:**
- Consumes: existing `REAL`, `ORIGIN`, `GROUND_Y`, `fromLatLon`, `ANCHORS`, `SHIFT`, `place`, `V3`.
- Produces:
  - `type World = 'real' | 'simple'`
  - `getWorld(): World`
  - `setWorld(w: World): void`
  - `place(p: V3): V3` — now identity while the active world is `'simple'`
  - `unplace(p: V3): V3` — real coords → stand-in coords

- [ ] **Step 1: Add the active-world type and accessors**

Insert after the `REAL` export (currently `src/city/geo.ts:8`):

```ts
/** Which city is on screen: the streaming real tiles, or the generated stand-in. */
export type World = 'real' | 'simple';

let active: World = REAL ? 'real' : 'simple';

export const getWorld = (): World => active;

/** The whole app has one active world at a time; call this before the state update that swaps it. */
export const setWorld = (w: World): void => {
  active = w;
};
```

- [ ] **Step 2: Make `place()` frame-aware**

Replace the body of `place()` (currently `src/city/geo.ts:48-58`) so it returns the point untouched while the simplified city is active:

```ts
/** A stand-in point's place in the city that is actually on screen. Identity for the simplified city. */
export function place(p: V3): V3 {
  if (!REAL || active === 'simple') return p;
  let best = SHIFT[0], bestD = Infinity;
  for (const s of SHIFT) {
    const d = (p[0] - s.x) ** 2 + (p[2] - s.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return [p[0] + best.dx, p[1] + GROUND_Y, p[2] + best.dz];
}
```

- [ ] **Step 3: Add `unplace()`**

Append to `src/city/geo.ts`:

```ts
/**
 * Inverse of place(): where a point in the city that is on screen sits in the stand-in map.
 * Picks the anchor whose real position is nearest p and undoes its shift and the ground lift.
 * Used once per real -> simplified landing.
 */
export function unplace(p: V3): V3 {
  if (!REAL) return p;
  let best: V3 = [p[0], p[1] - GROUND_Y, p[2]];
  let bestD = Infinity;
  for (const a of ANCHORS) {
    const r = fromLatLon(a.lat, a.lon);
    const d = (p[0] - r[0]) ** 2 + (p[2] - r[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [p[0] - (r[0] - a.standIn[0]), p[1] - GROUND_Y, p[2] - (r[2] - a.standIn[1])];
    }
  }
  return best;
}
```

- [ ] **Step 4: Verify round-trip by inspection and typecheck**

`unplace(place(p))` for any `p` inside one anchor's region returns `p`, because both pick the same anchor and the shifts cancel. (Near a region boundary the two may pick different anchors; the mapping is approximate by design — spec "Edge cases".)

Run: `npm run typecheck`
Expected: PASS (no output).

---

### Task 2: Frame setters on Flight and Ground

**Files:**
- Modify: `src/city/flight.ts`
- Modify: `src/city/ground.ts`

**Interfaces:**
- Consumes: `ColliderIndex`, `Collider`, three `Vector2`.
- Produces:
  - `Flight.setFrame(colliders: ColliderIndex, terrain: ((x: number, y: number, z: number) => number | null) | null, centre: THREE.Vector2, radius: number): void`
  - `Ground.setFrame(colliders: ColliderIndex, obstacles: Obstacle[] | undefined, centre: THREE.Vector2, radius: number): void`

- [ ] **Step 1: Add `Flight.setFrame`**

In `src/city/flight.ts`, the constructor already declares `private colliders: ColliderIndex`. Add this method after the constructor (after `src/city/flight.ts:61`):

```ts
/** Point the flyer at another city: its colliders (real tiles: empty), its terrain probe, and its map frame. */
setFrame(
  colliders: ColliderIndex,
  terrain: ((x: number, y: number, z: number) => number | null) | null,
  centre: THREE.Vector2,
  radius: number,
) {
  this.colliders = colliders;
  this.terrain = terrain;
  this.centre.copy(centre);
  this.radius = radius;
  this.floor = 0;
}
```

Note: `colliders` is a constructor property parameter and is reassignable from a method; `centre` is a `readonly THREE.Vector2` so use `.copy()`; `radius`, `terrain` and `floor` are plain fields.

- [ ] **Step 2: Add `Ground.setFrame`**

In `src/city/ground.ts`, add after the constructor (after `src/city/ground.ts:63`):

```ts
/** Point the walker at another city: its colliders and traffic, and its map frame. */
setFrame(colliders: ColliderIndex, obstacles: Obstacle[] | undefined, centre: THREE.Vector2, radius: number) {
  this.colliders = colliders;
  this.obstacles = obstacles ?? [];
  this.centre = centre;
  this.radius = radius;
  this.carrier = null;
}
```

Note: `colliders`, `centre` and `radius` are constructor property parameters and are reassignable; `obstacles` and `carrier` are fields (both already declared).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

---

### Task 3: CityScreen owns both cities; CityScene renders the active world

No behaviour changes yet (nothing swaps the world), only ownership and wiring. Both cities are built once and kept; disposal moves up to `CityScreen`.

**Files:**
- Modify: `src/screens/CityScreen.tsx`

**Interfaces:**
- Consumes: `buildCity()`, `City`, dynamic `buildRealCity()`, `World` from `./geo`.
- Produces (later tasks rely on these props on `CityScene`): `city: City`, `world: World`.

- [ ] **Step 1: Update the import**

`src/screens/CityScreen.tsx:8` currently:

```ts
import { GROUND_Y, REAL, place } from '../city/geo';
```

Change to:

```ts
import { GROUND_Y, REAL, place, type World } from '../city/geo';
```

(`setWorld`, `getWorld`, `unplace` are added to this import in later tasks.)

- [ ] **Step 2: Replace `makeCity` with two owned cities and a `world` state**

Replace `src/screens/CityScreen.tsx:897-901`:

```ts
  // the real-tiles code is only fetched when a Cesium ion token is configured; the stand-in city is always at hand
  const [makeCity, setMakeCity] = useState<(() => City) | null>(() => (REAL ? null : buildCity));
  useEffect(() => {
    if (REAL) import('../city/realCity').then((m) => setMakeCity(() => m.buildRealCity));
  }, []);
```

with:

```ts
  // Both cities are built once and kept alive, so a swap never re-streams the tiles. The generated
  // city is built eagerly without a token, and lazily on the first landing otherwise (see Task 5/6).
  const [realCity, setRealCity] = useState<City | null>(null);
  const [simpleCity, setSimpleCity] = useState<City | null>(() => (REAL ? null : buildCity()));
  const [world, setWorldState] = useState<World>(() => (REAL ? 'real' : 'simple'));
  useEffect(() => {
    if (!REAL) return;
    import('../city/realCity').then((m) => setRealCity(m.buildRealCity()));
  }, []);
  const city = world === 'simple' ? simpleCity : realCity;
  // dispose both on unmount; CityScene no longer owns disposal
  const owned = useRef<City[]>([]);
  useEffect(() => {
    if (realCity && !owned.current.includes(realCity)) owned.current.push(realCity);
    if (simpleCity && !owned.current.includes(simpleCity)) owned.current.push(simpleCity);
  }, [realCity, simpleCity]);
  useEffect(
    () => () => {
      for (const c of owned.current) c.dispose();
      owned.current.length = 0;
    },
    [],
  );
```

- [ ] **Step 3: Pass the active city and world to `CityScene`**

Replace the render line `src/screens/CityScreen.tsx:1188`:

```tsx
          {makeCity && <CityScene makeCity={makeCity} avatar={avatar} day={day} hud={hud} live={live} cam={cam} tour={tourCam} anchors={anchors} overlay={overlay} jobs={jobs} visited={visited} flightRef={flightRef} travelRef={travelRef} onTravel={setTravel} onReady={() => setReady(true)} onNear={setNearId} onLight={onLight} />}
```

with:

```tsx
          {city && <CityScene city={city} world={world} avatar={avatar} day={day} hud={hud} live={live} cam={cam} tour={tourCam} anchors={anchors} overlay={overlay} jobs={jobs} visited={visited} flightRef={flightRef} travelRef={travelRef} onTravel={setTravel} onReady={() => setReady(true)} onNear={setNearId} onLight={onLight} />}
```

- [ ] **Step 4: Change `SceneProps`**

Replace `src/screens/CityScreen.tsx:98-99`:

```ts
  /** Builds the city: the generated stand-in, or the real tiles when a key is configured. */
  makeCity: () => City;
```

with:

```ts
  /** The city on screen right now. */
  city: City;
  /** Which city that is: the real tiles or the generated stand-in. */
  world: World;
```

- [ ] **Step 5: Update the `CityScene` signature and drop the `makeCity` memo**

Replace `src/screens/CityScreen.tsx:118` and `122`:

```ts
function CityScene({ makeCity, avatar, day, hud, live, cam, tour, anchors, overlay, jobs, visited, flightRef, travelRef, onTravel, onReady, onNear, onLight }: SceneProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const city = useMemo(makeCity, [makeCity]);
```

with:

```ts
function CityScene({ city, world, avatar, day, hud, live, cam, tour, anchors, overlay, jobs, visited, flightRef, travelRef, onTravel, onReady, onNear, onLight }: SceneProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
```

- [ ] **Step 6: Stop disposing the city when it changes; split fog from env setup**

Replace `src/screens/CityScreen.tsx:331-343`:

```ts
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
```

with:

```ts
  useEffect(() => {
    env.current = { pmrem: new THREE.PMREMGenerator(gl), target: null, version: -1 };
    scene.environmentIntensity = 1;
    return () => {
      scene.environment = null;
      scene.fog = null;
      env.current?.target?.dispose();
      env.current?.pmrem.dispose();
      env.current = null;
    };
  }, [gl, scene]);
  useEffect(() => {
    scene.fog = city.fog;
  }, [scene, city]);
```

- [ ] **Step 7: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

Manual sanity (optional, no token build): `npm run dev`, fly the generated city — unchanged.

---

### Task 4: Make sky, fog/env, minimap, stats, credits, markers and overlays follow the active world

Until now `REAL` (compile-time) drove these; the world can still not change, but this task replaces every `REAL` presentation gate with `world` so a later swap is correct.

**Files:**
- Modify: `src/screens/CityScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `world: World`; `City.credits?`.
- Produces: no new public API; `App` gains `onWorld: (w: World) => void` on `CityScreen`.

- [ ] **Step 1: Replace the module-level `MINIMAP_3D` with a world-derived value**

Delete `src/screens/CityScreen.tsx:39`:

```ts
const MINIMAP_3D = REAL || Boolean(import.meta.env.VITE_MINIMAP_3D);
```

In `CityScreen` (outer), add near the top of the component body (after `const city = ...`):

```ts
  // the real tiles have no pre-drawn map: render their own tiles top-down; the stand-in uses the base chart
  const minimap3D = world === 'real' || Boolean(import.meta.env.VITE_MINIMAP_3D);
```

- [ ] **Step 2: Pass `minimap3D` into `CityScene` and use it there**

Add `minimap3D: boolean;` to `SceneProps` (next to `world`), pass `minimap3D={minimap3D}` in the `<CityScene ... />` line, add it to the destructured `CityScene` params, then replace `src/screens/CityScreen.tsx:170` and `172`:

```ts
  const mapBase = useMemo(() => (MINIMAP_3D ? null : makeMinimapBase()), []);
```
```ts
  const minimap3d = useMemo(() => (MINIMAP_3D ? makeMinimap3D(MINIMAP3D_SIZE) : null), []);
```

with:

```ts
  const mapBase = useMemo(() => (minimap3D ? null : makeMinimapBase()), [minimap3D]);
```
```ts
  const minimap3d = useMemo(() => (minimap3D ? makeMinimap3D(MINIMAP3D_SIZE) : null), [minimap3D]);
```

- [ ] **Step 3: Sky pass follows the world**

Replace `src/screens/CityScreen.tsx:793-799`:

```tsx
      {REAL ? (
        <AtmosphereSky />
      ) : (
        /* dusk: facades and ground stay under 1; lit windows, lamps and the sun cross it and glow.
           By day only the sun and its glints on glass and water do. */
        <Effects threshold={day ? 1.6 : 1.15} strength={day ? 0.12 : 0.26} radius={0.45} />
      )}
```

with:

```tsx
      {world === 'real' ? (
        <AtmosphereSky />
      ) : (
        /* dusk: facades and ground stay under 1; lit windows, lamps and the sun cross it and glow.
           By day only the sun and its glints on glass and water do. */
        <Effects threshold={day ? 1.6 : 1.15} strength={day ? 0.12 : 0.26} radius={0.45} />
      )}
```

- [ ] **Step 4: Bake the stand-in environment only in the simplified world**

Replace the bake guard `src/screens/CityScreen.tsx:378`:

```ts
      if (!REAL) {
```

with:

```ts
      if (world === 'simple') {
```

and, immediately before `const e0 = env.current;` inside the same `useFrame` (around line 373), add a re-bake trigger — a small effect placed with the other effects instead is cleaner; add after the env effect from Task 3:

```ts
  useEffect(() => {
    if (env.current) env.current.version = -1;
  }, [world]);
```

- [ ] **Step 5: Markers follow the world**

Delete the module constant `src/screens/CityScreen.tsx:31`:

```ts
const LM_POS = LANDMARKS.map((l) => place(l.pos));
```

Inside `CityScene`, after `const v = useMemo(...)`, add:

```ts
  const lmPos = useMemo(() => LANDMARKS.map((l) => place(l.pos)), [world]);
```

Replace every use of `LM_POS` inside `CityScene` with `lmPos` (there are three: the marker loop `const at = LM_POS[i];` at line 713, and the two minimap calls at lines 770 and 775).

- [ ] **Step 6: Camera lift follows the world**

Delete `src/screens/CityScreen.tsx:33`:

```ts
const LIFT = REAL ? GROUND_Y : 0;
```

Inside `CityScene`, add after `const lmPos = ...`:

```ts
  const lift = world === 'real' ? GROUND_Y : 0;
```

Replace `src/screens/CityScreen.tsx:505` `const wantH = want.height + LIFT;` with `const wantH = want.height + lift;`.

- [ ] **Step 7: `main--real` class, stats panel and credits follow the world**

Replace `src/screens/CityScreen.tsx:1181`:

```tsx
    <main className={`main main--city${REAL ? ' main--real' : ''}${mapId ? ' is-map' : ''}`}>
```

with:

```tsx
    <main className={`main main--city${world === 'real' ? ' main--real' : ''}${mapId ? ' is-map' : ''}`}>
```

Replace `src/screens/CityScreen.tsx:1224` `{REAL ? (` with `{world === 'real' ? (`.

Replace `src/screens/CityScreen.tsx:1327`:

```tsx
      {REAL && <p className="credits" ref={(el) => void (hud.current.credits = el)} />}
```

with:

```tsx
      {world === 'real' && <p className="credits" ref={(el) => void (hud.current.credits = el)} />}
```

- [ ] **Step 8: Rebuild overlays when the world changes**

Replace `src/screens/CityScreen.tsx:199`:

```ts
  const overlays = useMemo(buildOverlays, []);
```

with:

```ts
  // the map/console drawings bake place() into their geometry, so they follow the active world
  const overlays = useMemo(buildOverlays, [world]);
```

- [ ] **Step 9: Expose the world to `App` so the day/dusk tool follows it**

In `src/App.tsx`, change the import `src/App.tsx:2`:

```ts
import { REAL } from './city/geo';
```

to:

```ts
import { REAL, type World } from './city/geo';
```

Add state near `cityMode`:

```ts
  const [cityWorld, setCityWorld] = useState<World>('simple');
```

Change the `Shell` tools gate `src/App.tsx:43`:

```tsx
    <Shell hint={(stage === 'city' && CITY_HINTS[cityMode]) || HINTS[stage]} tools={stage === 'city' && !REAL ? light : undefined}>
```

to:

```tsx
    <Shell hint={(stage === 'city' && CITY_HINTS[cityMode]) || HINTS[stage]} tools={stage === 'city' && (!REAL || cityWorld === 'simple') ? light : undefined}>
```

Pass the callback `src/App.tsx:57`:

```tsx
        <CityScreen country={country} avatar={avatar} day={day} onChangeFlyer={() => setStage('avatar')} onGlobe={() => setStage('globe')} onMode={setCityMode} />
```

to:

```tsx
        <CityScreen country={country} avatar={avatar} day={day} onChangeFlyer={() => setStage('avatar')} onGlobe={() => setStage('globe')} onMode={setCityMode} onWorld={setCityWorld} />
```

- [ ] **Step 10: Add `onWorld` to `CityScreen` props and report it**

Add `onWorld: (w: World) => void;` to `Props` (`src/screens/CityScreen.tsx:883-892`), destructure it in `CityScreen`, and add an effect that reports the active world:

```ts
  useEffect(() => {
    onWorld(world);
  }, [world, onWorld]);
```

- [ ] **Step 11: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS. Manually: without a token the stats panel still shows "Buildings generated", the light tool is visible, and the bloom path is used.

---

### Task 5: The swap — rebind frames, convert position, land and take off

At the end of this task, pressing G over the real tiles lands (no confirm yet); pressing G again takes off back to the tiles at the same spot.

**Files:**
- Modify: `src/screens/CityScreen.tsx`

**Interfaces:**
- Consumes: `unplace`, `place`, `setWorld`, `getWorld` from `./geo`; `Flight.setFrame`, `Ground.setFrame`; `START`, `landSdf`, `REAL_FRAME`, `SIMPLE_FRAME`.
- Produces: `CityScene` props `onLand(): void` and `onTakeoff(): void`; `window.__test.world()`.

- [ ] **Step 1: Extend the geo import**

`src/screens/CityScreen.tsx:8`:

```ts
import { GROUND_Y, REAL, place, type World } from '../city/geo';
```

→

```ts
import { GROUND_Y, REAL, getWorld, place, setWorld as setGeoWorld, unplace, type World } from '../city/geo';
```

- [ ] **Step 2: Add frame constants**

After the `LOW` constant (`src/screens/CityScreen.tsx:88`), add:

```ts
/** Flyer frame per world: the real tiles are far wider than the stand-in, and their surface is streamed. */
const REAL_FRAME = { centre: new THREE.Vector2(7000, -4000), radius: 16000 };
const SIMPLE_FRAME = { centre: new THREE.Vector2(1500, -400), radius: 6500 };
```

- [ ] **Step 3: Let `canGround` be true in both worlds**

Replace both `const canGround = avatar.ground === true && !REAL;` lines (`src/screens/CityScreen.tsx:136` and `:917`) with:

```ts
  const canGround = avatar.ground === true;
```

- [ ] **Step 4: Stop building the pilot's bikes while the real tiles are active**

Replace `src/screens/CityScreen.tsx:144`:

```ts
  const bikes = useMemo(() => (canGround ? { parked: buildParked(), own: buildBike(), props: new THREE.Group() } : null), [canGround]);
```

with:

```ts
  // the parked motorbikes belong to the generated city; hide them (and this whole path) over the real tiles
  const bikes = useMemo(
    () => (canGround && world === 'simple' ? { parked: buildParked(), own: buildBike(), props: new THREE.Group() } : null),
    [canGround, world],
  );
```

- [ ] **Step 5: Add the frame effect (rebind + position conversion)**

Add after the `bikes` prop-adding effect (`src/screens/CityScreen.tsx:159-162`):

```ts
  // On a world change: rebind the pilot to the new city's colliders/frame, and move him between the
  // two coordinate systems. A real position -> simplified uses unplace(); the return uses place().
  const firstWorld = useRef(true);
  useEffect(() => {
    if (world === 'real') {
      flight.setFrame(city.colliders, city.surfaceBelow ?? null, REAL_FRAME.centre, REAL_FRAME.radius);
      ground.setFrame(city.colliders, city.obstacles, REAL_FRAME.centre, REAL_FRAME.radius);
    } else {
      flight.setFrame(city.colliders, null, SIMPLE_FRAME.centre, SIMPLE_FRAME.radius);
      ground.setFrame(city.colliders, city.obstacles, SIMPLE_FRAME.centre, SIMPLE_FRAME.radius);
    }
    if (firstWorld.current) {
      firstWorld.current = false;
      return;
    }
    const tr = travel.current;
    if (world === 'simple') {
      const at = unplace(flight.pos);
      const off = Math.hypot(at[0] - SIMPLE_FRAME.centre.x, at[2] - SIMPLE_FRAME.centre.y);
      if (landSdf(at[0], at[2]) > 2 || off > SIMPLE_FRAME.radius) {
        // landed over water or off the generated map: drop him at the start instead
        at[0] = START.pos[0];
        at[1] = 0;
        at[2] = START.pos[2];
      }
      ground.arrive(new THREE.Vector3(at[0], Math.max(0, at[1]), at[2]), flight.aimYaw);
      tr.mode = 'walk';
    } else {
      const at = place(ground.pos);
      flight.pos.set(at[0], at[1] + HIP, at[2]);
      flight.vel.set(0, 7, 0);
      flight.yaw = flight.aimYaw = ground.aimYaw;
      flight.pitch = 0;
      flight.aimPitch = 0.12;
      tr.mode = 'fly';
    }
    tr.stale = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- city is the new active city at this point
  }, [world]);
```

- [ ] **Step 5b: Compute `canLand` and report travel state outside the `bikes` block**

`tr.canLand` and the `onTravel` report currently live inside `if (bikes)` (`src/screens/CityScreen.tsx:675-706`), so over the real tiles (where `bikes` is null) the "Land on the street" prompt would never appear. Move both out and make the ground test world-aware.

Replace `src/screens/CityScreen.tsx:675-706`:

```ts
    // motorbikes: the ones parked around this block, which one is in reach, and whether there is ground to land on
    if (bikes) {
      const low = who.pos.y < LOW;
      if (frames.current % 6 === 0 || tr.stale) {
        const block = low ? `${Math.round(who.pos.x / 40)},${Math.round(who.pos.z / 40)}` : 'high';
        if (block !== tr.block || tr.stale) {
          tr.block = block;
          tr.stale = false;
          tr.spots = low ? spotsNear(who.pos.x, who.pos.z).filter((sp) => sp.key !== tr.taken) : [];
          bikes.parked.set(tr.spots, tr.mode !== 'ride');
        }
        tr.near = null;
        if (tr.mode === 'walk') {
          let best = 3.4;
          for (const sp of tr.spots) {
            const d = Math.hypot(sp.x - ground.pos.x, sp.z - ground.pos.z);
            if (d < best && ground.pos.y < 1) {
              best = d;
              tr.near = { x: sp.x, z: sp.z, yaw: sp.yaw, spot: sp };
            }
          }
          if (tr.left && Math.hypot(tr.left.x - ground.pos.x, tr.left.z - ground.pos.z) < best && ground.pos.y < 1) tr.near = { ...tr.left, spot: null };
        }
        tr.canLand = tr.mode === 'fly' && low && landSdf(flight.pos.x, flight.pos.z) > 2;
      }
      bikes.parked.update(t);
      const tell = `${tr.mode}|${tr.near ? 1 : 0}|${tr.canLand ? 1 : 0}`;
      if (tell !== tr.told) {
        tr.told = tell;
        onTravel({ mode: tr.mode, nearBike: tr.near !== null, canLand: tr.canLand });
      }
    }
```

with:

```ts
    // whether landing is offered: low over open ground. The real tiles have no stand-in shore test, so
    // ask the streamed surface instead; over water or a gap it reports no hit and landing is not offered.
    const low = who.pos.y < LOW;
    if ((frames.current % 6 === 0 || tr.stale) && tr.mode === 'fly') {
      tr.canLand =
        low &&
        (world === 'real'
          ? (city.surfaceBelow?.(flight.pos.x, flight.pos.y, flight.pos.z) ?? 0) > 0
          : landSdf(flight.pos.x, flight.pos.z) > 2);
    }

    // motorbikes: the ones parked around this block and which one is in reach (generated city only)
    if (bikes) {
      if (frames.current % 6 === 0 || tr.stale) {
        const block = low ? `${Math.round(who.pos.x / 40)},${Math.round(who.pos.z / 40)}` : 'high';
        if (block !== tr.block || tr.stale) {
          tr.block = block;
          tr.stale = false;
          tr.spots = low ? spotsNear(who.pos.x, who.pos.z).filter((sp) => sp.key !== tr.taken) : [];
          bikes.parked.set(tr.spots, tr.mode !== 'ride');
        }
        tr.near = null;
        if (tr.mode === 'walk') {
          let best = 3.4;
          for (const sp of tr.spots) {
            const d = Math.hypot(sp.x - ground.pos.x, sp.z - ground.pos.z);
            if (d < best && ground.pos.y < 1) {
              best = d;
              tr.near = { x: sp.x, z: sp.z, yaw: sp.yaw, spot: sp };
            }
          }
          if (tr.left && Math.hypot(tr.left.x - ground.pos.x, tr.left.z - ground.pos.z) < best && ground.pos.y < 1) tr.near = { ...tr.left, spot: null };
        }
      }
      bikes.parked.update(t);
    }
    const tell = `${tr.mode}|${tr.near ? 1 : 0}|${tr.canLand ? 1 : 0}`;
    if (tell !== tr.told) {
      tr.told = tell;
      onTravel({ mode: tr.mode, nearBike: tr.near !== null, canLand: tr.canLand });
    }
```

- [ ] **Step 6: Route `toggleGround` through the swap**

Add `onLand` / `onTakeoff` to `SceneProps` (after `world`):

```ts
  /** Leave the air for the simplified city. The screen builds it if needed and swaps the world. */
  onLand: () => void;
  /** Return to the real tiles. */
  onTakeoff: () => void;
```

Destructure them in `CityScene`. Replace `toggleGround` (`src/screens/CityScreen.tsx:257-277`) with:

```ts
      toggleGround() {
        if (!canGround) return;
        if (tr.mode === 'fly') {
          if (!tr.canLand) return;
          if (REAL && world === 'real') return onLand();
          ground.arrive(flight.pos, flight.aimYaw);
          tr.mode = 'walk';
        } else {
          if (tr.mode === 'ride') {
            tr.left = { x: ground.pos.x, z: ground.pos.z, yaw: ground.yaw };
            parkOwn();
          }
          if (REAL && world === 'simple') {
            flight.aimYaw = ground.aimYaw;
            return onTakeoff();
          }
          flight.pos.copy(ground.pos);
          flight.pos.y += HIP;
          flight.vel.set(0, 7, 0);
          flight.yaw = flight.aimYaw = ground.aimYaw;
          flight.pitch = 0;
          flight.aimPitch = 0.12;
          tr.mode = 'fly';
        }
        tr.stale = true;
      },
```

Note: on the real->simple takeoff, `aimYaw` is carried into `flight` before the world effect runs, so the effect can copy it onto `flight`.

- [ ] **Step 7: Implement `onLand` / `onTakeoff` in `CityScreen` and the lazy build**

In `CityScreen` (outer), add a ref and helper next to the city state (Task 3):

```ts
  const simpleRef = useRef<City | null>(null);
  /** Build the generated city on first use; later landings reuse it. */
  const ensureSimple = (): City => {
    if (simpleRef.current) return simpleRef.current;
    const c = buildCity();
    simpleRef.current = c;
    setSimpleCity(c);
    return c;
  };
  const land = () => {
    ensureSimple();
    setGeoWorld('simple');
    setWorldState('simple');
  };
  const takeoff = () => {
    setGeoWorld('real');
    setWorldState('real');
  };
```

Pass them to the scene:

```tsx
          {city && <CityScene city={city} world={world} onLand={land} onTakeoff={takeoff} avatar={avatar} ... />}
```

(Keep the rest of the existing props.)

- [ ] **Step 8: Report the world through the test hook**

In the `VITE_TEST` block (`src/screens/CityScreen.tsx:311-327`), add to the `__test` object:

```ts
      world: () => getWorld(),
      toggle: () => travel.current.toggleGround(),
```

(`travel` is already in scope inside `CityScene`.)

- [ ] **Step 9: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

Manual (needs `VITE_CESIUM_ION_TOKEN` and network): fly low over the city and press G — the pilot should land in the generated city at the matching spot; press G again — the tiles return at the same spot. Without a token, ground behaviour is unchanged.

---

### Task 6: Confirm dialog and first-swap loading overlay

**Files:**
- Create: `src/components/LandConfirm.tsx`
- Modify: `src/screens/CityScreen.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Produces: `LandConfirm({ onConfirm, onCancel, loading }: { onConfirm: () => void; onCancel: () => void; loading: boolean })`.

- [ ] **Step 1: Create the dialog component**

Create `src/components/LandConfirm.tsx`:

```tsx
import { useEffect, useRef } from 'react';

interface Props {
  /** The visitor approved the swap. */
  onConfirm: () => void;
  /** The visitor stayed in the air. */
  onCancel: () => void;
  /** The simplified city is building. */
  loading: boolean;
}

/** Blocking confirm shown before the pilot leaves the real tiles for the simplified city. */
export function LandConfirm({ onConfirm, onCancel, loading }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, []);
  return (
    <div
      className="land-confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="land-title"
      onKeyDown={(e) => {
        if (loading) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          onConfirm();
        }
      }}
    >
      <div className="land-confirm__panel" ref={panel} tabIndex={-1}>
        <p className="eyebrow">Landing</p>
        <h2 id="land-title">Leave the photorealistic tiles?</h2>
        <p>
          On the ground the city reloads as a simplified 3D model — buildings, streets and traffic generated in code,
          not Google&apos;s photorealistic tiles. Taking off again brings the real tiles back.
        </p>
        <div className="land-confirm__actions">
          <button type="button" className="ghost" onClick={onCancel} disabled={loading}>
            Keep flying
          </button>
          <button type="button" className="cta" onClick={onConfirm} disabled={loading}>
            {loading ? 'Loading simplified city…' : 'Land here'}
          </button>
        </div>
        <p className="land-confirm__hint">Enter lands · Esc stays in the air</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the dialog styles**

The dialog stands on tokens only: square corners, hairline border, glass, no shadow. Append to `src/styles/app.css`:

```css
/* ---------- Land confirm (real tiles -> simplified city) ---------- */

.land-confirm {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: var(--s-6);
  background: rgba(4, 7, 13, 0.62);
}

.land-confirm__panel {
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  padding: var(--s-6);
  background: var(--glass);
  border: 1px solid var(--line-strong);
  backdrop-filter: blur(14px);
  animation: panel-in 0.4s var(--ease) both;
}

.land-confirm__panel h2 {
  font-family: var(--font-display);
  font-size: var(--t-title);
  font-weight: 300;
  line-height: 1.1;
  letter-spacing: -0.01em;
}

.land-confirm__panel p:not(.eyebrow):not(.land-confirm__hint) {
  color: var(--ink-2);
  font-size: var(--t-small);
  line-height: 1.5;
}

.land-confirm__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--s-4);
}

.land-confirm__actions .cta {
  padding: 11px var(--s-4);
  font-size: var(--t-small);
}

.land-confirm__actions .cta:disabled {
  filter: none;
  opacity: 0.6;
  cursor: default;
}

.land-confirm__hint {
  color: var(--ink-3);
  font-family: var(--font-data);
  font-size: var(--t-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

- [ ] **Step 3: Add confirm + loading state and pause input**

In `CityScreen` (outer), add:

```ts
  const [confirmLand, setConfirmLand] = useState(false);
  const [swapLoading, setSwapLoading] = useState(false);
```

Change `onLand` (Step 7 of Task 5) to open the dialog instead of swapping directly:

```ts
  const land = () => setConfirmLand(true);
```

Add the confirm/cancel handlers:

```ts
  /** Confirmed: build the simplified city if needed, then swap. The overlay paints before the build. */
  const confirmLanding = () => {
    if (swapLoading) return;
    setSwapLoading(true);
    requestAnimationFrame(() => {
      ensureSimple();
      setGeoWorld('simple');
      setWorldState('simple');
      setSwapLoading(false);
      setConfirmLand(false);
    });
  };
  const cancelLanding = () => {
    setConfirmLand(false);
    setSwapLoading(false);
  };
```

Add a `paused` prop to `SceneProps` and pass `paused={confirmLand}`, then in `CityScene`'s `useFrame` change:

```ts
    const controls = live.current === true && intro.current > 0.7 && !want;
```

to:

```ts
    const controls = live.current === true && intro.current > 0.7 && !want && !paused;
```

and add `paused` to the destructured `CityScene` params. Also clear held keys when the dialog opens:

```ts
  useEffect(() => {
    if (!confirmLand) return;
    flightRef.current?.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
  }, [confirmLand, flightRef]);
```

- [ ] **Step 4: Render the dialog and the loading overlay**

Inside the `CityScreen` return, next to the other overlays (e.g. just before `{open && <Console ... />}`):

```tsx
      {confirmLand && (
        <LandConfirm onConfirm={confirmLanding} onCancel={cancelLanding} loading={swapLoading} />
      )}

      {swapLoading && (
        <div className="swap-loading" role="status">
          <span className="eyebrow">Loading simplified city…</span>
        </div>
      )}
```

Add the import at the top of `src/screens/CityScreen.tsx`:

```ts
import { LandConfirm } from '../components/LandConfirm';
```

The full-screen scrim (`swapLoading`) can reuse the dialog scrim styling; append:

```css
.swap-loading {
  position: fixed;
  inset: 0;
  z-index: 41;
  display: grid;
  place-items: center;
  background: rgba(4, 7, 13, 0.86);
}

.swap-loading .eyebrow {
  color: var(--ink);
}
```

Because `confirmLanding` sets `swapLoading` and yields a frame before the synchronous `buildCity()`, the overlay is painted first; the swap is instant on later landings (the city is cached).

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Browser check (stand-in)**

Run: `VITE_TEST=1 npm run build:artifact`
Then: `node scripts/shot-ground.mjs /tmp/ground-check`
Expected: the existing ground flow still passes with no errors thrown (the confirm path is not exercised without a token; the stand-in build lands directly).

Manual (needs `VITE_CESIUM_ION_TOKEN` and network): fly low, press G, the confirm appears; "Keep flying" changes nothing; "Land here" shows the loading line, then the simplified city; take off with G returns to the tiles.

---

## Self-Review

**Spec coverage**
- Active world + `place`/`unplace` → Task 1.
- Flight/Ground frame setters → Task 2.
- Both cities owned, active selection, no re-stream, disposal moved → Task 3.
- Sky, fog/env, minimap, stats, credits, `main--real`, markers, lift, overlays, App light tool → Task 4.
- Frame rebind + position conversion + land/takeoff + water/off-map clamp → Task 5.
- Confirm dialog + warning copy + first-swap loading → Task 6.
- Edge cases: `!REAL` unchanged (Tasks 4–6 gate on `world`/`REAL`); surface null → no landing offered (Task 5 Step 5b); water/off-map → Task 5 clamp; no-`ground` avatar → `canGround`; overlays → Task 4 Step 8; day/dusk → App light tool Task 4 Step 9. All covered.
- The prompt-driving `canLand`/`onTravel` moved out of the `bikes` block (Task 5 Step 5b) so landing is offered over the real tiles too.
- Non-goals respected: no `!REAL` change, no precise alignment, no collidable tiles, confirm-only warning.

**Placeholder scan:** no TBD/TODO; every code step shows the code.

**Type consistency:** `World` used from `./geo` throughout; `setWorld` imported as `setGeoWorld` where a local `setWorldState` also exists; `Flight.setFrame` / `Ground.setFrame` signatures match their call sites in Task 5; `LandConfirm` prop names match its usage; `minimap3D` is a `SceneProps` boolean and a local boolean in `CityScreen` — the local one is passed as the prop, so no shadowing inside `CityScene`.
