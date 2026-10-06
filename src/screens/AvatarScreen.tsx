import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { addLights, applyStudioEnvironment, loadAvatar } from '../avatars/loadAvatar';
import { renderThumbnails } from '../avatars/thumbnail';
import { Effects } from '../components/Effects';
import { AVATARS, OPEN_SLOTS, type Avatar } from '../data/avatars';
import type { Country } from '../data/countries';
import { PALETTE } from '../styles/palette';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Landing pad with tick marks under the model, like a survey turntable. It catches the shadow. */
function makeTurntable() {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.62, 1.62, 0.04, 96),
    // matte and almost non-reflective: at this grazing angle a glossy pad mirrors the whole studio as grey haze
    new THREE.MeshStandardMaterial({ color: PALETTE.pad, roughness: 0.9, metalness: 0, envMapIntensity: 0.03 }),
  );
  pad.position.y = -0.024;
  pad.receiveShadow = true;
  g.add(pad);
  const pts: number[] = [];
  const ring = (r: number, n = 96) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = ((i + 1) / n) * Math.PI * 2;
      pts.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r);
    }
  };
  ring(1.2);
  ring(1.59);
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r2 = i % 6 === 0 ? 1.5 : 1.55;
    pts.push(Math.cos(a) * 1.59, 0, Math.sin(a) * 1.59, Math.cos(a) * r2, 0, Math.sin(a) * r2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: PALETTE.signalSoft, transparent: true, opacity: 0.4 })));
  g.position.y = -1.25;
  return g;
}

function Preview({ object, yaw }: { object: THREE.Object3D; yaw: React.RefObject<{ value: number; held: boolean }> }) {
  const spin = useRef<THREE.Group>(null);
  const lights = useMemo(() => {
    const g = new THREE.Group();
    addLights(g, true);
    return g;
  }, []);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => applyStudioEnvironment(gl, scene), [gl, scene]);
  const turntable = useMemo(makeTurntable, []);
  const still = useMemo(reducedMotion, []);
  const appear = useRef(0);

  useEffect(() => {
    appear.current = 0; // replay the settle-in when the model changes
    (object.userData.setPose as ((preview: boolean) => void) | undefined)?.(true);
    object.userData.throttle = 0.6;
  }, [object]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const y = yaw.current!;
    if (!y.held && !still) y.value += dt * 0.35;
    appear.current = Math.min(1, appear.current + dt * 3);
    const e = 1 - Math.pow(1 - appear.current, 3);
    if (spin.current) {
      spin.current.rotation.y = y.value;
      spin.current.position.y = (still ? 0 : Math.sin(t * 1.3) * 0.05) - (1 - e) * 0.25;
      spin.current.scale.setScalar(0.9 + 0.1 * e);
    }
    turntable.rotation.y = -t * 0.05;
    (object.userData.tick as ((s: number) => void) | undefined)?.(t);
  });

  return (
    <>
      {/* lit white paint peaks around 2 in linear light; only lamps and exhaust cores cross 4 */}
      <Effects threshold={4} strength={0.38} radius={0.35} />
      <primitive object={lights} />
      <primitive object={turntable} />
      <group ref={spin}>
        <primitive object={object} />
      </group>
    </>
  );
}

interface Props {
  country: Country;
  avatarId: string;
  onPick: (id: string) => void;
  onBack: () => void;
  onFly: () => void;
}

export function AvatarScreen({ country, avatarId, onPick, onBack, onFly }: Props) {
  const [objects, setObjects] = useState<THREE.Object3D[] | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const yaw = useRef({ value: 0.5, held: false });
  const dragX = useRef(0);

  const index = Math.max(0, AVATARS.findIndex((a) => a.id === avatarId));
  const avatar: Avatar = AVATARS[index];

  useEffect(() => {
    let alive = true;
    Promise.all(AVATARS.map(loadAvatar)).then((objs) => {
      if (!alive) return;
      setThumbs(renderThumbnails(objs));
      setObjects(objs);
    });
    return () => {
      alive = false;
    };
  }, []);

  const pick = (a: Avatar) => {
    yaw.current.value = 0.5;
    onPick(a.id);
  };

  const stats = [
    { value: avatar.flight.topSpeed, unit: 'km/h', label: 'Top speed' },
    { value: avatar.flight.climb, unit: 'm/s', label: 'Climb rate' },
    { value: avatar.flight.turnRate, unit: '°/s', label: 'Turn rate' },
  ];

  return (
    <main className="main main--avatar">
      <section className="rail" aria-label="Flyers">
        <p className="eyebrow">
          {country.name} · {country.city}
        </p>
        <h1>Choose your flyer.</h1>
        <p className="lede">It carries you over {country.city}. You can swap it any time from the globe.</p>

        <ul className="roster">
          {AVATARS.map((a, i) => (
            <li key={a.id}>
              <button
                id={`avatar-${a.id}`}
                className={`tile${a.id === avatar.id ? ' is-picked' : ''}`}
                aria-pressed={a.id === avatar.id}
                onClick={() => pick(a)}
              >
                <span className="tile-art">{thumbs[i] && <img src={thumbs[i]} alt="" />}</span>
                <span className="tile-name">{a.name}</span>
                <svg className="tile-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.8" fill="none" />
                </svg>
              </button>
            </li>
          ))}
          {Array.from({ length: OPEN_SLOTS }, (_, i) => (
            <li key={`open-${i}`} className="tile tile--open" aria-label="Coming soon">
              <span>Coming soon</span>
            </li>
          ))}
        </ul>

        <div className="actions">
          <button id="take-off" className="cta" disabled={!objects} onClick={onFly}>
            Fly to {country.city}
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>
          <button id="back-to-globe" className="ghost" onClick={onBack}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M14 8H3M7 4L3 8l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
            Back to globe
          </button>
        </div>
      </section>

      <section className="stage stage--avatar" aria-label={`${avatar.name}, ${avatar.role}`}>
        <div
          className="preview"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            yaw.current.held = true;
            dragX.current = e.clientX;
          }}
          onPointerMove={(e) => {
            if (!yaw.current.held) return;
            yaw.current.value += (e.clientX - dragX.current) * 0.01;
            dragX.current = e.clientX;
          }}
          onPointerUp={() => (yaw.current.held = false)}
          onPointerCancel={() => (yaw.current.held = false)}
        >
          {objects ? (
            <Canvas shadows dpr={[1, 2]} gl={{ alpha: true, antialias: true }} camera={{ fov: 28, position: [0, 0.6, 7.3] }}>
              <Preview object={objects[index]} yaw={yaw} />
            </Canvas>
          ) : (
            <p className="preview-loading">Loading flyers</p>
          )}
        </div>

        <div className="readout">
          <dl className="stats stats--bare">
            {stats.map((s) => (
              <div key={s.label} className="stat">
                <dd>
                  {s.value}
                  <span className="stat-unit">{s.unit}</span>
                </dd>
                <dt>{s.label}</dt>
              </div>
            ))}
          </dl>
          <div className="nameplate">
            <p className="eyebrow">
              {avatar.callSign} · {avatar.role}
            </p>
            <p className="nameplate-name">{avatar.name}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
