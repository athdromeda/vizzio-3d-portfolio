// Landmark console: the operations view that opens when a landmark is inspected.
// Layout follows a facility dashboard: a left and a right column over the live 3D view, mode tabs on top,
// tags pinned to places on the building, and sheets that open over the centre.
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { cameraWall } from '../city/overlays';
import type { Landmark } from '../data/landmarks';
import { MODE_LABEL, MODE_TAB, OPS, type Alert, type Asset, type ModeId, type Tone, type V3, type Zone } from '../data/ops';
import { NO_OVERLAY, type Anchor, type InspectCam, type SceneOverlay } from './engine';
import { AlertDetail, AlertList, AlertToast, PlaybackSheet } from './modesAlerts';
import { AssetSheet, CameraWall, CctvViewer, EnvironmentPanel, FacilityPanel, RoomChecks, RoomPanel, SecurityPanel, SystemPanel, type Feed } from './modesBase';
import { ArchiveList, Comparison, Insights, MatchSheet, PatrolSide, PatrolStop, ReplaySheet, RoutePicker, Scoreboard, SidePanel, type MatchTab } from './modesStadium';

type TagIcon = 'place' | 'noise' | 'temp' | 'alert' | 'work';

const ICONS: Record<TagIcon, ReactNode> = {
  place: <path d="M8 1.5 13.5 4.5v7L8 14.5 2.5 11.5v-7zM2.5 4.5 8 7.5l5.5-3M8 7.5v7" />,
  noise: <path d="M2 6.5v3M5 4.5v7M8 2.5v11M11 5v6M14 6.5v3" />,
  temp: <path d="M8 2v7.2M6 3.5a2 2 0 0 1 4 0v5.6a3 3 0 1 1-4 0z" />,
  alert: <path d="M8 2 14.5 13.5h-13zM8 6.5v3.2M8 11.6v.2" />,
  work: <path d="M3 13 9 7M9.5 2.5a3 3 0 0 0 4 4l-2 .5-2-2z" />,
};

interface TagDef {
  id: string;
  pos: V3;
  icon: TagIcon;
  name: string;
  value?: string;
  tone: Tone;
  onClick?: () => void;
}

interface Props {
  landmark: Landmark;
  /** Stills rendered from the 3D scene, by camera id. They arrive a few frames after the console opens. */
  shots: Record<string, string>;
  assetShot: string | null;
  cam: RefObject<InspectCam | null>;
  overlay: RefObject<SceneOverlay>;
  anchors: RefObject<Map<string, Anchor>>;
  onClose: () => void;
}

const mid = ([a, b]: [[number, number], [number, number]]): V3 => [(a[0] + b[0]) / 2, 6, (a[1] + b[1]) / 2];

export function Console({ landmark, shots, assetShot, cam, overlay, anchors, onClose }: Props) {
  const ops = OPS[landmark.id];
  const zone = (id: string): Zone => ops.zones.find((z) => z.id === id) ?? ops.zones[0];
  const wall = cameraWall(landmark.orbit.target, landmark.orbit.radius, landmark.orbit.height);

  const [mode, setModeRaw] = useState<ModeId>(ops.modes[0]);
  // facility drill-down
  const [roomId, setRoomId] = useState<string | null>(null);
  const [systemId, setSystemId] = useState(ops.room.systems[0].id);
  const [asset, setAsset] = useState<Asset | null>(null);
  // match day
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<MatchTab>('fan');
  // patrol
  const [routeId, setRouteId] = useState(ops.patrol?.routes[0].id ?? '');
  const [stop, setStop] = useState<number | null>(null);
  // archive
  const [replayId, setReplayId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  // alerts
  const [alertId, setAlertId] = useState(ops.alerts?.items[0].id ?? '');
  const [alertStatus, setAlertStatus] = useState<Record<string, Alert['status']>>({});
  const [live3d, setLive3d] = useState(false);
  const [playback, setPlayback] = useState(false);
  // CCTV viewer: any camera tile or security incident can open it
  const [feed, setFeed] = useState<Feed | null>(null);
  const feeds: Feed[] = wall.flatMap((g) => g.shots.map((sh) => ({ id: sh.id, name: `CAM-${sh.id}`, title: `${g.name} camera`, place: g.name, pos: sh.pos, look: sh.look })));
  const openCam = (id: string) => setFeed(feeds.find((f) => f.id === id) ?? null);
  /** A camera aimed at a place on the landmark, standing outside the building and a little to one side. */
  const openIncident = (zoneId: string, title: string) => {
    const z = zone(zoneId);
    const dx = z.pos[0] - landmark.orbit.target[0], dz = z.pos[2] - landmark.orbit.target[2];
    const a = Math.hypot(dx, dz) > 20 ? Math.atan2(dz, dx) + 0.5 : 0.9;
    const n = ops.zones.indexOf(z);
    setFeed({
      id: `zone-${z.id}`,
      name: `${z.name.split(' ')[0]}_Cam${20 + n}`,
      title,
      place: z.name,
      pos: [z.pos[0] + Math.cos(a) * 115, z.pos[1] + 58, z.pos[2] + Math.sin(a) * 115],
      look: z.pos,
    });
  };
  const stepCam = (d: number) => {
    const i = feeds.findIndex((f) => f.id === feed?.id);
    setFeed(feeds[(i + d + feeds.length) % feeds.length]);
  };

  const setMode = (m: ModeId) => {
    setFeed(null);
    setModeRaw(m);
    setRoomId(null);
    setAsset(null);
    setExpanded(false);
    setStop(null);
    setReplayId(null);
    setComparing(false);
    setPlayback(false);
    setLive3d(false);
  };

  /** One step back: close the innermost open thing, or the console itself. */
  const back = () => {
    if (feed) setFeed(null);
    else if (asset) setAsset(null);
    else if (playback) setPlayback(false);
    else if (replayId || comparing) {
      setReplayId(null);
      setComparing(false);
    } else if (expanded) setExpanded(false);
    else if (stop !== null) setStop(null);
    else if (roomId) setRoomId(null);
    else onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Escape') back();
      else if (e.code === 'KeyE' && !(e.target as HTMLElement | null)?.closest?.('input, textarea')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const route = ops.patrol?.routes.find((r) => r.id === routeId) ?? null;
  const routeIndex = ops.patrol ? ops.patrol.routes.findIndex((r) => r.id === routeId) : 0;
  const alert = ops.alerts?.items.find((a) => a.id === alertId) ?? null;
  const statusOf = (a: Alert) => alertStatus[a.id] ?? a.status;
  const room = roomId ? zone(roomId) : null;
  const system = ops.room.systems.find((s) => s.id === systemId) ?? ops.room.systems[0];
  const replay = ops.archive?.find((e) => e.id === replayId) ?? null;
  const pair = comparing && ops.archive ? picked.map((id) => ops.archive!.find((e) => e.id === id)!) : null;

  // --- where the camera should be for the current state
  const base = landmark.orbit;
  let want: InspectCam = { target: base.target, radius: base.radius, height: base.height, spin: 0.1 };
  if (mode === 'facility' && room) {
    // look at the room from outside the building, never from within it
    const dx = room.pos[0] - base.target[0], dz = room.pos[2] - base.target[2];
    const out = Math.hypot(dx, dz) > 20 ? Math.atan2(dz, dx) : undefined;
    want = { target: room.pos, radius: 240, height: room.pos[1] + 130, angle: out, spin: 0.08 };
  }
  if (mode === 'matchday') want = { target: base.target, radius: base.radius * 0.82, height: base.height * 0.7, spin: 0.07 };
  // the camera stands outside the route, off to one side, and looks along it at the stop
  const stopAt: V3 | null =
    route && stop !== null ? [base.target[0] + Math.cos(route.stops[stop].angle) * route.radius, 9, base.target[2] + Math.sin(route.stops[stop].angle) * route.radius] : null;
  if (mode === 'patrol' && route) {
    want =
      stop === null
        ? { target: base.target, radius: 30, height: 760, angle: Math.PI / 2 }
        : { target: stopAt!, radius: 140, height: 58, angle: route.stops[stop].angle + 0.8 };
  }
  const alertAt: V3 | null = !ops.alerts || !alert ? null : alert.shape === 'line' ? mid(ops.alerts.line) : ops.alerts.focus;
  if (mode === 'alerts' && alertAt) want = { target: alertAt, radius: live3d ? 230 : 340, height: live3d ? 90 : 220, spin: 0.08 };
  const scene: SceneOverlay = {
    ...NO_OVERLAY,
    routes: mode === 'patrol',
    route: mode === 'patrol' && stop !== null ? routeId : null,
    fence: mode === 'alerts' && alert?.shape === 'fence',
    line: mode === 'alerts' && alert?.shape === 'line',
  };
  useEffect(() => {
    // while a CCTV feed is open its viewer steers the camera, every frame
    if (!feed) cam.current = want;
    overlay.current = scene;
  });
  useEffect(
    () => () => {
      cam.current = null;
      overlay.current = NO_OVERLAY;
      anchors.current?.clear();
    },
    [cam, overlay, anchors],
  );

  // --- tags pinned to places on the landmark
  const tags: TagDef[] = [];
  if (mode === 'environment') {
    for (const r of ops.environment.readings) tags.push({ id: `env-${r.zone}`, pos: zone(r.zone).pos, icon: r.kind, name: zone(r.zone).name, value: r.value, tone: r.tone });
  } else if (mode === 'security') {
    for (const i of ops.security.incidents) {
      tags.push({ id: `sec-${i.zone}`, pos: zone(i.zone).pos, icon: i.tone === 'info' ? 'place' : 'alert', name: i.title, tone: i.tone, onClick: i.tone === 'info' ? undefined : () => openIncident(i.zone, i.title) });
    }
  } else if (mode === 'facility' && !room) {
    for (const a of ops.facility.areas) {
      tags.push({ id: `fac-${a.zone}`, pos: zone(a.zone).pos, icon: a.open ? 'work' : 'place', name: zone(a.zone).name, value: a.open ? `${a.open} open` : undefined, tone: a.tone, onClick: () => setRoomId(a.zone) });
    }
  } else if (mode === 'facility' && room) {
    tags.push({ id: `room-${room.id}`, pos: room.pos, icon: 'place', name: room.name, tone: 'info' });
  } else if (mode === 'alerts' && ops.alerts && alert) {
    tags.push({ id: `alert-${alert.id}`, pos: alertAt ?? ops.alerts.focus, icon: 'alert', name: alert.type, tone: statusOf(alert) === 'Resolved' ? 'ok' : 'crit' });
  } else if (mode === 'patrol' && route && stop !== null && stopAt) {
    tags.push({ id: `stop-${routeId}-${stop}`, pos: [stopAt[0], 16, stopAt[2]], icon: 'place', name: route.stops[stop].name, value: route.stops[stop].cam, tone: 'info' });
  } else if (mode === 'archive' || mode === 'matchday') {
    tags.push({ id: 'site', pos: ops.zones[0].pos, icon: 'place', name: landmark.name, tone: 'info' });
  }
  const pin = (t: TagDef) => (el: HTMLElement | null) => {
    if (el) anchors.current?.set(t.id, { el, pos: t.pos });
    else anchors.current?.delete(t.id);
  };

  // --- columns, sheet and bottom bar per mode
  let left: ReactNode = null, right: ReactNode = null, sheet: ReactNode = null, bottom: ReactNode = null, floating: ReactNode = null;
  const cams = <CameraWall site={landmark.name} groups={wall} shots={shots} onOpen={openCam} />;

  if (mode === 'environment') {
    left = <EnvironmentPanel site={landmark.name} env={ops.environment} />;
    right = cams;
  } else if (mode === 'security') {
    left = <SecurityPanel site={landmark.name} sec={ops.security} zones={ops.zones} onIncident={openIncident} />;
    right = cams;
  } else if (mode === 'facility') {
    if (room) {
      left = <RoomPanel zone={room} room={ops.room} systemId={systemId} onSystem={setSystemId} onBack={() => setRoomId(null)} />;
      right = <SystemPanel system={system} assets={ops.room.assets} onAsset={setAsset} />;
      bottom = <RoomChecks zone={room} room={ops.room} />;
      if (asset) sheet = <AssetSheet asset={asset} shot={assetShot} onClose={() => setAsset(null)} />;
    } else {
      left = <FacilityPanel site={landmark.name} fac={ops.facility} />;
      right = cams;
    }
  } else if (mode === 'matchday' && ops.matchday) {
    const md = ops.matchday;
    left = <SidePanel label="Home" side={md.home} shot={shots[wall[1].shots[0].id]} camId={wall[1].shots[0].id} />;
    right = <SidePanel label="Away" side={md.away} shot={shots[wall[0].shots[0].id]} camId={wall[0].shots[0].id} />;
    bottom = <Scoreboard md={md} venue={landmark.name} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />;
    if (expanded) sheet = <MatchSheet md={md} tab={tab} onTab={setTab} />;
  } else if (mode === 'patrol' && ops.patrol && route) {
    if (stop === null) {
      left = cams;
      right = <RoutePicker patrol={ops.patrol} routeId={routeId} onRoute={setRouteId} onStart={() => setStop(0)} />;
    } else {
      left = <PatrolStop route={route} stop={stop} onStep={(d) => setStop(stop + d)} onEnd={() => setStop(null)} />;
      right = <PatrolSide patrol={ops.patrol} route={route} routeIndex={routeIndex} stop={stop} />;
      floating = (
        <div className="viewfinder" aria-hidden="true">
          <span className="cam-live">Live</span>
          <strong>{route.stops[stop].cam}</strong>
          <span>
            PTZ · {route.stops[stop].place} · {route.stops[stop].name}
          </span>
        </div>
      );
    }
  } else if (mode === 'archive' && ops.archive) {
    left = (
      <ArchiveList
        events={ops.archive}
        venue={landmark.name}
        picked={picked}
        onPick={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
        onReplay={(id) => {
          setComparing(false);
          setReplayId(id);
        }}
        onCompare={() => {
          setReplayId(null);
          setComparing(true);
        }}
      />
    );
    const close = () => {
      setReplayId(null);
      setComparing(false);
    };
    if (pair) {
      right = <Comparison a={pair[0]} b={pair[1]} />;
      sheet = <ReplaySheet title={`${pair[0].stage} and ${pair[1].stage}`} groups={wall} shots={shots} onClose={close} />;
    } else if (replay) {
      right = <Insights event={replay} />;
      sheet = <ReplaySheet title={replay.stage} groups={wall} shots={shots} onClose={close} />;
    } else {
      right = cams;
    }
  } else if (mode === 'alerts' && ops.alerts && alert) {
    left = <AlertList alerts={ops.alerts} statusOf={statusOf} activeId={alertId} onPick={setAlertId} />;
    right = (
      <AlertDetail
        key={alert.id}
        alert={alert}
        status={statusOf(alert)}
        live={live3d}
        onLive={() => setLive3d((v) => !v)}
        onPlayback={() => setPlayback(true)}
        onStatus={(s) => setAlertStatus((m) => ({ ...m, [alert.id]: s }))}
      />
    );
    if (statusOf(alert) !== 'Resolved') bottom = <AlertToast alert={alert} />;
    if (playback) sheet = <PlaybackSheet alert={alert} shot={shots[`alert-${alert.shape}`]} onClose={() => setPlayback(false)} />;
  }

  if (feed) {
    const i = feeds.findIndex((f) => f.id === feed.id);
    sheet = null;
    bottom = null;
    floating = <CctvViewer feed={feed} site={landmark.name} index={i < 0 ? feeds.length + ops.zones.findIndex((z) => `zone-${z.id}` === feed.id) : i} cam={cam} onStep={stepCam} onClose={() => setFeed(null)} />;
  }

  return (
    <div className={`console${sheet ? ' has-sheet' : ''}`}>
      <div className="tag3d-layer">
        {!sheet &&
          !feed &&
          tags.map((t) => {
            const body = (
              <>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  {ICONS[t.icon]}
                </svg>
                <span>{t.name}</span>
                {t.value && <em>{t.value}</em>}
              </>
            );
            return t.onClick ? (
              <button key={t.id} id={`tag-${t.id}`} ref={pin(t)} className={`tag3d tone-${t.tone}`} onClick={t.onClick}>
                {body}
              </button>
            ) : (
              <div key={t.id} ref={pin(t)} className={`tag3d tone-${t.tone}`}>
                {body}
              </div>
            );
          })}
      </div>

      <aside className="hud-panel console-col console-left" aria-label={`${MODE_LABEL[mode]} details`}>
        {left}
      </aside>

      <nav className="hud-panel console-tabs" aria-label="Console views">
        {ops.modes.map((m) => (
          <button key={m} id={`mode-${m}`} className={m === mode ? 'is-on' : ''} aria-pressed={m === mode} onClick={() => setMode(m)}>
            {MODE_TAB[m]}
          </button>
        ))}
        <button id="console-close" className="console-exit" title="Back to flight (E)" onClick={onClose}>
          Close
        </button>
      </nav>

      <div className="console-center" data-tag-area>
        {sheet}
        {!sheet && floating}
      </div>
      <div className="console-bottom">{bottom}</div>

      <aside className="hud-panel console-col console-right" aria-label={`${MODE_LABEL[mode]} side panel`}>
        {right}
      </aside>
    </div>
  );
}
