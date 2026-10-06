// Development only: screenshots of the city from fixed viewpoints, by day and at dusk.
// usage: npx vite build -c vite.harness.config.ts && node scripts/shot-city-views.mjs <outDir> [views] [width] [height] [modes]
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';

const VIEWS = {
  aerial: [[2300, 2600, 1400], [900, 0, -500]],
  bay: [[-500, 420, 620], [500, 60, -60]],
  mbs: [[60, 90, 240], [562, 110, 0]],
  cbd: [[-150, 260, 900], [-700, 60, 150]],
  streets: [[-1500, 170, -1300], [-1900, 0, -1700]],
  flats: [[1700, 190, 1050], [2100, 20, 700]],
  shop: [[-250, 110, -1250], [-560, 0, -1500]],
  port: [[-1100, 240, 2300], [-1800, 0, 1500]],
  stadium: [[2000, 240, -260], [2330, 30, -760]],
  airport: [[4700, 420, -1400], [5440, 20, -2050]],
  low: [[-900, 45, 520], [-700, 60, 200]],
  top: [[-800, 900, -900], [-800, 0, -1000]],
  map: [[900, 5200, 400], [900, 0, -300]],
  coast: [[2600, 520, 1500], [1500, 0, 700]],
  river: [[-500, 220, -80], [-1100, 0, -330]],
  street: [[-640, 14, 470], [-700, 22, 250]],
  water: [[-240, 40, 60], [560, 90, -40]],
  cars: [[-640, 9, 430], [-700, 4, 250]],
  kerb: [[-610, 26, 520], [-760, 0, 330]],
  down: [[-700, 150, 331], [-700, 0, 330]],
};
const [out, which = 'all', w = '1100', h = '620', modes = 'day,dusk'] = process.argv.slice(2);
const names = which === 'all' ? Object.keys(VIEWS) : which.split(',');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'],
});
const logs = [];
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(m.text().slice(0, 1500)));
page.on('console', (m) => m.type() === 'log' && process.env.SHOW && console.log('  ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 800)));
await page.goto('file://' + resolve('dist-harness/harness.html'));
await page.waitForFunction(() => typeof window.shot === 'function', null, { timeout: 120000 });
// "rider" views: the pilot on a street corner, on foot or on a bike. RIDER=walk|ride chooses.
const RIDER_AT = (process.env.RIDER_AT ?? "-742,300,0.2").split(",").map(Number);
if (process.env.RIDER) {
  const [x, z, yaw] = RIDER_AT;
  const n = await page.evaluate(([m, a, b, c, l]) => window.rider(m, a, b, c, 1.2, l), [process.env.RIDER, x, z, yaw, Number(process.env.LEAN ?? 0)]);
  console.log('bikes parked nearby:', n);
  Object.assign(VIEWS, {
    rside: [[x - 4.5, 1.5, z - 0.5], [x, 1.0, z]],
    rclose: [[x - 2.6, 1.3, z - 0.9], [x, 0.95, z - 0.1]],
    rq: [[x + 2.2, 1.6, z - 2.6], [x, 0.9, z]],
    rright: [[x + 2.8, 1.2, z + 0.2], [x, 0.9, z]],
    rback: [[x - 1.2, 2.0, z + 6], [x, 1.2, z - 4]],
    rfront: [[x + 2.5, 1.3, z - 5], [x, 1.0, z]],
    rwide: [[x - 9, 5, z + 14], [x, 1, z - 6]],
    rcam: [[x + 4.84, 3.09, z - 0.74], [x - 9, -1.2, z + 2.1]],
    rabove: [[x + 3, 9, z + 10], [x + 2, 1, z]],
    rnorth: [[x + 2, 2.2, z - 9], [x + 2, 1.2, z]],
  });
}
// "show" views: every vehicle model in a row on the airfield. SHOW=1 turns it on.
if (process.env.SHOW) {
  const [x, z] = (process.env.SHOW_AT ?? '5560,-2050').split(',').map(Number);
  const len = await page.evaluate(([a, b, s]) => window.lineup(a, b, s), [x, z, Number(process.env.SEED ?? 0)]);
  console.log('line-up length', len);
  const span = (a, b, d = 11, h = 2.0) => [[x + (a + b) / 2, h, z + d], [x + (a + b) / 2, 0.9, z]];
  Object.assign(VIEWS, {
    s1: span(0, 20), s2: span(18, 40), s3: span(36, 66, 17, 3), s4: span(62, 96, 19, 3.4), s5: span(88, 104, 9),
    sfront: [[x + 34, 1.6, z + 5], [x + 4, 1.0, z - 1]],
    srear: [[x - 9, 1.7, z + 4.5], [x + 10, 0.9, z - 1]],
    stop: [[x + 12, 9, z + 3], [x + 12, 0, z - 2]],
    sfar: [[x + 20, 2.2, z + 3], [x + 20, 0.9, z - 9]],
  });
}
// free cameras: EYES="x,y,z,lookX,lookY,lookZ;..." adds views e0, e1, ... ; T sets the clock (the signal phase)
(process.env.EYES ?? '').split(';').filter(Boolean).forEach((e, i) => {
  const v = e.split(',').map(Number);
  VIEWS['e' + i] = [v.slice(0, 3), v.slice(3, 6)];
});
const CLOCK = Number(process.env.T ?? 12);
// ACTOR="x,z,vx,vz[,urge]" puts the pilot on the street, so the people around can be seen making room
if (process.env.ACTOR) {
  const a = process.env.ACTOR.split(',').map(Number);
  await page.evaluate((v) => window.actorAt(...v), a);
  if (process.env.RIDER) await page.evaluate(([m, x, z, vx, vz]) => window.rider(m, x, z, Math.atan2(vx, -vz) || 0), [process.env.RIDER, a[0], a[1], a[2] ?? 0, a[3] ?? 0]);
}
const times = {};
for (const mode of modes.split(',')) {
  for (const n of names) {
    const [pos, look] = VIEWS[n];
    times[`${n}-${mode}`] = await page.evaluate(([p, l, d, t]) => window.shot(p, l, d, t), [pos, look, mode === 'day', CLOCK]);
    await page.screenshot({ path: `${out}/v-${n}-${mode}.png` });
  }
}
console.log(JSON.stringify({ buildMs: await page.evaluate(() => window.buildMs), times }));
console.log('street life in the last view:', JSON.stringify(await page.evaluate(() => window.tally?.())));
console.log(JSON.stringify(logs.filter((l) => !l.includes('THREE.Clock') && !l.includes('PCFSoft')).slice(0, 6)));
await browser.close();
