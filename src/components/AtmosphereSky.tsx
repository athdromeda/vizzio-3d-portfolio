// Real-city sky and light: the takram physically-based atmosphere, aligned to the app's rebased local
// frame. Mounted by CityScene for the whole visit (when REAL) and switched with `visible`, so the sky
// stays warm and taking off from the generated city is instant. It also owns the post-processing
// composer for the real path (aerial perspective, tone mapping, antialiasing).
import { useFrame, useThree } from '@react-three/fiber';
import { RenderCubeTexture, type RenderCubeTextureApi } from '@react-three/drei';
import { EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing';
import { AerialPerspective, Atmosphere, Sky, SkyLight, Stars, SunLight, type AtmosphereApi } from '@takram/three-atmosphere/r3f';
import type { SkyMaterial } from '@takram/three-atmosphere';
import { CloudShape, CloudShapeDetail, LocalWeather, Turbulence } from '@takram/three-clouds';
import { Clouds } from '@takram/three-clouds/r3f';
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial';
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import * as THREE from 'three';
import { ORIGIN } from '../city/geo';
import { TIME_OF_DAY, hasDaylightIrradiance, type TimeOfDay } from '../city/timeOfDay';
import { NightSkyGlow } from './NightSkyGlow';

/** Matches the three-geospatial reference story: day 173 (22 June), 10:00 local at 103.8545 E. */
const YEAR = 2025;
const DAY_OF_YEAR = 173;
const EXPOSURE = 6;
const dateAt = (hour: number) => new Date(Date.UTC(YEAR, 0, 1) + (DAY_OF_YEAR * 24 + hour - ORIGIN.lon / 15) * 3600000);

/** Self-hosted spatiotemporal blue noise (public/clouds/stbn.bin): the one cloud texture with no code generator. */
const STBN_URL = `${import.meta.env.BASE_URL}clouds/stbn.bin`;

/** Self-hosted star catalog (public/stars/stars.bin), copied from the atmosphere package. */
const STARS_URL = `${import.meta.env.BASE_URL}stars/stars.bin`;

const east = new THREE.Vector3();
const north = new THREE.Vector3();
const up = new THREE.Vector3();
const ecef = new THREE.Vector3();
const south = new THREE.Vector3();

interface Props {
  timeOfDay: TimeOfDay;
  /** False while the generated city is on screen: the atmosphere rests but keeps its shaders and targets. */
  visible: boolean;
  onTimeSettled?: () => void;
}

export function AtmosphereSky({ timeOfDay, visible, onTimeSettled }: Props) {
  const api = useRef<AtmosphereApi>(null);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const nightFill = useMemo(() => new THREE.HemisphereLight(0x9db4ff, 0x121a2c, 0), []);
  // The visible sky dome, so the moon's contribution can be raised after sunset (a moonlit sky).
  const sky = useRef<ComponentRef<typeof Sky>>(null);
  // Unlit by sun or sky after sunset, the volumetric clouds would read as black blobs: thin them out.
  const clouds = useRef<ComponentRef<typeof Clouds>>(null);
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

  // temporalAntialiasing blends 90% history by default; the pilot has no motion vectors, so that
  // history ghosted at its silhouette. temporalAlpha 1 takes the current frame only: no lifetime
  // smear against the sky (the clouds read a touch noisier, but never swirl at the flyer's edge).
  useEffect(() => {
    const effect = clouds.current;
    if (effect) effect.cloudsPass.resolveMaterial.uniforms.temporalAlpha.value = 1;
  }, []);

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

  // The real sky exposure is owned here for the duration of the visit; the generated-city path sets 1.
  useEffect(() => {
    if (visible) gl.toneMappingExposure = EXPOSURE;
  }, [visible, gl]);

  // Hand the flyer the real sky's reflections while the real city is up. When hidden we leave the
  // environment to the generated city, which bakes its own.
  useEffect(() => {
    if (!visible) return;
    scene.environment = env?.fbo.texture ?? null;
  }, [scene, env, visible]);

  useEffect(() => {
    scene.add(nightFill);
    return () => {
      scene.remove(nightFill);
    };
  }, [scene, nightFill]);

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
    const night = THREE.MathUtils.smoothstep(hour.current, 17, 21);
    // A moonlit sky: raising the moon's radiance keeps the night sky a deep blue instead of black.
    if (sky.current) (sky.current.material as SkyMaterial).lunarRadianceScale = THREE.MathUtils.lerp(1, 3, night);
    // Fewer clouds at night: with no sun or sky light they are black, and light pollution lit them.
    if (clouds.current) clouds.current.coverage = THREE.MathUtils.lerp(0.3, 0.14, night);
    // The atmosphere's sky light falls almost to zero after sunset. Keep a cool local fill so
    // streamed buildings and the pilot remain readable without flattening the daytime scene.
    // Off (0) while hidden, so it cannot light the generated city.
    nightFill.intensity = visible ? THREE.MathUtils.smoothstep(hour.current, 17, 21) * 0.85 : 0;
    envPos.current?.position.copy(camera.position);
  });

  return (
    <Atmosphere ref={api} correctAltitude>
      {/* Everything the atmosphere draws lives under this group: hidden while the generated city is up,
          so its sky dome, lights and stars cannot leak into that scene. */}
      <group visible={visible}>
        <Sky ref={sky} />
        <NightSkyGlow hourRef={hour} />
        <SunLight />
        <SkyLight />
        {/* Real night sky: the catalog stars fade out on their own as the sun rises. */}
        <Stars data={STARS_URL} intensity={104} />
        <group ref={envPos}>
          <RenderCubeTexture resolution={64} frames={visible ? Infinity : 0} ref={setEnv}>
            {/* The reference raises the sun radius here so the cube faces settle. */}
            <Sky sunAngularRadius={0.1} />
          </RenderCubeTexture>
        </group>
      </group>
      <EffectComposer enabled={visible} multisampling={0}>
        {/* Volumetric clouds first, so AerialPerspective picks up their shadow/overlay. Generated
            textures keep this offline-safe apart from the tiles; qualityPreset is the cost knob. */}
        <Clouds
          ref={clouds}
          qualityPreset="low"
          // The clouds default to a ¼-res temporal upscale. The pilot carries no motion vectors, so its
          // moving silhouette tore against the cloud history. Resolve at full res instead (see the
          // temporalAlpha effect below, which drops the history blend as well).
          temporalUpscale={false}
          shadow-maxFar={1e5}
          stbnTexture={STBN_URL}
          localWeatherTexture={cloudTextures.localWeather}
          shapeTexture={cloudTextures.shape}
          shapeDetailTexture={cloudTextures.shapeDetail}
          turbulenceTexture={cloudTextures.turbulence}
        />
        {/* Same settings as the three-geospatial reference: albedoScale below 1 keeps the aerial
            perspective from washing the tiles out, and the sun/sky terms give them their shading. */}
        {/* After sunset, post-process solar irradiance multiplies lit mesh colors toward black.
            Keep the haze but let the local lights illuminate tiles and pilot directly. */}
        <AerialPerspective
          sunLight={hasDaylightIrradiance(timeOfDay)}
          skyLight={hasDaylightIrradiance(timeOfDay)}
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
