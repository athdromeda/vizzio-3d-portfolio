import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Avatar } from '../data/avatars';
import { buildPlaceholder } from './builders';

const FIT = 2; // every model is scaled so its longest side is 2 units
const cache = new Map<string, Promise<THREE.Object3D>>();

/** Centres a loaded model on the origin and scales it to the shared size. */
function normalise(model: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const k = FIT / Math.max(size.x, size.y, size.z, 1e-6);
  model.position.sub(centre).multiplyScalar(k);
  model.scale.multiplyScalar(k);
  const root = new THREE.Group();
  root.add(model);
  root.userData.tick = () => {};
  return root;
}

/**
 * Returns the avatar's 3D object: its GLB when `model` is set and loads,
 * otherwise the built-in placeholder. Never rejects.
 */
export function loadAvatar(avatar: Avatar): Promise<THREE.Object3D> {
  let p = cache.get(avatar.id);
  if (!p) {
    p = avatar.model
      ? new GLTFLoader()
          .loadAsync(new URL(avatar.model, document.baseURI).href)
          .then((gltf) => normalise(gltf.scene))
          .catch((err) => {
            console.warn(`Avatar "${avatar.id}": could not load ${avatar.model}, using placeholder.`, err);
            return buildPlaceholder(avatar.placeholder);
          })
      : Promise.resolve(buildPlaceholder(avatar.placeholder));
    cache.set(avatar.id, p);
  }
  return p;
}

/** Shared lighting so previews and roster thumbnails match. `shadows` turns on the key light's shadow. */
export function addLights(scene: THREE.Object3D, shadows = false) {
  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x0a111c, 0.35);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 5, 4);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -2.4;
    key.shadow.camera.right = key.shadow.camera.top = 2.4;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 14;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 7;
  }
  const rim = new THREE.DirectionalLight(0x2f5bff, 4.5);
  rim.position.set(-4, 1.5, -4);
  const fill = new THREE.DirectionalLight(0x9db4ff, 0.7);
  fill.position.set(-3, 0.5, 3);
  scene.add(hemi, key, rim, fill);
}

/**
 * Studio reflections for PBR materials, generated in code (no HDR download).
 * Returns a disposer. Works for placeholders and for loaded GLBs alike.
 */
export function applyStudioEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04);
  scene.environment = target.texture;
  scene.environmentIntensity = 0.6;
  return () => {
    scene.environment = null;
    target.dispose();
    pmrem.dispose();
  };
}
