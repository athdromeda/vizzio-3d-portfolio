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

/** Matches the three-geospatial reference story: day 173 (22 June), 10:00 local at 103.8545 E. */
const YEAR = 2025;
const DAY_OF_YEAR = 173;
const TIME_OF_DAY = 9;
const EXPOSURE = 6;
const SUN_DATE = new Date(Date.UTC(YEAR, 0, 1) + (DAY_OF_YEAR * 24 + TIME_OF_DAY - ORIGIN.lon / 15) * 3600000);

/** Self-hosted spatiotemporal blue noise (public/clouds/stbn.bin): the one cloud texture with no code generator. */
const STBN_URL = `${import.meta.env.BASE_URL}clouds/stbn.bin`;

const east = new THREE.Vector3();
const north = new THREE.Vector3();
const up = new THREE.Vector3();
const ecef = new THREE.Vector3();
const south = new THREE.Vector3();

export function AtmosphereSky() {
  const api = useRef<AtmosphereApi>(null);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  // The real sky, rendered into a cube map and used as the flyer's environment (see the
  // Sky-EnvironmentMap reference). Without it the flyer reflects the stand-in sky.
  const [env, setEnv] = useState<RenderCubeTextureApi | null>(null);
  const envPos = useRef<THREE.Group>(null);
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
    a.updateByDate(SUN_DATE);
    gl.toneMappingExposure = EXPOSURE;
  }, [gl]);

  useEffect(() => {
    scene.environment = env?.fbo.texture ?? null;
    return () => {
      scene.environment = null;
    };
  }, [scene, env]);

  useFrame(({ camera }) => {
    api.current?.updateByDate(SUN_DATE);
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
