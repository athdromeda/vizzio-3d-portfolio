// The real city: Google Photorealistic 3D Tiles, streamed with 3d-tiles-renderer and authenticated
// through Cesium ion. Used instead of buildCity() when VITE_CESIUM_ION_TOKEN is set (see .env.example
// and geo.ts). The sky and sun come from the AtmosphereSky component, not from here.
//
// STATUS: written against 3d-tiles-renderer 0.5 and type-checked, but never run against Cesium ion:
// the preview environment has no network and no token. Expect to tune it on first run.
// The attribution returned by `credits()` must stay on screen.
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { TilesRenderer } from '3d-tiles-renderer';
import { CesiumIonAuthPlugin, GLTFExtensionsPlugin, ReorientationPlugin, TileCompressionPlugin, TilesFadePlugin, UnloadTilesPlugin } from '3d-tiles-renderer/plugins';
import type { City } from './buildCity';
import { ION_ASSET, ORIGIN } from './geo';
import { ColliderIndex, SUN_DAY } from './layout';
import { SHARED, makeSkyMaterial } from './shaders';
import { TileCreasedNormalsPlugin } from './tiles/TileCreasedNormalsPlugin';

/** Draco decoder for the tiles' meshes. Google hosts it; to self-host, copy three/examples/jsm/libs/draco/gltf into public/draco and point here. */
const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export function buildRealCity(): City {
  const group = new THREE.Group();

  // the same sky as the stand-in city is kept for the flyer's reflection bake only; the visible sky
  // is drawn by the AtmosphereSky component
  SHARED.uDay.value = 1;
  SHARED.uNight.value = 0;
  SHARED.uSun.value.set(...SUN_DAY);

  const tiles = new TilesRenderer();
  tiles.registerPlugin(new CesiumIonAuthPlugin({ apiToken: import.meta.env.VITE_CESIUM_ION_TOKEN ?? '', assetId: ION_ASSET, autoRefreshToken: true }));
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: new DRACOLoader().setDecoderPath(DRACO_PATH) }));
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new UnloadTilesPlugin());
  tiles.registerPlugin(new TilesFadePlugin());
  // Google's tiles ship near-flat normals; give them creased ones so the atmosphere can shade edges
  tiles.registerPlugin(new TileCreasedNormalsPlugin({ creaseAngle: Math.PI / 6 }));
  // puts the origin (lat/lon in radians) at 0,0,0 with +Y up, +Z north and +X west ...
  tiles.registerPlugin(new ReorientationPlugin({ lat: (ORIGIN.lat * Math.PI) / 180, lon: (ORIGIN.lon * Math.PI) / 180, height: 0 }));
  tiles.errorTarget = 12; // screen-space error in pixels: lower is sharper and heavier
  // ... and this turns it half a turn, to the app's frame: +X east, +Z south
  const frame = new THREE.Group();
  frame.rotation.y = Math.PI;
  frame.add(tiles.group);
  group.add(frame);

  // reflection bake for the flyer: a sky-only scene, lit by nothing but its own material
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), makeSkyMaterial()));
  // the atmosphere supplies the haze; keep a density-0 fog so the app's fog slot stays valid
  const fog = new THREE.FogExp2(new THREE.Color(0.5, 0.62, 0.8).getHex(), 0);

  const ray = new THREE.Raycaster();
  (ray as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true; // honoured by the tiles' own raycast
  const from = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  let attached: THREE.Camera | null = null;

  return {
    group,
    colliders: new ColliderIndex(), // empty: collisions come from surfaceBelow()
    envScene,
    fog,
    lightVersion: 0,
    setTimeOfDay() {},
    attach(camera, renderer) {
      if (attached) tiles.deleteCamera(attached);
      attached = camera;
      tiles.setCamera(camera);
      tiles.setResolutionFromRenderer(camera, renderer);
    },
    registerMapCamera(camera, size) {
      tiles.setCamera(camera);
      tiles.setResolution(camera, size, size);
    },
    surfaceBelow(x, y, z) {
      ray.set(from.set(x, y + 400, z), down);
      ray.far = 3000;
      const hit = ray.intersectObject(tiles.group, true)[0];
      return hit ? hit.point.y : null;
    },
    credits() {
      return tiles
        .getAttributions()
        .filter((a) => a.type === 'string')
        .map((a) => String(a.value))
        .join(' ');
    },
    update(t, _camera) {
      SHARED.uTime.value = t;
      if (attached) {
        attached.updateMatrixWorld();
        tiles.update();
      }
    },
    dispose() {
      tiles.dispose();
    },
  };
}
