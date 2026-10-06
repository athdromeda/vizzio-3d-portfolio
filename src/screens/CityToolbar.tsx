// The city toolbar: the menus of the city map, plus the map's own tools while it is open
// and the ways out of the flight while it is not.
import { Icon, type IconName } from '../components/icons';
import { MAP_MENUS, type MapMenuId } from '../data/citymap';

interface Props {
  /** The open map menu, or null while flying. */
  mapId: MapMenuId | null;
  flat: boolean;
  onMenu: (id: MapMenuId) => void;
  onFlat: () => void;
  onZoom: (factor: number) => void;
  onFly: () => void;
  onStats: () => void;
  onFlyer: () => void;
  onGlobe: () => void;
}

function Tool({ id, icon, label, hint, pressed, onClick }: { id: string; icon: IconName; label: string; hint?: string; pressed?: boolean; onClick: () => void }) {
  return (
    <button id={id} className="tool" title={hint ?? label} aria-pressed={pressed} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

export function CityToolbar({ mapId, flat, onMenu, onFlat, onZoom, onFly, onStats, onFlyer, onGlobe }: Props) {
  return (
    <nav className="hud-panel toolbar" aria-label="City tools">
      {MAP_MENUS.map((m, i) => (
        <Tool key={m.id} id={`tool-${m.id}`} icon={m.icon} label={m.label} hint={`${m.title} (${i + 1})`} pressed={mapId === m.id} onClick={() => onMenu(m.id)} />
      ))}
      <span className="tool-rule" aria-hidden="true" />
      {mapId ? (
        <>
          <Tool id="tool-flat" icon="tilt" label={flat ? '2D' : '3D'} hint="Switch between a flat and a tilted map" pressed={flat} onClick={onFlat} />
          <Tool id="tool-zoom-in" icon="plus" label="Zoom in" onClick={() => onZoom(0.7)} />
          <Tool id="tool-zoom-out" icon="minus" label="Zoom out" onClick={() => onZoom(1 / 0.7)} />
          <span className="tool-rule" aria-hidden="true" />
          <Tool id="tool-fly" icon="fly" label="Fly" hint="Back to flight (Esc)" onClick={onFly} />
        </>
      ) : (
        <>
          <Tool id="replay-tour" icon="chart" label="Statistics" hint="City statistics" onClick={onStats} />
          <Tool id="change-flyer" icon="flyer" label="Flyer" hint="Change flyer" onClick={onFlyer} />
          <Tool id="city-to-globe" icon="globe" label="Globe" hint="Back to the globe" onClick={onGlobe} />
        </>
      )}
    </nav>
  );
}
