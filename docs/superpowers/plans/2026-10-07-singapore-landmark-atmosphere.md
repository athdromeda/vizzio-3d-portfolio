# Singapore Landmark (Cesium ion tiles + atmosphere) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the Singapore Marina Bay landmark as Google Photorealistic 3D Tiles (via Cesium ion) lit by the takram physically-based atmosphere in the existing city screen's real path, keeping flight/HUD/console/map unchanged.

**Architecture:** The real path (`src/city/realCity.ts`) keeps streaming tiles imperatively and returning the `City` object, but swaps Google auth for `CesiumIonAuthPlugin` and drops its hand-rolled sky/lights. A new r3f component (`src/components/AtmosphereSky.tsx`) supplies the atmosphere (`<Atmosphere>` + `<Sky>` + `<SunLight>`/`<SkyLight>`) and replaces the bloom `<Effects>` with an `@react-three/postprocessing` composer (`AerialPerspective → ToneMapping → SMAA → Dithering`) when `REAL`. The atmosphere aligns with the app's rebased local frame through `atmosphere.worldToECEFMatrix`.

**Tech Stack:** Vite, React 19, @react-three/fiber 9, three 0.186, 3d-tiles-renderer 0.5, @takram/three-atmosphere / three-geospatial / three-geospatial-effects, postprocessing + @react-three/postprocessing, @react-three/drei.

## Global Constraints

- The project **has no test framework**. The verification cycle is `npm run typecheck` (tsc, `strict`, `noUnusedLocals`, `noUnusedParameters`) and `npm run build` (typecheck + Vite build). Runtime verification needs network + a Cesium ion token; it cannot run in the offline preview.
- **Do not commit** (owner's instruction). Omit every `git commit` step.
- `VITE_CESIUM_ION_TOKEN` replaces `VITE_GOOGLE_MAPS_KEY` everywhere; Cesium ion asset id is `2275207` (Google Photorealistic 3D Tiles).
- Real mode is **flight only**: `canGround = avatar.ground === true && !REAL` stays verbatim.
- Do not change the generated stand-in city, the artifact preview, or the `City` interface.
- The atmosphere's fixed date mirrors the reference story: `dayOfYear 173`, `timeOfDay 10:00`, tone-mapping exposure `10`, `ToneMappingMode.AGX`.
- The local frame is +X east, +Y up, +Z south (`src/city/geo.ts`, `realCity.ts` comment).

---

### Task 1: Config plumbing — Cesium ion token + env types

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `src/vite-env.d.ts:3-8`
- Modify: `.env.example`
- Modify: `src/city/geo.ts:7-11`
- Modify: `src/screens/CityScreen.tsx:866-870`

**Interfaces:**
- Produces: `REAL: boolean` (from `VITE_CESIUM_ION_TOKEN`), `ION_ASSET: number` (both from `src/city/geo.ts`); `ImportMetaEnv.VITE_CESIUM_ION_TOKEN?: string`.
- Consumes: nothing.

- [ ] **Step 1: Add the runtime dependencies**

In `package.json`, inside `"dependencies"` (keep alphabetical), add:

```json
    "@react-three/drei": "^10.7.9",
    "@react-three/postprocessing": "^3.1.3",
    "@takram/three-atmosphere": "^0.19.1",
    "@takram/three-geospatial": "^0.9.1",
    "@takram/three-geospatial-effects": "^0.6.4",
    "postprocessing": "^6.39.5",
```

- [ ] **Step 2: Install them**

Run: `npm install`
Expected: installs without peer-dependency errors (three 0.186 / fiber 9.8 satisfy the takram peers).

- [ ] **Step 3: Replace the env type**

In `src/vite-env.d.ts`, replace the Google line:

```ts
interface ImportMetaEnv {
  /** Cesium ion access token. When set, the city is Google Photorealistic 3D Tiles via Cesium ion. */
  readonly VITE_CESIUM_ION_TOKEN?: string;
  /** Set for test builds only: exposes the simulation to scripts/shot-ground.mjs. */
  readonly VITE_TEST?: string;
}
```

- [ ] **Step 4: Update `.env.example`**

Replace the file's contents with:

```
# Copy to .env.local and fill in to fly over the real city instead of the generated stand-in.
# Needs a Cesium ion access token with access to the Google Photorealistic 3D Tiles asset (2275207).
# Tiles are billed through Cesium; keep the token scoped. Leave empty for the stand-in city.
VITE_CESIUM_ION_TOKEN=
```

- [ ] **Step 5: Point `REAL` at the new token and add the asset id**

In `src/city/geo.ts`, change line 8 and add the asset constant near `ORIGIN`:

```ts
/** True when a Cesium ion token is configured (see .env.example). */
export const REAL = Boolean(import.meta.env.VITE_CESIUM_ION_TOKEN);

/** Cesium ion asset holding Google Photorealistic 3D Tiles. */
export const ION_ASSET = 2275207;
```

- [ ] **Step 6: Use `REAL` in the city loader**

In `src/screens/CityScreen.tsx`, replace the two `import.meta.env.VITE_GOOGLE_MAPS_KEY` reads (lines 867 and 869) so the lazy import follows the same flag as the rest of the app:

```ts
  // the real-tiles code is only fetched when a Cesium ion token is configured; the stand-in city is always at hand
  const [makeCity, setMakeCity] = useState<(() => City) | null>(() => (REAL ? null : buildCity));
  useEffect(() => {
    if (REAL) import('../city/realCity').then((m) => setMakeCity(() => m.buildRealCity));
  }, []);
```

(`REAL` is already imported at `src/screens/CityScreen.tsx:8`.)

- [ ] **Step 7: Verify**

Run: `npm run typecheck`
Expected: no errors. There must be zero remaining references to `VITE_GOOGLE_MAPS_KEY` — search `src` for it and confirm it is gone.

Run: `npm run build`
Expected: build succeeds (stand-in path, no token set).

---

### Task 2: Real tiles through Cesium ion; drop the hand-rolled sky and lights

**Files:**
- Modify: `src/city/realCity.ts` (whole file)

**Interfaces:**
- Consumes: `ION_ASSET`, `ORIGIN` from `./geo`; the `City` interface from `./buildCity`.
- Produces: `buildRealCity(): City` unchanged signature.

- [ ] **Step 1: Rewrite `src/city/realCity.ts`**

Replace the entire file with:

```ts
// The real city: Google Photorealistic 3D Tiles, streamed with 3d-tiles-renderer and authenticated
// through Cesium ion. Used instead of buildCity() when VITE_CESIUM_ION_TOKEN is set (see .env.example
// and geo.ts). The sky and sun come from the AtmosphereSky component, not from here.
//
// STATUS: written against 3d-tiles-renderer 0.5 and type-checked, but never run against Cesium ion:
// the preview environment has no network and no token. Expect to tune it on first run.
// The attribution returned by `credits()` must stay on screen.
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { TilesRenderer } from '3d-tiles-renderer';
import { CesiumIonAuthPlugin, GLTFExtensionsPlugin, ReorientationPlugin, TileCompressionPlugin, TilesFadePlugin, UnloadTilesPlugin } from '3d-tiles-renderer/plugins';
import type { City } from './buildCity';
import { ION_ASSET, ORIGIN } from './geo';
import { ColliderIndex, SUN_DAY } from './layout';
import { SHARED, makeSkyMaterial } from './shaders';

/** Draco decoder for the tiles' meshes. Google hosts it; to self-host, copy three/examples/jsm/libs/draco/gltf into public/draco and point here. */
const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export function buildRealCity(): City {
  const group = new THREE.Group();

  // the same sky as the stand-in city is kept for the flyer's reflection bake only; the visible sky
  // is drawn by the AtmosphereSky component
  SHARED.uDay.value = 1;
  SHARED.uSun.value.set(...SUN_DAY);

  const tiles = new TilesRenderer();
  tiles.registerPlugin(new CesiumIonAuthPlugin({ apiToken: import.meta.env.VITE_CESIUM_ION_TOKEN ?? '', assetId: ION_ASSET, autoRefreshToken: true }));
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: new DRACOLoader().setDecoderPath(DRACO_PATH) }));
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new UnloadTilesPlugin());
  tiles.registerPlugin(new TilesFadePlugin());
  // puts the origin (lat/lon in radians) at 0,0,0 with +Y up, +Z north and +X west ...
  tiles.registerPlugin(new ReorientationPlugin({ lat: (ORIGIN.lat * Math.PI) / 180, lon: (ORIGIN.lon * Math.PI) / 180, height: 0 }));
  tiles.errorTarget = 12; // screen-space error in pixels: lower is sharper and heavier
  // ... and this turns it half a turn, to the app's frame: +X east, +Z south
  const frame = new THREE.Group();
  frame.rotation.y = Math.PI;
  frame.add(tiles.group);
  group.add(frame);

  // reflection bake for the flyer: a sky-only scene, lit by nothing but its own material
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), makeSkyMaterial()));
  // the atmosphere supplies the haze; keep a density-0 fog so the app's fog slot stays valid
  const fog = new THREE.FogExp2(new THREE.Color(0.5, 0.62, 0.8).getHex(), 0);

  const ray = new THREE.Raycaster();
  (ray as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true; // honoured by the tiles' own raycast
  const from = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  let attached: THREE.Camera | null = null;

  return {
    group,
    colliders: new ColliderIndex(), // empty: collisions come from surfaceBelow()
    envScene,
    fog,
    lightVersion: 0,
    lit: false,
    setDay() {},
    attach(camera, renderer) {
      if (attached) tiles.deleteCamera(attached);
      attached = camera;
      tiles.setCamera(camera);
      tiles.setResolutionFromRenderer(camera, renderer);
    },
    surfaceBelow(x, y, z) {
      ray.set(from.set(x, y + 400, z), down);
      ray.far = 3000;
      const hit = ray.intersectObject(tiles.group, true)[0];
      return hit ? hit.point.y : null;
    },
    credits() {
      return tiles
        .getAttributions()
        .filter((a) => a.type === 'string')
        .map((a) => String(a.value))
        .join(' ');
    },
    update(t, camera) {
      SHARED.uTime.value = t;
      if (attached) {
        attached.updateMatrixWorld();
        tiles.update();
      }
    },
    dispose() {
      tiles.dispose();
    },
  };
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: no errors (in particular, no unused-import errors — `FOG_DENSITY` and the removed light/sky locals must be gone).

Run: `npm run build`
Expected: build succeeds.

---

### Task 3: Atmosphere sky, sun and composer

**Files:**
- Create: `src/components/AtmosphereSky.tsx`
- Modify: `src/screens/CityScreen.tsx:764-775` (CityScene return)
- Modify: `src/screens/CityScreen.tsx:1152-1156` (Canvas `gl`)

**Interfaces:**
- Consumes: `ORIGIN` from `../city/geo`.
- Produces: `AtmosphereSky: React.FC` (no props). Renders the takram atmosphere and, in real mode, replaces `<Effects>`.

- [ ] **Step 1: Create `src/components/AtmosphereSky.tsx`**

```tsx
// Real-city sky and light: the takram physically-based atmosphere, aligned to the app's rebased local
// frame. Mounted by CityScene only when REAL, in place of the bloom <Effects>. It also owns the
// post-processing composer for the real path (aerial perspective, tone mapping, antialiasing).
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing';
import { AerialPerspective, Atmosphere, Sky, SkyLight, SunLight, type AtmosphereApi } from '@takram/three-atmosphere/r3f';
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial';
import { Dithering } from '@takram/three-geospatial-effects/r3f';
import { ToneMappingMode } from 'postprocessing';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { ORIGIN } from '../city/geo';

/** Matches the three-geospatial reference story: day 173 (22 June), 10:00 local at 103.8545 E. */
const YEAR = 2025;
const DAY_OF_YEAR = 173;
const TIME_OF_DAY = 10;
const EXPOSURE = 10;
const SUN_DATE = new Date(Date.UTC(YEAR, 0, 1) + (DAY_OF_YEAR * 24 + TIME_OF_DAY - ORIGIN.lon / 15) * 3600000);

const east = new THREE.Vector3();
const north = new THREE.Vector3();
const up = new THREE.Vector3();
const ecef = new THREE.Vector3();
const south = new THREE.Vector3();

export function AtmosphereSky() {
  const api = useRef<AtmosphereApi>(null);
  const gl = useThree((s) => s.gl);

  // Align the atmosphere's world frame with the app's rebased local frame: +X east, +Y up, +Z south.
  // (Ellipsoid.WGS84.getNorthUpEastFrame gives X north, Y up, Z east — not our frame.)
  useLayoutEffect(() => {
    const a = api.current;
    if (!a) return;
    new Geodetic(radians(ORIGIN.lon), radians(ORIGIN.lat), 0).toECEF(ecef);
    Ellipsoid.WGS84.getEastNorthUpVectors(ecef, east, north, up);
    south.copy(north).negate();
    a.worldToECEFMatrix.makeBasis(east, up, south).setPosition(ecef);
    a.updateByDate(SUN_DATE);
    gl.toneMappingExposure = EXPOSURE;
  }, [gl]);

  useFrame(() => {
    api.current?.updateByDate(SUN_DATE);
  });

  return (
    <Atmosphere ref={api} correctAltitude>
      <Sky />
      <SunLight />
      <SkyLight />
      <EffectComposer multisampling={0}>
        <AerialPerspective />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <SMAA />
        <Dithering />
      </EffectComposer>
    </Atmosphere>
  );
}
```

- [ ] **Step 2: Mount it in `CityScene` and branch the composer**

In `src/screens/CityScreen.tsx`, add the import beside `Effects` (line 15):

```ts
import { AtmosphereSky } from '../components/AtmosphereSky';
```

Replace the `CityScene` return block (lines 764-775) so exactly one composer is active:

```tsx
  return (
    <>
      {/* real mode: atmosphere sky + its own composer. stand-in: the bloom pass below. */}
      {REAL ? (
        <AtmosphereSky />
      ) : (
        /* dusk: facades and ground stay under 1; lit windows, lamps and the sun cross it and glow.
           By day only the sun and its glints on glass and water do. */
        <Effects threshold={day ? 1.6 : 1.15} strength={day ? 0.12 : 0.26} radius={0.45} />
      )}
      <primitive object={city.group} />
      <primitive object={rig.yaw} />
      {bikes && <primitive object={bikes.props} />}
      <primitive object={overlays.group} />
    </>
  );
```

- [ ] **Step 3: Turn the default depth buffer off in real mode**

In `src/screens/CityScreen.tsx`, the Canvas (lines 1152-1156) becomes:

```tsx
        <Canvas
          dpr={[1, 1.25]}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', depth: !REAL }}
          camera={{ fov: 58, near: 1, far: 42000, position: INTRO_CAM.toArray() }}
        >
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: no errors (watch for unused imports and the `AtmosphereApi` type import).

Run: `npm run build`
Expected: build succeeds. The bundle grows (postprocessing + atmosphere); the `chunkSizeWarningLimit` is 1600, so a warning is acceptable but not an error.

---

### Task 4: Documentation

**Files:**
- Modify: `README.md:63-79` (env section) and any `VITE_GOOGLE_MAPS_KEY` mention
- Modify: `docs/HANDOFF.md:145-158` (§8 Real city: first run)
- Modify: `tasks.md:17,30,31` (real-city entries)

**Interfaces:** none.

- [ ] **Step 1: README**

In the environment table and the notes under it, replace the `VITE_GOOGLE_MAPS_KEY` row and the Google-specific bullets with:

| Name | Required | Purpose |
| --- | --- | --- |
| `VITE_CESIUM_ION_TOKEN` | No | Cesium ion access token with the Google Photorealistic 3D Tiles asset (2275207). When set, the city is real 3D tiles lit by the atmosphere instead of the generated stand-in. |

Bullets: read at build time (redeploy after changing); any `VITE_` variable is public, so scope the token; tiles are billed through Cesium (set a budget alert); the real path has never been run against Cesium ion.

- [ ] **Step 2: HANDOFF §8**

Change "With `VITE_GOOGLE_MAPS_KEY` set" to "With `VITE_CESIUM_ION_TOKEN` set"; replace "Google" references with Cesium ion / Google Photorealistic 3D Tiles (via Cesium ion); keep the checklist (attribution visible, orientation, tune `GROUND_Y` and `ANCHORS`, markers shifted, Day/Dusk hidden, watch billing). Add: the sky and sun now come from the takram atmosphere at fixed midday; verify the sun sits over the bay and adjust the `worldToECEFMatrix` basis (or an `azimuth` on `ReorientationPlugin`) if it is rotated.

- [ ] **Step 3: tasks.md**

Update the real-city bullet (5f) and the two open items to name `VITE_CESIUM_ION_TOKEN`, Cesium ion asset 2275207, and the atmosphere. Keep the "not run against the provider's servers" caveat.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: clean.

Run a text search for `VITE_GOOGLE_MAPS_KEY` and `GoogleCloudAuthPlugin` across the repo (excluding `node_modules`) and confirm no source reference remains.

---

### Task 5: First-run verification with a token (manual, requires network)

**Files:** none (tuning only).

- [ ] **Step 1: Prepare the env**

Copy `.env.example` to `.env.local`, paste a Cesium ion token with access to asset 2275207, then run `npm run dev` and open the site → Singapore → flyer → city.

- [ ] **Step 2: Check the look and the frame**

- The sky is the atmosphere (not black, not the stand-in sky); the tiles stream in over Marina Bay.
- The sun sits where midday in Singapore should put it, roughly overhead/south. If the sky/sun is rotated relative to the city, add an `azimuth` to the `ReorientationPlugin` in `src/city/realCity.ts` (or correct the `worldToECEFMatrix` basis in `AtmosphereSky.tsx`) until it matches.
- The flyer is lit and readable at exposure 10; adjust `EXPOSURE` in `AtmosphereSky.tsx` if not.

- [ ] **Step 3: Check orientation and ground**

- Flying "east" on the compass heads toward Changi.
- In `src/city/geo.ts`, tune `GROUND_Y` until altitude 0 meets the water, and correct each `ANCHORS` latitude/longitude.

- [ ] **Step 4: Check the constraints**

- The attribution line at the bottom stays visible.
- Exactly one composer runs: no double-bright or double-dark frame; console camera stills (`3D twin`) still render.
- Walking/riding stay unavailable; the Day/Dusk switch stays hidden.

- [ ] **Step 5: Confirm offline is untouched**

Run: `npm run build` (no token) and `VITE_TEST=1 npm run build:artifact`, then check the stand-in city and `window.__test` still behave as before.

---

## Self-Review

**Spec coverage:**
- Dependencies → Task 1. Config `VITE_CESIUM_ION_TOKEN` / `ION_ASSET` → Task 1. Tiles auth swap + drop sky/lights + fog 0 → Task 2. `AtmosphereSky` + `worldToECEFMatrix` + fixed midday + `SunLight`/`SkyLight` → Task 3. Composer swap + `depth: !REAL` → Task 3. Docs → Task 4. Verification/risks → Task 5. Flight-only and untouched gen-city/artifact → constraints + Task 5.
- Risks 1–4 from the spec map to Task 5 steps 2–5.

**Placeholder scan:** no TBD/TODO; every code step contains the full code.

**Type consistency:** `REAL` (geo.ts) and `ION_ASSET` (geo.ts) are used in Tasks 1–3; `buildRealCity()` keeps its `City` return; `AtmosphereSky` takes no props and is mounted player-agnostically inside `CityScene`; `AtmosphereApi.worldToECEFMatrix` and `updateByDate` are the takram API used in both the reference and Task 3.
