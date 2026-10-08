import { useEffect, useState } from 'react';
import { REAL, type World } from './city/geo';
import { TIME_OPTIONS, type TimeOfDay } from './city/timeOfDay';
import { Shell } from './components/Shell';
import { AVATARS } from './data/avatars';
import type { Country } from './data/countries';
import { AvatarScreen } from './screens/AvatarScreen';
import { CityScreen, type CityMode } from './screens/CityScreen';
import { GlobeScreen } from './screens/GlobeScreen';

type Stage = 'globe' | 'avatar' | 'city';

const CITY_HINTS: Record<CityMode, string | null> = {
  fly: null,
  tour: 'Arrow keys change chapter. Enter starts the flight.',
  console: 'Pick a view on top. Esc steps back, E returns to flight.',
  map: 'Drag to pan, scroll to zoom, click a marker. Esc returns to flight.',
};
const HINTS: Record<Stage, string> = {
  globe: 'Drag to rotate. Select a live country to enter.',
  avatar: 'Drag the model to turn it. Pick a flyer, then take off.',
  city: 'Click the view to steer. Esc frees the cursor.',
};

export function App() {
  const [stage, setStage] = useState<Stage>('globe');
  const [country, setCountry] = useState<Country | null>(null);
  const [avatarId, setAvatarId] = useState(AVATARS[0].id);
  const avatar = AVATARS.find((a) => a.id === avatarId) ?? AVATARS[0];
  const [cityMode, setCityMode] = useState<CityMode>('fly');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const [world, setWorld] = useState<World>(REAL ? 'real' : 'simple');
  // The real tiles read badly at night, so the option is offered only in the generated stand-in city.
  const lightOptions = world === 'real' ? TIME_OPTIONS.filter((option) => option.id !== 'night') : TIME_OPTIONS;
  useEffect(() => {
    if (world === 'real' && timeOfDay === 'night') setTimeOfDay('dusk');
  }, [world, timeOfDay]);
  const light = (
    <div className="seg" role="group" aria-label="City time">
      {lightOptions.map((option) => (
        <button key={option.id} id={`light-${option.id}`} aria-pressed={timeOfDay === option.id} onClick={() => setTimeOfDay(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <Shell hint={(stage === 'city' && CITY_HINTS[cityMode]) || HINTS[stage]} tools={stage === 'city' && cityMode === 'fly' ? light : undefined}>
      {stage === 'globe' && (
        <GlobeScreen
          initialFocusId={country?.id}
          onEnter={(c) => {
            setCountry(c);
            setStage('avatar');
          }}
        />
      )}
      {stage === 'avatar' && country && (
        <AvatarScreen country={country} avatarId={avatarId} onPick={setAvatarId} onBack={() => setStage('globe')} onFly={() => setStage('city')} />
      )}
      {stage === 'city' && country && (
        <CityScreen country={country} avatar={avatar} timeOfDay={timeOfDay} onChangeFlyer={() => setStage('avatar')} onGlobe={() => setStage('globe')} onMode={setCityMode} onWorld={setWorld} />
      )}
    </Shell>
  );
}
