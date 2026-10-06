// Line icons for the city toolbar, map pins and layer rows. One 20-unit grid, one stroke weight,
// drawn here so nothing is downloaded. They are decoration: the control beside them carries the name.
const PATHS = {
  train: 'M7 3h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM5 8h10M7.5 13 6 17M12.5 13 14 17M8 10.6h.01M12 10.6h.01',
  bus: 'M4.5 4h11a1 1 0 0 1 1 1v9h-13V5a1 1 0 0 1 1-1zM3.5 9.5h13M6 14v2M14 14v2M6.5 11.8h.01M13.5 11.8h.01',
  taxi: 'M5 9l1.2-3.2A1.2 1.2 0 0 1 7.3 5h5.4a1.2 1.2 0 0 1 1.1.8L15 9M3.5 14v-3.5A1.5 1.5 0 0 1 5 9h10a1.5 1.5 0 0 1 1.5 1.5V14zM5.5 14v1.5M14.5 14v1.5M8.5 5V3.5h3V5M6.5 11.5h.01M13.5 11.5h.01',
  bike: 'M2.5 13a3 3 0 1 0 6 0a3 3 0 1 0-6 0M11.5 13a3 3 0 1 0 6 0a3 3 0 1 0-6 0M5.5 13 8.5 7.5h4l2 5.5M8.5 7.5 11 13H5.5M12 5.5h2',
  road: 'M6 17 8 3M14 17 12 3M10 4v2M10 9v2M10 14v2',
  cone: 'M8.5 3.5h3L15 15H5zM3.5 16.5h13M7.4 8h5.2M6.3 11.5h7.4',
  alert: 'M10 3.5 17.5 16h-15zM10 8.5v3.5M10 14.2v.1',
  gate: 'M3.5 17V6.5L10 3l6.5 3.5V17M3.5 9.5h13M7 17v-4.5h6V17',
  parking: 'M4 3.5h12v13H4zM8 13.5v-7h2.6a2.2 2.2 0 0 1 0 4.4H8',
  crane: 'M6 17V3M6 5h10.5M6 3l6 2M15 5v3.5M4 17h4M11 17v-5h5.5v5M10 17h7.5',
  plan: 'M10 3 16 6.5v7L10 17 4 13.5v-7zM4 6.5 10 10l6-3.5M10 10v7',
  done: 'M3.5 10a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M7 10.2l2 2 4-4.4',
  leaf: 'M4 16c0-7 4-11 12-12 0 8-4 12-11 12M4 16l7-7',
  wind: 'M3 8h9a2 2 0 1 0-2-2M3 12h12a2 2 0 1 1-2 2M3 10h5',
  cloud: 'M6.5 15h7.5a3 3 0 0 0 .3-6 4.5 4.5 0 0 0-8.7 1A2.6 2.6 0 0 0 6.5 15z',
  bolt: 'M11 2.5 4.5 11H10l-1 6.5L15.5 9H10z',
  drop: 'M10 3c3 3.6 5 6 5 8.5a5 5 0 0 1-10 0C5 9 7 6.6 10 3z',
  chart: 'M3.5 16.5h13M6 14V9.5M10 14V5.5M14 14v-3',
  flyer: 'M10 3.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM4.5 16.5c.5-3.2 2.6-5 5.5-5s5 1.8 5.5 5',
  globe: 'M3.5 10a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M3.5 10h13M10 3.5c-2.4 2-2.4 11 0 13M10 3.5c2.4 2 2.4 11 0 13',
  plus: 'M10 4.5v11M4.5 10h11',
  minus: 'M4.5 10h11',
  tilt: 'M3 13.5 10 17l7-3.5M3 10l7 3.5 7-3.5M10 3 3 6.5 10 10l7-3.5z',
  fly: 'M17 3 3 9l5 2 2 5zM8 11l9-8',
  eye: 'M2.5 10c2-3.5 4.5-5 7.5-5s5.5 1.5 7.5 5c-2 3.5-4.5 5-7.5 5s-5.5-1.5-7.5-5zM10 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  eyeOff: 'M2.5 10c2-3.5 4.5-5 7.5-5s5.5 1.5 7.5 5c-2 3.5-4.5 5-7.5 5s-5.5-1.5-7.5-5zM4 4l12 12',
  close: 'M5 5l10 10M15 5 5 15',
  left: 'M12.5 4.5 7 10l5.5 5.5',
  right: 'M7.5 4.5 13 10l-5.5 5.5',
  up: 'M4.5 12.5 10 7l5.5 5.5',
  down: 'M4.5 7.5 10 13l5.5-5.5',
  spin: 'M16 10a6 6 0 1 1-2-4.5M14.5 2.5v3.5H11',
  home: 'M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3M6.5 10a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
