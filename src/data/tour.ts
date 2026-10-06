// City statistics shown before the flight starts: one chapter per theme, each over its own view of the city.
// Figures follow Vizzio's Singapore showcase video with units corrected; they are demo data, not checked
// against official sources.
import type { V3 } from './ops';

export interface TourChange {
  /** Signed percentage as shown, for example "+2.01%". */
  value: string;
  period: 'annual' | 'quarterly';
  /** Whether the change is good news. Decides the status colour; the text always carries the sign. */
  good: boolean;
}

export interface TourStat {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  change?: TourChange;
}

export type TourBlock =
  /** One figure fills its column as a headline; two share it, one above the other. */
  | { kind: 'stats'; items: TourStat[] }
  | { kind: 'lines'; title: string; labels: string[]; values: number[]; unit?: string }
  | { kind: 'columns'; title: string; labels: string[]; values: number[]; unit?: string }
  | { kind: 'stack'; title: string; parts: { name: string; pct: number }[] }
  /** Ranked horizontal bars. `show` is the text printed for the value. */
  | { kind: 'rank'; title: string; rows: { name: string; value: number; show: string }[] };

export interface TourChapter {
  id: string;
  /** Tab label. */
  name: string;
  /** Seconds before the tour moves on by itself. */
  seconds: number;
  /** Camera: starts at `angle` around `target` and drifts at `spin` radians per second. */
  shot: { target: V3; radius: number; height: number; angle: number; spin: number };
  /** One block per column of the band, left to right. Three to five keeps the columns readable. */
  blocks: TourBlock[];
}

const YEARS = ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];

export const TOUR: TourChapter[] = [
  {
    id: 'welcome',
    name: 'Welcome',
    seconds: 7,
    shot: { target: [1700, 0, -600], radius: 2500, height: 3000, angle: 1.9, spin: 0.012 },
    blocks: [
      { kind: 'stats', items: [{ label: 'Typical daily range', value: '25–33', unit: '°C', note: 'Tropical, humid all year' }] },
      { kind: 'stats', items: [{ label: 'Total land area', value: '735.6', unit: 'km²' }] },
      { kind: 'stats', items: [{ label: 'Population', value: '6.04', unit: 'M' }] },
      { kind: 'stats', items: [{ label: 'GDP (2022)', value: '466.79', unit: 'US$ B' }] },
      { kind: 'stats', items: [{ label: 'Tourist arrivals (2022)', value: '6.31', unit: 'M' }] },
    ],
  },
  {
    id: 'population',
    name: 'Population',
    seconds: 11,
    shot: { target: [480, 60, -40], radius: 1500, height: 900, angle: 2.5, spin: 0.02 },
    blocks: [
      { kind: 'lines', title: 'Population trend, million', labels: YEARS, values: [5.61, 5.61, 5.64, 5.7, 5.69, 5.45, 5.64, 5.92, 6.04], unit: 'M' },
      {
        kind: 'stats',
        items: [
          { label: 'Total population', value: '6,036,860', change: { value: '+2.01%', period: 'annual', good: true } },
          { label: 'Singapore citizens', value: '3,635,973', change: { value: '+0.70%', period: 'annual', good: true } },
        ],
      },
      {
        kind: 'stats',
        items: [
          { label: 'Permanent residents', value: '544,931', change: { value: '+1.18%', period: 'annual', good: true } },
          { label: 'Fertility rate', value: '1.05', change: { value: '−2%', period: 'annual', good: false } },
        ],
      },
      {
        kind: 'stats',
        items: [
          { label: 'Population density', value: '8,207', unit: 'per km²', note: 'On 735.6 km² of land' },
          { label: 'Life expectancy', value: '83', unit: 'years' },
        ],
      },
    ],
  },
  {
    id: 'business',
    name: 'Business',
    seconds: 11,
    shot: { target: [2330, 30, -760], radius: 640, height: 300, angle: 1.15, spin: 0.03 },
    blocks: [
      {
        kind: 'rank',
        title: 'Top sector contribution to GDP, Q2 2024',
        rows: [
          { name: 'Financial and logistics', value: 1468, show: 'S$1.468T' },
          { name: 'Technology and innovation', value: 775.6, show: 'S$775.6B' },
          { name: 'Others', value: 526.3, show: 'S$526.3B' },
        ],
      },
      { kind: 'stats', items: [{ label: 'Startup growth', value: '3,800', note: 'Startups this quarter, Q2 2024', change: { value: '+5%', period: 'quarterly', good: true } }] },
      { kind: 'stats', items: [{ label: 'Job creation', value: '2,500', note: 'New jobs in green energy and AI', change: { value: '+2.5%', period: 'quarterly', good: true } }] },
      { kind: 'lines', title: 'SGD in US dollars', labels: ['2019', '2020', '2021', '2022', '2023', '2024'], values: [0.73, 0.72, 0.74, 0.73, 0.75, 0.74] },
    ],
  },
  {
    id: 'investment',
    name: 'Investment',
    seconds: 11,
    shot: { target: [5440, 20, -2050], radius: 980, height: 430, angle: 2.7, spin: 0.02 },
    blocks: [
      { kind: 'stats', items: [{ label: 'Foreign direct investment', value: '2.77', unit: 'S$ T', note: 'Total investment, Q2 2024' }] },
      {
        kind: 'stack',
        title: 'Key investment sectors',
        parts: [
          { name: 'Financial services', pct: 35 },
          { name: 'Technology and innovation', pct: 28 },
          { name: 'Other', pct: 19 },
          { name: 'Logistics and trade', pct: 18 },
        ],
      },
      {
        kind: 'rank',
        title: 'Top 5 source economies 2023, S$ billion',
        rows: [
          { name: 'United States', value: 716, show: '716' },
          { name: 'Cayman Islands', value: 311, show: '311' },
          { name: 'British Virgin Islands', value: 186, show: '186' },
          { name: 'Japan', value: 182, show: '182' },
          { name: 'United Kingdom', value: 159, show: '159' },
        ],
      },
    ],
  },
  {
    id: 'environment',
    name: 'Environment',
    seconds: 11,
    shot: { target: [950, 30, 160], radius: 620, height: 260, angle: 0.5, spin: 0.03 },
    blocks: [
      { kind: 'lines', title: 'Renewable share of energy, %', labels: ['2020', '2021', '2022', '2023', '2024'], values: [3.2, 3.8, 4.4, 5, 5.5], unit: '%' },
      { kind: 'stats', items: [{ label: 'Air quality index', value: '49', note: 'Moderate, Q2 2024', change: { value: '−3.2%', period: 'quarterly', good: true } }] },
      { kind: 'stats', items: [{ label: 'Green space', value: '61', unit: 'm² per capita', note: 'Q2 2024', change: { value: '+3.2%', period: 'quarterly', good: true } }] },
      {
        kind: 'rank',
        title: 'Renewable energy contributions, MW',
        rows: [
          { name: 'Tuas Mega Solar Park', value: 500, show: '500 · 2.5%' },
          { name: 'Other projects', value: 240, show: '240 · 1.2%' },
          { name: 'Pulau Ubin Solar Project', value: 200, show: '200 · 1.0%' },
          { name: 'Jurong Rooftop Solar', value: 160, show: '160 · 0.8%' },
        ],
      },
    ],
  },
  {
    id: 'transport',
    name: 'Transport',
    seconds: 11,
    shot: { target: [562, 125, 0], radius: 640, height: 70, angle: 3.3, spin: 0.02 },
    blocks: [
      { kind: 'stats', items: [{ label: 'MRT network', value: '231', unit: 'km', note: 'Total network, Q2 2024', change: { value: '+2.6%', period: 'quarterly', good: true } }] },
      {
        kind: 'rank',
        title: 'Daily passengers, Q2 2024',
        rows: [
          { name: 'Bus', value: 4, show: '4.0 M' },
          { name: 'MRT', value: 3.5, show: '3.5 M' },
        ],
      },
      {
        kind: 'rank',
        title: 'Infrastructure spend by type, S$ billion',
        rows: [
          { name: 'Bridges', value: 5.8, show: '5.8' },
          { name: 'Transport', value: 4.6, show: '4.6' },
          { name: 'Tunnels', value: 3.9, show: '3.9' },
          { name: 'Roads', value: 2.4, show: '2.4' },
          { name: 'Urban development', value: 2.3, show: '2.3' },
        ],
      },
      { kind: 'stats', items: [{ label: 'Infrastructure spend', value: '22', unit: 'S$ B', note: 'Total, Q3 2024', change: { value: '+2.5%', period: 'quarterly', good: true } }] },
    ],
  },
  {
    id: 'economy',
    name: 'Economy',
    seconds: 11,
    shot: { target: [-700, 0, -1100], radius: 520, height: 1150, angle: 1, spin: 0.02 },
    blocks: [
      { kind: 'stats', items: [{ label: 'GDP, Q3 2024', value: '140,279.4', unit: 'S$ M', change: { value: '+5.4%', period: 'quarterly', good: true } }] },
      { kind: 'columns', title: 'GDP by quarter, S$ billion', labels: ['Q2 23', 'Q3 23', 'Q4 23', 'Q1 24', 'Q2 24', 'Q3 24'], values: [124.8, 128.1, 131.9, 133.4, 136.2, 140.3] },
      {
        kind: 'rank',
        title: 'Productivity growth by sector, %',
        rows: [
          { name: 'Finance', value: 4.1, show: '4.1' },
          { name: 'Technology', value: 3.8, show: '3.8' },
          { name: 'Manufacturing', value: 3.2, show: '3.2' },
          { name: 'Healthcare', value: 2.6, show: '2.6' },
          { name: 'Education', value: 2.1, show: '2.1' },
        ],
      },
      {
        kind: 'stats',
        items: [
          { label: 'Employment absorption', value: '80', unit: '%' },
          { label: 'Consumer price index', value: '1.4', note: 'Q3 2024' },
        ],
      },
    ],
  },
  {
    id: 'tourism',
    name: 'Tourism',
    seconds: 11,
    shot: { target: [900, 80, -500], radius: 460, height: 150, angle: 0.9, spin: 0.03 },
    blocks: [
      {
        kind: 'rank',
        title: 'Top visitor markets, Q3 2024',
        rows: [
          { name: 'China', value: 1033266, show: '1,033,266' },
          { name: 'Indonesia', value: 554284, show: '554,284' },
          { name: 'Australia', value: 299487, show: '299,487' },
          { name: 'Malaysia', value: 275072, show: '275,072' },
          { name: 'India', value: 269220, show: '269,220' },
        ],
      },
      { kind: 'stats', items: [{ label: 'International arrivals', value: '11.87', unit: 'M', note: 'Q3 2024', change: { value: '−6.9%', period: 'quarterly', good: false } }] },
      { kind: 'stats', items: [{ label: 'Tourism receipts', value: '18', unit: 'S$ B', note: 'Q3 2024', change: { value: '+4.8%', period: 'quarterly', good: true } }] },
      {
        kind: 'rank',
        title: 'Main attractions, visitors a year',
        rows: [
          { name: 'Marina Bay Sands SkyPark', value: 5.2, show: '5.2 M' },
          { name: 'Gardens by the Bay', value: 4.1, show: '4.1 M' },
          { name: 'Sentosa Island', value: 3.9, show: '3.9 M' },
          { name: 'Singapore Zoo', value: 3.5, show: '3.5 M' },
          { name: 'Jewel Changi Airport', value: 3.0, show: '3.0 M' },
        ],
      },
    ],
  },
];
