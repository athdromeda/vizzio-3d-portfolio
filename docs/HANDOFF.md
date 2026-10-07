# Handoff notes

For the developer taking this from concept to a deployed site. The README covers running and deploying;
this file covers what you are inheriting.

## 1. What the visitor does

1. **Globe** (`GlobeScreen`): countries as tags on a cobe globe. Singapore is live; the others say "coming soon".
2. **Flyer** (`AvatarScreen`): pick one of three flyers, shown as a live 3D model.
3. **Loading** (`LoadingScreen`): a terminal-style loader while the city builds.
4. **City statistics** (`CityTour`): eight chapters of figures over views of the city. Plays by itself; skippable.
5. **Flight** (`CityScreen`): free flight with a chase camera, compass, minimap and landmark markers.
   One of the three flyers, the pilot "Kite", can also leave the air: `G` lands him on the street, he walks
   and jumps, and sport motorbikes parked along the pavements can be ridden (`F`), with a horn (`H`).
   The streets are busy: cars, taxis, buses, lorries and motorbikes queue at working signals, people walk
   the pavements and cross on the zebra, cyclists ride the kerb. For the pilot the vehicles are solid and
   the people step aside.
6. **Landmark console** (`console/`): opens at Marina Bay Sands, the National Stadium and Changi Airport.
   Tabs for environment, security and facilities everywhere; match day, patrol and event archive at the
   stadium; alerts at the airport. Camera tiles open a 360° CCTV viewer.
7. **City map** (`CityMap`, `CityToolbar`): transport, traffic, development and environment layers with
   clickable markers.

## 2. There is no backend

Everything is bundled at build time. Content lives in TypeScript files under `src/data/`:

| File | Holds |
| --- | --- |
| `countries.ts` | Globe tags and the Singapore panel |
| `avatars.ts` | Flyers, their flight characteristics, the optional `.glb` path |
| `landmarks.ts` | Landmark positions and camera orbits |
| `ops.ts` | Everything the landmark consoles show |
| `tour.ts` | The statistics tour: chapters, figures, camera shots |
| `citymap.ts` | City map menus, layers, markers, panel figures, routes |

You need a backend only when one of these becomes true:

- **The figures must be live or editable without a redeploy.** Add Vercel Functions under `/api`, return
  the same shapes these files export (the TypeScript interfaces are the contract), and load them once at
  start-up before the city screen mounts. The components read plain objects, so nothing else changes.
- **Real camera video.** The CCTV viewer currently shows the 3D scene from a camera position. Real feeds
  need a streaming service and signed URLs, which must be issued server-side.
- **Access control or analytics.** Use Vercel's password protection or middleware, or your own auth.

A proxy for the Cesium ion token is not worth building: tiles are fetched directly by the browser, and
the token is scoped on Cesium's side.

## 3. Placeholder inventory: replace before any public use

| What | Where | State |
| --- | --- | --- |
| Country list | `data/countries.ts` | Singapore, Indonesia and Saudi Arabia were named by the owner. UAE, Japan, United Kingdom and Germany are invented placeholders |
| Flyers | `avatars/builders.ts` | Three original placeholder models built in code (Kite, Scout, Delta). Swap for licensed `.glb` models via `public/avatars/` |
| The city | `city/` | Generated in code. It is laid out like Marina Bay but is not a survey: streets, buildings, coastline and distances are invented |
| Landmark console data | `data/ops.ts` | All invented: readings, alarms, work orders, teams ("Marina FC", "Kallang United"), people, match statistics |
| Statistics tour | `data/tour.ts` | Most figures were read off Vizzio's Singapore showcase video with obviously wrong units corrected; several series were filled in by hand. None were checked against official sources |
| City map | `data/citymap.ts` | Station and expressway names are real. Arrival times, speeds, alerts, projects and sensor readings are invented, and markers sit where they fit the generated city, not at true coordinates |
| CCTV | `console/modesBase.tsx` | Not video. It is the 3D scene from a camera position, and is labelled "Live 3D" / "3D twin" |
| Camera tiles, replay, playback | `screens/CityScreen.tsx` | Stills rendered from the 3D scene |

The bottom strip reads "Concept exploration. Not an official Vizzio site. Demo data." and panels carry a
"Demo data" label. Keep both until the content above is real and Vizzio has approved the site.

## 4. Brand and rights

- There are no Vizzio or partner logos anywhere; the wordmark is plain text. Add real brand assets only
  with Vizzio's approval.
- The owner originally wanted film-character flyers. None were made: the placeholders are original, and
  any model you add must be one you have the right to publish.
- The owner asked for "CBR-style" motorbikes. The model in `city/bike.ts` is an original generic sport
  bike with no badge or livery. Keep it that way, or use a licensed model.
- Every vehicle, person and piece of street furniture is an original generic model built in code
  (`city/vehicles.ts`, `people.ts`, `props.ts`): no make, badge, operator colours or lettering; number
  plates and advert panels are blank. Bus and taxi colours are plain colours, not a real operator's.
- Fonts (Sora, Martian Mono) load from Google Fonts, which means a request to Google on every visit. If
  the privacy policy rules that out, self-host them and change the `<link>` in `index.html`.

## 5. What was tested, and what was not

**Tested** (automated Chromium, software rendering, 1280×720, some screens also at 1612×900 and 400×800):

- the whole flow from globe to flight, without console errors
- every console tab and drill-down, the CCTV viewer's controls with real mouse clicks
- all eight tour chapters, all four map menus (markers, layers, 2D/3D, pan, zoom, Esc)
- the traffic model, numerically: no two vehicles closer than 2 m over a whole signal cycle, no walker or
  cyclist within 0.25 m of a vehicle over two minutes; and walking into, being pushed by and riding into
  a vehicle
- landing, walking, jumping, mounting, riding, leaning, the horn, dismounting and taking off, by stepping
  the simulation from the test script (`scripts/shot-ground.mjs`, needs a `VITE_TEST=1` build)
- `npm ci && npm run build` from a clean copy, and the built site served locally

**Not tested:**

- **Frame rate.** The owner saw 60 fps on his machine *before* the last realism pass. That pass made the
  city noticeably heavier and has not been measured on real hardware. The test browser runs at under 1 fps
  (no GPU), so it says nothing about speed. Measure on a typical laptop before launch.
- **Feel of the controls**: mouse steering and pointer lock in flight, map pan and zoom, CCTV drag. They
  work; whether they feel right at full frame rate is unjudged. The same goes for walking and riding:
  speeds, steering and the camera were set by reasoning and screenshots, not by playing.
- **Browsers other than Chromium.** Firefox and Safari have never run it.
- **A Vercel deployment.**
- **The real-city path** (below).

## 6. Known gaps

- No message when WebGL 2 is unavailable or the GPU context is lost: the visitor gets a blank view.
- No error boundary around the 3D canvases.
- On the ground, buildings, ships, the shoreline and vehicles stop the pilot (a moving vehicle shoves him
  along; a roof can be stood on). Trees, lamp posts and street furniture do not. Colliders of rotated
  buildings are approximate.
- Traffic is a timetable, not a simulation (`city/traffic.ts` explains it): vehicles never turn, change
  lane, or react to the pilot, and every junction in the city changes at the same moment. Nobody sits on
  the benches. Parks, the waterfront and the airport have no people.
- Walking and riding are switched off when the real Google tiles are used (`canGround` in
  `CityScreen.tsx`): there is no street surface to stand on there yet.
- The horn is two notes from the Web Audio API. Browsers that block audio stay silent; the headlight
  flash still shows it.
- Phones and tablets: the layout does not break, but flight needs a keyboard and mouse. A note says so.
- The single JavaScript file is about 1.55 MB (445 KB gzipped), mostly three.js. It could be split by
  lazy-loading the city screen.
- Accessibility was considered for the panels (labels, focus, tables behind charts) but the 3D experience
  itself has no non-visual equivalent.

- `index.html` carries `<meta name="robots" content="noindex">` so search engines skip the concept. Remove it at launch.
- `npm audit` reports three high-severity findings, all in the dependency chain of `vite-plugin-singlefile`
  (`micromatch`, `braces`). That plugin is a development dependency used only for the single-file preview
  build; none of it is in the deployed site. Drop the plugin and the `build:artifact` script if the preview
  is no longer needed.

## 7. If the frame rate is too low

Cheapest cuts first, each in one place:

0. Street life: `POOL` in `city/shaders.ts` (how far out vehicles are 3D; the painted ones take over beyond)
   and `PEOPLE`, `FINE_CAR`, `FINE_PERSON` in `city/street.ts`. Placing about 1,000 vehicles and 500 people
   costs roughly 1 ms of JavaScript per frame, measured in Node, not in a browser.

1. Water reflections: the 12-step loop in `makeGroundMaterial` (`city/shaders.ts`). Halve the steps.
2. Lamp posts: `POOL_LINES` in `city/street.ts` (streets either side of the camera that get 3D lamp posts).
3. Roof clutter: `roofGear` in `city/layout.ts` adds about 9,000 small boxes.
4. Render scale: `dpr={[1, 1.25]}` on the `<Canvas>` in `screens/CityScreen.tsx`. Use `[1, 1]`.
5. Trees: the `near` detail radius in `buildCity.ts` (`< 1700`).

## 8. Real city: first run

With `VITE_CESIUM_ION_TOKEN` set, `city/realCity.ts` streams Google Photorealistic 3D Tiles (Cesium ion
asset `2275207`) in place of the generated city, and `components/AtmosphereSky.tsx` draws the sky and sun
from the takram atmosphere at a fixed midday. It type-checks and was booted once offline to confirm the
wiring does not crash. It has never received a tile. On the first run with a token:

1. Check the data attribution line appears at the bottom. Google's terms require it to stay visible.
2. Check the sky and sun: midday in Singapore should put the sun high and roughly to the south. If the
   sun is rotated relative to the city, add an `azimuth` to the `ReorientationPlugin` in `city/realCity.ts`
   (or correct the `worldToECEFMatrix` basis in `components/AtmosphereSky.tsx`) until it matches. If the
   frame is too dark or too bright, adjust `EXPOSURE` in the same file.
3. Check orientation: flying "east" on the compass should head toward Changi.
4. In `city/geo.ts`, tune `GROUND_Y` until altitude 0 meets the water.
5. In `city/geo.ts`, correct each latitude/longitude in `ANCHORS`. They were typed from memory.
6. Console tags, patrol routes, the airport fence and all city-map markers are placed for the generated
   city and merely shifted with their nearest landmark. They will need real coordinates.
7. The Day / Dusk switch is hidden in this mode: the tiles carry their own baked daylight.
8. Watch the Cesium ion billing page during the first session.

The realism pass adds three things, all in this mode only:

- **Creased normals** (`city/tiles/`, registered in `realCity.ts`): Google's tiles ship near-flat normals;
  a worker recomputes per-face normals so the atmosphere's sun/sky light can shade edges. `creaseAngle`
  (`Math.PI / 6`) is the knob — larger creases more.
- **Sky environment map** (`components/AtmosphereSky.tsx`): the sky is rendered into a 64px cube map and
  set as `scene.environment` so the flyer reflects the real sky, not the stand-in one. `CityScreen` skips
  its stand-in bake when `REAL`. Lower the cube `resolution`/`frames` if it costs too much.
- **Lens flare** (`LensFlare` in the same composer): `intensity` (default `0.005`) is the knob.
- **Volumetric clouds** (`@takram/three-clouds`, mounted in `AtmosphereSky` before `AerialPerspective`):
  shape/weather/turbulence textures are generated in code, the STBN noise is self-hosted
  (`public/clouds/stbn.bin`), so nothing is fetched from a CDN. Clouds are the heaviest pass; if the
  frame rate suffers, lower `qualityPreset` (`low` already) or its `resolutionScale`, or turn off
  `haze`/`lightShafts`. They cast their shadows onto the tiles through `AerialPerspective`.

## 9. Development tooling

`scripts/` holds the Playwright runs used to check each screen (`shot-tour`, `shot-console`, `shot-map`,
`shot-city-views`, `shot-ground`). They are not needed to build or deploy. To use them, install a Chromium for
Playwright and point `CHROME_PATH` at it, then run `npm run build:artifact` (or `build:harness` for the
city views) first. Steps written `real:name:selector` click with the real mouse; prefer them, because
`element.click()` passes even when something invisible is covering a button.

`shot-ground` needs a test build (`VITE_TEST=1 npm run build:artifact`), which exposes the simulation as
`window.__test` so the script can step it; the software renderer is far too slow to play in real time.
That hook is compiled out of every build made without `VITE_TEST`. Never deploy a test build.

`CLAUDE.md` records the conventions the code follows (coordinate system, how the console talks to the 3D
scene, design tokens). Read it before changing the city or the console.
