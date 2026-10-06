/** Landmarks the visitor can fly to and open. What each console shows lives in ops.ts, keyed by the same id. */
export interface Landmark {
  id: string;
  name: string;
  kind: string;
  /** Where the on-screen marker sits, in city metres (x, y, z). */
  pos: [number, number, number];
  /** Horizontal distance within which E opens the console. */
  range: number;
  /** Inspect camera: circles `target` at this radius and height. */
  orbit: { target: [number, number, number]; radius: number; height: number };
}

export const LANDMARKS: Landmark[] = [
  {
    id: 'mbs',
    name: 'Marina Bay Sands',
    kind: 'Hotel and skyline',
    pos: [562, 238, -20],
    range: 430,
    orbit: { target: [562, 120, 0], radius: 470, height: 280 },
  },
  {
    id: 'stadium',
    name: 'National Stadium',
    kind: 'Sports Hub',
    pos: [2330, 108, -760],
    range: 400,
    orbit: { target: [2330, 30, -760], radius: 400, height: 210 },
  },
  {
    id: 'airport',
    name: 'Changi Airport',
    kind: 'Aviation hub',
    pos: [5440, 122, -2330],
    range: 900,
    orbit: { target: [5520, 20, -2050], radius: 900, height: 380 },
  },
];
