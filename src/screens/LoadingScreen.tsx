import { useEffect, useMemo, useRef, useState } from 'react';
import type { Avatar } from '../data/avatars';
import type { Country } from '../data/countries';

const MIN_MS = 4200; // long enough to read one tip, short enough not to feel like waiting
const TIPS = [
  'Move the mouse to steer. Your flyer turns to follow your view.',
  'Hold Shift while flying forward to boost.',
  'Space climbs, C descends. Look up or down to fly that way.',
  'Press Esc to free the cursor, then click the view to take control again.',
];

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Deterministic pseudo-random stream text, so the screen looks alive without real data. */
function makeStream(seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('').toUpperCase();
  return {
    hexRow: (w: number) => Array.from({ length: Math.ceil(w / 9) }, () => hex(8)).join(' '),
    bits: (w: number) => Array.from({ length: w }, () => (rnd() < 0.5 ? '0' : '1')).join(''),
    tile: () => `T ${14 + Math.floor(rnd() * 5)}/${12800 + Math.floor(rnd() * 260)}/${8090 + Math.floor(rnd() * 90)}  ${hex(6)}  OK`,
  };
}

interface Props {
  country: Country;
  avatar: Avatar;
  /** True once the city has rendered its first frames. */
  ready: boolean;
  onDone: () => void;
}

/**
 * Terminal-style loading screen shown while the city builds.
 * It stays for at least MIN_MS, then waits for `ready`, then fades out.
 */
export function LoadingScreen({ country, avatar, ready, onDone }: Props) {
  const still = useMemo(reducedMotion, []);
  const [tick, setTick] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const stream = useRef(makeStream(4711));
  const lines = useRef<{ top: string[]; side: string[]; tiles: string[] }>({
    top: Array.from({ length: 3 }, () => stream.current.hexRow(220)),
    side: Array.from({ length: 30 }, () => stream.current.bits(26)),
    tiles: Array.from({ length: 7 }, () => stream.current.tile()),
  });
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], []);

  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => {
      setElapsed(performance.now() - t0);
      if (still) return;
      const l = lines.current;
      l.top = [...l.top.slice(1), stream.current.hexRow(220)];
      l.side = [...l.side.slice(1), stream.current.bits(26)];
      l.tiles = [...l.tiles.slice(1), stream.current.tile()];
      setTick((n) => n + 1);
    }, 120);
    return () => clearInterval(id);
  }, [still]);

  const timeDone = elapsed >= MIN_MS;
  useEffect(() => {
    if (timeDone && ready) setLeaving(true);
  }, [timeDone, ready]);
  // the fade-out timer must survive re-renders, so it depends on `leaving` alone
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => done.current(), still ? 0 : 700);
    return () => clearTimeout(id);
  }, [leaving, still]);

  // progress runs on the clock to 92%, and only completes when the city is really there
  const pct = ready && timeDone ? 100 : Math.min(92, Math.round((elapsed / MIN_MS) * 92));
  const log = [
    { at: 0, text: `Uplink ${country.id.toUpperCase()}-01 established` },
    { at: 0.22, text: `Building ${country.city}` },
    { at: 0.5, text: 'Compiling shaders' },
    { at: 0.74, text: `Calibrating ${avatar.callSign}` },
  ];
  const progress = elapsed / MIN_MS;

  return (
    <div className={`loading${leaving ? ' is-leaving' : ''}`} role="status" aria-live="polite" aria-label={`Loading ${country.city}, ${pct} percent`} data-tick={tick}>
      <pre className="stream stream--top" aria-hidden="true">{lines.current.top.join('\n')}</pre>
      <pre className="stream stream--side" aria-hidden="true">{lines.current.side.join('\n')}</pre>

      <div className="loading-log" aria-hidden="true">
        {log.map((l, i) => {
          // the last step only completes when the city has really rendered
          const next = log[i + 1]?.at ?? Infinity;
          const state = progress >= next || (ready && timeDone) ? 'done' : progress >= l.at ? 'now' : 'wait';
          return (
            <p key={l.text} className={`log log--${state}`}>
              <span className="log-mark">{state === 'done' ? 'OK' : state === 'now' ? '..' : '  '}</span>
              {l.text}
            </p>
          );
        })}
        <pre className="stream stream--tiles">{lines.current.tiles.join('\n')}</pre>
      </div>

      <div className="loading-core">
        {/* Original emblem: three stacked map tiles under a position fix */}
        <svg className="emblem" viewBox="0 0 160 150" width="200" height="188" aria-hidden="true">
          <g fill="none" strokeWidth="2.5" strokeLinejoin="round">
            <path className="emblem-tile emblem-tile--3" d="M16 104 80 72l64 32-64 32z" />
            <path className="emblem-tile emblem-tile--2" d="M16 80 80 48l64 32-64 32z" />
            <path className="emblem-tile emblem-tile--1" d="M16 56 80 24l64 32-64 32z" />
          </g>
          <circle className="emblem-fix" cx="80" cy="56" r="5" />
          <path className="emblem-beam" d="M80 6v38" strokeWidth="2" fill="none" />
        </svg>
        <p className="loading-place">{country.city}</p>
        <p className="loading-coords">
          {country.name} · {country.coords}
        </p>
      </div>

      <div className="loading-foot">
        <p className="loading-tip">“{tip}”</p>
        <p className="loading-state">
          Loading <span className="loading-pct">{String(pct).padStart(3, ' ')}%</span>
        </p>
        <div className="loading-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
      </div>

      <div className="loading-fx" aria-hidden="true" />
    </div>
  );
}
