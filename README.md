# Vizzio 3D Portfolio (concept)

An interactive 3D portfolio concept for vizzio.ai, built to replace video demos with something a visitor
can fly through: a globe of project countries, a choice of flyer, a statistics tour of Singapore, free
flight over the city, landmark operations consoles with 360° cameras, and a city map with layered data.

**Status: concept build.** It is not an official Vizzio site. Every figure, name, alert and project in it
is demo data. Read [docs/HANDOFF.md](docs/HANDOFF.md) before putting it in front of the public.

Desktop browsers only (keyboard and mouse). It is a static site: there is no backend, database or login.

## Requirements

- Node.js 20.19 or newer (22 recommended; `.nvmrc` says 22)
- npm 10
- A desktop browser with WebGL 2 and a real GPU

## Run it locally

```bash
npm ci
npm run dev
```

Open the address Vite prints (normally http://localhost:5173).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run typecheck` | TypeScript check, no output files |
| `npm run build` | Type check, then the production build into `dist/` |
| `npm run preview` | Serves `dist/` locally, to check the production build |
| `npm run build:artifact` | Single-file HTML preview into `artifact/` (used during design review, not for deployment) |
| `npm run build:harness` | The city alone on one page, for the screenshot scripts in `scripts/` |

## Deploy on Vercel

The repository is ready for Vercel as it stands. `vercel.json` sets the framework (Vite), the install
and build commands and the output folder, and gives the hashed files in `/assets` a long cache life.

**From the dashboard**

1. Push this folder to a Git repository (GitHub, GitLab or Bitbucket).
2. In Vercel choose **Add New → Project** and import the repository.
3. Leave the build settings as detected. They come from `vercel.json`: build `npm run build`, output `dist`.
4. Optional: add the environment variable described below.
5. Deploy. Every push to the main branch redeploys; other branches get preview URLs.

**From the command line**

```bash
npm i -g vercel
vercel          # first run links the folder to a project and makes a preview deployment
vercel --prod   # production deployment
```

This build was produced and served locally from a clean copy of the repository. It has **not** been
deployed to Vercel by the author: treat the first deployment as the test.

## Environment variable

| Name | Required | Purpose |
| --- | --- | --- |
| `VITE_GOOGLE_MAPS_KEY` | No | Google Maps Platform key with the **Map Tiles API** enabled. When set, the city is Google's Photorealistic 3D Tiles instead of the generated stand-in. |

Things to know before setting it:

- It is read **at build time**. After adding or changing it in Vercel, redeploy.
- Any variable starting with `VITE_` ends up in the JavaScript the browser downloads, so this key is
  public. That is normal for Maps keys, and the protection is on Google's side: in Google Cloud Console
  restrict the key to your site's domains (HTTP referrers) and to the Map Tiles API only.
- Google bills tile usage. Set a budget alert before sharing the link.
- The real-city path has never been run against Google's servers. See "Real city: first run" in
  [docs/HANDOFF.md](docs/HANDOFF.md).

Locally, copy `.env.example` to `.env.local` and fill it in. Leave it empty to fly over the stand-in city.

## Controls

| Where | Keys |
| --- | --- |
| Flight | Click the view to steer with the mouse. `W A S D` move, `Shift` boost, `Space` ascend, `C` descend, `Esc` frees the cursor |
| Landmarks | `E` near a landmark (or click its marker) opens its console. `Esc` steps back one level, `E` closes it |
| City map | `M` or `1`–`4` open it. Drag to pan, scroll to zoom, click a marker. `Esc` returns to flight |
| CCTV | Drag the picture to look around, scroll to zoom, arrow keys to pan and tilt |
| Statistics tour | Arrow keys change chapter, `Enter` starts the flight |

## Where things are

```
src/
  App.tsx            stages: globe -> avatar -> city
  screens/           one file per screen (globe, avatar, loading, city, tour, map, toolbar)
  city/              the generated city, its shaders, flight, and the Google 3D Tiles path
  console/           landmark console: modes, CCTV viewer, charts
  avatars/           placeholder flyer models and the GLB loader
  data/              ALL content: countries, flyers, landmarks, console data, tour figures, map layers
  styles/            tokens.css is the design system; app.css is everything else
public/avatars/      drop .glb flyer models here
scripts/             development tooling (screenshot runs); not part of the site
docs/HANDOFF.md      what is real, what is placeholder, what has not been tested
CLAUDE.md            project conventions (written for AI coding assistants, useful for people too)
tasks.md             what was built, in order, and the open items
```

To change what the site says, edit `src/data/`. To change how it looks, start in `src/styles/tokens.css`.
