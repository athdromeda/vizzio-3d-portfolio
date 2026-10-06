// Small building blocks for the landmark console: tiles, chips, meters and charts.
// Chart rules: one series = one hue, text never takes a series colour, every value is reachable
// without hovering (readout, direct label or a screen-reader table), status colours always carry a word.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Tone } from '../data/ops';

export const fmt = (n: number) => n.toLocaleString('en');

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="c-section">
      <header className="c-head">
        <h3 className="eyebrow">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Tiles({ items, cols = 2 }: { items: { label: string; value: string; unit?: string; note?: string }[]; cols?: number }) {
  return (
    <dl className="c-tiles" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {items.map((s) => (
        <div key={s.label} className="c-tile">
          <dt>{s.label}</dt>
          <dd>
            {s.value}
            {s.unit && <span className="stat-unit">{s.unit}</span>}
          </dd>
          {s.note && <span className="c-tile-note">{s.note}</span>}
        </div>
      ))}
    </dl>
  );
}

/** Status word with a colour key beside it. The word carries the meaning; the square only repeats it. */
export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`chip-s tone-${tone}`}>{children}</span>;
}

export function Meter({ value, target, tone = 'ok', label }: { value: number; target?: number; tone?: Tone; label: string }) {
  return (
    <span className={`meter tone-${tone}`} role="img" aria-label={label}>
      <span className="meter-fill" style={{ width: `${Math.min(100, value)}%` }} />
      {target !== undefined && <span className="meter-target" style={{ left: `${target}%` }} />}
    </span>
  );
}

/** Tiny trend line with an end dot. Decorative beside its value, so it is hidden from screen readers. */
export function Spark({ values, w = 96, h = 26 }: { values: number[]; w?: number; h?: number }) {
  const lo = Math.min(...values), hi = Math.max(...values);
  const pts = values.map((v, i) => [3 + (i / (values.length - 1)) * (w - 8), h - 4 - ((v - lo) / (hi - lo || 1)) * (h - 8)]);
  const [ex, ey] = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polyline points={pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')} />
      <circle cx={ex} cy={ey} r="3" />
    </svg>
  );
}

export function Ring({ value, tone = 'ok' }: { value: number; tone?: Tone }) {
  const r = 20, c = 2 * Math.PI * r;
  return (
    <svg className={`ring tone-${tone}`} viewBox="0 0 52 52" width="52" height="52" role="img" aria-label={`${value} percent`}>
      <circle className="ring-track" cx="26" cy="26" r={r} />
      <circle className="ring-fill" cx="26" cy="26" r={r} strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle">
        {value}%
      </text>
    </svg>
  );
}

/** Axis top: the first "clean" number at or above the data maximum (6.3 -> 8, 71 -> 80). */
export function niceMax(max: number) {
  const unit = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / unit;
  return ([1, 2, 4, 5, 6, 8, 10].find((s) => s >= n) ?? 10) * unit;
}

const compact = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}K` : String(+v.toFixed(2)));

/** Single-series column chart: thin bars, two gridlines, the peak called out, every value on hover or focus. */
export function Columns({ title, labels, values, unit = '' }: { title: string; labels: string[]; values: number[]; unit?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceMax(Math.max(...values));
  const peak = values.indexOf(Math.max(...values));
  const shown = active ?? peak;
  const f = (v: number) => `${compact(v)}${unit}`;
  const last = labels.length - 1;
  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="eyebrow">{title}</span>
        <span className="chart-readout" aria-live="polite">
          <strong>{f(values[shown])}</strong> {active === null ? `peak, ${labels[shown]}` : labels[shown]}
        </span>
      </figcaption>
      <div className="chart-plot" onPointerLeave={() => setActive(null)}>
        <span className="chart-grid" style={{ bottom: '100%' }}>
          <i>{f(top)}</i>
        </span>
        <span className="chart-grid" style={{ bottom: '50%' }}>
          <i>{f(top / 2)}</i>
        </span>
        <div className="chart-bars">
          {values.map((v, i) => (
            <button
              key={labels[i]}
              className={`chart-col${i === shown ? ' is-active' : ''}`}
              aria-label={`${labels[i]}: ${f(v)}`}
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <span style={{ height: `${(v / top) * 100}%` }} />
            </button>
          ))}
        </div>
      </div>
      <div className="chart-axis" aria-hidden="true">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(last / 2)]}</span>
        <span>{labels[last]}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {values.map((v, i) => (
            <tr key={labels[i]}>
              <th scope="row">{labels[i]}</th>
              <td>{f(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export interface LineSeries {
  name: string;
  values: number[];
  /** Categorical slot 1..4. Omit for a single series, which uses the default hue. */
  cat?: number;
}

/**
 * Line chart on one shared axis. A crosshair snaps to the nearest position and the readout lists every
 * series there; arrow keys do the same from the keyboard. Two or more series get a legend.
 */
export function Lines({ title, labels, series, unit = '' }: { title: string; labels: string[]; series: LineSeries[]; unit?: string }) {
  const n = labels.length;
  const [at, setAt] = useState<number | null>(null);
  const top = niceMax(Math.max(...series.flatMap((s) => s.values)));
  // drawn at the width it is given, so the plot fills its column and the tick text keeps its size
  const box = useRef<HTMLElement>(null);
  const [W, setW] = useState(300);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(180, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 104, L = 36, B = 4, T = 6;
  const x = (i: number) => L + (i / (n - 1)) * (W - L - 6);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const shown = at ?? n - 1;
  const f = (v: number) => `${compact(v)}${unit}`;
  const stroke = (s: LineSeries) => (s.cat ? `var(--cat-${s.cat})` : 'var(--signal-soft)');
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setAt(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - 6)) * (n - 1)))));
  };
  return (
    <figure className="chart" ref={box}>
      <figcaption className="chart-head">
        <span className="eyebrow">{title}</span>
        <span className="chart-readout" aria-live="polite">
          {labels[shown]}
          {series.map((s) => (
            <span key={s.name} className="chart-key">
              {series.length > 1 && <i style={{ background: stroke(s) }} />}
              <strong>{f(s.values[shown])}</strong>
            </span>
          ))}
        </span>
      </figcaption>
      <svg
        className="lines"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        tabIndex={0}
        aria-label={`${title}. Use the arrow keys to read values.`}
        onPointerMove={pick}
        onPointerLeave={() => setAt(null)}
        onBlur={() => setAt(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setAt(Math.min(n - 1, shown + 1));
          if (e.key === 'ArrowLeft') setAt(Math.max(0, shown - 1));
        }}
      >
        {[1, 0.5, 0].map((k) => (
          <g key={k}>
            <line className="lines-grid" x1={L} x2={W} y1={y(top * k)} y2={y(top * k)} />
            <text className="lines-tick" x={L - 6} y={y(top * k) + 3} textAnchor="end">
              {f(top * k)}
            </text>
          </g>
        ))}
        {series.length === 1 && (
          <path className="lines-wash" d={`M${x(0)},${y(0)} ${series[0].values.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} L${x(n - 1)},${y(0)} Z`} />
        )}
        {series.map((s) => (
          <polyline key={s.name} className="lines-path" style={{ stroke: stroke(s) }} points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
        ))}
        <line className="lines-cross" x1={x(shown)} x2={x(shown)} y1={T} y2={H - B} />
        {series.map((s) => (
          <circle key={s.name} className="lines-dot" style={{ fill: stroke(s) }} cx={x(shown)} cy={y(s.values[shown])} r="4" />
        ))}
      </svg>
      <div className="chart-axis" aria-hidden="true">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor((n - 1) / 2)]}</span>
        <span>{labels[n - 1]}</span>
      </div>
      {series.length > 1 && (
        <ul className="legend">
          {series.map((s) => (
            <li key={s.name}>
              <i className="legend-line" style={{ background: stroke(s) }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {labels.map((l, i) => (
            <tr key={l}>
              <th scope="row">{l}</th>
              {series.map((s) => (
                <td key={s.name}>
                  {s.name} {f(s.values[i])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Parts of a whole in one bar, with a legend that repeats every share as a number. */
export function Stack({ parts }: { parts: { name: string; pct: number }[] }) {
  return (
    <div className="stack">
      <div className="stack-bar" role="img" aria-label={parts.map((p) => `${p.name} ${p.pct}%`).join(', ')}>
        {parts.map((p, i) => (
          <span key={p.name} style={{ flexGrow: p.pct, background: `var(--cat-${i + 1})` }} />
        ))}
      </div>
      <ul className="legend legend--grid">
        {parts.map((p, i) => (
          <li key={p.name}>
            <i className="legend-box" style={{ background: `var(--cat-${i + 1})` }} />
            {p.name}
            <strong>{p.pct}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Two values of one measure side by side: each bar is scaled to the larger of the pair. */
export function Pair({ label, a, b, unit = '' }: { label: string; a: number; b: number; unit?: string }) {
  const top = Math.max(a, b);
  return (
    <div className="pair">
      <span className="eyebrow">{label}</span>
      {[a, b].map((v, i) => (
        <div key={i} className="pair-row">
          <strong>
            {fmt(v)}
            {unit}
          </strong>
          <span className="pair-track">
            <span style={{ width: `${(v / top) * 100}%`, background: `var(--cat-${i + 1})` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

const mood = (score: number): Tone => (score <= 3 ? 'crit' : score <= 7 ? 'warn' : 'ok');

/** Seating blocks around the pitch, each showing its sentiment score. Colour repeats the score's band. */
export function SeatGrid({ blocks }: { blocks: { top: number[]; right: number[]; bottom: number[]; left: number[] } }) {
  const cell = (score: number, col: number, row: number, where: string) => (
    <span key={`${col}-${row}`} className={`seat tone-${mood(score)}`} style={{ gridColumn: col, gridRow: row }} title={`${where}: ${score}`}>
      {score}
    </span>
  );
  const rows = blocks.left.length;
  return (
    <div className="seats-wrap">
      <div className="seats" style={{ gridTemplateColumns: `repeat(${blocks.top.length + 2}, minmax(0, 1fr))` }}>
        {blocks.top.map((s, i) => cell(s, i + 2, 1, `North block ${i + 1}`))}
        {blocks.bottom.map((s, i) => cell(s, i + 2, rows + 2, `South block ${i + 1}`))}
        {blocks.left.map((s, i) => cell(s, 1, i + 2, `West block ${i + 1}`))}
        {blocks.right.map((s, i) => cell(s, blocks.top.length + 2, i + 2, `East block ${i + 1}`))}
        <svg className="pitch" style={{ gridColumn: `2 / ${blocks.top.length + 2}`, gridRow: `2 / ${rows + 2}` }} viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true">
          <rect x="1" y="1" width="198" height="118" />
          <line x1="100" y1="1" x2="100" y2="119" />
          <circle cx="100" cy="60" r="18" />
          <rect x="1" y="32" width="26" height="56" />
          <rect x="173" y="32" width="26" height="56" />
        </svg>
      </div>
      <ul className="legend">
        <li>
          <i className="legend-box tone-crit" />1 to 3, negative
        </li>
        <li>
          <i className="legend-box tone-warn" />4 to 7, mixed
        </li>
        <li>
          <i className="legend-box tone-ok" />8 to 15, positive
        </li>
      </ul>
    </div>
  );
}

/** Who passes to whom: node size is the player's passing score, line weight the passes exchanged. */
export function PassNetwork({ nodes, links }: { nodes: { id: string; x: number; y: number; score: number; selected?: boolean }[]; links: { a: string; b: string; passes: number }[] }) {
  const W = 300, H = 180;
  const at = (id: string) => nodes.find((n) => n.id === id)!;
  const px = (n: { x: number; y: number }) => [8 + (n.x / 100) * (W - 16), 8 + (n.y / 100) * (H - 16)];
  const most = Math.max(...links.map((l) => l.passes));
  return (
    <figure className="network">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Passing network. The list beside it gives the same passes as numbers.">
        <g className="pitch-lines">
          <rect x="8" y="8" width={W - 16} height={H - 16} />
          <line x1={W / 2} y1="8" x2={W / 2} y2={H - 8} />
          <circle cx={W / 2} cy={H / 2} r="24" />
          <rect x="8" y={H / 2 - 38} width="34" height="76" />
          <rect x={W - 42} y={H / 2 - 38} width="34" height="76" />
        </g>
        {links.map((l) => {
          const [x1, y1] = px(at(l.a)), [x2, y2] = px(at(l.b));
          return <line key={l.a + l.b} className="net-link" x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={1 + (l.passes / most) * 4} />;
        })}
        {nodes.map((n) => {
          const [cx, cy] = px(n);
          return (
            <g key={n.id}>
              <circle className={`net-node${n.selected ? ' is-selected' : ''}`} cx={cx} cy={cy} r={5 + n.score * 0.75} />
              <text className="net-label" x={cx} y={cy + 3} textAnchor="middle">
                {n.id}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="net-key">Filled node: selected player. Node size: passing score. Line weight: passes exchanged.</figcaption>
    </figure>
  );
}

/** Ranked horizontal bars for a handful of categories: one hue, every value printed beside its bar. */
export function Rank({ title, rows }: { title: string; rows: { name: string; value: number; show: string }[] }) {
  const top = Math.max(...rows.map((r) => r.value));
  return (
    <figure className="rank">
      <figcaption className="eyebrow">{title}</figcaption>
      <ul>
        {rows.map((r) => (
          <li key={r.name}>
            <span className="rank-name">{r.name}</span>
            <strong>{r.show}</strong>
            <span className="rank-track" aria-hidden="true">
              <span style={{ width: `${(r.value / top) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
