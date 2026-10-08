# Real-city ground mode: land from the photorealistic tiles into the simplified city

## Problem

Flying over the real city (Google Photorealistic 3D Tiles via Cesium ion) is the app's headline
view. The pilot avatar can already land, walk and ride a motorbike — but only in the generated
stand-in city. Landing was deliberately deferred for the real tiles (`canGround = avatar.ground
&& !REAL` in `src/screens/CityScreen.tsx`; notes in `tasks.md`, `docs/HANDOFF.md`), because the
tiles are a visual surface with no walkable colliders, no traffic, and no street props.

We want to bring the ability back: when the pilot lands over the real tiles, swap the world to the
generated stand-in city so the visitor can walk it, and warn them first that the ground view is a
simplified 3D model, not the photorealistic tiles they were just flying over.

## Goals

- Pressing **G** over the real tiles offers a **blocking confirm** explaining the simplification.
- On confirm, the world swaps to the generated city, the pilot lands at the matching spot, and
  walking/riding works exactly as it does in the non-real build.
- Taking off restores the real tiles at the same spot, without re-streaming them.
- The rest of the app (sky, bloom, minimap, stats, credits, landmark markers, console, map) follows
  the active world.

## Non-goals

- No change to the already-shipped `!REAL` ground experience.
- No attempt to align the two maps precisely — the landmark anchors in `geo.ts` are approximate.
- No collidable real tiles for walking; we swap worlds instead.
- No persistent warning banner; the warning lives in the confirm only.
- No deep unload/reload of tiles beyond hiding them while on the ground.

## Key decision

When the pilot lands over the real tiles, the app **switches the active world to the generated
stand-in city** (not: walking on the tiles, not: a coarse tile LOD). The confirm exists because
the 3D the visitor sees on the ground is a simplified, code-generated city.

## Design

### 1. The active world (frame switch)

Introduce a runtime **active world** (`'real' | 'simple'`) that replaces the compile-time `REAL`
for everything frame- and presentation-related. `REAL` stays only as the capability flag ("a Cesium
token is configured").

**`src/city/geo.ts`**

- Keep `REAL`, `place()`, `GROUND_Y`, `ORIGIN`, and the anchor table.
- Add `export type World = 'real' | 'simple'` and a module-level active world with
  `getWorld()` / `setWorld(w)`. Initialize to `REAL ? 'real' : 'simple'`.
- `place(p)` returns `p` unchanged when the active world is `'simple'` (or `!REAL`); otherwise it
  shifts as it does today. Every existing `place()` call site — per-frame camera, stills, anchor
  tags, `overlays.ts` — keeps working with no signature change.
- Add `unplace(p: V3): V3`, the inverse of `place()`: pick the anchor whose **real** position
  (`fromLatLon`) is nearest `p`, subtract that anchor's shift and `GROUND_Y`. Used once per
  real→simple transition.

`place()` reading a module-level active world is acceptable here because the app has exactly one
active world at a time, and `place()` is already the single global-ish helper for the mapping.
`CityScreen` calls `setWorld()` before the state update that re-renders, so memos that depend on
`world` recompute against the new value.

### 2. City ownership

The real tiles must not be re-streamed on every takeoff, and the generated city is expensive to
build. So both cities are built once and kept alive.

**`src/screens/CityScreen.tsx` (outer component)**

- Build the real city once, as today (dynamic import of `realCity.ts` when `REAL`).
- Build the generated city once, **lazily on the first landing request**. Cache it.
- Dispose both only on unmount. Disposal moves out of `CityScene` up to here so switching never
  disposes the other city.
- Hold `world` state; on swap call `setWorld('simple' | 'real')` and `setWorldState(...)` together.
- Pass `realCity`, `simpleCity`, and `world` down to `CityScene`.

### 3. Scene

**`src/screens/CityScene`**

- New props `realCity`, `simpleCity`, `world`.
  `const city = world === 'simple' ? simpleCity : realCity`.
- `Flight` / `Ground` are created once per avatar and are **not rebuilt** on a world change, so
  physics state and the camera carry over. They gain a frame setter:
  - `Flight.setFrame(colliders, terrain, centre, radius)`
  - `Ground.setFrame(colliders, obstacles, centre, radius)`
- Transition:
  - real→simple: `ground.arrive(unplace(flight.pos), flight.aimYaw)`, mode `walk`.
  - simple→real: `flight.pos.copy(place(ground.pos)); flight.pos.y += HIP`, reset `vel`/`yaw`/
    `pitch` as the existing `toggleGround()` takeoff does, mode `fly`.
- Per frame: `city.update(...)` on the active city only; `scene.fog` from the active city;
  `realCity.attach(camera, gl)` and `realCity.update()` only while real (so hidden tiles stop
  streaming against a stand-in camera).
- `world`-derived values:
  - `LM_POS` becomes a `useMemo(..., [world])` (real: `place(l.pos)`; simple: raw).
  - camera `lift` (`GROUND_Y` when real, else 0).
  - minimap: 3D tile render when real, drawn base chart when simple.
  - `main--real` class.
  - sky pass: `AtmosphereSky` when real, `Effects` bloom when simple.
- Overlays (`buildOverlays`) rebuild on `world` change so map/console drawing lands in the right
  frame.

### 4. UX — confirm before landing

- While flying over the real tiles with ground available, **G** opens a small centered panel
  instead of landing. Styling follows the design system: square corners, hairline `--line`, glass
  (`--glass` + blur), primary button in `--signal`.
- Content: an eyebrow ("Landing"), the warning copy, and two actions — **Land here** (confirm,
  primary) and **Keep flying** (cancel).
- Warning copy (draft): *"On the ground the city reloads as a simplified 3D model — buildings,
  streets and traffic generated in code, not Google's photorealistic tiles. Taking off again brings
  the real tiles back."*
- While the panel is up: flight keys cleared, pointer freed. **Esc/G** cancels, **Enter/G**
  confirms. Cancel changes nothing.
- In the `!REAL` build the panel never appears (world is always `simple`).

### 5. UX — first-swap loading and on-the-ground HUD

- Building the generated city is heavy (height, shadow and shore bakes plus street life). On the
  **first** confirm, show a fixed loading overlay ("Loading simplified city…"), yield one frame so
  it paints, then build and swap. Later swaps are instant (cached).
- While on the ground (world simple):
  - Stats panel switches from "3D Tiles · Photorealistic, by Google" to the generated
    "Buildings generated" count.
  - The Google credits line hides.
  - The minimap switches from the tile render to the drawn base chart.
  - The day/dusk light tool becomes available (`App` shows it when the active world is simple).
  - Controls list and prompts follow the ground mode as they already do; takeoff is immediate.

## Edge cases

- `!REAL`: world is always `simple`; no confirm, no swap, behavior unchanged.
- Real surface not loaded yet (`surfaceBelow` null) → `canLand` false → G does nothing (already
  the case).
- Landing over water / off the generated map: after `unplace`, if the mapped point is water
  (`landSdf` high) or outside the map radius, drop the pilot at the generated `START`.
- Approximate anchors mean the landing spot is only roughly the real one; accepted.
- Avatar without `ground: true`: G never offers landing; unchanged.
- Console/map open while on foot: overlays and landmark positions use the simple frame.
- Day/dusk set on the ground then takeoff: the real tiles ignore `day` (AtmosphereSky is fixed
  midday); no special handling.
- Tour, stills (`SnapJob`), CCTV `lookFrom`: all call `place()`, so they follow the active frame.

## Testing

- Type-check and `npm run build`.
- `unplace(place(p)) ≈ p` round-trip check within each anchor region.
- The generated-city ground path is unchanged, so the existing `VITE_TEST` / `scripts/shot-*`
  coverage still applies; expose the swap through `window.__test` for a land→walk→takeoff step.
- Full real-tiles e2e can't run in the preview (no network); the swap logic is verified by hand
  with a token.
