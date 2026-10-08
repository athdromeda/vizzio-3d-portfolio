export type TimeOfDay = 'day' | 'dusk' | 'night';

/** Physical solar/sky irradiance collapses at sunset and would black out lit surfaces in post. */
export const hasDaylightIrradiance = (timeOfDay: TimeOfDay): boolean => timeOfDay === 'day';

export const TIME_OF_DAY: Record<TimeOfDay, { hour: number; day: number; night: number; bloom: { threshold: number; strength: number } }> = {
  day: { hour: 9, day: 1, night: 0, bloom: { threshold: 1.6, strength: 0.12 } },
  dusk: { hour: 18, day: 0, night: 0, bloom: { threshold: 1.15, strength: 0.26 } },
  night: { hour: 21, day: 0, night: 1, bloom: { threshold: 1.05, strength: 0.32 } },
};

export const TIME_OPTIONS: { id: TimeOfDay; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'night', label: 'Night' },
];
