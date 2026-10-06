// Operations data behind the landmark console. Every figure, name and event here is DEMO DATA,
// written to exercise the layouts. Teams, people and incidents are fictional.

export type V3 = [number, number, number];
export type Tone = 'ok' | 'warn' | 'crit' | 'info';
export type ModeId = 'environment' | 'security' | 'facility' | 'matchday' | 'patrol' | 'archive' | 'alerts';

export const MODE_LABEL: Record<ModeId, string> = {
  environment: 'Environment',
  security: 'Security',
  facility: 'Facility',
  matchday: 'Match day',
  patrol: 'Virtual patrol',
  archive: 'Event archive',
  alerts: 'Alerts',
};

/** Short form for the tab bar, so every view fits on one row. */
export const MODE_TAB: Record<ModeId, string> = { ...MODE_LABEL, patrol: 'Patrol', archive: 'Archive' };

/** A named place on the landmark, in city metres. Tags in the 3D view hang off these. */
export interface Zone {
  id: string;
  name: string;
  pos: V3;
}

export interface Reading {
  zone: string;
  kind: 'noise' | 'temp' | 'place';
  value?: string;
  tone: Tone;
}

export interface Environment {
  tiles: { label: string; value: string; unit?: string }[];
  air: { label: string; aqi: number };
  conditions: { name: string; value: string; state: string; tone: Tone; series: number[] }[];
  systems: { name: string; value: number; target: number }[];
  teams: { name: string; state: string; tone: Tone }[];
  readings: Reading[];
}

export interface Security {
  alarms: number;
  resolved: number;
  processing: number;
  areas: { zone: string; count: number; kind: string }[];
  /** `zone` points the CCTV viewer at the place; entries without one are not clickable. */
  attention: { time: string; tone: Tone; title: string; place: string; zone?: string }[];
  incidents: { zone: string; title: string; tone: Tone }[];
}

export type AssetStatus = 'Running' | 'Check' | 'Stopped';
export interface Asset {
  name: string;
  place: string;
  kw: number;
  status: AssetStatus;
  tag: string;
  spec: [string, string][];
}

export interface CriticalSystem {
  id: string;
  name: string;
  assets: number;
  load: number;
  status: 'Normal' | 'Check';
}

export interface Facility {
  pending: number;
  resolved: number;
  processing: number;
  orders: { title: string; id: string; place: string; age: string; status: 'Resolved' | 'Processing' | 'Pending' }[];
  health: number;
  status: { name: string; value: number }[];
  /** Areas with open work; each opens the room view. */
  areas: { zone: string; open: number; tone: Tone }[];
}

/** Room drill-down. One template serves every room; the room's name comes from its zone. */
export interface Room {
  iaq: { label: string; value: string; unit?: string }[];
  systems: CriticalSystem[];
  occupancy: { utilisation: number; vacancy: number };
  energy: { label: string; value: string; unit?: string }[];
  checks: { headline: string; items: [string, string][] };
  assets: Asset[];
}

export interface Side {
  name: string;
  rank: string;
  sentiment: { label: string; value: string; note: string }[];
  trend: { now: number; peak: number; series: number[] };
  audience: { total: number; types: { name: string; pct: number }[] };
}

export interface MatchDay {
  round: string;
  score: [number, number];
  home: Side;
  away: Side;
  fan: {
    /** Sentiment score per seating block, clockwise from the top-left corner. */
    blocks: { top: number[]; right: number[]; bottom: number[]; left: number[] };
    stands: { name: string; detail: string; score: number; mood: 'Positive' | 'Negative' }[];
    events: { min: string; event: string; detail: string; mood: string; tone: Tone; sections: string }[];
  };
  player: {
    name: string;
    meta: string;
    figures: { label: string; value: string }[];
    nodes: { id: string; x: number; y: number; score: number; selected?: boolean }[];
    links: { a: string; b: string; passes: number }[];
    exchanged: { pair: string; passes: number }[];
    leaders: { name: string; meta: string; score: number }[];
    timeline: { min: string; text: string }[];
  };
  match: {
    possession: [number, number];
    /** Share of attacks through the left, centre and right channel. */
    channels: { home: [number, number, number]; away: [number, number, number] };
    stats: { name: string; home: number; away: number }[];
  };
}

export interface PatrolRoute {
  id: string;
  name: string;
  /** Radius of the route around the landmark, metres. */
  radius: number;
  stops: { name: string; cam: string; place: string; angle: number }[];
}

export interface Patrol {
  routes: PatrolRoute[];
  contacts: { team: string; name: string; role: string; ext: string }[];
  priority: { name: string; level: 'Top' | 'High' | 'Medium' }[];
}

export interface PastEvent {
  id: string;
  stage: string;
  home: string;
  away: string;
  score: string;
  when: string;
  crowd: number;
  crowdNote: string;
  density: number;
  densityNote: string;
  dwell: number;
  dwellNote: string;
  anomalies: number;
  /** Crowd on site, hourly from 14:00 to 18:00 at half-hour steps. */
  flow: number[];
  /** Share of the crowd by age group, percent. */
  ages: number[];
}

export interface Alert {
  id: string;
  type: string;
  status: 'Alarm received' | 'PIC dispatched' | 'Resolved';
  place: string;
  when: string;
  detected: string;
  confidence: number;
  recommend: string;
  checklist: string[];
  shape: 'fence' | 'line';
}

export interface Alerts {
  site: string;
  focus: V3;
  /** Restricted area outline, [x, z] corners. */
  fence: [number, number][];
  /** Virtual tripwire, two [x, z] ends. */
  line: [[number, number], [number, number]];
  items: Alert[];
}

export interface SiteOps {
  modes: ModeId[];
  zones: Zone[];
  environment: Environment;
  security: Security;
  facility: Facility;
  room: Room;
  matchday?: MatchDay;
  patrol?: Patrol;
  archive?: PastEvent[];
  alerts?: Alerts;
}

/* ---------- shared templates ---------- */

const TEMP = [26.1, 26.3, 26.2, 26.6, 26.9, 27.2, 27.0, 26.8, 26.9, 27.1, 26.9, 26.8, 26.9];
const HUMID = [39, 38, 38, 37, 37, 36, 36, 35, 36, 36, 37, 36, 36];
const NOISE = [52, 54, 53, 58, 61, 60, 66, 70, 68, 72, 69, 71, 71];

const SYSTEMS = [
  { name: 'HVAC system', value: 100, target: 95 },
  { name: 'Air filtration', value: 82, target: 95 },
  { name: 'Ventilation', value: 100, target: 95 },
  { name: 'Temperature control', value: 95, target: 95 },
];

const TEAMS: Environment['teams'] = [
  { name: 'Medical team A', state: 'Available', tone: 'ok' },
  { name: 'Fire team B', state: 'On call', tone: 'ok' },
  { name: 'Security team C', state: 'Deployed', tone: 'warn' },
];

const AHU_SPEC: [string, string][] = [
  ['Model', 'CL-050 (demo)'],
  ['Nominal airflow', '50,000 CMH'],
  ['Coil face area', '5.01 sqm'],
  ['Width', '3,219 mm'],
  ['Height', '2,079 mm'],
  ['Cooling capacity', '249 kW'],
  ['Electrical demand', '22 kW'],
  ['Off-coil setpoint', '14 °C'],
  ['Off-coil temperature', '16 °C'],
  ['Return air temperature', '39 °C'],
  ['Ambient air temperature', '38.5 °C'],
  ['Chilled water supply', '7 °C'],
  ['Chilled water return', '16.5 °C'],
  ['Chilled water valve', '50.0 %'],
  ['Static pressure', '213 Pa'],
];

const ROOM: Room = {
  iaq: [
    { label: 'Temperature', value: '26.9', unit: '°C' },
    { label: 'Humidity', value: '36', unit: '%' },
    { label: 'CO₂ level', value: '400', unit: 'ppm' },
    { label: 'Air quality', value: '50', unit: 'AQI' },
  ],
  systems: [
    { id: 'hvac', name: 'Air conditioning and ventilation', assets: 6, load: 82, status: 'Normal' },
    { id: 'power', name: 'Power distribution', assets: 3, load: 64, status: 'Normal' },
    { id: 'plumbing', name: 'Plumbing and drainage', assets: 2, load: 71, status: 'Check' },
    { id: 'bms', name: 'Building automation', assets: 2, load: 45, status: 'Normal' },
    { id: 'backup', name: 'Emergency power', assets: 1, load: 12, status: 'Normal' },
  ],
  occupancy: { utilisation: 86, vacancy: 3 },
  energy: [
    { label: 'Used today', value: '1,840', unit: 'kWh' },
    { label: 'Intensity', value: '118', unit: 'kWh/m²' },
  ],
  checks: {
    headline: 'Monitoring equipment integrity rate ≥ 95%',
    items: [
      ['Fire-fighting facilities', 'Normal'],
      ['Lighting fixtures', 'Normal'],
      ['Public area waste bins', 'Normal'],
      ['Fire escape routes', 'Unobstructed'],
    ],
  },
  assets: [
    { name: 'Air handling unit', place: 'AC room · Level 1', kw: 34, status: 'Running', tag: 'AHU-L1-01', spec: AHU_SPEC },
    { name: 'Air cooled chiller A', place: 'Central plant · Level 1', kw: 34, status: 'Check', tag: 'CH-L1-A', spec: AHU_SPEC },
    { name: 'Exhaust fan (EF)', place: 'Plant room · Basement 1', kw: 34, status: 'Stopped', tag: 'EF-B1-03', spec: AHU_SPEC },
    { name: 'Fan coil unit (FCU)', place: 'VIP area · Level 2', kw: 34, status: 'Running', tag: 'FCU-L2-11', spec: AHU_SPEC },
  ],
};

const conditions = (): Environment['conditions'] => [
  { name: 'Temperature', value: '26.9 °C', state: 'Stable', tone: 'ok', series: TEMP },
  { name: 'Humidity', value: '36 %', state: 'Stable', tone: 'ok', series: HUMID },
  { name: 'Noise', value: '71 dB', state: 'Elevated', tone: 'warn', series: NOISE },
];

const WORK_STATUS: Facility['status'] = [
  { name: 'WiFi', value: 92 },
  { name: 'Environmental', value: 98 },
  { name: 'CCTV', value: 100 },
];

/* ---------- National Stadium: the full set ---------- */

const SX = 2330, SZ = -760;
const HOME = 'Marina FC', AWAY = 'Kallang United';
const TYPES = ['Supportive', 'Fanatical', 'Analytical', 'Competitive'];

const flow = (peak: number, shift: number) =>
  Array.from({ length: 9 }, (_, i) => Math.round(peak * (0.34 + 0.5 * Math.exp(-((i - 2.4 - shift) ** 2) / 2.2) + 0.62 * Math.exp(-((i - 6.2 - shift) ** 2) / 2.6))));

const stadium: SiteOps = {
  modes: ['environment', 'security', 'facility', 'matchday', 'patrol', 'archive'],
  zones: [
    { id: 'main', name: 'Main stadium', pos: [SX, 80, SZ] },
    { id: 'north', name: 'North stand', pos: [SX, 52, SZ - 118] },
    { id: 'south', name: 'South stand', pos: [SX, 52, SZ + 118] },
    { id: 'east', name: 'East stand', pos: [SX + 122, 52, SZ] },
    { id: 'west', name: 'West stand', pos: [SX - 122, 52, SZ] },
    { id: 'concourse', name: 'Concourse', pos: [SX + 150, 14, SZ + 96] },
    { id: 'plant', name: 'Plant rooms', pos: [SX - 150, 14, SZ + 96] },
    { id: 'pump', name: 'Fire pump room', pos: [SX + 96, 30, SZ - 96] },
    { id: 'vip', name: 'VIP area', pos: [SX - 60, 58, SZ - 70] },
    { id: 'central', name: 'Central plant', pos: [SX - 190, 10, SZ - 110] },
    { id: 'carpark', name: 'Car park', pos: [SX + 230, 8, SZ + 200] },
    { id: 'training', name: 'Training pitches', pos: [SX + 210, 8, SZ - 200] },
    { id: 'perimeter', name: 'Perimeter', pos: [SX + 40, 8, SZ + 235] },
  ],
  environment: {
    tiles: [
      { label: 'Temperature', value: '26.9', unit: '°C' },
      { label: 'Occupancy', value: '57.2', unit: 'K' },
    ],
    air: { label: 'Good', aqi: 82 },
    conditions: conditions(),
    systems: SYSTEMS,
    teams: TEAMS,
    readings: [
      { zone: 'main', kind: 'place', tone: 'info' },
      { zone: 'north', kind: 'noise', value: '66 dB', tone: 'warn' },
      { zone: 'south', kind: 'noise', value: '66 dB', tone: 'warn' },
      { zone: 'east', kind: 'noise', value: '71 dB', tone: 'crit' },
      { zone: 'concourse', kind: 'noise', value: '70 dB', tone: 'crit' },
      { zone: 'plant', kind: 'temp', value: '32.6 °C', tone: 'crit' },
      { zone: 'training', kind: 'temp', value: '29.2 °C', tone: 'warn' },
      { zone: 'carpark', kind: 'temp', value: '31.4 °C', tone: 'crit' },
      { zone: 'perimeter', kind: 'temp', value: '30.1 °C', tone: 'crit' },
      { zone: 'central', kind: 'place', tone: 'info' },
    ],
  },
  security: {
    alarms: 498,
    resolved: 482,
    processing: 16,
    areas: [
      { zone: 'west', count: 1, kind: 'Spectator' },
      { zone: 'east', count: 5, kind: 'Spectator' },
      { zone: 'south', count: 3, kind: 'Spectator' },
      { zone: 'north', count: 2, kind: 'Spectator' },
      { zone: 'training', count: 1, kind: 'Staff' },
      { zone: 'carpark', count: 4, kind: 'Public' },
    ],
    attention: [
      { time: '02:11', tone: 'crit', title: 'Sport injury, medical dispatched', place: 'Training pitch 2', zone: 'training' },
      { time: '02:03', tone: 'warn', title: 'Altercation detected', place: 'South concourse', zone: 'south' },
      { time: '01:56', tone: 'crit', title: 'Fire alarm activated', place: 'Equipment room', zone: 'pump' },
      { time: '01:51', tone: 'warn', title: 'Vehicle obstruction, zone D', place: 'Car park level 2', zone: 'carpark' },
      { time: '22:48', tone: 'ok', title: 'Lift B cleared by maintenance', place: 'Stadium central' },
      { time: '22:05', tone: 'warn', title: 'Lift B reported offline', place: 'Stadium central', zone: 'concourse' },
    ],
    incidents: [
      { zone: 'vip', title: 'VIP area, unauthorised access', tone: 'crit' },
      { zone: 'pump', title: 'Fire alarm activated', tone: 'crit' },
      { zone: 'training', title: 'Sport injury, medical dispatched', tone: 'crit' },
      { zone: 'south', title: 'Altercation', tone: 'warn' },
      { zone: 'concourse', title: 'Lift malfunction', tone: 'warn' },
      { zone: 'carpark', title: 'Vehicle obstruction', tone: 'warn' },
      { zone: 'main', title: 'Main stadium', tone: 'info' },
    ],
  },
  facility: {
    pending: 8,
    resolved: 482,
    processing: 6,
    orders: [
      { title: 'VIP door hardware integrity check', id: 'WO-FM-019', place: 'VIP box 1 entry', age: '1 min ago', status: 'Resolved' },
      { title: 'Alert deduplication rule tuning', id: 'WO-FM-025', place: 'VIP entrance, turnstile 3', age: '15 min ago', status: 'Processing' },
      { title: 'Lift malfunction', id: 'WO-FM-023', place: 'Gold and silver ticket lift', age: '15 min ago', status: 'Processing' },
      { title: 'Turnstile throughput readiness check', id: 'WO-FM-022', place: 'Main entrance, turnstiles 2 to 5', age: '22 min ago', status: 'Pending' },
    ],
    health: 98,
    status: WORK_STATUS,
    areas: [
      { zone: 'vip', open: 2, tone: 'warn' },
      { zone: 'pump', open: 2, tone: 'warn' },
      { zone: 'plant', open: 3, tone: 'crit' },
      { zone: 'south', open: 1, tone: 'warn' },
      { zone: 'carpark', open: 1, tone: 'warn' },
      { zone: 'central', open: 0, tone: 'info' },
    ],
  },
  room: ROOM,
  matchday: {
    round: 'Round 23',
    score: [0, 1],
    home: {
      name: HOME,
      rank: '3rd in league · Home',
      sentiment: [
        { label: 'Happiness', value: '34.8', note: 'Peak' },
        { label: 'Anger', value: '27.4', note: 'Low' },
        { label: 'Focus', value: '92.1', note: 'High' },
        { label: 'Volatility', value: '68.3', note: 'Active' },
      ],
      trend: { now: 34, peak: 55, series: [22, 30, 41, 55, 48, 39, 44, 36, 31, 34] },
      audience: { total: 32183, types: [45, 22, 14, 19].map((pct, i) => ({ name: TYPES[i], pct })) },
    },
    away: {
      name: AWAY,
      rank: '1st in league · Away',
      sentiment: [
        { label: 'Happiness', value: '72.6', note: 'Peak' },
        { label: 'Anger', value: '9.7', note: 'Low' },
        { label: 'Focus', value: '93.4', note: 'High' },
        { label: 'Volatility', value: '44.2', note: 'Active' },
      ],
      trend: { now: 74, peak: 82, series: [40, 44, 52, 49, 58, 66, 82, 77, 71, 74] },
      audience: { total: 29382, types: [45, 22, 14, 19].map((pct, i) => ({ name: TYPES[i], pct })) },
    },
    fan: {
      blocks: {
        top: [12, 11, 2, 10, 5, 9, 12, 5, 10, 12, 10, 12, 3],
        right: [8, 7, 12, 13, 1, 13, 13],
        bottom: [13, 10, 12, 4, 10, 12, 9, 7, 10, 2, 11, 13, 10],
        left: [1, 1, 4, 13, 13, 1, 12],
      },
      stands: [
        { name: 'North stand', detail: `${HOME} · 8 blocks`, score: 11.0, mood: 'Positive' },
        { name: 'West stand', detail: `${HOME} · 6 blocks`, score: 11.8, mood: 'Positive' },
        { name: 'South stand', detail: `${HOME} · 8 blocks`, score: 10.6, mood: 'Positive' },
        { name: 'East stand', detail: `${AWAY} · 6 blocks`, score: 3.4, mood: 'Negative' },
      ],
      events: [
        { min: "12'", event: 'High press sequence', detail: 'Held 56 s', mood: 'Happy +18%', tone: 'ok', sections: 'North, west' },
        { min: "22'–26'", event: 'Sustained possession', detail: 'Held 120 s', mood: 'Content +25%', tone: 'ok', sections: 'East' },
        { min: "31'", event: 'Yellow card', detail: 'Midfield foul', mood: 'Angry +14%', tone: 'crit', sections: 'North, south' },
        { min: "38'", event: 'Goal conceded', detail: 'Counter attack', mood: 'Angry +31%', tone: 'crit', sections: 'All home stands' },
        { min: "44'", event: 'Shot on target', detail: 'Saved', mood: 'Hopeful +9%', tone: 'ok', sections: 'South' },
      ],
    },
    player: {
      name: '#7 A. Rahman',
      meta: `${HOME} · CM · 45′ game time`,
      figures: [
        { label: 'Passing score', value: '10.9' },
        { label: 'Accuracy', value: '87%' },
        { label: 'Passes', value: '34' },
      ],
      nodes: [
        { id: 'GK', x: 8, y: 50, score: 4 },
        { id: 'LB', x: 28, y: 16, score: 6 },
        { id: 'CB', x: 24, y: 50, score: 7 },
        { id: 'RB', x: 28, y: 84, score: 5 },
        { id: '7', x: 48, y: 50, score: 11, selected: true },
        { id: 'LM', x: 58, y: 22, score: 8 },
        { id: 'RM', x: 60, y: 78, score: 7 },
        { id: 'ST', x: 82, y: 46, score: 9 },
      ],
      links: [
        { a: '7', b: 'ST', passes: 13 },
        { a: '7', b: 'LM', passes: 9 },
        { a: 'CB', b: '7', passes: 8 },
        { a: 'LM', b: 'ST', passes: 7 },
        { a: '7', b: 'RM', passes: 6 },
        { a: 'LB', b: 'LM', passes: 5 },
        { a: 'GK', b: 'CB', passes: 5 },
        { a: 'RB', b: 'RM', passes: 4 },
      ],
      exchanged: [
        { pair: 'Rahman ↔ Costa', passes: 13 },
        { pair: 'Costa ↔ Lim', passes: 9 },
        { pair: 'Iskandar → Rahman', passes: 8 },
        { pair: 'Lim → Okafor', passes: 7 },
        { pair: 'Rahman ↔ Tan', passes: 6 },
        { pair: 'Yusof → Lim', passes: 5 },
      ],
      leaders: [
        { name: 'A. Rahman', meta: 'CM · 34 passes · 87% accuracy', score: 10.9 },
        { name: 'D. Costa', meta: 'ST · 21 passes · 81% accuracy', score: 8.7 },
        { name: 'J. Lim', meta: 'LM · 26 passes · 84% accuracy', score: 8.1 },
      ],
      timeline: [
        { min: "12'", text: 'High press sequence' },
        { min: "23'", text: 'Yellow card, midfield foul' },
        { min: "38'", text: 'Goal conceded' },
      ],
    },
    match: {
      possession: [42, 58],
      channels: { home: [38, 24, 38], away: [29, 41, 30] },
      stats: [
        { name: 'Shots', home: 5, away: 9 },
        { name: 'Shots on target', home: 2, away: 4 },
        { name: 'Corners', home: 3, away: 5 },
        { name: 'Fouls', home: 7, away: 4 },
      ],
    },
  },
  patrol: {
    routes: [
      {
        id: 'home',
        name: 'Home fan',
        radius: 176,
        stops: ['Main entrance · Gate 2', 'North concourse', 'Block N4 stairs', 'North-east vomitory', 'East concourse', 'Block E2 stairs', 'Family zone', 'South-east exit'].map((name, i) => ({
          name,
          cam: `Pitch_Cam${22 + i}`,
          place: i < 4 ? 'North stand' : 'East stand',
          angle: -2.5 + i * 0.44,
        })),
      },
      {
        id: 'vip',
        name: 'VIP',
        radius: 198,
        stops: ['VIP drop-off', 'VIP lobby', 'Hospitality level', 'Box corridor', 'Media tribune', 'Players’ tunnel', 'VIP car park'].map((name, i) => ({
          name,
          cam: `VIP_Cam${10 + i}`,
          place: 'West stand',
          angle: 2.1 + i * 0.36,
        })),
      },
      {
        id: 'away',
        name: 'Away fan',
        radius: 220,
        stops: ['Away turnstiles', 'South concourse', 'Block S6 stairs', 'Away section', 'South-west exit', 'Coach bays'].map((name, i) => ({
          name,
          cam: `Away_Cam${40 + i}`,
          place: 'South stand',
          angle: 0.5 + i * 0.4,
        })),
      },
    ],
    contacts: [
      { team: 'Team Bravo', name: 'David Ong', role: 'Security', ext: 'Ext. 3310' },
      { team: 'Team Charlie', name: 'Anisha Rao', role: 'Security', ext: 'Ext. 3872' },
      { team: 'Team Delta', name: 'Danny Lee', role: 'Security', ext: 'Ext. 3401' },
    ],
    priority: [
      { name: 'VIP area', level: 'Top' },
      { name: 'Gold and silver premium entrance', level: 'High' },
      { name: 'Match area', level: 'High' },
      { name: 'Gold area', level: 'Medium' },
      { name: 'Premium area', level: 'Medium' },
    ],
  },
  archive: [
    { id: 'e1', stage: `${HOME} vs ${AWAY}`, home: HOME, away: AWAY, score: '2 : 3', when: '13 April · 5:45 PM', crowd: 58100, crowdNote: '12% above average', density: 4.2, densityNote: 'Near capacity', dwell: 125, dwellNote: 'Normal', anomalies: 12, flow: flow(40000, 0), ages: [9, 34, 31, 19, 7] },
    { id: 'e2', stage: 'Harbour City vs Tanjong Rovers', home: 'Harbour City', away: 'Tanjong Rovers', score: '3 : 1', when: '14 April · 9:00 PM', crowd: 45230, crowdNote: '4% below average', density: 3.8, densityNote: 'Comfortable', dwell: 110, dwellNote: 'Normal', anomalies: 5, flow: flow(31000, 0.6), ages: [12, 29, 33, 18, 8] },
    { id: 'e3', stage: 'Quarter final, match 1', home: HOME, away: 'Tanjong Rovers', score: '1 : 1', when: '17 April · 7:30 PM', crowd: 51800, crowdNote: '3% above average', density: 4.0, densityNote: 'Busy', dwell: 131, dwellNote: 'Long', anomalies: 9, flow: flow(36000, -0.3), ages: [8, 36, 30, 19, 7] },
    { id: 'e4', stage: 'Semi final, match 1', home: 'Harbour City', away: AWAY, score: '0 : 2', when: '21 April · 8:30 PM', crowd: 54400, crowdNote: '6% above average', density: 4.1, densityNote: 'Busy', dwell: 118, dwellNote: 'Normal', anomalies: 7, flow: flow(38000, 0.3), ages: [10, 33, 32, 18, 7] },
    { id: 'e5', stage: 'Semi final, match 2', home: HOME, away: 'Tanjong Rovers', score: '2 : 0', when: '22 April · 8:30 PM', crowd: 49700, crowdNote: 'On average', density: 3.9, densityNote: 'Comfortable', dwell: 114, dwellNote: 'Normal', anomalies: 4, flow: flow(34000, 0.1), ages: [11, 31, 32, 19, 7] },
  ],
};

/* ---------- Marina Bay Sands ---------- */

const mbs: SiteOps = {
  modes: ['environment', 'security', 'facility'],
  zones: [
    { id: 'deck', name: 'Sky deck', pos: [566, 214, 40] },
    { id: 'pool', name: 'Infinity pool', pos: [556, 212, -80] },
    { id: 't1', name: 'Tower 1', pos: [544, 130, -125] },
    { id: 't2', name: 'Tower 2', pos: [544, 110, 0] },
    { id: 't3', name: 'Tower 3', pos: [544, 130, 125] },
    { id: 'podium', name: 'Retail podium', pos: [440, 32, 60] },
    { id: 'lobby', name: 'Hotel lobby', pos: [530, 12, -60] },
    { id: 'plant', name: 'Plant rooms', pos: [596, 30, 125] },
    { id: 'carpark', name: 'Car park', pos: [470, 30, 200] },
    { id: 'promenade', name: 'Promenade', pos: [395, 8, -120] },
  ],
  environment: {
    tiles: [
      { label: 'Temperature', value: '29.4', unit: '°C' },
      { label: 'Guests on site', value: '48.5', unit: 'K' },
    ],
    air: { label: 'Good', aqi: 61 },
    conditions: conditions(),
    systems: SYSTEMS,
    teams: TEAMS,
    readings: [
      { zone: 't2', kind: 'place', tone: 'info' },
      { zone: 'deck', kind: 'temp', value: '29.4 °C', tone: 'warn' },
      { zone: 'pool', kind: 'temp', value: '28.1 °C', tone: 'ok' },
      { zone: 'podium', kind: 'noise', value: '68 dB', tone: 'warn' },
      { zone: 'lobby', kind: 'noise', value: '61 dB', tone: 'ok' },
      { zone: 'plant', kind: 'temp', value: '33.0 °C', tone: 'crit' },
      { zone: 'carpark', kind: 'temp', value: '31.2 °C', tone: 'crit' },
      { zone: 'promenade', kind: 'noise', value: '72 dB', tone: 'crit' },
    ],
  },
  security: {
    alarms: 214,
    resolved: 205,
    processing: 9,
    areas: [
      { zone: 'deck', count: 2, kind: 'Guests' },
      { zone: 'podium', count: 4, kind: 'Public' },
      { zone: 'lobby', count: 1, kind: 'Guests' },
      { zone: 'carpark', count: 1, kind: 'Public' },
      { zone: 't1', count: 0, kind: 'Guests' },
      { zone: 'promenade', count: 1, kind: 'Public' },
    ],
    attention: [
      { time: '19:42', tone: 'crit', title: 'Restricted door forced', place: 'Sky deck service stair', zone: 'deck' },
      { time: '19:30', tone: 'warn', title: 'Crowding at lift lobby', place: 'Tower 2, level 1', zone: 't2' },
      { time: '19:12', tone: 'warn', title: 'Unattended bag', place: 'Retail podium, atrium', zone: 'podium' },
      { time: '18:55', tone: 'ok', title: 'Lost child reunited', place: 'Promenade', zone: 'promenade' },
      { time: '18:20', tone: 'warn', title: 'Vehicle in fire lane', place: 'Car park entry', zone: 'carpark' },
    ],
    incidents: [
      { zone: 'deck', title: 'Restricted door forced', tone: 'crit' },
      { zone: 't2', title: 'Crowding at lift lobby', tone: 'warn' },
      { zone: 'podium', title: 'Unattended bag', tone: 'warn' },
      { zone: 'carpark', title: 'Vehicle in fire lane', tone: 'warn' },
      { zone: 'lobby', title: 'Hotel lobby', tone: 'info' },
    ],
  },
  facility: {
    pending: 6,
    resolved: 318,
    processing: 4,
    orders: [
      { title: 'Pool filtration pressure drop', id: 'WO-MB-104', place: 'Infinity pool plant', age: '4 min ago', status: 'Processing' },
      { title: 'Guest lift door sensor', id: 'WO-MB-101', place: 'Tower 2, lift 6', age: '18 min ago', status: 'Processing' },
      { title: 'Chiller vibration check', id: 'WO-MB-099', place: 'Plant rooms', age: '35 min ago', status: 'Pending' },
      { title: 'Atrium lighting scene reset', id: 'WO-MB-097', place: 'Retail podium', age: '1 h ago', status: 'Resolved' },
    ],
    health: 96,
    status: [
      { name: 'WiFi', value: 97 },
      { name: 'Environmental', value: 91 },
      { name: 'CCTV', value: 100 },
    ],
    areas: [
      { zone: 'pool', open: 1, tone: 'warn' },
      { zone: 't2', open: 1, tone: 'warn' },
      { zone: 'plant', open: 2, tone: 'crit' },
      { zone: 'podium', open: 0, tone: 'info' },
      { zone: 'carpark', open: 1, tone: 'warn' },
    ],
  },
  room: ROOM,
};

/* ---------- Changi Airport ---------- */

const airport: SiteOps = {
  modes: ['environment', 'security', 'facility', 'alerts'],
  zones: [
    { id: 't1', name: 'Terminal 1', pos: [5330, 38, -2620] },
    { id: 't2', name: 'Terminal 2', pos: [5330, 38, -2050] },
    { id: 't3', name: 'Terminal 3', pos: [5330, 38, -1480] },
    { id: 'tower', name: 'Control tower', pos: [5440, 100, -2330] },
    { id: 'dome', name: 'Glass dome', pos: [5170, 44, -2050] },
    { id: 'apron', name: 'Apron', pos: [5490, 10, -1760] },
    { id: 'baggage', name: 'Baggage hall', pos: [5300, 36, -2250] },
    { id: 'gate', name: 'Airside gate 4', pos: [5545, 12, -1620] },
    { id: 'rw1', name: 'Runway 1', pos: [5700, 8, -2100] },
    { id: 'rw2', name: 'Runway 2', pos: [6050, 8, -2000] },
  ],
  environment: {
    tiles: [
      { label: 'Temperature', value: '28.2', unit: '°C' },
      { label: 'Passengers on site', value: '41.6', unit: 'K' },
    ],
    air: { label: 'Moderate', aqi: 96 },
    conditions: conditions(),
    systems: SYSTEMS,
    teams: TEAMS,
    readings: [
      { zone: 't2', kind: 'place', tone: 'info' },
      { zone: 't1', kind: 'temp', value: '24.6 °C', tone: 'ok' },
      { zone: 't3', kind: 'temp', value: '25.1 °C', tone: 'ok' },
      { zone: 'apron', kind: 'noise', value: '94 dB', tone: 'crit' },
      { zone: 'rw1', kind: 'noise', value: '102 dB', tone: 'crit' },
      { zone: 'baggage', kind: 'noise', value: '78 dB', tone: 'warn' },
      { zone: 'dome', kind: 'temp', value: '26.0 °C', tone: 'ok' },
      { zone: 'tower', kind: 'place', tone: 'info' },
    ],
  },
  security: {
    alarms: 342,
    resolved: 331,
    processing: 11,
    areas: [
      { zone: 't1', count: 2, kind: 'Passengers' },
      { zone: 't2', count: 4, kind: 'Passengers' },
      { zone: 't3', count: 1, kind: 'Passengers' },
      { zone: 'apron', count: 2, kind: 'Airside' },
      { zone: 'baggage', count: 1, kind: 'Staff' },
      { zone: 'gate', count: 1, kind: 'Airside' },
    ],
    attention: [
      { time: '10:42', tone: 'crit', title: 'Person in restricted area', place: 'Airside gate 4', zone: 'gate' },
      { time: '10:39', tone: 'warn', title: 'Tripwire crossed', place: 'Apron service road', zone: 'apron' },
      { time: '10:31', tone: 'warn', title: 'Queue over threshold', place: 'Terminal 2 security', zone: 't2' },
      { time: '10:12', tone: 'ok', title: 'Unattended bag cleared', place: 'Terminal 1, row C', zone: 't1' },
      { time: '09:58', tone: 'warn', title: 'Vehicle speeding airside', place: 'Apron', zone: 'apron' },
    ],
    incidents: [
      { zone: 'gate', title: 'Person in restricted area', tone: 'crit' },
      { zone: 'apron', title: 'Tripwire crossed', tone: 'warn' },
      { zone: 't2', title: 'Queue over threshold', tone: 'warn' },
      { zone: 'baggage', title: 'Belt jam', tone: 'warn' },
      { zone: 'tower', title: 'Control tower', tone: 'info' },
    ],
  },
  facility: {
    pending: 11,
    resolved: 640,
    processing: 9,
    orders: [
      { title: 'Baggage belt 7 jam', id: 'WO-AP-311', place: 'Baggage hall', age: '2 min ago', status: 'Processing' },
      { title: 'Jet bridge alignment fault', id: 'WO-AP-309', place: 'Terminal 3, gate C12', age: '11 min ago', status: 'Processing' },
      { title: 'Runway edge light out', id: 'WO-AP-305', place: 'Runway 2, light 44', age: '26 min ago', status: 'Pending' },
      { title: 'Travelator belt inspection', id: 'WO-AP-298', place: 'Terminal 2 transfer', age: '1 h ago', status: 'Resolved' },
    ],
    health: 97,
    status: [
      { name: 'WiFi', value: 95 },
      { name: 'Environmental', value: 97 },
      { name: 'CCTV', value: 99 },
    ],
    areas: [
      { zone: 'baggage', open: 2, tone: 'crit' },
      { zone: 't3', open: 1, tone: 'warn' },
      { zone: 'rw2', open: 1, tone: 'warn' },
      { zone: 't2', open: 1, tone: 'warn' },
      { zone: 'dome', open: 0, tone: 'info' },
    ],
  },
  room: ROOM,
  alerts: {
    site: 'Changi Airport',
    focus: [5555, 6, -1640],
    fence: [[5500, -1720], [5625, -1720], [5625, -1560], [5500, -1560]],
    line: [[5480, -1500], [5640, -1500]],
    items: [
      {
        id: 'a1', type: 'Geo-fencing', status: 'Alarm received', place: 'Airside gate 4 · Restricted area', when: '16 September · 10:42 AM',
        detected: 'Person entered a restricted geofenced area', confidence: 0.96,
        recommend: 'Verify entry, review footage, notify security if required',
        checklist: ['Check live camera feed', 'Confirm entry into the restricted area', 'Verify whether access is authorised', 'Dispatch on-site security if required'],
        shape: 'fence',
      },
      {
        id: 'a2', type: 'Line crossing', status: 'PIC dispatched', place: 'Apron service road', when: '16 September · 10:39 AM',
        detected: 'Person crossed a virtual line (A → B)', confidence: 0.95,
        recommend: 'Verify crossing, review footage, notify security if required',
        checklist: ['Check live camera feed', 'Confirm crossing direction', 'Verify whether the crossing is authorised', 'Dispatch on-site security if required'],
        shape: 'line',
      },
      {
        id: 'a3', type: 'Smoking', status: 'PIC dispatched', place: 'Rear stairwell', when: '16 September · 10:36 AM',
        detected: 'Smoking detected in a no-smoking zone', confidence: 0.91,
        recommend: 'Confirm on camera and send a duty officer',
        checklist: ['Check live camera feed', 'Confirm the location', 'Send a duty officer'],
        shape: 'fence',
      },
      {
        id: 'a4', type: 'Fall', status: 'PIC dispatched', place: 'Level 1 corridor', when: '16 September · 10:33 AM',
        detected: 'Person fell and has not stood up', confidence: 0.93,
        recommend: 'Send first aid and keep the camera on the person',
        checklist: ['Check live camera feed', 'Send first aid', 'Clear the corridor'],
        shape: 'line',
      },
      {
        id: 'a5', type: 'Fighting', status: 'PIC dispatched', place: 'Staff car park', when: '16 September · 10:30 AM',
        detected: 'Physical altercation between two people', confidence: 0.9,
        recommend: 'Send security and preserve the footage',
        checklist: ['Check live camera feed', 'Send security', 'Preserve the footage'],
        shape: 'fence',
      },
      {
        id: 'a6', type: 'Loitering', status: 'Alarm received', place: 'Side gate', when: '16 September · 10:27 AM',
        detected: 'Person stationary near a gate for over 5 minutes', confidence: 0.88,
        recommend: 'Watch live and challenge if it continues',
        checklist: ['Check live camera feed', 'Check access records', 'Challenge if it continues'],
        shape: 'line',
      },
      {
        id: 'a7', type: 'Crowding', status: 'PIC dispatched', place: 'Main hall', when: '16 September · 10:22 AM',
        detected: 'Density above the set threshold', confidence: 0.94,
        recommend: 'Open an extra lane and redirect the queue',
        checklist: ['Check live camera feed', 'Open an extra lane', 'Redirect the queue'],
        shape: 'fence',
      },
    ],
  },
};

export const OPS: Record<string, SiteOps> = { stadium, mbs, airport };
