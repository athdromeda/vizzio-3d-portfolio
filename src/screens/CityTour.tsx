// City statistics: a short tour that plays after the city has loaded and before the flyer appears.
// Each chapter parks the camera over a different part of the city and shows its figures in a band at the bottom:
// one equal column per block, so the band is filled from edge to edge whatever the chapter holds.
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { InspectCam } from '../console/engine';
import { Chip, Columns, Lines, Rank, Stack } from '../console/widgets';
import type { Country } from '../data/countries';
import { TOUR, type TourBlock, type TourStat } from '../data/tour';

interface Props {
  country: Country;
  /** The scene reads this every frame. The tour owns it while it is mounted. */
  cam: RefObject<InspectCam | null>;
  /** True while the loading screen still covers the view: the first shot is set up, the clock waits. */
  paused: boolean;
  onDone: () => void;
}

/** One figure: label on top so every column of the band starts on the same line, then the number. */
function Stat({ s, lead }: { s: TourStat; lead: boolean }) {
  return (
    <div className={`tour-stat${lead ? ' tour-stat--lead' : ''}`}>
      <dt>{s.label}</dt>
      <dd className="tour-value">
        {s.value}
        {s.unit && <span className="stat-unit">{s.unit}</span>}
      </dd>
      {s.note && <dd className="tour-note">{s.note}</dd>}
      {s.change && (
        <dd>
          <Chip tone={s.change.good ? 'ok' : 'crit'}>
            {s.change.value} {s.change.period}
          </Chip>
        </dd>
      )}
    </div>
  );
}

function Block({ b }: { b: TourBlock }) {
  if (b.kind === 'stats') {
    return (
      <dl className="tour-stats">
        {b.items.map((s) => (
          <Stat key={s.label} s={s} lead={b.items.length === 1} />
        ))}
      </dl>
    );
  }
  if (b.kind === 'lines') return <Lines title={b.title} labels={b.labels} series={[{ name: b.title, values: b.values }]} unit={b.unit} />;
  if (b.kind === 'columns') return <Columns title={b.title} labels={b.labels} values={b.values} unit={b.unit} />;
  if (b.kind === 'rank') return <Rank title={b.title} rows={b.rows} />;
  return (
    <figure className="tour-stack">
      <figcaption className="eyebrow">{b.title}</figcaption>
      <Stack parts={b.parts} />
    </figure>
  );
}

export function CityTour({ country, cam, paused, onDone }: Props) {
  const [index, setIndex] = useState(0);
  // the tour plays by itself until the visitor takes over
  const [auto, setAuto] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const chapter = TOUR[index];
  const last = index === TOUR.length - 1;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    cam.current = { ...chapter.shot, cut: index };
  }, [cam, chapter, index]);
  useEffect(
    () => () => {
      cam.current = null;
    },
    [cam],
  );

  useEffect(() => {
    if (!auto || paused) return;
    const id = window.setTimeout(() => (last ? done.current() : setIndex((i) => i + 1)), chapter.seconds * 1000);
    return () => window.clearTimeout(id);
  }, [auto, paused, last, chapter]);

  const go = (i: number) => {
    setAuto(false);
    setIndex(Math.max(0, Math.min(TOUR.length - 1, i)));
  };
  const state = useRef({ index, paused });
  state.current = { index, paused };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || state.current.paused) return;
      const onControl = (e.target as HTMLElement | null)?.closest?.('button, a, input, svg[tabindex]');
      if (e.code === 'Enter' && !onControl) done.current();
      else if (e.code === 'Escape') done.current();
      else if ((e.code === 'ArrowRight' || e.code === 'Space') && !onControl) {
        e.preventDefault();
        go(state.current.index + 1);
      } else if (e.code === 'ArrowLeft' && !onControl) go(state.current.index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`tour${paused ? ' is-paused' : ''}`}>
      {/* covers the jump between two places, then clears */}
      <div key={index} className="tour-dip" aria-hidden="true" />

      <div className="tour-top">
        <nav className="hud-panel tour-nav" aria-label="City statistics chapters">
          {TOUR.map((c, i) => (
            <button key={c.id} id={`tour-${c.id}`} className={i === index ? 'is-on' : ''} aria-current={i === index ? 'step' : undefined} onClick={() => go(i)}>
              {c.name}
              {i === index && auto && !paused && <i key={index} className="tour-clock" style={{ animationDuration: `${c.seconds}s` }} />}
            </button>
          ))}
        </nav>
        <button id="tour-skip" className="cta tour-skip" onClick={onDone}>
          Start flying
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
      </div>

      {index === 0 && (
        <div className="tour-title">
          <p>Welcome to</p>
          <h1>{country.name}</h1>
        </div>
      )}

      {/* one band, edge to edge: a head row, then one equal column per block with hairlines between */}
      <section key={chapter.id} className="hud-panel tour-band" aria-live="polite">
        <header className="tour-head">
          <div className="c-title">
            <p className="eyebrow">
              {country.name} · {country.coords} · {String(index + 1).padStart(2, '0')} of {String(TOUR.length).padStart(2, '0')}
            </p>
            <h2>{index === 0 ? 'At a glance' : chapter.name}</h2>
          </div>
          <span className="chip">Demo data</span>
          <span className="tour-step">
            <button id="tour-prev" className="c-btn" disabled={index === 0} onClick={() => go(index - 1)}>
              Previous
            </button>
            <button id="tour-next" className="c-btn" onClick={() => (last ? onDone() : go(index + 1))}>
              {last ? 'Start flying' : 'Next'}
            </button>
          </span>
        </header>
        <div className="tour-clip">
          <div className="tour-cells" style={{ '--cols': chapter.blocks.length } as CSSProperties}>
            {chapter.blocks.map((b, i) => (
              <div key={i} className={`tour-cell${b.kind === 'stats' && b.items.length > 1 ? ' tour-cell--pair' : ''}`}>
                <Block b={b} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
