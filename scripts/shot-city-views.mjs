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
page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 800)));
await page.goto('file://' + resolve('dist-harness/harness.html'));
await page.waitForFunction(() => typeof window.shot === 'function', null, { timeout: 120000 });
const times = {};
for (const mode of modes.split(',')) {
  for (const n of names) {
    const [pos, look] = VIEWS[n];
    times[`${n}-${mode}`] = await page.evaluate(([p, l, d]) => window.shot(p, l, d), [pos, look, mode === 'day']);
    await page.screenshot({ path: `${out}/v-${n}-${mode}.png` });
  }
}
console.log(JSON.stringify({ buildMs: await page.evaluate(() => window.buildMs), times }));
console.log(JSON.stringify(logs.filter((l) => !l.includes('THREE.Clock') && !l.includes('PCFSoft')).slice(0, 6)));
await browser.close();
