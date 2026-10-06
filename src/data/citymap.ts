// City map: the menus opened from the toolbar while flying. Each menu has layers of clickable places,
// a side panel of figures, and optionally lines or volumes drawn into the 3D scene.
// Positions are stand-in city metres (x east, z south). Station and expressway names are real; every
// figure, arrival time, project and reading is invented demo data.
import type { IconName } from '../components/icons';
import type { Tone } from './ops';

export type MapMenuId = 'transport' | 'traffic' | 'development' | 'environment';

export interface MapPoint {
  id: string;
  name: string;
  /** [x, z] */
  at: [number, number];
  sub?: string;
  chip?: { tone: Tone; text: string };
  facts?: [string, string][];
  /** A share from 0 to 100, with what it measures. */
  meter?: { label: string; value: number };
  table?: { caption: string; head: string[]; rows: string[][] };
  note?: string;
  /** Development only: the planned volume drawn on the site, in metres. */
  site?: { w: number; d: number; h: number };
}

export interface MapLayer {
  id: string;
  name: string;
  icon: IconName;
  /** Categorical colour slot (--cat-1..4). The icon and the name carry the meaning too. */
  cat: 1 | 2 | 3 | 4;
  /** Shown when the menu opens. */
  on: boolean;
  points: MapPoint[];
}

export type MapBlock =
  | { kind: 'tiles'; items: { label: string; value: string; unit?: string; note?: string }[] }
  | { kind: 'lines'; title: string; labels: string[]; values: number[]; unit?: string }
  | { kind: 'columns'; title: string; labels: string[]; values: number[]; unit?: string }
  | { kind: 'rank'; title: string; rows: { name: string; value: number; show: string }[] }
  | { kind: 'stack'; title: string; parts: { name: string; pct: number }[] }
  | { kind: 'status'; title: string; rows: { name: string; detail?: string; tone: Tone; state: string }[] }
  | { kind: 'counts'; title: string; items: { label: string; value: number; tone: Tone }[] }
  | { kind: 'table'; title: string; head: string[]; rows: string[][] };

/** A line drawn over the city: an expressway or a rail corridor. */
export interface MapRoute {
  id: string;
  tone: Tone;
  path: [number, number][];
}

export interface MapMenu {
  id: MapMenuId;
  /** Toolbar label: one word. */
  label: string;
  title: string;
  lede: string;
  icon: IconName;
  /** Where the map opens: centre, camera distance in metres, and straight-down or tilted. */
  view: { x: number; z: number; dist: number; flat: boolean };
  layers: MapLayer[];
  blocks: MapBlock[];
  routes?: MapRoute[];
}

const HOURS = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'];

const trains = (rows: [string, string, string, string][]): MapPoint['table'] => ({ caption: 'Next trains', head: ['Line', 'Towards', 'Next', 'Then'], rows });
const buses = (rows: [string, string, string, string][]): MapPoint['table'] => ({ caption: 'Bus arrivals', head: ['Bus', 'Next', 'Then', 'Destination'], rows });
const LOW = { tone: 'ok' as Tone, text: 'Low crowd' };
const MID = { tone: 'warn' as Tone, text: 'Moderate crowd' };
const HIGH = { tone: 'crit' as Tone, text: 'Very crowded' };

const transport: MapMenu = {
  id: 'transport',
  label: 'Transport',
  title: 'Transport',
  lede: 'Stations, stops and stands around the bay. Click a marker for arrivals.',
  icon: 'train',
  view: { x: 620, z: -330, dist: 2700, flat: false },
  routes: [
    { id: 'rail-circle', tone: 'info', path: [[120, 560], [455, 120], [700, -560], [1250, -560], [2180, -560], [1850, -1300]] },
    { id: 'rail-downtown', tone: 'info', path: [[-600, -520], [-600, 150], [-430, 420], [120, 560], [1120, 360]] },
    { id: 'rail-east', tone: 'info', path: [[-600, -520], [-160, -600], [700, -560], [1850, -1300], [4350, -1450], [5310, -2050]] },
  ],
  layers: [
    {
      id: 'train',
      name: 'Train stations',
      icon: 'train',
      cat: 1,
      on: true,
      points: [
        { id: 'bayfront', name: 'Bayfront', at: [455, 120], sub: 'Circle Line · Downtown Line', chip: MID, table: trains([['Circle', 'HarbourFront', '2 min', '6 min'], ['Circle', 'Dhoby Ghaut', '3 min', '8 min'], ['Downtown', 'Expo', '1 min', '5 min'], ['Downtown', 'Bukit Panjang', '4 min', '9 min']]) },
        { id: 'marina-bay', name: 'Marina Bay', at: [120, 560], sub: 'North South · Circle · Thomson–East Coast', chip: LOW, table: trains([['North South', 'Jurong East', '3 min', '7 min'], ['Circle', 'Stadium', '5 min', '11 min'], ['Thomson', 'Woodlands North', '2 min', '8 min']]) },
        { id: 'promenade', name: 'Promenade', at: [700, -560], sub: 'Circle Line · Downtown Line', chip: MID, table: trains([['Circle', 'Marina Bay', '1 min', '6 min'], ['Circle', 'Dhoby Ghaut', '4 min', '9 min'], ['Downtown', 'Expo', '3 min', '7 min']]) },
        { id: 'esplanade', name: 'Esplanade', at: [-160, -600], sub: 'Circle Line', chip: LOW, table: trains([['Circle', 'HarbourFront', '4 min', '10 min'], ['Circle', 'Dhoby Ghaut', '2 min', '7 min']]) },
        { id: 'city-hall', name: 'City Hall', at: [-600, -520], sub: 'North South Line · East West Line', chip: HIGH, table: trains([['North South', 'Marina South Pier', '1 min', '4 min'], ['North South', 'Jurong East', '2 min', '5 min'], ['East West', 'Pasir Ris', '2 min', '6 min'], ['East West', 'Tuas Link', '3 min', '7 min']]) },
        { id: 'raffles-place', name: 'Raffles Place', at: [-600, 150], sub: 'North South Line · East West Line', chip: HIGH, table: trains([['North South', 'Jurong East', '1 min', '4 min'], ['East West', 'Pasir Ris', '3 min', '6 min'], ['East West', 'Tuas Link', '2 min', '5 min']]) },
        { id: 'downtown', name: 'Downtown', at: [-430, 420], sub: 'Downtown Line', chip: MID, table: trains([['Downtown', 'Expo', '2 min', '6 min'], ['Downtown', 'Bukit Panjang', '3 min', '8 min']]) },
        { id: 'nicoll', name: 'Nicoll Highway', at: [1250, -560], sub: 'Circle Line', chip: LOW, table: trains([['Circle', 'HarbourFront', '3 min', '9 min'], ['Circle', 'Dhoby Ghaut', '5 min', '11 min']]) },
        { id: 'stadium-stn', name: 'Stadium', at: [2180, -560], sub: 'Circle Line', chip: MID, note: 'Event at the National Stadium tonight: extra trains from 21:30.', table: trains([['Circle', 'HarbourFront', '2 min', '5 min'], ['Circle', 'Dhoby Ghaut', '2 min', '6 min']]) },
        { id: 'kallang', name: 'Kallang', at: [1850, -1300], sub: 'East West Line', chip: LOW, table: trains([['East West', 'Pasir Ris', '4 min', '9 min'], ['East West', 'Tuas Link', '1 min', '6 min']]) },
        { id: 'gardens', name: 'Gardens by the Bay', at: [1120, 360], sub: 'Thomson–East Coast Line', chip: LOW, table: trains([['Thomson', 'Woodlands North', '3 min', '9 min'], ['Thomson', 'Bayshore', '6 min', '12 min']]) },
        { id: 'expo', name: 'Expo', at: [4350, -1450], sub: 'East West Line · Downtown Line', chip: LOW, table: trains([['East West', 'Changi Airport', '3 min', '10 min'], ['Downtown', 'Bukit Panjang', '5 min', '11 min']]) },
        { id: 'airport-stn', name: 'Changi Airport', at: [5310, -2050], sub: 'East West Line', chip: MID, table: trains([['East West', 'Tanah Merah', '4 min', '11 min']]) },
      ],
    },
    {
      id: 'bus',
      name: 'Bus stops',
      icon: 'bus',
      cat: 2,
      on: true,
      points: [
        { id: 'bus-mbs', name: 'Opp Marina Bay Sands', at: [385, -70], sub: 'Stop 03501', table: buses([['97', '1 min', '9 min', 'Jurong East Int'], ['106', '3 min', '14 min', 'Bukit Batok Int'], ['133', '4 min', '12 min', 'Ang Mo Kio Int'], ['502', '8 min', '21 min', 'Jurong West'], ['518', 'Arr', '15 min', 'Pasir Ris']]) },
        { id: 'bus-bayfront', name: 'Bayfront Ave', at: [640, 300], sub: 'Stop 03509', table: buses([['97', '2 min', '11 min', 'Marina Centre'], ['106', '5 min', '16 min', 'Marina Centre'], ['400', '7 min', '27 min', 'Marina Barrage']]) },
        { id: 'bus-raffles-blvd', name: 'Raffles Blvd', at: [300, -640], sub: 'Stop 02151', table: buses([['36', '1 min', '7 min', 'Changi Airport'], ['56', '3 min', '13 min', 'Bishan Int'], ['111', '6 min', '15 min', 'Ghim Moh'], ['857', 'Arr', '9 min', 'Yishun Int']]) },
        { id: 'bus-temasek', name: 'Temasek Ave', at: [1010, -700], sub: 'Stop 02171', table: buses([['36', '4 min', '12 min', 'Tomlinson Rd'], ['70M', '6 min', '18 min', 'Yio Chu Kang'], ['133', '2 min', '10 min', 'Shenton Way']]) },
        { id: 'bus-stadium', name: 'Stadium Blvd', at: [2450, -480], sub: 'Stop 80199', table: buses([['11', '3 min', '17 min', 'Lor 1 Geylang'], ['10', '5 min', '13 min', 'Kent Ridge'], ['16', '9 min', '22 min', 'Bukit Merah Int']]) },
        { id: 'bus-kallang', name: 'Kallang Rd', at: [1420, -1250], sub: 'Stop 01311', table: buses([['2', '1 min', '8 min', 'Changi Village'], ['12', '4 min', '11 min', 'Pasir Ris'], ['33', '6 min', '15 min', 'Bedok Int'], ['130', '2 min', '12 min', 'Ang Mo Kio Int']]) },
        { id: 'bus-shenton', name: 'Shenton Way', at: [-520, 620], sub: 'Stop 03217', table: buses([['10', '2 min', '9 min', 'Tampines Int'], ['57', '3 min', '10 min', 'Bishan Int'], ['131', '7 min', '19 min', 'Bukit Merah Int'], ['970', '5 min', '14 min', 'Bukit Panjang']]) },
        { id: 'bus-collyer', name: 'Collyer Quay', at: [-420, -20], sub: 'Stop 03019', table: buses([['10', '4 min', '11 min', 'Kent Ridge'], ['70', '2 min', '15 min', 'Yio Chu Kang'], ['196', '6 min', '13 min', 'Clementi Int']]) },
        { id: 'bus-gardens', name: 'Marina Gardens Dr', at: [1250, 120], sub: 'Stop 03371', table: buses([['400', '5 min', '25 min', 'Shenton Way'], ['106', '9 min', '20 min', 'Bukit Batok Int']]) },
      ],
    },
    {
      id: 'taxi',
      name: 'Taxi stands',
      icon: 'taxi',
      cat: 3,
      on: false,
      points: [
        { id: 'taxi-mbs', name: 'Hotel driveway, Marina Bay Sands', at: [520, 210], facts: [['Owner', 'Private taxi stand'], ['Taxis waiting', '14'], ['Typical wait', '2 min']] },
        { id: 'taxi-raffles', name: 'Raffles Place', at: [-710, 60], facts: [['Owner', 'Public taxi stand'], ['Taxis waiting', '6'], ['Typical wait', '5 min']] },
        { id: 'taxi-esplanade', name: 'Esplanade driveway', at: [-80, -710], facts: [['Owner', 'Private taxi stand'], ['Taxis waiting', '3'], ['Typical wait', '7 min']] },
        { id: 'taxi-gardens', name: 'Gardens, main entrance', at: [900, 340], facts: [['Owner', 'Private taxi stand'], ['Taxis waiting', '9'], ['Typical wait', '3 min']] },
        { id: 'taxi-stadium', name: 'Stadium drop-off', at: [2420, -930], facts: [['Owner', 'Public taxi stand'], ['Taxis waiting', '0'], ['Typical wait', '12 min']], chip: { tone: 'warn', text: 'Long wait' } },
        { id: 'taxi-airport', name: 'Airport, Terminal 2', at: [5390, -2180], facts: [['Owner', 'Airport taxi stand'], ['Taxis waiting', '42'], ['Typical wait', '1 min']] },
      ],
    },
    {
      id: 'bike',
      name: 'Bicycle parking',
      icon: 'bike',
      cat: 4,
      on: false,
      points: [
        { id: 'bike-barrage', name: 'Marina Barrage', at: [1650, 480], facts: [['Racks', '120'], ['Free now', '74']], meter: { label: 'Racks in use', value: 38 } },
        { id: 'bike-promenade', name: 'Promenade park connector', at: [560, -500], facts: [['Racks', '60'], ['Free now', '11']], meter: { label: 'Racks in use', value: 82 } },
        { id: 'bike-stadium', name: 'Stadium riverside', at: [2050, -1010], facts: [['Racks', '200'], ['Free now', '128']], meter: { label: 'Racks in use', value: 36 } },
        { id: 'bike-downtown', name: 'Downtown park', at: [-250, 760], facts: [['Racks', '48'], ['Free now', '5']], meter: { label: 'Racks in use', value: 90 } },
        { id: 'bike-eastcoast', name: 'East Coast Park', at: [3300, -60], facts: [['Racks', '160'], ['Free now', '97']], meter: { label: 'Racks in use', value: 39 } },
      ],
    },
  ],
  blocks: [
    {
      kind: 'tiles',
      items: [
        { label: 'Trains in service', value: '1,023' },
        { label: 'Buses in service', value: '5,746' },
        { label: 'Rail trips a day', value: '3.5', unit: 'M' },
        { label: 'Bus trips a day', value: '4.0', unit: 'M' },
      ],
    },
    {
      kind: 'status',
      title: 'Train line status',
      rows: [
        { name: 'North South Line', tone: 'ok', state: 'Normal' },
        { name: 'East West Line', tone: 'ok', state: 'Normal' },
        { name: 'Circle Line', detail: 'Promenade to Stadium, +6 min', tone: 'warn', state: 'Minor delay' },
        { name: 'Downtown Line', tone: 'ok', state: 'Normal' },
        { name: 'North East Line', tone: 'ok', state: 'Normal' },
        { name: 'Thomson–East Coast Line', tone: 'ok', state: 'Normal' },
      ],
    },
    { kind: 'lines', title: 'Rail trips by hour, thousand', labels: HOURS, values: [96, 248, 362, 301, 188, 164, 176, 181, 169, 174, 212, 318, 371, 296, 214, 168, 131, 84], unit: 'K' },
    {
      kind: 'rank',
      title: 'Busiest interchanges, taps a day',
      rows: [
        { name: 'City Hall', value: 148, show: '148 K' },
        { name: 'Raffles Place', value: 136, show: '136 K' },
        { name: 'Bayfront', value: 92, show: '92 K' },
        { name: 'Promenade', value: 71, show: '71 K' },
        { name: 'Marina Bay', value: 58, show: '58 K' },
      ],
    },
  ],
};

const works = (id: string, name: string, at: [number, number], road: string, until: string): MapPoint => ({
  id,
  name,
  at,
  sub: road,
  chip: { tone: 'warn', text: 'Lane closed' },
  facts: [['Type', 'Road works'], ['Until', until], ['Advice', 'Keep left, expect a short delay']],
});
const carPark = (id: string, name: string, at: [number, number], lots: number, free: number): MapPoint => ({
  id,
  name,
  at,
  facts: [['Car lots', lots.toLocaleString('en')], ['Free now', free.toLocaleString('en')]],
  meter: { label: 'Lots in use', value: Math.round((1 - free / lots) * 100) },
});

const traffic: MapMenu = {
  id: 'traffic',
  label: 'Traffic',
  title: 'Traffic and parking',
  lede: 'Expressway flow, road alerts and free parking. Lines on the map show how each expressway is moving.',
  icon: 'road',
  view: { x: 1200, z: -1700, dist: 4800, flat: true },
  routes: [
    { id: 'ECP', tone: 'ok', path: [[-300, 760], [600, 700], [1800, 430], [2520, 60], [3200, -80], [4400, -600], [5100, -1150], [5300, -1750]] },
    { id: 'PIE', tone: 'warn', path: [[-3800, -2600], [-2000, -2900], [0, -3100], [2000, -3000], [4000, -2700], [5000, -2500]] },
    { id: 'CTE', tone: 'crit', path: [[-1100, -5000], [-1000, -3000], [-900, -1500], [-820, -300], [-640, 520]] },
    { id: 'AYE', tone: 'ok', path: [[-640, 520], [-1800, 740], [-3000, 1020], [-3900, 1300]] },
    { id: 'KPE', tone: 'ok', path: [[2900, 40], [3000, -1500], [3100, -3000], [3200, -4800]] },
    { id: 'TPE', tone: 'ok', path: [[3200, -4800], [4500, -4200], [5600, -3500], [5000, -2500]] },
    { id: 'SLE', tone: 'ok', path: [[-1050, -4700], [1000, -4900], [3200, -4800]] },
    { id: 'BKE', tone: 'ok', path: [[-3000, -5200], [-2800, -3800], [-2400, -2860]] },
    { id: 'KJE', tone: 'ok', path: [[-3900, -4200], [-2800, -3800]] },
  ],
  layers: [
    {
      id: 'heavy',
      name: 'Heavy traffic',
      icon: 'alert',
      cat: 4,
      on: true,
      points: [
        { id: 'heavy-cte', name: 'CTE towards the city', at: [-940, -2100], sub: 'After Braddell Rd exit', chip: { tone: 'crit', text: 'Heavy traffic' }, facts: [['Speed', '18 km/h'], ['Queue', '2.4 km'], ['Reported', '13:02'], ['Advice', 'Avoid lane 1. Use PIE or Thomson Rd']] },
        { id: 'slow-pie', name: 'PIE towards Changi', at: [1100, -3060], sub: 'Before Kallang Way exit', chip: { tone: 'warn', text: 'Slow traffic' }, facts: [['Speed', '41 km/h'], ['Queue', '900 m'], ['Reported', '13:10']] },
      ],
    },
    {
      id: 'works',
      name: 'Road works',
      icon: 'cone',
      cat: 2,
      on: true,
      points: [
        works('works-1', 'ECP, lane 3', [2520, 60], 'East Coast Parkway towards Changi', '15 Oct, 17:00'),
        works('works-2', 'CTE, lane 1', [-880, -1100], 'Central Expressway towards SLE', '15 Oct, 13:00'),
        works('works-3', 'PIE, shoulder', [-2900, -2760], 'Pan Island Expressway towards Tuas', '16 Oct, 05:00'),
        works('works-4', 'KPE tunnel, lane 2', [3040, -2200], 'Kallang–Paya Lebar Expressway', '15 Oct, 23:00'),
        works('works-5', 'TPE, lane 1', [5100, -3840], 'Tampines Expressway towards PIE', '17 Oct, 05:00'),
        works('works-6', 'AYE, lane 4', [-2400, 880], 'Ayer Rajah Expressway towards the city', '15 Oct, 16:00'),
        works('works-7', 'Nicoll Highway', [1150, -760], 'Towards the city, near the stadium', '15 Oct, 15:00'),
      ],
    },
    {
      id: 'gate',
      name: 'Checkpoints',
      icon: 'gate',
      cat: 1,
      on: true,
      points: [
        { id: 'gate-tuas', name: 'Tuas Checkpoint', at: [-3820, 1260], sub: 'Second Link', chip: { tone: 'ok', text: 'Smooth' }, facts: [['Cars, departing', '15 min'], ['Cars, arriving', '20 min'], ['Lorries', '35 min']] },
        { id: 'gate-woodlands', name: 'Woodlands Checkpoint', at: [-1090, -4900], sub: 'Causeway', chip: { tone: 'warn', text: 'Busy' }, facts: [['Cars, departing', '45 min'], ['Cars, arriving', '30 min'], ['Lorries', '60 min']] },
      ],
    },
    {
      id: 'park',
      name: 'Car parks',
      icon: 'parking',
      cat: 3,
      on: false,
      points: [
        carPark('park-marina', 'Marina Bay Sands car park', [600, 80], 2360, 612),
        carPark('park-raffles', 'Raffles Place basement', [-640, 240], 540, 38),
        carPark('park-esplanade', 'Esplanade car park', [-140, -760], 820, 264),
        carPark('park-stadium', 'Stadium car park', [2140, -1020], 1280, 870),
        carPark('park-gardens', 'Gardens car park', [1010, 420], 760, 301),
      ],
    },
  ],
  blocks: [
    {
      kind: 'counts',
      title: 'Road alerts',
      items: [
        { label: 'Heavy traffic', value: 1, tone: 'crit' },
        { label: 'Accident', value: 0, tone: 'crit' },
        { label: 'Breakdown', value: 0, tone: 'warn' },
        { label: 'Obstacle', value: 0, tone: 'warn' },
        { label: 'Road works', value: 49, tone: 'warn' },
        { label: 'Road block', value: 0, tone: 'warn' },
        { label: 'Diversion', value: 0, tone: 'info' },
        { label: 'Weather', value: 0, tone: 'info' },
      ],
    },
    {
      kind: 'status',
      title: 'Expressway speed',
      rows: [
        { name: 'KPE', detail: '82 km/h', tone: 'ok', state: 'Flowing' },
        { name: 'CTE', detail: '24 km/h', tone: 'crit', state: 'Heavy' },
        { name: 'AYE', detail: '78 km/h', tone: 'ok', state: 'Flowing' },
        { name: 'PIE', detail: '46 km/h', tone: 'warn', state: 'Slow' },
        { name: 'SLE', detail: '84 km/h', tone: 'ok', state: 'Flowing' },
        { name: 'TPE', detail: '80 km/h', tone: 'ok', state: 'Flowing' },
        { name: 'KJE', detail: '86 km/h', tone: 'ok', state: 'Flowing' },
        { name: 'BKE', detail: '79 km/h', tone: 'ok', state: 'Flowing' },
        { name: 'ECP', detail: '74 km/h', tone: 'ok', state: 'Flowing' },
      ],
    },
    {
      kind: 'table',
      title: 'Available parking',
      head: ['Area', 'Cars', 'Motorcycles', 'Heavy'],
      rows: [
        ['HDB estates', '401,034', '3,484', '9,807'],
        ['Marina', '3,541', '0', '0'],
        ['Orchard', '1,882', '0', '0'],
        ['HarbourFront', '4,543', '0', '0'],
      ],
    },
  ],
};

const project = (id: string, name: string, at: [number, number], site: MapPoint['site'], type: string, stage: string, progress: number, target: string, value: string, tone: Tone = 'info'): MapPoint => ({
  id,
  name,
  at,
  site,
  sub: type,
  chip: { tone, text: stage },
  facts: [['Target', target], ['Value', value]],
  meter: progress > 0 ? { label: 'Construction progress', value: progress } : undefined,
});

const development: MapMenu = {
  id: 'development',
  label: 'Development',
  title: 'Development',
  lede: 'Projects under way and planned. The outlined volumes show roughly what will stand on each site.',
  icon: 'crane',
  view: { x: 1000, z: -420, dist: 3400, flat: false },
  layers: [
    {
      id: 'building',
      name: 'Under construction',
      icon: 'crane',
      cat: 2,
      on: true,
      points: [
        project('dev-marina-south', 'Marina South residential precinct', [250, 990], { w: 300, d: 200, h: 150 }, 'Housing and shops', 'Construction', 38, '2029', 'S$ 4.2 B', 'warn'),
        project('dev-kallang', 'Kallang sports precinct', [2740, -1150], { w: 240, d: 180, h: 55 }, 'Sports and community', 'Construction', 62, '2027', 'S$ 1.1 B', 'warn'),
        project('dev-changi-east', 'Changi East terminal', [6420, -1320], { w: 420, d: 300, h: 45 }, 'Airport', 'Construction', 21, '2034', 'S$ 13.0 B', 'warn'),
        project('dev-interchange', 'Cross-island rail interchange', [-950, -2450], { w: 180, d: 130, h: 36 }, 'Rail', 'Construction', 47, '2030', 'S$ 2.6 B', 'warn'),
        project('dev-tower', 'Downtown office tower', [-880, 560], { w: 70, d: 70, h: 305 }, 'Offices', 'Fit-out', 81, '2026', 'S$ 0.9 B', 'warn'),
      ],
    },
    {
      id: 'planned',
      name: 'Planned',
      icon: 'plan',
      cat: 1,
      on: true,
      points: [
        project('dev-waterfront', 'Southern waterfront district', [-1780, 1760], { w: 640, d: 360, h: 90 }, 'Mixed use, on the port site', 'Planning', 0, 'From 2030', 'To be set'),
        project('dev-east-coast', 'East Coast housing estate', [3450, -950], { w: 300, d: 260, h: 120 }, 'Public housing', 'Tender', 0, '2031', 'S$ 3.4 B'),
        project('dev-north', 'Northern innovation district', [1250, -3650], { w: 340, d: 240, h: 80 }, 'Business park', 'Planning', 0, '2032', 'S$ 5.8 B'),
      ],
    },
    {
      id: 'done',
      name: 'Completed this year',
      icon: 'done',
      cat: 3,
      on: false,
      points: [
        { id: 'dev-done-park', name: 'Kallang riverside park', at: [1300, -1520], sub: 'Parks', chip: { tone: 'ok', text: 'Open' }, facts: [['Opened', 'March'], ['Area', '6.2 ha']] },
        { id: 'dev-done-hub', name: 'Bayfront community hub', at: [820, 520], sub: 'Community', chip: { tone: 'ok', text: 'Open' }, facts: [['Opened', 'June'], ['Floor area', '18,000 m²']] },
        { id: 'dev-done-flats', name: 'Stadium View flats', at: [2900, -420], sub: 'Public housing', chip: { tone: 'ok', text: 'Handed over' }, facts: [['Handed over', 'August'], ['Homes', '1,240']] },
      ],
    },
  ],
  blocks: [
    {
      kind: 'tiles',
      items: [
        { label: 'Active projects', value: '126' },
        { label: 'Under construction', value: '58' },
        { label: 'Pipeline value', value: '84.6', unit: 'S$ B' },
        { label: 'Completed this year', value: '31' },
      ],
    },
    {
      kind: 'rank',
      title: 'Projects by stage',
      rows: [
        { name: 'Construction', value: 58, show: '58' },
        { name: 'Planning', value: 34, show: '34' },
        { name: 'Tender', value: 21, show: '21' },
        { name: 'Fit-out', value: 13, show: '13' },
      ],
    },
    { kind: 'columns', title: 'Homes completed a year, thousand', labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'], values: [19.4, 12.1, 14.6, 20.2, 22.9, 21.3, 24.8], unit: 'K' },
    {
      kind: 'rank',
      title: 'Land use, share of area',
      rows: [
        { name: 'Housing', value: 15, show: '15%' },
        { name: 'Industry and commerce', value: 17, show: '17%' },
        { name: 'Parks and nature', value: 9, show: '9%' },
        { name: 'Transport', value: 12, show: '12%' },
        { name: 'Defence', value: 18, show: '18%' },
        { name: 'Water, utilities, other', value: 29, show: '29%' },
      ],
    },
  ],
};

const air = (id: string, name: string, at: [number, number], psi: number, pm25: number, pm10: number): MapPoint => ({
  id,
  name,
  at,
  sub: 'Air quality station',
  chip: psi <= 50 ? { tone: 'ok', text: `PSI ${psi} · Good` } : { tone: 'warn', text: `PSI ${psi} · Moderate` },
  facts: [['PM2.5', `${pm25} µg/m³`], ['PM10', `${pm10} µg/m³`], ['Updated', '13:00']],
});
const weather = (id: string, name: string, at: [number, number], temp: number, humidity: number, wind: string, rain: string): MapPoint => ({
  id,
  name,
  at,
  sub: 'Weather station',
  facts: [['Temperature', `${temp.toFixed(1)} °C`], ['Humidity', `${humidity}%`], ['Wind', wind], ['Rain, last hour', rain]],
});

const environment: MapMenu = {
  id: 'environment',
  label: 'Environment',
  title: 'Environment and utilities',
  lede: 'Air, weather, energy and water across the city. Click a marker for its latest reading.',
  icon: 'leaf',
  view: { x: 900, z: -900, dist: 3600, flat: false },
  layers: [
    {
      id: 'air',
      name: 'Air quality',
      icon: 'wind',
      cat: 1,
      on: true,
      points: [
        air('air-central', 'Central', [-300, -900], 49, 11, 24),
        air('air-east', 'East', [4200, -1900], 54, 14, 29),
        air('air-north', 'North', [600, -4200], 46, 10, 22),
        air('air-west', 'West', [-3300, -1800], 58, 16, 33),
        air('air-south', 'South', [-900, 1100], 51, 13, 27),
      ],
    },
    {
      id: 'weather',
      name: 'Weather',
      icon: 'cloud',
      cat: 3,
      on: true,
      points: [
        weather('wx-barrage', 'Marina Barrage', [1750, 560], 31.2, 74, '12 km/h, north-east', '0.0 mm'),
        weather('wx-changi', 'Changi', [5650, -2700], 30.6, 78, '18 km/h, north-east', '0.2 mm'),
        weather('wx-kallang', 'Kallang', [1950, -1560], 31.5, 72, '9 km/h, east', '0.0 mm'),
        weather('wx-newton', 'Newton', [-1300, -2300], 30.9, 76, '7 km/h, north', '1.4 mm'),
      ],
    },
    {
      id: 'energy',
      name: 'Energy',
      icon: 'bolt',
      cat: 2,
      on: false,
      points: [
        { id: 'en-cooling', name: 'Marina district cooling plant', at: [310, 330], sub: 'Chilled water for 23 buildings', facts: [['Capacity', '60,000 RT'], ['Supply temperature', '4.5 °C']], meter: { label: 'Load', value: 71 } },
        { id: 'en-solar', name: 'Rooftop solar cluster', at: [3000, -1700], sub: '412 rooftops', facts: [['Output now', '12.4 MW'], ['Peak capacity', '18 MW']], meter: { label: 'Of peak capacity', value: 69 } },
        { id: 'en-west', name: 'West power station', at: [-3500, 620], sub: 'Combined-cycle gas', chip: { tone: 'ok', text: 'On line' }, facts: [['Output now', '1,180 MW'], ['Capacity', '1,500 MW']], meter: { label: 'Of capacity', value: 79 } },
        { id: 'en-waste', name: 'Waste-to-energy plant', at: [-2900, -900], sub: 'Incineration with power recovery', chip: { tone: 'ok', text: 'On line' }, facts: [['Waste today', '2,650 t'], ['Output now', '74 MW']] },
      ],
    },
    {
      id: 'water',
      name: 'Water',
      icon: 'drop',
      cat: 4,
      on: false,
      points: [
        { id: 'wa-marina', name: 'Marina Reservoir', at: [0, 0], sub: 'Reservoir', chip: { tone: 'ok', text: 'Normal level' }, facts: [['Catchment', '10,000 ha'], ['Barrage gates', 'Closed']], meter: { label: 'Storage', value: 92 } },
        { id: 'wa-kallang', name: 'Kallang Basin', at: [1700, -700], sub: 'Part of Marina Reservoir', chip: { tone: 'ok', text: 'Normal level' }, facts: [['Water quality', 'Good for rowing']], meter: { label: 'Storage', value: 90 } },
        { id: 'wa-reclaim', name: 'East water reclamation plant', at: [4700, -900], sub: 'Used water treatment', chip: { tone: 'ok', text: 'Running' }, facts: [['Treated today', '412,000 m³']], meter: { label: 'Of capacity', value: 64 } },
      ],
    },
  ],
  blocks: [
    {
      kind: 'tiles',
      items: [
        { label: 'Air quality', value: '49', unit: 'PSI', note: 'Good' },
        { label: 'Temperature', value: '31.2', unit: '°C' },
        { label: 'Humidity', value: '74', unit: '%' },
        { label: 'Water use', value: '141', unit: 'L', note: 'Per person a day' },
      ],
    },
    { kind: 'lines', title: 'Electricity demand today, GW', labels: ['00', '02', '04', '06', '08', '10', '12', '14', '16', '18', '20', '22'], values: [5.6, 5.3, 5.2, 5.6, 6.5, 7.1, 7.3, 7.5, 7.4, 7.2, 6.9, 6.2], unit: ' GW' },
    {
      kind: 'stack',
      title: 'Electricity by source',
      parts: [
        { name: 'Natural gas', pct: 94 },
        { name: 'Solar', pct: 3 },
        { name: 'Waste and biomass', pct: 2 },
        { name: 'Other', pct: 1 },
      ],
    },
    {
      kind: 'rank',
      title: 'Electricity use by district, GWh a month',
      rows: [
        { name: 'Industrial west', value: 1420, show: '1,420' },
        { name: 'Downtown', value: 610, show: '610' },
        { name: 'East, with the airport', value: 480, show: '480' },
        { name: 'Marina Bay', value: 310, show: '310' },
        { name: 'Kallang', value: 190, show: '190' },
      ],
    },
  ],
};

export const MAP_MENUS: MapMenu[] = [transport, traffic, development, environment];
/** How far the map may be panned, in stand-in metres, and the camera distance limits. */
export const MAP_LIMITS = { x: [-3700, 7600] as const, z: [-4900, 2100] as const, dist: [500, 5200] as const };
