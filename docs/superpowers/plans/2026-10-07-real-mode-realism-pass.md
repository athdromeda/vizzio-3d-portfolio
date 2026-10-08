# Real-mode realism pass 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Improve the Cesium-ion real path: creased normals on tiles, a sky-derived environment map for the flyer, and a lens flare.

**Architecture:** Three additions scoped to `REAL` mode. Creased normals are a ported `3d-tiles-renderer` plugin under `src/city/tiles/` (web worker). The environment map and lens flare live in `AtmosphereSky.tsx`; `CityScreen` stops baking the stand-in `envScene` when `REAL`.

**Tech Stack:** three 0.186, @react-three/fiber 9, 3d-tiles-renderer 0.5, @react-three/drei, @takram/three-atmosphere, @takram/three-geospatial-effects.

## Global Constraints
- Scoped to `REAL`; offline stand-in and the single-file artifact keep working.
- No test framework: verify with `npm run typecheck`, `npm run build`, `npm run build:artifact`. **Do not commit.**
- Use `three/examples/jsm/...` paths (no `three/addons` alias here).
- Plugin hooks: `init(tiles)` on register; `processTileModel(scene, tile)` is awaited per tile (`TilesRenderer.js:808`).

---

### Task 1: Creased normals (web worker)
Create `src/city/tiles/{creaseNormals.ts,creaseNormals.worker.ts,creasedNormalsPool.ts,TileCreasedNormalsPlugin.ts}`; register in `src/city/realCity.ts` with `creaseAngle: Math.PI / 6`. (Full code in the design message.)

### Task 2: Atmosphere environment map
`AtmosphereSky.tsx`: `RenderCubeTexture` (drei, `resolution 64`, `frames Infinity`) wrapping a second `<Sky sunAngularRadius={0.1}/>`, group positioned at the camera each frame, `scene.environment = fbo.texture`. `CityScreen.tsx`: guard the `envScene` PMREM bake with `if (!REAL)`.

### Task 3: Lens flare
`AtmosphereSky.tsx`: add `<LensFlare />` (from `@takram/three-geospatial-effects/r3f`) between `AerialPerspective` and `ToneMapping`.

### Task 4: Docs
`docs/HANDOFF.md` §8 and `tasks.md` (new `5p` entry).

## Verification
- `npm run typecheck`, `npm run build`, `npm run build:artifact` all clean.
- Visual (owner, token run): tiles' edges shaded, flyer reflects the real sky, sun flare present.

## Risks
1. Worker + single-file artifact — falls back to a lazy `import()` if singlefile complains.
2. `scene.environment` fight — prevented by the `!REAL` gate.
3. Env-map per-frame cost — lower `frames` if needed.
