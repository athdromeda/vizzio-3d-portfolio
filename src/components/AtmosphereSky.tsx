// Real-city sky and light: the takram physically-based atmosphere, aligned to the app's rebased local
// frame. Mounted by CityScene only when REAL, in place of the bloom <Effects>. It also owns the
// post-processing composer for the real path (aerial perspective, tone mapping, antialiasing).
import { useFrame, useThree } from '@react-three/fiber';
import { RenderCubeTexture, type RenderCubeTextureApi } from '@react-three/drei';
import { EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing';
import { AerialPerspective, Atmosphere, Sky, SkyLight, SunLight, type AtmosphereApi } from '@takram/three-atmosphere/r3f';
import { CloudShape, CloudShapeDetail, LocalWeather, Turbulence } from '@takram/three-clouds';
import { Clouds } from '@takram/three-clouds/r3f';
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial';
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ORIGIN } from '../city/geo';
import { TIME_OF_DAY, type TimeOfDay } from '../city/timeOfDay';

/** Matches the three-geospatial reference story: day 173 (22 June), 10:00 local at 103.8545 E. */
const YEAR = 2025;
const DAY_OF_YEAR = 173;
const EXPOSURE = 6;
const dateAt = (hour: number) => new Date(Date.UTC(YEAR, 0, 1) + (DAY_OF_YEAR * 24 + hour - ORIGIN.lon / 15) * 3600000);

/** Self-hosted spatiotemporal blue noise (public/clouds/stbn.bin): the one cloud texture with no code generator. */
const STBN_URL = `${import.meta.env.BASE_URL}clouds/stbn.bin`;

const east = new THREE.Vector3();
const north = new THREE.Vector3();
const up = new THREE.Vector3();
const ecef = new THREE.Vector3();
const south = new THREE.Vector3();

interface Props {
  timeOfDay: TimeOfDay;
  onTimeSettled?: () => void;
}

export function AtmosphereSky({ timeOfDay, onTimeSettled }: Props) {
  const api = useRef<AtmosphereApi>(null);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  // The real sky, rendered into a cube map and used as the flyer's environment (see the
  // Sky-EnvironmentMap reference). Without it the flyer reflects the stand-in sky.
  const [env, setEnv] = useState<RenderCubeTextureApi | null>(null);
  const envPos = useRef<THREE.Group>(null);
  const hour = useRef(TIME_OF_DAY[timeOfDay].hour);
  const transition = useRef({ from: hour.current, to: hour.current, elapsed: 2, moving: false });
  // Cloud shape/weather/turbulence are generated in code (no downloaded textures); the effect
  // renders each once on first use.
  const cloudTextures = useMemo(
    () => ({
      localWeather: new LocalWeather(),
      shape: new CloudShape(),
      shapeDetail: new CloudShapeDetail(),
      turbulence: new Turbulence(),
    }),
    [],
  );
  useEffect(
    () => () => {
      cloudTextures.localWeather.dispose();
      cloudTextures.shape.dispose();
      cloudTextures.shapeDetail.dispose();
      cloudTextures.turbulence.dispose();
    },
    [cloudTextures],
  );

  // Align the atmosphere's world frame with the app's rebased local frame: +X east, +Y up, +Z south.
  // (Ellipsoid.WGS84.getNorthUpEastFrame gives X north, Y up, Z east — not our frame.)
  useLayoutEffect(() => {
    const a = api.current;
    if (!a) return;
    new Geodetic(radians(ORIGIN.lon), radians(ORIGIN.lat), 0).toECEF(ecef);
    Ellipsoid.WGS84.getEastNorthUpVectors(ecef, east, north, up);
    south.copy(north).negate();
    a.worldToECEFMatrix.makeBasis(east, up, south).setPosition(ecef);
    a.updateByDate(dateAt(hour.current));
    gl.toneMappingExposure = EXPOSURE;
  }, [gl]);

  useEffect(() => {
    const to = TIME_OF_DAY[timeOfDay].hour;
    if (to === hour.current) return;
    transition.current = { from: hour.current, to, elapsed: 0, moving: true };
  }, [timeOfDay]);

  useEffect(() => {
    scene.environment = env?.fbo.texture ?? null;
    return () => {
      scene.environment = null;
    };
  }, [scene, env]);

  useFrame(({ camera }, dt) => {
    const change = transition.current;
    if (change.moving) {
      change.elapsed = Math.min(2, change.elapsed + dt);
      const x = change.elapsed / 2;
      const k = x * x * (3 - 2 * x);
      hour.current = THREE.MathUtils.lerp(change.from, change.to, k);
      if (change.elapsed === 2) {
        change.moving = false;
        onTimeSettled?.();
      }
    }
    api.current?.updateByDate(dateAt(hour.current));
    envPos.current?.position.copy(camera.position);
  });

  return (
    <Atmosphere ref={api} correctAltitude>
      <Sky />
      <SunLight />
      <SkyLight />
      <group ref={envPos}>
        <RenderCubeTexture resolution={64} frames={Infinity} ref={setEnv}>
          {/* The reference raises the sun radius here so the cube faces settle. */}
          <Sky sunAngularRadius={0.1} />
        </RenderCubeTexture>
      </group>
      <EffectComposer multisampling={0}>
        {/* Volumetric clouds first, so AerialPerspective picks up their shadow/overlay. Generated
            textures keep this offline-safe apart from the tiles; qualityPreset is the cost knob. */}
        <Clouds
          qualityPreset="low"
          shadow-maxFar={1e5}
          stbnTexture={STBN_URL}
          localWeatherTexture={cloudTextures.localWeather}
          shapeTexture={cloudTextures.shape}
          shapeDetailTexture={cloudTextures.shapeDetail}
          turbulenceTexture={cloudTextures.turbulence}
        />
        {/* Same settings as the three-geospatial reference: albedoScale below 1 keeps the aerial
            perspective from washing the tiles out, and the sun/sky terms give them their shading. */}
        <AerialPerspective
          sunLight
          skyLight
          transmittance
          inscatter
          correctGeometricError
          albedoScale={0.6}
          stbnTexture={STBN_URL}
        />
        <LensFlare />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <SMAA />
        <Dithering />
      </EffectComposer>
    </Atmosphere>
  );
}
