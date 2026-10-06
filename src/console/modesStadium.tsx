// Stadium-only console modes: match day analytics, virtual patrol, event archive.
import type { MatchDay, PastEvent, Patrol, PatrolRoute, Side, Tone } from '../data/ops';
import { CamTile } from './modesBase';
import { Chip, Columns, Lines, PassNetwork, Pair, SeatGrid, Section, Spark, Stack, Tiles, fmt } from './widgets';

const HALF = ['Pre-match', '15 min', '30 min', '45 min', 'Half-time'];

/** One team's supporters: sentiment, mood over time, audience mix. */
export function SidePanel({ label, side, shot, camId }: { label: string; side: Side; shot?: string; camId: string }) {
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">{label}</p>
        <h2>{side.name}</h2>
      </header>
      <CamTile id={camId} url={shot} place={`${label} stand`} />
      <Section title="Sentiment, average">
        <Tiles items={side.sentiment.map((s) => ({ label: s.label, value: s.value, unit: '%', note: s.note }))} />
      </Section>
      <Section title="Real-time emotional trend">
        <div className="c-trend">
          <p>
            <strong>{side.trend.now}%</strong>
            <span>now · peak {side.trend.peak}%</span>
          </p>
          <Spark values={side.trend.series} w={150} h={40} />
        </div>
        <div className="c-ticks" aria-hidden="true">
          {HALF.map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
      </Section>
      <Section title="Audience type distribution">
        <p className="c-big">{fmt(side.audience.total)}</p>
        <Stack parts={side.audience.types} />
      </Section>
    </>
  );
}

export function Scoreboard({ md, venue, expanded, onToggle }: { md: MatchDay; venue: string; expanded: boolean; onToggle: () => void }) {
  return (
    <div className={`hud-panel c-score${expanded ? ' is-compact' : ''}`}>
      <span className="c-team c-team--home">
        <strong>{md.home.name}</strong>
        <span>{md.home.rank}</span>
      </span>
      <span className="c-result">
        <strong>
          {md.score[0]} : {md.score[1]}
        </strong>
        <span>
          {md.round} · {venue}
        </span>
      </span>
      <span className="c-team">
        <strong>{md.away.name}</strong>
        <span>{md.away.rank}</span>
      </span>
      <button id="match-expand" className="c-btn" aria-expanded={expanded} onClick={onToggle}>
        {expanded ? 'Close analytics' : 'Open match analytics'}
      </button>
    </div>
  );
}

export type MatchTab = 'fan' | 'player' | 'match';
const TABS: { id: MatchTab; label: string }[] = [
  { id: 'fan', label: 'Fan' },
  { id: 'player', label: 'Player' },
  { id: 'match', label: 'Match' },
];

export function MatchSheet({ md, tab, onTab }: { md: MatchDay; tab: MatchTab; onTab: (t: MatchTab) => void }) {
  const { fan, player, match } = md;
  const most = Math.max(...player.exchanged.map((e) => e.passes));
  return (
    <div className="hud-panel c-sheet c-sheet--wide">
      <div className="c-tabs" role="tablist" aria-label="Analytics">
        {TABS.map((t) => (
          <button key={t.id} id={`match-tab-${t.id}`} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'fan' && (
        <>
          <Section title="Recent sweeps">
            <div className="c-split">
              <SeatGrid blocks={fan.blocks} />
              <div className="c-list">
                {fan.stands.map((s) => (
                  <div key={s.name} className="c-stand">
                    <span>
                      <strong>{s.name}</strong>
                      {s.detail}
                    </span>
                    <span className="c-kw">
                      <strong>{s.score.toFixed(1)}</strong>
                      <Chip tone={s.mood === 'Positive' ? 'ok' : 'crit'}>{s.mood}</Chip>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
          <Section title="Match events and crowd response" aside={<span className="c-aside">{fan.events.length} events to half-time</span>}>
            <div className="c-scroll">
              <table className="c-table">
                <thead>
                  <tr>
                    <th scope="col">Min</th>
                    <th scope="col">On-field event</th>
                    <th scope="col">Mood shift</th>
                    <th scope="col">Sections moved</th>
                  </tr>
                </thead>
                <tbody>
                  {fan.events.map((e) => (
                    <tr key={e.min}>
                      <td>{e.min}</td>
                      <td>
                        <strong>{e.event}</strong>
                        <br />
                        {e.detail}
                      </td>
                      <td>
                        <Chip tone={e.tone}>{e.mood}</Chip>
                      </td>
                      <td>{e.sections}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      {tab === 'player' && (
        <>
          <div className="c-player">
            <div className="c-title">
              <p className="eyebrow">Player overview · passing network</p>
              <h2>{player.name}</h2>
              <p className="c-aside">{player.meta}</p>
            </div>
            <Tiles cols={3} items={player.figures} />
          </div>
          <div className="c-split">
            <PassNetwork nodes={player.nodes} links={player.links} />
            <Section title="Passes exchanged">
              {player.exchanged.map((e) => (
                <div key={e.pair} className="c-bar">
                  <span>{e.pair}</span>
                  <strong>{e.passes} passes</strong>
                  <span className="c-bar-track">
                    <span style={{ width: `${(e.passes / most) * 100}%` }} />
                  </span>
                </div>
              ))}
            </Section>
          </div>
          <div className="c-split">
            <Section title="Passes leaders">
              {player.leaders.map((l, i) => (
                <p key={l.name} className="c-line">
                  <span>
                    {String(i + 1).padStart(2, '0')} · <strong>{l.name}</strong> · {l.meta}
                  </span>
                  <strong>{l.score.toFixed(1)}</strong>
                </p>
              ))}
            </Section>
            <Section title="Timeline">
              {player.timeline.map((t) => (
                <p key={t.min} className="c-line">
                  <span>{t.min}</span>
                  <span>{t.text}</span>
                </p>
              ))}
            </Section>
          </div>
        </>
      )}

      {tab === 'match' && (
        <>
          <ul className="legend">
            <li>
              <i className="legend-box" style={{ background: 'var(--cat-1)' }} />
              {md.home.name}
            </li>
            <li>
              <i className="legend-box" style={{ background: 'var(--cat-2)' }} />
              {md.away.name}
            </li>
          </ul>
          <div className="c-split">
            <Section title="Possession and shots">
              <Pair label="Possession" a={match.possession[0]} b={match.possession[1]} unit="%" />
              {match.stats.map((s) => (
                <Pair key={s.name} label={s.name} a={s.home} b={s.away} />
              ))}
            </Section>
            <Section title="Attack channels, share of attacks">
              {(['Left', 'Centre', 'Right'] as const).map((c, i) => (
                <Pair key={c} label={c} a={match.channels.home[i]} b={match.channels.away[i]} unit="%" />
              ))}
            </Section>
          </div>
          <p className="note">Match video with player tracking is not part of this demo.</p>
        </>
      )}
    </div>
  );
}

/* ---------- virtual patrol ---------- */

export function RoutePicker({ patrol, routeId, onRoute, onStart }: { patrol: Patrol; routeId: string; onRoute: (id: string) => void; onStart: () => void }) {
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">Virtual patrol</p>
        <h2>Select a route</h2>
      </header>
      {patrol.routes.map((r, i) => (
        <button key={r.id} id={`route-${r.id}`} className={`c-pick${r.id === routeId ? ' is-on' : ''}`} aria-pressed={r.id === routeId} onClick={() => onRoute(r.id)}>
          <span className="c-route">
            <i className="legend-line" style={{ background: `var(--cat-${i + 1})` }} />
            <span>
              <strong>{r.name}</strong>
              {r.stops.length} stops
            </span>
          </span>
        </button>
      ))}
      <button id="patrol-start" className="cta" onClick={onStart}>
        Start virtual patrol
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      <p className="note">The camera walks the route stop by stop inside the 3D scene.</p>
    </>
  );
}

export function PatrolStop({ route, stop, onStep, onEnd }: { route: PatrolRoute; stop: number; onStep: (d: number) => void; onEnd: () => void }) {
  const s = route.stops[stop];
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">Virtual patrol route</p>
        <h2>{route.name} route</h2>
        <p className="c-aside">{s.name}</p>
      </header>
      <p className="c-big">
        Stop {stop + 1}
        <span className="stat-unit">of {route.stops.length}</span>
      </p>
      <table className="c-spec">
        <tbody>
          {[
            ['Camera', s.cam],
            ['Type', 'PTZ'],
            ['Place', s.place],
            ['Feed', '3D twin, live'],
          ].map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="c-steps">
        <button id="patrol-prev" className="c-btn" disabled={stop === 0} onClick={() => onStep(-1)}>
          Previous
        </button>
        <button id="patrol-next" className="c-btn" disabled={stop === route.stops.length - 1} onClick={() => onStep(1)}>
          Next stop
        </button>
      </div>
      <button id="patrol-end" className="ghost" onClick={onEnd}>
        End patrol
      </button>
    </>
  );
}

const LEVEL: Record<string, Tone> = { Top: 'crit', High: 'warn', Medium: 'info' };

export function PatrolSide({ patrol, route, routeIndex, stop }: { patrol: Patrol; route: PatrolRoute; routeIndex: number; stop: number }) {
  return (
    <>
      <Section title="Route map">
        <svg className="routemap" viewBox="-130 -130 260 260" role="img" aria-label={`Route map, stop ${stop + 1} of ${route.stops.length}`}>
          <ellipse className="routemap-site" cx="0" cy="0" rx="62" ry="62" />
          <rect className="routemap-site" x="-30" y="-19" width="60" height="38" />
          <polyline className="routemap-path" style={{ stroke: `var(--cat-${routeIndex + 1})` }} points={route.stops.map((s) => `${(Math.cos(s.angle) * 100).toFixed(1)},${(Math.sin(s.angle) * 100).toFixed(1)}`).join(' ')} />
          {route.stops.map((s, i) => (
            <circle key={s.name} className={`routemap-stop${i === stop ? ' is-on' : ''}`} cx={Math.cos(s.angle) * 100} cy={Math.sin(s.angle) * 100} r={i === stop ? 8 : 4.5} />
          ))}
        </svg>
      </Section>
      <Section title="Points of contact">
        {patrol.contacts.map((c) => (
          <p key={c.name} className="c-line">
            <span>
              <strong>{c.name}</strong> · {c.team} · {c.role}
            </span>
            <span className="c-aside">{c.ext}</span>
          </p>
        ))}
      </Section>
      <Section title="Patrol priority">
        {patrol.priority.map((p, i) => (
          <p key={p.name} className="c-line">
            <span>
              {String(i + 1).padStart(2, '0')} · {p.name}
            </span>
            <Chip tone={LEVEL[p.level]}>{p.level}</Chip>
          </p>
        ))}
      </Section>
    </>
  );
}

/* ---------- event archive ---------- */

export function ArchiveList({ events, venue, picked, onPick, onReplay, onCompare }: { events: PastEvent[]; venue: string; picked: string[]; onPick: (id: string) => void; onReplay: (id: string) => void; onCompare: () => void }) {
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">Event archive</p>
        <h2>Fan section</h2>
      </header>
      {events.map((e) => (
        <article key={e.id} className={`c-card${picked.includes(e.id) ? ' is-on' : ''}`}>
          <p className="eyebrow">{e.stage}</p>
          <p className="c-fixture">
            <span>{e.home}</span>
            <strong>{e.score}</strong>
            <span>{e.away}</span>
          </p>
          <p>
            {e.when} · {venue}
          </p>
          <div className="c-card-actions">
            <button id={`replay-${e.id}`} className="c-btn" onClick={() => onReplay(e.id)}>
              View replay
            </button>
            <label className="c-check">
              <input id={`compare-${e.id}`} type="checkbox" checked={picked.includes(e.id)} disabled={!picked.includes(e.id) && picked.length >= 2} onChange={() => onPick(e.id)} />
              Compare
            </label>
          </div>
        </article>
      ))}
      <button id="compare-go" className="cta" disabled={picked.length !== 2} onClick={onCompare}>
        Compare selected ({picked.length}/2)
      </button>
    </>
  );
}

const FLOW_LABELS = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'];
const AGES = ['<18', '18–30', '31–45', '46–60', '>60'];

export function Insights({ event }: { event: PastEvent }) {
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">AI insights</p>
        <h2>{event.stage}</h2>
      </header>
      <Tiles
        items={[
          { label: 'Total crowd', value: fmt(event.crowd), note: event.crowdNote },
          { label: 'Peak density', value: event.density.toFixed(1), unit: 'p/m²', note: event.densityNote },
          { label: 'Average dwell time', value: String(event.dwell), unit: 'min', note: event.dwellNote },
          { label: 'Anomalies', value: String(event.anomalies), note: 'In the incident log' },
        ]}
      />
      <Lines title="Crowd flow" labels={FLOW_LABELS} series={[{ name: 'People on site', values: event.flow }]} />
      <Columns title="Age groups, share of crowd" labels={AGES} values={event.ages} unit="%" />
    </>
  );
}

export function Comparison({ a, b }: { a: PastEvent; b: PastEvent }) {
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">Comparative AI insights</p>
        <h2>Two events</h2>
      </header>
      <ul className="legend legend--stack">
        <li>
          <i className="legend-box" style={{ background: 'var(--cat-1)' }} />
          {a.stage}
        </li>
        <li>
          <i className="legend-box" style={{ background: 'var(--cat-2)' }} />
          {b.stage}
        </li>
      </ul>
      <Pair label="Total crowd" a={a.crowd} b={b.crowd} />
      <Pair label="Peak density, p/m²" a={a.density} b={b.density} />
      <Pair label="Average dwell time, min" a={a.dwell} b={b.dwell} />
      <Pair label="Anomalies" a={a.anomalies} b={b.anomalies} />
      <Lines
        title="Comparative crowd flow"
        labels={FLOW_LABELS}
        series={[
          { name: a.stage, values: a.flow, cat: 1 },
          { name: b.stage, values: b.flow, cat: 2 },
        ]}
      />
    </>
  );
}

/** Centre sheet for replay and comparison: stills from the twin cameras, not recorded footage. */
export function ReplaySheet({ title, groups, shots, onClose }: { title: string; groups: { name: string; shots: { id: string }[] }[]; shots: Record<string, string>; onClose: () => void }) {
  const views = groups.flatMap((g) => g.shots.map((s) => ({ ...s, place: g.name }))).slice(0, 6);
  return (
    <div className="hud-panel c-sheet c-sheet--wide">
      <header className="c-sheet-head">
        <div className="c-title">
          <p className="eyebrow">Replay</p>
          <h2>{title}</h2>
        </div>
        <button id="replay-close" className="icon-btn" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
      </header>
      <Section title={`Twin views (${views.length})`}>
        <div className="cam-grid">
          {views.map((v) => (
            <CamTile key={v.id} id={v.id} url={shots[v.id]} place={v.place} />
          ))}
        </div>
      </Section>
      <p className="note">Recorded match footage is not part of this demo. These are views of the 3D twin from each camera position.</p>
    </div>
  );
}
