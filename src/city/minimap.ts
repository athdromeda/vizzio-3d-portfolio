// Heading-up minimap: a pre-drawn map of the whole stand-in city, re-centred on the flyer each frame.
import type { Landmark } from '../data/landmarks';
import { getBuildings, landSdf, parkSdf } from './layout';

const MPP = 16; // metres per pixel in the base map
const BOUNDS = { x0: -3300, x1: 7300, z0: -4300, z1: 2500 };
const RANGE = 1500; // metres from the centre to the edge of the minimap

// map colours, kept close to the HUD tokens
const WATER = [9, 22, 46], LAND = [28, 34, 48], PARK = [22, 46, 32];

/** Draws coast, parks and building footprints once. */
export function makeMinimapBase() {
  const w = Math.round((BOUNDS.x1 - BOUNDS.x0) / MPP);
  const h = Math.round((BOUNDS.z1 - BOUNDS.z0) / MPP);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = BOUNDS.x0 + (i + 0.5) * MPP;
      const z = BOUNDS.z0 + (j + 0.5) * MPP;
      const col = landSdf(x, z) < 0 ? WATER : parkSdf(x, z) < 0 ? PARK : LAND;
      const k = (j * w + i) * 4;
      img.data[k] = col[0];
      img.data[k + 1] = col[1];
      img.data[k + 2] = col[2];
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(214, 226, 255, 0.3)';
  for (const b of getBuildings()) {
    if (b.y0 > 0) continue;
    ctx.save();
    ctx.translate((b.x - BOUNDS.x0) / MPP, (b.z - BOUNDS.z0) / MPP);
    ctx.rotate(-b.rot);
    const w = Math.max(1, b.w / MPP), d = Math.max(1, b.d / MPP);
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.restore();
  }
  return c;
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  size: number,
  base: HTMLCanvasElement,
  x: number,
  z: number,
  heading: number,
  landmarks: Landmark[],
  visited: Set<string>,
) {
  const c = size / 2;
  const k = c / RANGE;
  const cos = Math.cos(heading), sin = Math.sin(heading);
  ctx.fillStyle = `rgb(${WATER.join(',')})`;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(-heading);
  ctx.scale(k, k);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(base, BOUNDS.x0 - x, BOUNDS.z0 - z, BOUNDS.x1 - BOUNDS.x0, BOUNDS.z1 - BOUNDS.z0);
  ctx.restore();

  // landmarks: diamonds, pinned to the edge when out of range; visited ones are hollow
  const edge = c - 9;
  for (const lm of landmarks) {
    const dx = lm.pos[0] - x, dz = lm.pos[2] - z;
    let px = (dx * cos + dz * sin) * k;
    let py = (-dx * sin + dz * cos) * k;
    const m = Math.max(Math.abs(px), Math.abs(py));
    if (m > edge) {
      px *= edge / m;
      py *= edge / m;
    }
    ctx.save();
    ctx.translate(c + px, c + py);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#04070d';
    ctx.fillRect(-5.5, -5.5, 11, 11);
    if (visited.has(lm.id)) {
      ctx.strokeStyle = '#7fa0ff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-3.5, -3.5, 7, 7);
    } else {
      ctx.fillStyle = '#7fa0ff';
      ctx.fillRect(-4, -4, 8, 8);
    }
    ctx.restore();
  }

  // north marker on the rim
  ctx.font = "500 10px 'Martian Mono', ui-monospace, monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f1f5fa';
  ctx.fillText('N', c - sin * (c - 11), c - cos * (c - 11));

  // the flyer: always centre, always pointing up
  ctx.beginPath();
  ctx.moveTo(c, c - 9);
  ctx.lineTo(c + 6, c + 7);
  ctx.lineTo(c, c + 3.5);
  ctx.lineTo(c - 6, c + 7);
  ctx.closePath();
  ctx.fillStyle = '#f1f5fa';
  ctx.strokeStyle = '#04070d';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fill();
}
