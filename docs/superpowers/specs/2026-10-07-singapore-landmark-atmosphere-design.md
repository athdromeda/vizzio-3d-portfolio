# Design — Photorealistic Singapore landmark: Cesium ion tiles + takram atmosphere

Date: 2026-10-07
Status: approved, ready to plan

## Goal

When a Cesium ion token is configured, the city screen's **real path**
(`src/city/realCity.ts`, gated by `geo.ts`) renders the Singapore Marina Bay landmark
as Google Photorealistic 3D Tiles lit by the physically-based takram atmosphere — the
look of the `three-geospatial` Storybook story
(`storybook/src/atmosphere/3DTilesRenderer-Story.tsx`, the `Singapore` story).

The existing flight, HUD, landmark markers, landmark console and city map keep working
unchanged. Walking and riding stay a generated-city feature and remain off in real mode.
The generated stand-in city, the single-file artifact preview and every offline path are
untouched.

## Reference: how the `three-geospatial` story integrates the landmark

`3DTilesRenderer-Story.tsx`:

- **Tiles** — `3d-tiles-renderer/r3f` `<TilesRenderer>` with `GoogleCloudAuthPlugin`,
  Draco, TileCompression, TilesFade, UpdateOnChange and TileCreasedNormals plugins, plus
  `<TilesAttributionOverlay>` for the required credits.
- **Camera** — ECEF math: `new PointOfView(distance, heading, pitch).decompose(
  new Geodetic(radians(lon), radians(lat)).toECEF(), camera.position, camera.quaternion,
  camera.up)`, then `GlobeControls`.
- **Sky / light** — `@takram/three-atmosphere` `<Atmosphere>` context with `<Sky>` and
  `<Stars>`; each frame `atmosphere.updateByDate(new Date(...))` drives the sun. The tiles
  are unlit; the atmosphere provides their light.
- **Post** — a `postprocessing` `EffectComposer` with `AerialPerspective`, `ToneMapping`,
  `SMAA`, `Dithering`; canvas `gl={{ depth: false }}`, `frameloop='demand'`.
- The `Singapore` story is just the `Story` component at `longitude 103.8545`,
  `latitude 1.2868`, `heading -160`, `pitch -22`, `distance 600` (Marina Bay) — the same
  area as this repo's `ORIGIN` (`geo.ts`).

The `Atmosphere-WorldOriginRebasing` story shows the atmosphere also works in a rebased
local frame: after setting `atmosphere.worldToECEFMatrix` from
`Ellipsoid.WGS84.getNorthUpEastFrame(...)`, all content lives in local coordinates. This
repo is a rebased local scene, so that is the pattern to follow.

## Decisions (confirmed)

1. **Scope** — upgrade the existing real-city path (option B). Keep `CityScreen`, flight,
   HUD, console and map. Add the atmosphere to the real path only.
2. **Auth** — Cesium ion token instead of a Google Maps key.
   `CesiumIonAuthPlugin` with asset id `2275207` (Google Photorealistic 3D Tiles).
3. **Sun / time** — fixed midday, matching the story: `dayOfYear 173`, `timeOfDay 10:00`,
   exposure 10. No controls.
4. **Post** — in real mode, replace the existing `<Effects>` bloom with the atmosphere
   composer (`AerialPerspective → ToneMapping → SMAA → Dithering`). Keep bloom in
   non-real mode.
5. **Ground** — keep `canGround = avatar.ground === true && !REAL`. Real mode is flight
   only.

## Architecture

### Dependencies to add

`@takram/three-geospatial`, `@takram/three-atmosphere`, `@takram/three-geospatial-effects`,
`postprocessing`, `@react-three/postprocessing`, `@react-three/drei`.

All are peer-compatible with the current `three@0.186.1`, `@react-three/fiber@9.8.1` and
`3d-tiles-renderer@0.5.3`. `@takram/three-atmosphere` generates its scattering LUTs in
code (no download). `<Stars>` is omitted in daylight, so no `stars.bin` asset is needed.

### Config

- New env var `VITE_CESIUM_ION_TOKEN`; `REAL` in `src/city/geo.ts` keys off it. Add
  `ION_ASSET = 2275207`.
- `.env.example`, `README.md` (env table and billing note) and `docs/HANDOFF.md` §8 change
  from a Google key to a Cesium ion token; Google-billed language becomes Cesium ion.

### Tiles — `src/city/realCity.ts`

- Swap `GoogleCloudAuthPlugin` for `CesiumIonAuthPlugin({
  apiToken: import.meta.env.VITE_CESIUM_ION_TOKEN, assetId: ION_ASSET,
  autoRefreshToken: true })` (import from `3d-tiles-renderer/plugins`).
- Keep `ReorientationPlugin` and `frame.rotation.y = Math.PI` (local +X east, +Z south,
  +Y up) and the whole `City` interface (`group`, `colliders`, `envScene`, `fog`,
  `attach`, `surfaceBelow`, `credits`, `update`, `dispose`).
- Remove the hand-rolled sky sphere and the directional/hemisphere lights; the atmosphere
  provides sky and light.
- Keep the DRACO decoder. Flag that `https://www.gstatic.com/draco/...` may need
  self-hosting under `public/draco` for a fully first-party load.

### Atmosphere — `src/components/AtmosphereSky.tsx` (new)

Rendered inside `CityScene` only when `REAL`:

- `<Atmosphere ref={...} correctAltitude date={FIXED_DATE}>` with `<Sky groundAlbedo>`,
  `<SunLight>` and `<SkyLight>` (so the flyer is lit by the real sun).
- One-time setup of `atmosphere.worldToECEFMatrix`. This repo's frame is `(east, up,
  south)`; the matrix is built from `Ellipsoid.WGS84.getEastNorthUpVectors(originECEF)`
  as `makeBasis(east, up, north.negate()).setPosition(originECEF)`. This is the single
  most important thing to verify visually (sun over the bay).
- `useFrame` → `atmosphere.updateByDate(FIXED_DATE)`.

### Post-processing and loop — `src/screens/CityScreen.tsx`

- `REAL`: render an `@react-three/postprocessing` `EffectComposer` (multisampling 0) with
  `AerialPerspective`, `ToneMapping` (exposure 10), `SMAA`, `Dithering`, in the story's
  order. Do **not** also render the existing `<Effects>` bloom.
- Non-real: the current `<Effects>` bloom, unchanged.
- Canvas `gl` branches `depth: !REAL`. `frameloop` stays continuous (the story uses
  `demand`; flight animates every frame).
- Exactly one composer must be active at a time.

## Files touched

- `package.json` — new dependencies.
- `src/city/geo.ts` — `VITE_CESIUM_ION_TOKEN`, `ION_ASSET`.
- `src/city/realCity.ts` — Cesium ion auth; drop sky/lights.
- `src/components/AtmosphereSky.tsx` — new.
- `src/screens/CityScreen.tsx` — branch composer, gl, atmosphere.
- `.env.example`, `README.md`, `docs/HANDOFF.md`, `tasks.md` — docs/config.

## Out of scope

- Walking / riding in real mode (`canGround` stays `... && !REAL`).
- Fitting console tags, patrol routes, the airport fence and map markers to the real
  buildings (they stay shifted by nearest landmark, as today).
- `GlobeControls` — the app owns the chase camera.
- A time-of-day control; the sun is fixed at midday.
- Any change to the generated stand-in city or the artifact preview.

## Risks

1. **Sun alignment.** The `worldToECEFMatrix` basis is the main unknown. Verify the sun
   sits where expected; fallback is an `azimuth` correction on `ReorientationPlugin`.
2. **Aerial-perspective cost/quality** at the app's near/far (1 / 42000) with a 20 km sky.
   May need `correctGeometricError` tuning or a smaller far plane.
3. **Composer swap.** `depth: !REAL` with the app's offscreen snapshot render targets and
   `city.attach`'s `setResolutionFromRenderer` — verify camera tiles/stills still render
   and there is no double render.
4. **No offline test.** Like today's real path, this only runs with network + a token; the
   stand-in city and the artifact preview are the offline guarantee.

## Verification (with a token)

- Sun/sky orientation is correct over Marina Bay; flying east heads to Changi.
- In `geo.ts`, tune `GROUND_Y` until altitude 0 meets the water and check each `ANCHORS`
  latitude/longitude.
- The attribution line stays visible.
- `npm run typecheck` and `npm run build` are clean; the stand-in path still runs; a
  `VITE_TEST=1` build still exposes `window.__test`.
- Frame rate measured on real hardware.
