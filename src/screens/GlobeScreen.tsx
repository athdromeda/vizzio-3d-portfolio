import { useCallback, useEffect, useRef, useState } from 'react';
import createGlobe from 'cobe';
import { COUNTRIES, type Country } from '../data/countries';
import { angleDelta, focusAngles, latLngToVec3, project } from '../globe/projection';

const ELEVATION = 0.02;
const SPIN = 0.035; // rad/s while idle
const IDLE_MS = 3000;
const THETA_MIN = -0.5;
const THETA_MAX = 0.9;

const HOME = COUNTRIES.find((c) => c.status === 'live')!;
const VECTORS = COUNTRIES.map((c) => latLngToVec3(c.location));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Props {
  /** Re-open this country when coming back from a later stage. */
  initialFocusId?: string | null;
  onEnter: (country: Country) => void;
}

export function GlobeScreen({ initialFocusId = null, onEnter }: Props) {
  const [focusId, setFocusId] = useState<string | null>(initialFocusId);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRef = useRef<HTMLElement>(null);

  // Animation state lives in refs so the render loop never waits on React.
  const [start] = useState(() => {
    const back = COUNTRIES.find((c) => c.id === initialFocusId);
    const f = focusAngles((back ?? HOME).location);
    return back ? { phi: f.phi, theta: clamp(f.theta + 0.12, THETA_MIN, THETA_MAX) } : { phi: f.phi + 0.3, theta: 0.2 };
  });
  const view = useRef({ ...start });
  const target = useRef({ ...start });
  const drag = useRef<{ x: number; y: number; phi: number; theta: number } | null>(null);
  const lastTouch = useRef(-IDLE_MS);
  const paused = useRef(false);

  const focus = COUNTRIES.find((c) => c.id === focusId) ?? null;
  const panel = focus?.status === 'live' ? focus : null;
  paused.current = focusId !== null || hoverId !== null;

  const select = useCallback((c: Country) => {
    const f = focusAngles(c.location);
    target.current = {
      phi: view.current.phi + angleDelta(view.current.phi, f.phi),
      theta: clamp(f.theta + 0.12, THETA_MIN, THETA_MAX),
    };
    setFocusId(c.id);
  }, []);

  const clear = useCallback(() => {
    setFocusId(null);
    lastTouch.current = performance.now();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && clear();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clear]);

  // On stacked (narrow) layouts the panel opens below the globe: bring it into view.
  useEffect(() => {
    if (panel && window.matchMedia('(max-width: 859px)').matches) {
      panelRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
    }
  }, [panel]);

  useEffect(() => {
    const host = hostRef.current!;
    const wrap = wrapRef.current!;
    const canvas = document.createElement('canvas');
    canvas.className = 'globe-canvas';
    host.append(canvas); // cobe re-parents the canvas, so React must not own it

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let size = Math.max(320, Math.min(1100, wrap.clientWidth || 720));

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size,
      height: size,
      phi: view.current.phi,
      theta: view.current.theta,
      dark: 1,
      diffuse: 1.5,
      mapSamples: 24000,
      mapBrightness: 5,
      mapBaseBrightness: 0.05,
      baseColor: [0.34, 0.44, 0.7],
      glowColor: [0.1, 0.17, 0.42],
      markerColor: [0.56, 0.64, 0.82],
      markerElevation: ELEVATION,
      markers: COUNTRIES.map((c) => ({
        location: c.location,
        size: c.status === 'live' ? 0.05 : 0.028,
        color: c.status === 'live' ? [0.3, 0.5, 1] : undefined,
      })),
    });

    const ro = new ResizeObserver(() => {
      const next = Math.max(320, Math.min(1100, wrap.clientWidth));
      if (Math.abs(next - size) > 8) {
        size = next;
        globe.update({ width: size, height: size });
      }
    });
    ro.observe(wrap);

    let raf = 0;
    let prev = performance.now();
    const still = reducedMotion();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const v = view.current;
      const t = target.current;

      const idle = !drag.current && !paused.current && now - lastTouch.current > IDLE_MS;
      if (idle && !still) t.phi += SPIN * dt;

      const k = still ? 1 : 1 - Math.exp(-dt * (drag.current ? 18 : 5));
      v.phi += (t.phi - v.phi) * k;
      v.theta += (t.theta - v.theta) * k;
      globe.update({ phi: v.phi, theta: v.theta });

      const px = wrap.clientWidth;
      for (let i = 0; i < COUNTRIES.length; i++) {
        const el = tagRefs.current[i];
        if (!el) continue;
        const p = project(VECTORS[i], v.phi, v.theta, ELEVATION);
        const visible = clamp((p.depth - 0.08) / 0.2, 0, 1);
        el.style.transform = `translate3d(${(p.x * px).toFixed(1)}px, ${(p.y * px).toFixed(1)}px, 0)`;
        el.style.opacity = visible.toFixed(2);
        el.style.pointerEvents = visible > 0.5 ? 'auto' : 'none';
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      globe.destroy();
      host.replaceChildren();
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, phi: target.current.phi, theta: target.current.theta };
    if (focus?.status === 'soon') setFocusId(null);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const r = (wrapRef.current?.clientWidth ?? 720) * 0.4;
    target.current = {
      phi: d.phi + (e.clientX - d.x) / r,
      theta: clamp(d.theta + (e.clientY - d.y) / r, THETA_MIN, THETA_MAX),
    };
  };
  const onPointerUp = () => {
    drag.current = null;
    lastTouch.current = performance.now();
  };

  return (
      <main className={`main${panel ? ' has-panel' : ''}`}>
        <section className="rail" aria-label="Countries">
          <p className="eyebrow">Select a country</p>
          <h1>Pick a country. Fly its cities.</h1>
          <p className="lede">See the work from orbit down to a single stadium.</p>

          <ul className="index">
            {COUNTRIES.map((c) => (
              <li key={c.id}>
                <button
                  id={`row-${c.id}`}
                  className={`row row--${c.status}${focusId === c.id || hoverId === c.id ? ' is-active' : ''}`}
                  aria-pressed={focusId === c.id}
                  onClick={() => select(c)}
                  onPointerEnter={() => setHoverId(c.id)}
                  onPointerLeave={() => setHoverId(null)}
                >
                  <span className="row-dot" aria-hidden="true" />
                  <span className="row-name">{c.name}</span>
                  <span className="row-coords">{c.coords}</span>
                  <span className="row-status">{c.status === 'live' ? 'Live' : 'Soon'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="stage" aria-label="Globe">
          <div className="globe-wrap" ref={wrapRef}>
            <div
              className="globe-host"
              ref={hostRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            <div className="tags">
              {COUNTRIES.map((c, i) => (
                <button
                  key={c.id}
                  ref={(el) => {
                    tagRefs.current[i] = el;
                  }}
                  className={`tag tag--${c.status} tag--${c.side}${focusId === c.id || hoverId === c.id ? ' is-open' : ''}`}
                  tabIndex={-1}
                  aria-label={c.status === 'live' ? `Open ${c.name}` : `${c.name}, coming soon`}
                  onClick={() => select(c)}
                  onPointerEnter={() => setHoverId(c.id)}
                  onPointerLeave={() => setHoverId(null)}
                >
                  <span className="tag-dot" />
                  <span className="tag-body">
                    <span className="tag-name">{c.name}</span>
                    <span className="tag-more">
                      <span>{c.status === 'live' ? 'Enter' : 'Coming soon'}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {panel && (
            <aside className="panel" ref={panelRef} aria-label={panel.name}>
              <div className="panel-head">
                <p className="eyebrow eyebrow--live">
                  <span className="live-dot" aria-hidden="true" />
                  Live · {panel.coords}
                </p>
                <button id="panel-close" className="icon-btn" aria-label="Close" onClick={clear}>
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  </svg>
                </button>
              </div>
              <h2>{panel.name}</h2>
              <p className="panel-sub">You land at {panel.city}.</p>

              <dl className="stats">
                {panel.stats?.map((s) => (
                  <div key={s.label} className="stat">
                    <dd>
                      {s.value}
                      {s.unit && <span className="stat-unit">{s.unit}</span>}
                    </dd>
                    <dt>{s.label}</dt>
                  </div>
                ))}
              </dl>

              <p className="eyebrow">Landmarks to visit</p>
              <ul className="landmarks">
                {panel.landmarks?.map((l) => (
                  <li key={l.name}>
                    <span className="landmark-name">{l.name}</span>
                    <span className="landmark-kind">{l.kind}</span>
                  </li>
                ))}
              </ul>

              <button id="enter-country" className="cta" onClick={() => onEnter(panel)}>
                Enter {panel.name}
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </button>
              <p className="note">Demo data.</p>
            </aside>
          )}
        </section>
      </main>

  );
}
