// Real-city sky and light: the takram physically-based atmosphere, aligned to the app's rebased local
// frame. Mounted by CityScene only when REAL, in place of the bloom <Effects>. It also owns the
// post-processing composer for the real path (aerial perspective, tone mapping, antialiasing).
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing';
import { AerialPerspective, Atmosphere, Sky, SkyLight, SunLight, type AtmosphereApi } from '@takram/three-atmosphere/r3f';
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial';
import { Dithering } from '@takram/three-geospatial-effects/r3f';
import { ToneMappingMode } from 'postprocessing';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { ORIGIN } from '../city/geo';

/** Matches the three-geospatial reference story: day 173 (22 June), 10:00 local at 103.8545 E. */
const YEAR = 2025;
const DAY_OF_YEAR = 173;
const TIME_OF_DAY = 10;
const EXPOSURE = 6;
const SUN_DATE = new Date(Date.UTC(YEAR, 0, 1) + (DAY_OF_YEAR * 24 + TIME_OF_DAY - ORIGIN.lon / 15) * 3600000);

const east = new THREE.Vector3();
const north = new THREE.Vector3();
const up = new THREE.Vector3();
const ecef = new THREE.Vector3();
const south = new THREE.Vector3();

export function AtmosphereSky() {
  const api = useRef<AtmosphereApi>(null);
  const gl = useThree((s) => s.gl);

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

  useFrame(() => {
    api.current?.updateByDate(SUN_DATE);
  });

  return (
    <Atmosphere ref={api} correctAltitude>
      <Sky />
      <SunLight />
      <SkyLight />
      <EffectComposer multisampling={0}>
        {/* Same settings as the three-geospatial reference: albedoScale below 1 keeps the aerial
            perspective from washing the tiles out, and the sun/sky terms give them their shading. */}
        <AerialPerspective sunLight skyLight transmittance inscatter correctGeometricError albedoScale={0.6} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <SMAA />
        <Dithering />
      </EffectComposer>
    </Atmosphere>
  );
}
