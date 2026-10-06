// City map: opened from the toolbar while flying. The camera lifts to a map view, the cursor is free,
// and the chosen menu shows its figures in a side panel and its places as markers pinned to the city.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Icon } from '../components/icons';
import type { Anchor } from '../console/engine';
import { Chip, Columns, Lines, Meter, Rank, Section, Stack, Tiles } from '../console/widgets';
import type { MapBlock, MapLayer, MapMenu, MapPoint } from '../data/citymap';

interface Props {
  menu: MapMenu;
  /** Ids of the layers that are switched on. */
  layers: readonly string[];
  onLayer: (id: string) => void;
  /** Id of the place whose card is open. */
  selected: string | null;
  onSelect: (point: MapPoint | null) => void;
  /** The scene moves every element registered here to its place on screen. */
  anchors: RefObject<Map<string, Anchor>>;
  onClose: () => void;
}

/** Counts and waits read better ranged right; names and destinations stay left. */
const num = (cell: string) => (/^[\d,.]+( min)?$|^Arr$/.test(cell) ? 'num' : undefined);
const numCol = (rows: string[][], i: number) => (rows.every((r) => num(r[i])) ? 'num' : undefined);

function Block({ b }: { b: MapBlock }) {
  let body: ReactNode;
  if (b.kind === 'tiles') return <Tiles items={b.items} />;
  if (b.kind === 'lines') return <Lines title={b.title} labels={b.labels} series={[{ name: b.title, values: b.values }]} unit={b.unit} />;
  if (b.kind === 'columns') return <Columns title={b.title} labels={b.labels} values={b.values} unit={b.unit} />;
  if (b.kind === 'rank') return <Rank title={b.title} rows={b.rows} />;
  if (b.kind === 'stack') body = <Stack parts={b.parts} />;
  else if (b.kind === 'status') {
    body = (
      <ul className="map-status">
        {b.rows.map((r) => (
          <li key={r.name}>
            <span>
              <strong>{r.name}</strong>
              {r.detail && <em>{r.detail}</em>}
            </span>
            <Chip tone={r.tone}>{r.state}</Chip>
          </li>
        ))}
      </ul>
    );
  } else if (b.kind === 'counts') {
    body = (
      <dl className="map-counts">
        {b.items.map((c) => (
          <div key={c.label} className={c.value > 0 ? `is-live tone-${c.tone}` : ''}>
            <dd>{c.value}</dd>
            <dt>{c.label}</dt>
          </div>
        ))}
      </dl>
    );
  } else {
    body = (
      <table className="c-table map-table">
        <thead>
          <tr>
            {b.head.map((h, i) => (
              <th key={h} scope="col" className={numCol(b.rows, i)}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.rows.map((r) => (
            <tr key={r[0]}>
              {r.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i} className={numCol(b.rows, i)}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <Section title={b.title}>{body}</Section>;
}

/** Everything known about one place. Shown beside its marker, or in the panel on narrow screens. */
function PointCard({ layer, point, onClose }: { layer: MapLayer; point: MapPoint; onClose: () => void }) {
  return (
    <div className="hud-panel pin-card" role="dialog" aria-label={point.name}>
      <header className="pin-card-head">
        <div className="c-title">
          <p className="eyebrow">{layer.name}</p>
          <h3>{point.name}</h3>
          {point.sub && <p className="c-aside">{point.sub}</p>}
        </div>
        <button id="pin-close" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>
      {point.chip && <Chip tone={point.chip.tone}>{point.chip.text}</Chip>}
      {point.facts && (
        <dl className="c-facts">
          {point.facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {point.meter && (
        <p className="pin-meter">
          <span>{point.meter.label}</span>
          <strong>{point.meter.value}%</strong>
          <Meter value={point.meter.value} tone="info" label={`${point.meter.label}: ${point.meter.value} percent`} />
        </p>
      )}
      {point.table && (
        <table className="c-table map-table">
          <caption className="eyebrow">{point.table.caption}</caption>
          <thead>
            <tr>
              {point.table.head.map((h, j) => (
                <th key={h} scope="col" className={numCol(point.table!.rows, j)}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {point.table.rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j} className={numCol(point.table!.rows, j)}>{cell}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {point.note && <p className="note">{point.note}</p>}
    </div>
  );
}

export function CityMap({ menu, layers, onLayer, selected, onSelect, anchors, onClose }: Props) {
  const shown = menu.layers.filter((l) => layers.includes(l.id));
  const picked = shown.flatMap((l) => l.points.map((p) => ({ l, p }))).find((x) => x.p.id === selected) ?? null;

  // Esc closes the open card first, then the map
  const state = useRef({ picked: picked !== null, onSelect, onClose });
  state.current = { picked: picked !== null, onSelect, onClose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.code !== 'Escape') return;
      if (state.current.picked) state.current.onSelect(null);
      else state.current.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => () => anchors.current?.clear(), [anchors]);

  const pin = (p: MapPoint) => (el: HTMLElement | null) => {
    if (el) anchors.current?.set(p.id, { el, pos: [p.at[0], 16, p.at[1]] });
    else anchors.current?.delete(p.id);
  };

  return (
    <div className="citymap">
      <div className="pin-layer">
        {shown.map((l) =>
          l.points.map((p) => {
            const on = p.id === selected;
            return (
              <div key={p.id} ref={pin(p)} className={`pin cat-${l.cat}${on ? ' is-on' : ''}`}>
                <button id={`pin-${p.id}`} className="pin-btn" aria-label={`${l.name}: ${p.name}`} aria-expanded={on} onClick={() => onSelect(on ? null : p)}>
                  <Icon name={l.icon} size={16} />
                </button>
                {!on && <span className="pin-name">{p.name}</span>}
                {on && <PointCard layer={l} point={p} onClose={() => onSelect(null)} />}
              </div>
            );
          }),
        )}
      </div>

      <aside className="hud-panel console-col map-panel" aria-label={`${menu.title} figures`}>
        <header className="c-title">
          <p className="eyebrow">City map · Demo data</p>
          <h2>{menu.title}</h2>
          <p className="c-aside">{menu.lede}</p>
        </header>

        <Section title="Layers" aside={<span className="c-aside">{shown.length} of {menu.layers.length} shown</span>}>
          <ul className="map-layers">
            {menu.layers.map((l) => {
              const on = layers.includes(l.id);
              return (
                <li key={l.id}>
                  <button id={`layer-${l.id}`} className={`map-layer cat-${l.cat}`} aria-pressed={on} onClick={() => onLayer(l.id)}>
                    <span className="map-key">
                      <Icon name={l.icon} size={14} />
                    </span>
                    <span className="map-layer-name">{l.name}</span>
                    <span className="c-aside">{l.points.length}</span>
                    <Icon name={on ? 'eye' : 'eyeOff'} size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* narrow screens have no markers: the same places as a list, with the open card in the flow */}
        <div className="map-places">
          {shown.map((l) => (
            <Section key={l.id} title={l.name}>
              <ul className="map-layers">
                {l.points.map((p) => (
                  <li key={p.id}>
                    <button className="map-layer" aria-expanded={p.id === selected} onClick={() => onSelect(p.id === selected ? null : p)}>
                      <span className="map-layer-name">{p.name}</span>
                    </button>
                    {p.id === selected && <PointCard layer={l} point={p} onClose={() => onSelect(null)} />}
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>

        {menu.blocks.map((b, i) => (
          <Block key={i} b={b} />
        ))}
      </aside>

      <div className="map-center" data-tag-area />
    </div>
  );
}
