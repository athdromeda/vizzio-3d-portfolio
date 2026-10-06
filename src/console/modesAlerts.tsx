// Alerts mode: AI video-analytics notifications with a geofence or tripwire drawn in the 3D scene.
import { useState } from 'react';
import type { Alert, Alerts, Tone } from '../data/ops';
import { Chip } from './widgets';

const STATUS: Record<Alert['status'], Tone> = { 'Alarm received': 'crit', 'PIC dispatched': 'warn', Resolved: 'ok' };

export function AlertList({ alerts, statusOf, activeId, onPick }: { alerts: Alerts; statusOf: (a: Alert) => Alert['status']; activeId: string; onPick: (id: string) => void }) {
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">Notifications</p>
        <h2>{alerts.site}</h2>
      </header>
      {alerts.items.map((a) => (
        <button key={a.id} id={`alert-${a.id}`} className={`c-pick c-pick--tall${a.id === activeId ? ' is-on' : ''}`} aria-pressed={a.id === activeId} onClick={() => onPick(a.id)}>
          <span>
            <strong>{a.type}</strong>
            <span>{a.place}</span>
            <span>{a.when}</span>
            <Chip tone={STATUS[statusOf(a)]}>{statusOf(a)}</Chip>
          </span>
        </button>
      ))}
    </>
  );
}

interface DetailProps {
  alert: Alert;
  status: Alert['status'];
  live: boolean;
  onLive: () => void;
  onPlayback: () => void;
  onStatus: (s: Alert['status']) => void;
}

export function AlertDetail({ alert, status, live, onLive, onPlayback, onStatus }: DetailProps) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  return (
    <>
      <header className="c-title">
        <p className="eyebrow">Alert</p>
        <h2>{alert.type}</h2>
        <Chip tone={STATUS[status]}>{status}</Chip>
      </header>
      <dl className="c-facts">
        <div>
          <dt>Location</dt>
          <dd>{alert.place}</dd>
        </div>
        <div>
          <dt>Detected</dt>
          <dd>{alert.detected}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{alert.confidence.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Recommended</dt>
          <dd>{alert.recommend}</dd>
        </div>
      </dl>
      <fieldset className="c-checklist">
        <legend className="eyebrow">Action checklist</legend>
        {alert.checklist.map((c, i) => {
          const key = `${alert.id}-${i}`;
          return (
            <label key={key} className="c-check">
              <input id={`check-${key}`} type="checkbox" checked={!!done[key]} onChange={() => setDone((d) => ({ ...d, [key]: !d[key] }))} />
              {c}
            </label>
          );
        })}
      </fieldset>
      <div className="c-actions">
        <button id="alert-live" className="c-btn" aria-pressed={live} onClick={onLive}>
          {live ? 'Wide view' : 'Live 3D'}
        </button>
        <button id="alert-playback" className="c-btn" onClick={onPlayback}>
          Playback
        </button>
        <button id="alert-inform" className="c-btn" disabled={status !== 'Alarm received'} onClick={() => onStatus('PIC dispatched')}>
          Inform PIC
        </button>
        <button id="alert-resolve" className="c-btn" disabled={status === 'Resolved'} onClick={() => onStatus('Resolved')}>
          Mark as resolved
        </button>
      </div>
    </>
  );
}

export function AlertToast({ alert }: { alert: Alert }) {
  return (
    <div className="hud-panel c-toast tone-crit" role="status">
      <strong>Alert · {alert.type}</strong>
      <span>
        {alert.place} · Confidence {alert.confidence.toFixed(2)}
      </span>
    </div>
  );
}

export function PlaybackSheet({ alert, shot, onClose }: { alert: Alert; shot?: string; onClose: () => void }) {
  return (
    <div className="hud-panel c-sheet" role="dialog" aria-label={`Playback, ${alert.type}`}>
      <header className="c-sheet-head">
        <div className="c-title">
          <p className="eyebrow">Playback</p>
          <h2>{alert.type}</h2>
          <p className="c-aside">{alert.place}</p>
        </div>
        <button id="playback-close" className="icon-btn" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
      </header>
      <div className="c-still">{shot ? <img src={shot} alt={`3D view of ${alert.place}`} /> : <span className="cam-wait">Rendering</span>}</div>
      <p className="note">Recorded footage is not part of this demo. This is a still of the 3D twin at the alert location, with the detection zone drawn in.</p>
    </div>
  );
}
