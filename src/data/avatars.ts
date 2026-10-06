export type AvatarKind = 'kite' | 'scout' | 'delta';

export interface Avatar {
  id: string;
  name: string;
  callSign: string;
  role: string;
  /** Built-in placeholder model, used when `model` is missing or fails to load. */
  placeholder: AvatarKind;
  /**
   * Swappable model slot: path to a .glb under /public, e.g. 'avatars/kite.glb'.
   * The model is centred and scaled to fit automatically. Nose/front should face +Z.
   */
  model?: string;
  /** Flight characteristics, read by flight mode: km/h, m/s, degrees per second. Demo values. */
  flight: { topSpeed: number; climb: number; turnRate: number };
  /** How far the model leans forward at full speed, in radians (a pilot flies head-first, a drone barely tips). */
  cruiseLean: number;
  /** Chase camera: metres behind and above the flyer. */
  chase: { back: number; up: number };
}

export const AVATARS: Avatar[] = [
  {
    id: 'kite',
    name: 'Kite',
    callSign: 'KITE-01',
    role: 'Jetsuit pilot',
    placeholder: 'kite',
    flight: { topSpeed: 260, climb: 18, turnRate: 90 },
    cruiseLean: 1.25,
    chase: { back: 4.2, up: 1.7 },
  },
  {
    id: 'scout',
    name: 'Scout',
    callSign: 'SCOUT-02',
    role: 'Survey drone',
    placeholder: 'scout',
    flight: { topSpeed: 120, climb: 12, turnRate: 140 },
    cruiseLean: 0.3,
    chase: { back: 4.6, up: 1.6 },
  },
  {
    id: 'delta',
    name: 'Delta',
    callSign: 'DELTA-03',
    role: 'Mapping wing',
    placeholder: 'delta',
    flight: { topSpeed: 340, climb: 9, turnRate: 55 },
    cruiseLean: 0,
    chase: { back: 5.2, up: 1.8 },
  },
];

/** Empty roster slots shown as "Coming soon". Add an entry to AVATARS to fill one. */
export const OPEN_SLOTS = 3;
