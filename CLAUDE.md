# Vizzio 3D Portfolio — project rules

Concept build: an interactive 3D portfolio for vizzio.ai. Desktop, browser only. See tasks.md for scope and order.

## Stack
- Vite + React + TypeScript. 3D scenes: Three.js via React Three Fiber (from task 2 on). Globe: cobe 2.x.
- City data (production): Google Photorealistic 3D Tiles through `3d-tiles-renderer`.
- HUD is plain HTML/CSS over the canvas. Data lives in `src/data/*.ts`. No backend.

## Conventions
- Per-frame animation state lives in refs, never in React state.
- cobe re-parents its canvas: create the canvas imperatively inside a host div (see GlobeScreen).
- DOM tags follow WebGL markers through `src/globe/projection.ts` (mirrors cobe's math). Do not switch to CSS anchor positioning.
- `npm run build` is the production build (hashed files in `dist/`, deployed on Vercel). `npm run build:artifact` produces the single-file preview in `artifact/` (`--mode artifact` switches the single-file plugin on).
- 3D models: front faces +Z, up is +Y, fitted to a 2-unit box. Avatars load through `src/avatars/loadAvatar.ts` (GLB if `model` is set, built-in placeholder otherwise; a failed load falls back to the placeholder).
- Roster thumbnails are rendered from the models at runtime (`src/avatars/thumbnail.ts`). Do not add static thumbnail images.
- No network at runtime in the preview: no drei `Environment` presets, no remote HDRs or textures. Light scenes with `addLights()` and get reflections from `applyStudioEnvironment()` (generated in code).
- Placeholder flyers use the shared PBR materials in `src/avatars/builders.ts` (paint, dark, carbon, metal, suit, rubber, accent, glass). Smooth geometry, no flat shading. Surface textures and markings are drawn in code (canvas), never downloaded.
- The avatar preview renders through a bloom pass (`Effects` in AvatarScreen). Only `lamp*` materials are bright enough to glow; use `strip*` for larger light surfaces. Keep ground planes matte, a glossy one mirrors the studio as haze.
- App stages live in `src/App.tsx` (`globe` -> `avatar` -> `city`). The top bar and bottom strip come from `Shell`.
- City (`src/city`): metres, +X east, +Z south, north is -Z. `layout.ts` is the single source for the map: water, parks, the street warp, districts, buildings, trees. Its shapes are used in JS (placement, collisions, minimap) and emitted as GLSL (ground shader). Change the map there, never in a shader.
- Every city material reads the shared uniforms in `shaders.ts` (`SHARED`: sun, day/dusk blend, time, baked height, shadow and ground maps), so the whole city changes light together. New city materials must use them too; `city.setDay()` is the only way to change the light.
- Shorelines: the water shapes in `layout.ts` are bent by `coast()` (a few sine waves, identical in JS and GLSL) except near the `FIRM` areas where landmarks stand on the waterfront. After changing a shape or a wave, check that landmarks, map places and console zones are still on land.
- Reflections (water, glass) and contact shade read the baked height map (`heightAt`, and the max-pooled `heightFar` for long rays). They are estimates from heights, not a second render of the scene.
- Street life exists only around the camera and nothing about it is stored: where every vehicle, walker and cyclist is follows from the clock (`traffic.ts`). The whole city keeps one 30-second signal cycle: north-south streets get green and every car on them moves up exactly one block, then the east-west streets; while a street's cars stand, people cross it. A block is four car slots, three of which queue behind the stop line. Keep that invariant and nothing can overlap; `trafficRules.ts` holds the numbers, and the ground shader paints the far-away traffic from the same ones, so change traffic in both places or in neither. Traffic keeps left. Streets run along half steps of the grid (blocks are centred on whole steps).
- `street.ts` turns those positions into instances every frame (one full and one coarse pool per model, shade and headlight pools) and hands `ground.ts` the vehicles near the pilot as obstacles. Models are built in code with `meshkit.ts`: vehicles in `vehicles.ts`, people and cyclists in `people.ts` (the walk cycle runs in the vertex shader from a stride phase), signal poles, shelters, benches, bins and signs in `props.ts`. Each face carries a part number that the shader turns into paint, glass, a lamp and so on. Model front is +Z, left is +X.
- Vehicles and people are original and generic: no make, badge, operator livery or lettering. Plates are blank, shelter panels are blocks of colour. Keep it that way.
- Lamp posts are older: each instance still works out its own place in its vertex shader (`lampMaterial`).
- Ships are generated in `layout.ts` (`getShips`); their deck cargo is ordinary container boxes, their hulls are instanced in `buildCity.ts`. They collide but are left out of the shadow bake.
- Shadows are baked once from a height field (`bakeHeights`, `bakeShadow` in `layout.ts`), one map for day and one for dusk. There are no shadow maps or lights on the generated city.
- Real city: when `VITE_GOOGLE_MAPS_KEY` is set, `realCity.ts` replaces `buildCity()` behind the same `City` interface. App code stays in stand-in coordinates; wrap any position handed to the scene in `place()` from `geo.ts`. The tiles code must stay behind the env check so the preview build leaves it out.
- City shaders output linear HDR and are tone-mapped by `<Effects>`. Guard every `exp()`/`pow()` against overflow: one NaN pixel turns the whole frame black after bloom.
- Flight (`src/city/flight.ts`): the mouse sets the aim, the body turns toward it at the avatar's turn rate. Descend is C, never Ctrl (Ctrl+W closes the tab). HUD numbers are written straight to the DOM from the frame loop.
- On the ground (`src/city/ground.ts`, `src/city/bike.ts`): only an avatar with `ground: true` (the pilot) can land, and only in the generated city. `Ground` shares the flight keys and colliders: a box below the feet is a floor, a box beside the body is a wall, `landSdf` is the shore. `CityScreen` holds the mode (`fly`, `walk`, `ride`) in a ref and reads position, aim and speed from whichever of `flight` and `ground` is active (`who`). Keys: G land / take off, F on / off a bike, H horn, Space jump.
- Parked motorbikes are not stored anywhere: `spotsNear()` derives them from the block grid around a point, so they are the same every visit. The ridden bike is one separate model (`buildBike`) attached to the rig; the parked ones are instanced. The bike is an original design with no brand; do not model a real one.
- Limb poses come from `applyStance` in `avatars/builders.ts` (`fly`, `walk`, `air`, `ride`); a model without `userData.joints` simply has no `setStance`.
- The ground is a 200 x 200 grid, not one quad: huge triangles lose depth precision at street level and cover what stands on them.
- Test builds: `VITE_TEST=1` exposes `window.__test` (flight, ground, `sim(seconds)`) for `scripts/shot-ground.mjs`. Always rebuild without it before publishing or packaging.
- Landmarks (`src/data/landmarks.ts`): position, open range and orbit camera per landmark. Markers are DOM buttons moved by the frame loop; off-screen ones queue in the middle column. Opening one frees the cursor, stops flight input and opens the landmark console.
- Landmark console (`src/console`, data in `src/data/ops.ts`): `Console.tsx` owns the state (mode, drill-down, sheets) and lays out left column, tabs, centre, bottom bar, right column. Panels live in `modesBase.tsx` (every landmark), `modesStadium.tsx`, `modesAlerts.tsx`; shared pieces in `widgets.tsx`. To give a landmark a mode, add it to `modes` in its `ops.ts` entry and supply the data.
- Console and scene talk through refs only (`src/console/engine.ts`): the console writes the wanted camera (`InspectCam`), scene drawings (`SceneOverlay`), tag anchors and still requests (`SnapJob`); the frame loop in `CityScreen` reads them. No React state per frame, no scene objects in the console.
- Console tags are DOM elements pinned to city coordinates by the frame loop. It hides a tag that would sit under a column and raises overlapping ones on a longer leader line; do not position tags in CSS.
- Camera tiles are stills of the 3D scene, rendered one per frame into a small target and kept per landmark. They are labelled "3D twin", never "Live": there is no video in this build.
- CCTV viewer (`CctvViewer` in `modesBase.tsx`): a frame over the live 3D view while the scene camera stands at the feed's position and turns on the spot (`lookFrom` in `engine.ts`: `eye`, `yaw`, `pitch`, `fov`). The viewer owns pan, tilt and zoom in a ref and writes the pose every frame; `Console` leaves the camera ref alone while a feed is open. Label it "Live 3D"; it is the twin, not video.
- `.console-center` and `.map-center` let clicks through to the city (`pointer-events: none` from `.console`). Anything interactive placed in them must set `pointer-events: auto` itself, and must be tested with a real mouse click (`real:` steps in `scripts/shot-console.mjs`), not `element.click()`.
- City tour (`src/screens/CityTour.tsx`, data in `src/data/tour.ts`): plays after loading, before the flyer appears. It writes its shot into the tour camera ref with a `cut` number, so the scene jumps between places instead of gliding; the flyer stays hidden and the arrival move waits until it ends. Add a chapter by adding an entry to `TOUR`.
- Statistics band (`.tour-band`): one panel, one equal column per block of the chapter, hairlines between, the same padding in every cell, label on top so the columns line up. A `stats` block with one figure is a headline; with two they share the column. Keep a chapter to three to five blocks.
- City toolbar (`src/screens/CityToolbar.tsx`): the only place for city-wide actions. The four map menus first, then the map's own tools while it is open, or the ways out of the flight while it is not. Do not add floating panels for single links.
- City map (`src/screens/CityMap.tsx`, data in `src/data/citymap.ts`): a menu has layers of places, panel blocks, and optionally routes (lines) and sites (volumes) drawn by `overlays.ts`. `CityScreen` owns the map camera (`mapView`, north up) and writes it to the same inspect-camera ref the console uses; markers are DOM elements registered in the same `anchors` map as console tags. Add a menu by adding an entry to `MAP_MENUS`; it gets its toolbar button and number key from its place in the list.
- Lines over the city use `Line2` (constant width on screen, drawn over the buildings). Status colours on them need the same words in the panel.
- Icons come from `src/components/icons.tsx` (one grid, one stroke weight). Add a path there; do not import an icon library.
- Esc always steps back one level (CCTV viewer, sheet, room, patrol, then the console; in the map, the open card, then the map); E closes the console; M opens and closes the map.
- Charts follow one rule set: one series = one hue (`--signal-soft`), the active column at full strength, every value reachable by hover, focus and a screen-reader table. Two or more series use `--cat-1..4` in that order, with a legend. `--live`, `--warn` and `--crit` are status colours only and always come with a text label.
- The city screen is full-bleed: `.city-view` is fixed behind everything, HUD panels float in `.hud`. The loading screen is a fixed overlay and must stay up until the city has rendered.

## Design system (source of truth: src/styles/tokens.css)
- One dark look. Ground is blue-black `--space`, never pure black. Text uses `--ink`, `--ink-2`, `--ink-3` only.
- `--signal` (electric blue) marks the one live path: the live tag and the primary button. Nothing else.
- `--live` (mint) is semantic status only.
- Type: Sora (display 200, body 300, emphasis 400). Martian Mono for labels, coordinates, tags: uppercase, letter-spaced.
- Big light numerals with a small unit beside them and a plain label below (the Vizzio dashboard pattern). In dense grids (console tiles, the statistics band) the label goes above instead, so neighbouring cells start on the same line.
- Square corners. Hairline borders (`--line`). Glass panels (`--glass` + blur) only for HUD over the map.
- Spacing in steps of 4 from the `--s-*` tokens. Layout with flex/grid + gap, not margins.

## Do not
- No gradients on text or buttons, no rounded cards, no drop shadows, no emoji as icons.
- No hardcoded colors or font sizes outside tokens.css. WebGL scenes take colors from `src/styles/palette.ts`, which mirrors the tokens. Exception: scenery colours of the stand-in city (sky, water, facades) live in `src/city/shaders.ts`.
- No Vizzio or partner logos; the wordmark is plain text. Keep the bottom-strip line ("Concept exploration. Not an official Vizzio site. Demo data.") and the "Demo data" labels on panels. The "Concept build" chip in the top bar was removed at the owner's request.
