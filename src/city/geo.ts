// Where things are when the city is the real one (Google Photorealistic 3D Tiles).
// Everything in the app is written in the stand-in city's coordinates. In real mode `place()` moves a
// stand-in point to the matching spot in the real city, by shifting it with its nearest landmark.
// In stand-in mode it returns the point untouched.
import type { V3 } from '../data/ops';

/** True when a Google Maps Platform key is configured (see .env.example). */
export const REAL = Boolean(import.meta.env.VITE_GOOGLE_MAPS_KEY);

/** Local origin of the real scene: the middle of Marina Bay. Metres from here, +X east, +Z south, +Y up. */
export const ORIGIN = { lat: 1.2847, lon: 103.861 };
/**
 * Sea level sits a few metres above the WGS84 ellipsoid here, and the tiles are placed on the ellipsoid.
 * Estimate: adjust until `Altitude 0` meets the water.
 */
export const GROUND_Y = 8;

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

/** Latitude and longitude in degrees to local metres. Flat-earth maths: within a metre or two at city scale. */
export function fromLatLon(lat: number, lon: number, y = 0): V3 {
  return [(lon - ORIGIN.lon) * M_PER_DEG_LON, y, -(lat - ORIGIN.lat) * M_PER_DEG_LAT];
}

/**
 * Stand-in position (x, z) of a place and its real coordinates.
 * The latitudes and longitudes are approximate, typed in from memory and NOT checked against the tiles:
 * verify each one in the running app and correct it here.
 */
const ANCHORS: { name: string; standIn: [number, number]; lat: number; lon: number }[] = [
  { name: 'Marina Bay Sands', standIn: [562, 0], lat: 1.2834, lon: 103.8607 },
  { name: 'National Stadium', standIn: [2330, -760], lat: 1.3044, lon: 103.8743 },
  { name: 'Changi Airport', standIn: [5440, -2050], lat: 1.3592, lon: 103.9894 },
  { name: 'Singapore Flyer', standIn: [900, -525], lat: 1.2893, lon: 103.8631 },
  { name: 'Gardens by the Bay', standIn: [950, 160], lat: 1.2816, lon: 103.8636 },
  { name: 'Raffles Place', standIn: [-660, 240], lat: 1.284, lon: 103.851 },
];
const SHIFT = ANCHORS.map((a) => {
  const r = fromLatLon(a.lat, a.lon);
  return { x: a.standIn[0], z: a.standIn[1], dx: r[0] - a.standIn[0], dz: r[2] - a.standIn[1] };
});

/** A stand-in point's place in the city that is actually on screen. */
export function place(p: V3): V3 {
  if (!REAL) return p;
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
