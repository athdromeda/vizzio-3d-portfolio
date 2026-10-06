// The real city: Google Photorealistic 3D Tiles, streamed with 3d-tiles-renderer.
// Used instead of buildCity() when VITE_GOOGLE_MAPS_KEY is set (see .env.example and geo.ts).
//
// STATUS: written against 3d-tiles-renderer 0.5 and type-checked, but never run against Google's
// servers: the preview environment has no network and no key. Expect to tune it on first run.
// Google's terms require the attribution returned by `credits()` to stay on screen.
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin, GoogleCloudAuthPlugin, ReorientationPlugin, TileCompressionPlugin, TilesFadePlugin, UnloadTilesPlugin } from '3d-tiles-renderer/plugins';
import type { City } from './buildCity';
import { ORIGIN } from './geo';
import { ColliderIndex, FOG_DENSITY, SUN_DAY } from './layout';
import { SHARED, makeSkyMaterial } from './shaders';

/** Draco decoder for the tiles' meshes. Google hosts it; to self-host, copy three/examples/jsm/libs/draco/gltf into public/draco and point here. */
const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export function buildRealCity(): City {
  const group = new THREE.Group();

  // the same sky as the stand-in city, fixed at day: the tiles carry their own baked daylight
  SHARED.uDay.value = 1;
  SHARED.uSun.value.set(...SUN_DAY);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), makeSkyMaterial());
  sky.scale.setScalar(20000);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);

  const tiles = new TilesRenderer();
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '', autoRefreshToken: true }));
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: new DRACOLoader().setDecoderPath(DRACO_PATH) }));
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new UnloadTilesPlugin());
  tiles.registerPlugin(new TilesFadePlugin());
  // puts the origin (lat/lon in radians) at 0,0,0 with +Y up, +Z north and +X west ...
  tiles.registerPlugin(new ReorientationPlugin({ lat: (ORIGIN.lat * Math.PI) / 180, lon: (ORIGIN.lon * Math.PI) / 180, height: 0 }));
  tiles.errorTarget = 12; // screen-space error in pixels: lower is sharper and heavier
  // ... and this turns it half a turn, to the app's frame: +X east, +Z south
  const frame = new THREE.Group();
  frame.rotation.y = Math.PI;
  frame.add(tiles.group);
  group.add(frame);

  // lights for the flyer; the tiles themselves are unlit
  const sunLight = new THREE.DirectionalLight(new THREE.Color(1, 0.95, 0.86), 3.2);
  sunLight.position.set(...SUN_DAY).multiplyScalar(1000);
  group.add(sunLight, new THREE.HemisphereLight(new THREE.Color(0.5, 0.62, 0.9), new THREE.Color(0.34, 0.31, 0.27), 1.25));

  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), makeSkyMaterial()));
  const fog = new THREE.FogExp2(new THREE.Color(0.5, 0.62, 0.8).getHex(), FOG_DENSITY * 0.35);

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
    lit: false,
    setDay() {},
    attach(camera, renderer) {
      if (attached) tiles.deleteCamera(attached);
      attached = camera;
      tiles.setCamera(camera);
      tiles.setResolutionFromRenderer(camera, renderer);
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
    update(t, camera) {
      SHARED.uTime.value = t;
      sky.position.copy(camera);
      if (attached) {
        attached.updateMatrixWorld();
        tiles.update();
      }
    },
    dispose() {
      tiles.dispose();
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
    },
  };
}
