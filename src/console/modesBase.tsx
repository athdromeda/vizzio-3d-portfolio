// Console modes every landmark has: Environment, Security, Facility (with room and asset drill-down),
// plus the camera wall they share.
import type { Asset, CriticalSystem, Environment, Facility, Room, Security, Tone, Zone } from '../data/ops';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Icon, type IconName } from '../components/icons';
import { aimAt, lookFrom, type InspectCam } from './engine';
import { Chip, Meter, Ring, Section, Spark, Tiles } from './widgets';

export interface CamGroup {
  name: string;
  shots: { id: string }[];
}

/** One camera position. The picture is a still of the 3D twin, so the badge says so; it is not video. */
export function CamTile({ id, url, place, badge = '3D twin', onOpen }: { id: string; url?: string; place: string; badge?: string; onOpen?: () => void }) {
  const body = (
    <>
      {url ? <img src={url} alt={`3D view from camera ${id}, ${place}`} /> : <span className="cam-wait">Rendering</span>}
      <span className="cam-live">{badge}</span>
      <span className="cam-cap">
        <strong>CAM-{id}</strong>
        <span>{place}</span>
      </span>
    </>
  );
  return onOpen ? (
    <button id={`cam-${id}`} className="cam cam--open" title="Open this camera" onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className="cam">{body}</div>
  );
}

/** Camera wall: stills rendered from the 3D scene itself, grouped by side. A tile opens the CCTV viewer. */
export function CameraWall({ site, groups, shots, onOpen }: { site: string; groups: CamGroup[]; shots: Record<string, string>; onOpen?: (id: string) => void }) {
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">{site}</p>
        <h2>Twin cameras</h2>
      </header>
      {groups.map((g) => (
        <Section key={g.name} title={g.name} aside={<span className="c-aside">{g.shots.length} views</span>}>
          <div className="cam-row">
            {g.shots.map((s) => (
              <CamTile key={s.id} id={s.id} url={shots[s.id]} place={g.name} onOpen={onOpen && (() => onOpen(s.id))} />
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

/** What the CCTV viewer is showing: a camera position in the city and what to call it. */
export interface Feed {
  id: string;
  /** Camera name as printed on the picture. */
  name: string;
  title: string;
  place: string;
  pos: [number, number, number];
  look: [number, number, number];
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <>{now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour12: false })}</>;
}

const DEG = Math.PI / 180;
/** How far the camera may tilt, and how far it zooms (field of view in degrees). */
const TILT = [-78 * DEG, 32 * DEG] as const;
const ZOOM = [16, 72] as const;
const WIDE = 58;

/**
 * CCTV viewer: a frame over the live 3D view while the scene's camera stands at the feed's position.
 * The camera turns on the spot: drag the picture to look all the way round, scroll to zoom, or use the
 * controls underneath. It is the 3D twin seen from that camera, not video, and the label says so.
 */
export function CctvViewer({ feed, site, index, cam, onStep, onClose }: { feed: Feed; site: string; index: number; cam: RefObject<InspectCam | null>; onStep?: (d: number) => void; onClose: () => void }) {
  const home = aimAt(feed.pos, feed.look);
  // pan, tilt and zoom change every frame while dragging or sweeping: they live in a ref, the readout is written directly
  const ptz = useRef({ yaw: home.yaw, pitch: home.pitch, fov: WIDE, feed: feed.id });
  const [auto, setAuto] = useState(false);
  const live = useRef({ auto, dragging: false });
  live.current.auto = auto;
  const view = useRef<HTMLDivElement>(null);
  const out = useRef<{ pan: HTMLElement | null; tilt: HTMLElement | null; zoom: HTMLElement | null }>({ pan: null, tilt: null, zoom: null });

  if (ptz.current.feed !== feed.id) ptz.current = { yaw: home.yaw, pitch: home.pitch, fov: WIDE, feed: feed.id };

  const turn = (dYaw: number, dPitch: number) => {
    const p = ptz.current;
    p.yaw += dYaw;
    p.pitch = Math.min(TILT[1], Math.max(TILT[0], p.pitch + dPitch));
  };
  const zoom = (factor: number) => {
    ptz.current.fov = Math.min(ZOOM[1], Math.max(ZOOM[0], ptz.current.fov * factor));
  };
  const reset = () => {
    setAuto(false);
    ptz.current = { yaw: home.yaw, pitch: home.pitch, fov: WIDE, feed: feed.id };
  };

  // every frame: sweep if asked, hand the pose to the scene, and refresh the readout when it changed
  useEffect(() => {
    let raf = 0, last = performance.now();
    const shown = { pan: '', tilt: '', zoom: '' };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = ptz.current;
      if (live.current.auto && !live.current.dragging) p.yaw += dt * 0.3;
      cam.current = lookFrom(feed.pos, p.yaw, p.pitch, p.fov, index);
      // compass bearing: 0 is north, 90 east
      const pan = `${String(Math.round((((p.yaw / DEG + 90) % 360) + 360) % 360) % 360).padStart(3, '0')}°`;
      const tilt = `${Math.round(p.pitch / DEG)}°`;
      const z = `${(WIDE / p.fov).toFixed(1)}×`;
      const o = out.current;
      if (o.pan && pan !== shown.pan) o.pan.textContent = shown.pan = pan;
      if (o.tilt && tilt !== shown.tilt) o.tilt.textContent = shown.tilt = tilt;
      if (o.zoom && z !== shown.zoom) o.zoom.textContent = shown.zoom = z;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cam, feed, index]);

  // the wheel zooms; arrow keys pan and tilt
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(Math.exp(Math.max(-240, Math.min(240, e.deltaY)) * 0.0016));
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
      const step = 6 * DEG;
      if (e.code === 'ArrowLeft') turn(-step, 0);
      else if (e.code === 'ArrowRight') turn(step, 0);
      else if (e.code === 'ArrowUp') turn(0, step / 2);
      else if (e.code === 'ArrowDown') turn(0, -step / 2);
      else return;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // dragging takes hold of the picture: it follows the cursor, so the camera turns the other way
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!live.current.dragging) return;
    const perPx = (ptz.current.fov * DEG) / (view.current?.clientHeight || 400);
    turn(-e.movementX * perPx, e.movementY * perPx);
  };

  const tool = (id: string, icon: IconName, label: string, onClick: () => void) => (
    <button id={id} className="c-btn cctv-tool" title={label} aria-label={label} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
  );

  return (
    <div className="cctv" role="dialog" aria-label={`CCTV, ${feed.title}`}>
      <header className="cctv-head">
        <div className="c-title">
          <p className="eyebrow">CCTV · 360° camera</p>
          <h2>{feed.title}</h2>
          <p className="c-aside">The 3D twin seen from this camera, not video. Drag the picture to look around, scroll to zoom.</p>
        </div>
        <button id="cctv-close" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <div
        className="cctv-view"
        ref={view}
        onPointerDown={(e) => {
          live.current.dragging = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={drag}
        onPointerUp={() => (live.current.dragging = false)}
        onPointerCancel={() => (live.current.dragging = false)}
      >
        <span className="cam-live">Live 3D</span>
        <div className="cctv-name">
          <strong>{feed.name}</strong>
          <span>
            PTZ · {site} · {feed.place}
          </span>
        </div>
        <dl className="cctv-data">
          <div>
            <dt>Pan</dt>
            <dd ref={(el) => void (out.current.pan = el)}>000°</dd>
          </div>
          <div>
            <dt>Tilt</dt>
            <dd ref={(el) => void (out.current.tilt = el)}>0°</dd>
          </div>
          <div>
            <dt>Zoom</dt>
            <dd ref={(el) => void (out.current.zoom = el)}>1.0×</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>
              <Clock />
            </dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>3D twin</dd>
          </div>
        </dl>
      </div>
      <footer className="cctv-foot">
        <span className="cctv-step" role="group" aria-label="Camera controls">
          {tool('cctv-left', 'left', 'Pan left', () => turn(-30 * DEG, 0))}
          {tool('cctv-right', 'right', 'Pan right', () => turn(30 * DEG, 0))}
          {tool('cctv-up', 'up', 'Tilt up', () => turn(0, 10 * DEG))}
          {tool('cctv-down', 'down', 'Tilt down', () => turn(0, -10 * DEG))}
          {tool('cctv-zoom-in', 'plus', 'Zoom in', () => zoom(0.75))}
          {tool('cctv-zoom-out', 'minus', 'Zoom out', () => zoom(1 / 0.75))}
          <button id="cctv-auto" className="c-btn" aria-pressed={auto} onClick={() => setAuto((v) => !v)}>
            Auto 360°
          </button>
          <button id="cctv-reset" className="c-btn" onClick={reset}>
            Reset
          </button>
        </span>
        {onStep && (
          <span className="cctv-step">
            <button id="cctv-prev" className="c-btn" onClick={() => onStep(-1)}>
              Previous camera
            </button>
            <button id="cctv-next" className="c-btn" onClick={() => onStep(1)}>
              Next camera
            </button>
          </span>
        )}
      </footer>
    </div>
  );
}

export function EnvironmentPanel({ site, env }: { site: string; env: Environment }) {
  const below = env.systems.filter((s) => s.value < s.target);
  const worst = [...env.systems].sort((a, b) => a.value - b.value)[0];
  const health = Math.round(env.systems.reduce((sum, s) => sum + s.value, 0) / env.systems.length);
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">{site}</p>
        <h2>Environment</h2>
      </header>
      <Tiles items={env.tiles} />
      <p className="c-line">
        <span>Air quality</span>
        <strong>{env.air.label}</strong>
        <span className="c-aside">AQI {env.air.aqi}</span>
      </p>
      <Section title="Environmental conditions">
        {env.conditions.map((c) => (
          <div key={c.name} className="c-cond">
            <span>{c.name}</span>
            <Spark values={c.series} />
            <span className="c-cond-value">
              <strong>{c.value}</strong>
              <Chip tone={c.tone}>{c.state}</Chip>
            </span>
          </div>
        ))}
        <div className="c-ticks" aria-hidden="true">
          <span>09:00</span>
          <span>11:00</span>
          <span>13:00</span>
        </div>
      </Section>
      <Section title="Environmental system">
        <div className="c-ring">
          <Ring value={health} tone={below.length ? 'warn' : 'ok'} />
          <p>
            <strong>
              {below.length} of {env.systems.length} below target
            </strong>
            <span>
              {worst.name} lowest at {worst.value}%, {worst.target - worst.value} points under target
            </span>
          </p>
        </div>
        {env.systems.map((s) => (
          <div key={s.name} className="c-meter">
            <span>{s.name}</span>
            <Meter value={s.value} target={s.target} tone={s.value < s.target ? 'warn' : 'ok'} label={`${s.name} ${s.value} percent`} />
            <strong>{s.value}</strong>
          </div>
        ))}
      </Section>
      <Section title="Emergency response">
        {env.teams.map((t) => (
          <p key={t.name} className="c-line">
            <span>{t.name}</span>
            <Chip tone={t.tone}>{t.state}</Chip>
          </p>
        ))}
      </Section>
    </>
  );
}

export function SecurityPanel({ site, sec, zones, onIncident }: { site: string; sec: Security; zones: Zone[]; onIncident?: (zone: string, title: string) => void }) {
  const name = (id: string) => zones.find((z) => z.id === id)?.name ?? id;
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">{site}</p>
        <h2>Security</h2>
      </header>
      <Tiles
        cols={3}
        items={[
          { label: 'Alarms', value: String(sec.alarms) },
          { label: 'Resolved', value: String(sec.resolved) },
          { label: 'Processing', value: String(sec.processing) },
        ]}
      />
      <Section title="By area">
        <div className="c-areas">
          {sec.areas.map((a) => (
            <div key={a.zone} className={`c-area tone-${a.count >= 4 ? 'crit' : a.count >= 2 ? 'warn' : 'info'}`}>
              <strong>{a.count}</strong>
              <span>
                {name(a.zone)}
                <em>{a.kind}</em>
              </span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Areas needing attention" aside={<span className="c-aside">{sec.attention.length}</span>}>
        <ol className="c-feed">
          {sec.attention.map((a) => (
            <li key={a.time + a.title} className={`tone-${a.tone}`}>
              <time>{a.time}</time>
              {a.zone && onIncident ? (
                <button className="c-feed-text c-feed-open" title="Open the camera on this place" onClick={() => onIncident(a.zone!, a.title)}>
                  <strong>{a.title}</strong>
                  {a.place}
                </button>
              ) : (
                <span className="c-feed-text">
                  <strong>{a.title}</strong>
                  {a.place}
                </span>
              )}
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}

const ORDER_TONE: Record<string, Tone> = { Resolved: 'ok', Processing: 'warn', Pending: 'crit' };

export function FacilityPanel({ site, fac }: { site: string; fac: Facility }) {
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">{site}</p>
        <h2>Facility</h2>
      </header>
      <Tiles
        cols={3}
        items={[
          { label: 'Pending', value: String(fac.pending) },
          { label: 'Resolved', value: String(fac.resolved) },
          { label: 'Processing', value: String(fac.processing) },
        ]}
      />
      <Section title="Work orders">
        {fac.orders.map((o) => (
          <article key={o.id} className="c-card">
            <header>
              <strong>{o.title}</strong>
              <Chip tone={ORDER_TONE[o.status]}>{o.status}</Chip>
            </header>
            <p>
              {o.id} · {o.place}
            </p>
            <p>{o.age}</p>
          </article>
        ))}
      </Section>
      <Section title="System status" aside={<Chip tone="ok">{fac.health}% health</Chip>}>
        {fac.status.map((s) => (
          <div key={s.name} className="c-meter">
            <span>{s.name}</span>
            <Meter value={s.value} target={95} tone={s.value < 95 ? 'warn' : 'ok'} label={`${s.name} ${s.value} percent`} />
            <strong>{s.value}%</strong>
          </div>
        ))}
      </Section>
      <p className="note">Select an area in the view to open its systems.</p>
    </>
  );
}

const SYS_TONE: Record<string, Tone> = { Normal: 'ok', Check: 'warn' };
const ASSET_TONE: Record<string, Tone> = { Running: 'ok', Check: 'warn', Stopped: 'crit' };

/** Left column of the room view: air, critical systems, occupancy, energy. */
export function RoomPanel({ zone, room, systemId, onSystem, onBack }: { zone: Zone; room: Room; systemId: string; onSystem: (id: string) => void; onBack: () => void }) {
  return (
    <>
      <button id="room-back" className="ghost" onClick={onBack}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M14 8H3M7 4L3 8l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
        Facility
      </button>
      <header className="c-title">
        <p className="eyebrow">Building</p>
        <h2>{zone.name}</h2>
      </header>
      <Section title="Indoor environmental quality">
        <Tiles items={room.iaq} />
      </Section>
      <Section title="Critical system">
        {room.systems.map((s) => (
          <button key={s.id} id={`system-${s.id}`} className={`c-pick${s.id === systemId ? ' is-on' : ''}`} aria-pressed={s.id === systemId} onClick={() => onSystem(s.id)}>
            <span>
              <strong>{s.name}</strong>
              {s.assets} assets · {s.load}% load
            </span>
            <Chip tone={SYS_TONE[s.status]}>{s.status}</Chip>
          </button>
        ))}
      </Section>
      <Section title="Occupancy">
        <div className="c-meter">
          <span>Space utilisation</span>
          <Meter value={room.occupancy.utilisation} tone={room.occupancy.utilisation > 85 ? 'crit' : 'ok'} label={`Space utilisation ${room.occupancy.utilisation} percent`} />
          <strong>{room.occupancy.utilisation}%</strong>
        </div>
        <div className="c-meter">
          <span>Vacancy</span>
          <Meter value={room.occupancy.vacancy} tone="ok" label={`Vacancy ${room.occupancy.vacancy} percent`} />
          <strong>{room.occupancy.vacancy}%</strong>
        </div>
      </Section>
      <Section title="Energy management">
        <Tiles items={room.energy} />
      </Section>
    </>
  );
}

/** Right column of the room view: the chosen system and the equipment behind it. */
export function SystemPanel({ system, assets, onAsset }: { system: CriticalSystem; assets: Asset[]; onAsset: (a: Asset) => void }) {
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">Critical system</p>
        <h2>{system.name}</h2>
      </header>
      <div className="c-load">
        <dl className="c-tiles">
          <div className="c-tile">
            <dt>Load</dt>
            <dd>
              {system.load}
              <span className="stat-unit">%</span>
            </dd>
          </div>
        </dl>
        <Chip tone={SYS_TONE[system.status]}>{system.status}</Chip>
      </div>
      <Meter value={system.load} tone={SYS_TONE[system.status]} label={`Load ${system.load} percent`} />
      <p className="c-aside">{system.assets} assets serving this building</p>
      <Section title="Assets" aside={<span className="c-aside">{assets.length} shown</span>}>
        {assets.map((a) => (
          <button key={a.tag} id={`asset-${a.tag}`} className="c-pick" onClick={() => onAsset(a)}>
            <span>
              <strong>{a.name}</strong>
              {a.place}
            </span>
            <span className="c-kw">
              <strong>
                {a.kw}
                <span className="stat-unit">kW</span>
              </strong>
              <Chip tone={ASSET_TONE[a.status]}>{a.status}</Chip>
            </span>
          </button>
        ))}
      </Section>
    </>
  );
}

/** Floating checklist for the selected room, as in a facility walk-through. */
export function RoomChecks({ zone, room }: { zone: Zone; room: Room }) {
  return (
    <div className="hud-panel c-checks">
      <p className="eyebrow">{zone.name}</p>
      <p className="c-banner tone-ok">{room.checks.headline}</p>
      {room.checks.items.map(([k, v]) => (
        <p key={k} className="c-line">
          <span>{k}</span>
          <strong>{v}</strong>
        </p>
      ))}
    </div>
  );
}

export function AssetSheet({ asset, shot, onClose }: { asset: Asset; shot: string | null; onClose: () => void }) {
  return (
    <div className="hud-panel c-sheet" role="dialog" aria-label={asset.name}>
      <header className="c-sheet-head">
        <div className="c-title">
          <p className="eyebrow">Asset · {asset.tag}</p>
          <h2>{asset.name}</h2>
          <p className="c-aside">{asset.place}</p>
        </div>
        <button id="asset-close" className="icon-btn" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
      </header>
      <div className="c-sheet-body">
        <div className="c-sheet-shot">{shot ? <img src={shot} alt={`3D model of the ${asset.name.toLowerCase()}`} /> : <span className="cam-wait">Rendering</span>}</div>
        <table className="c-spec">
          <tbody>
            <tr>
              <th scope="row">Status</th>
              <td>
                <Chip tone={ASSET_TONE[asset.status]}>{asset.status}</Chip>
              </td>
            </tr>
            {asset.spec.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
