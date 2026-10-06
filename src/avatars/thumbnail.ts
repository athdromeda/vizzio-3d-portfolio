import * as THREE from 'three';
import { addLights, applyStudioEnvironment } from './loadAvatar';

/**
 * Renders roster thumbnails from the real models, so a swapped GLB shows up in the grid
 * without anyone exporting an image. One short-lived renderer draws them all.
 */
export function renderThumbnails(objects: THREE.Object3D[], size = 260): string[] {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  addLights(scene);
  const disposeEnv = applyStudioEnvironment(renderer, scene);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(2.6, 1.4, 4.2);
  camera.lookAt(0, 0, 0);

  const urls = objects.map((obj) => {
    const parent = obj.parent;
    const tick = obj.userData.tick as ((t: number) => void) | undefined;
    tick?.(0.02);
    scene.add(obj);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(obj);
    parent?.add(obj);
    return url;
  });

  disposeEnv();
  renderer.dispose();
  renderer.forceContextLoss();
  return urls;
}
