// Development only: renders the city on its own, without the app around it, so a look can be checked quickly.
// Built by `npx vite build -c vite.harness.config.ts`, driven by scripts/shot-city-views.mjs.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { buildCity } from '../src/city/buildCity';

const W = window.innerWidth, H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // what React Three Fiber sets by default
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, W / H, 1, 42000);
const t0 = performance.now();
const city = buildCity();
const buildMs = Math.round(performance.now() - t0);
scene.add(city.group);
scene.fog = city.fog;
const pmrem = new THREE.PMREMGenerator(renderer);
let env: THREE.WebGLRenderTarget | null = null;
const bakeEnv = () => {
  env?.dispose();
  env = pmrem.fromScene(city.envScene, 0, 1, 1000);
  scene.environment = env.texture;
};

const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.26, 0.45, 1.15);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.setSize(W, H);

declare global {
  interface Window {
    shot: (pos: number[], look: number[], day: boolean, time?: number) => number;
    buildMs: number;
  }
}
window.buildMs = buildMs;
window.shot = (pos, look, day, time = 12) => {
  city.setDay(day, true);
  bakeEnv();
  bloom.strength = day ? 0.12 : 0.26;
  bloom.threshold = day ? 1.6 : 1.15;
  camera.position.set(pos[0], pos[1], pos[2]);
  camera.lookAt(look[0], look[1], look[2]);
  camera.updateMatrixWorld();
  city.update(time, camera.position);
  const s = performance.now();
  composer.render(0.016);
  renderer.getContext().finish();
  return Math.round(performance.now() - s);
};
