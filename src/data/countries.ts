export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface Landmark {
  name: string;
  kind: string;
}

export interface Country {
  id: string;
  name: string;
  /** [lat, lng] of the entry city */
  location: [number, number];
  coords: string;
  status: 'live' | 'soon';
  /** Which side of the dot the tag sits on, so neighbours never overlap. */
  side: Side;
  city?: string;
  stats?: { value: string; unit?: string; label: string }[];
  landmarks?: Landmark[];
}

/**
 * Singapore is the only playable country in the MVP.
 * Every "soon" entry below Saudi Arabia is a PLACEHOLDER: replace with Vizzio's real project list.
 * All stats are demo data.
 */
export const COUNTRIES: Country[] = [
  {
    id: 'sg',
    name: 'Singapore',
    location: [1.2838, 103.8591],
    coords: '01°17′N 103°51′E',
    status: 'live',
    side: 'top',
    city: 'Marina Bay',
    stats: [
      { value: '1', label: 'City mapped' },
      { value: '3', label: 'Landmarks' },
      { value: '735', unit: 'km²', label: 'Area covered' },
    ],
    landmarks: [
      { name: 'Marina Bay Sands', kind: 'Hotel and skyline' },
      { name: 'National Stadium', kind: 'Sports Hub' },
      { name: 'Changi Airport', kind: 'Aviation hub' },
    ],
  },
  { id: 'id', name: 'Indonesia', location: [-6.2088, 106.8456], coords: '06°13′S 106°51′E', status: 'soon', side: 'bottom' },
  { id: 'sa', name: 'Saudi Arabia', location: [24.7136, 46.6753], coords: '24°43′N 046°41′E', status: 'soon', side: 'left' },
  { id: 'ae', name: 'UAE', location: [24.4539, 54.3773], coords: '24°27′N 054°23′E', status: 'soon', side: 'right' },
  { id: 'jp', name: 'Japan', location: [35.6762, 139.6503], coords: '35°41′N 139°39′E', status: 'soon', side: 'top' },
  { id: 'gb', name: 'United Kingdom', location: [51.5072, -0.1276], coords: '51°30′N 000°08′W', status: 'soon', side: 'left' },
  { id: 'de', name: 'Germany', location: [52.52, 13.405], coords: '52°31′N 013°24′E', status: 'soon', side: 'right' },
];
