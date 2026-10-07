// Heading-up minimap: the stand-in city is pre-drawn once, the real tiles are rendered top-down each frame;
// either base is then re-centred on the flyer and turned to face the way it is going.
import type { Landmark } from '../data/landmarks';
import type { V3 } from '../data/ops';
import { getBuildings, landSdf, parkSdf } from './layout';

const MPP = 16; // metres per pixel in the base map
const BOUNDS = { x0: -3300, x1: 7300, z0: -4300, z1: 2500 };
/** Metres from the centre to the edge of the minimap. */
export const MINIMAP_RANGE = 1500;

// map colours, kept close to the HUD tokens
const WATER = [9, 22, 46] as [number, number, number],
  LAND = [28, 34, 48],
  PARK = [22, 46, 32];
/** The water tone as a hex number, to clear the off-screen top-down render to the same colour. */
export const MINIMAP_WATER_HEX = (WATER[0] << 16) | (WATER[1] << 8) | WATER[2];

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
    const w = Math.max(1, b.w / MPP),
      d = Math.max(1, b.d / MPP);
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.restore();
  }
  return c;
}

/** The stand-in base: a pre-drawn image of the whole city, re-centred and turned to face the heading. */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  size: number,
  base: HTMLCanvasElement,
  x: number,
  z: number,
  heading: number,
  landmarks: Landmark[],
  positions: readonly V3[],
  visited: Set<string>,
) {
  const c = size / 2;
  const k = c / MINIMAP_RANGE;
  ctx.fillStyle = `rgb(${WATER.join(',')})`;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(-heading);
  ctx.scale(k, k);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(base, BOUNDS.x0 - x, BOUNDS.z0 - z, BOUNDS.x1 - BOUNDS.x0, BOUNDS.z1 - BOUNDS.z0);
  ctx.restore();
  drawMinimapOverlay(ctx, size, k, x, z, heading, landmarks, positions, visited);
}

/** Draws the live top-down render the same way, but its image is only ±RANGE wide, so it is drawn to the
 *  panel's circumscribed circle (overscan) — otherwise turning the map would leave the corners bare. */
export function drawMinimapTile(
  ctx: CanvasRenderingContext2D,
  size: number,
  image: HTMLCanvasElement,
  x: number,
  z: number,
  heading: number,
  landmarks: Landmark[],
  positions: readonly V3[],
  visited: Set<string>,
) {
  const c = size / 2;
  const over = c * Math.SQRT2 * 1.05;
  const k = over / MINIMAP_RANGE;
  ctx.fillStyle = `rgb(${WATER.join(',')})`;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(-heading);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, -over, -over, over * 2, over * 2);
  ctx.restore();
  drawMinimapOverlay(ctx, size, k, x, z, heading, landmarks, positions, visited);
}

/** Landmarks (diamonds, pinned to the rim when out of range), the north marker and the flyer. */
export function drawMinimapOverlay(
  ctx: CanvasRenderingContext2D,
  size: number,
  scale: number,
  x: number,
  z: number,
  heading: number,
  landmarks: Landmark[],
  positions: readonly V3[],
  visited: Set<string>,
) {
  const c = size / 2;
  const cos = Math.cos(heading),
    sin = Math.sin(heading);

  const edge = c - 9;
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    const dx = positions[i][0] - x,
      dz = positions[i][2] - z;
    let px = (dx * cos + dz * sin) * scale;
    let py = (-dx * sin + dz * cos) * scale;
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
