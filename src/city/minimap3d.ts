// The real city has no vector map to pre-draw, so the minimap base comes from the scene itself: the loaded
// 3D tiles are rendered once more from high above the flyer, into a small off-screen target, and read back
// into a canvas. North is up and east is right, so the caller can turn the result to face the heading.
//
// The view is a narrow perspective from very high up rather than a true orthographic one. At this height it
// covers the same square to within a percent or so, but an orthographic camera reports an infinite distance
// from every tile (see TilesRenderer.calculateTileViewError), which drops the tiles it sees to the bottom of
// the load queue: the minimap's edges would never stream in and stay at the clear colour.
import * as THREE from 'three';

/** Height of the map camera: high enough that the perspective is near-orthographic, inside the far plane. */
const CAM_Y = 12000;
const CAM_NEAR = 50;
const CAM_FAR = CAM_Y + 8000;

export interface Minimap3D {
  /** The map camera; register it with the tiles so the ground under the whole view gets loaded. */
  camera: THREE.PerspectiveCamera;
  /** Aim it straight down at (x, z), covering ±range metres on the ground. */
  pose(x: number, z: number, range: number): void;
  /** Render `object` from above and return the painted canvas (north up, centred on x, z). */
  render(gl: THREE.WebGLRenderer, object: THREE.Object3D, x: number, z: number, range: number, clear: number): HTMLCanvasElement;
  dispose(): void;
}

export function makeMinimap3D(size: number): Minimap3D {
  const camera = new THREE.PerspectiveCamera(15, 1, CAM_NEAR, CAM_FAR);
  camera.up.set(0, 0, -1); // north (-Z) up, east (+X) right
  const target = new THREE.WebGLRenderTarget(size, size);
  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const saved = new THREE.Color();
  let span = -1;

  const pose = (x: number, z: number, range: number) => {
    if (range !== span) {
      span = range;
      // half the vertical FOV must reach ±range on the ground, measured from the camera height
      camera.fov = (2 * Math.atan(range / CAM_Y) * 180) / Math.PI;
      camera.updateProjectionMatrix();
    }
    camera.position.set(x, CAM_Y, z);
    camera.lookAt(x, 0, z);
    camera.updateMatrixWorld();
  };

  return {
    camera,
    pose,
    render(gl, object, x, z, range, clear) {
      pose(x, z, range);

      const alpha = gl.getClearAlpha();
      gl.getClearColor(saved);
      gl.setClearColor(clear, 1);
      gl.setRenderTarget(target);
      gl.clear();
      gl.render(object, camera);
      gl.readRenderTargetPixels(target, 0, 0, size, size, pixels);
      gl.setRenderTarget(null);
      gl.setClearColor(saved, alpha);

      // the target holds linear light, bottom row first: flip it and encode for display
      const d = img.data;
      for (let row = 0; row < size; row++) {
        const src = (size - 1 - row) * size * 4;
        const dst = row * size * 4;
        for (let i = 0; i < size * 4; i += 4) {
          d[dst + i] = 255 * Math.pow(pixels[src + i] / 255, 1 / 2.2);
          d[dst + i + 1] = 255 * Math.pow(pixels[src + i + 1] / 255, 1 / 2.2);
          d[dst + i + 2] = 255 * Math.pow(pixels[src + i + 2] / 255, 1 / 2.2);
          d[dst + i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    },
    dispose() {
      target.dispose();
    },
  };
}
