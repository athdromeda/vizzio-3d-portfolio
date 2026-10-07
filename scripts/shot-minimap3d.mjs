// Checks the minimap against the running city. Serves artifact/ over http (so real tile URLs resolve) and
// drives the app into flight, then reads the minimap canvas and saves a crop of the panel.
// usage: node scripts/shot-minimap3d.mjs [outDir] [avatar] [seconds]
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '/tmp/opencode/minimap3d';
const avatar = process.argv[3] ?? 'kite';
const settle = Number(process.argv[4] ?? 18);
mkdirSync(out, { recursive: true });

const root = 'artifact';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer((req, res) => {
  const path = join(root, decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (!existsSync(path)) {
    res.writeHead(404).end('nope');
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/vizzio-3d-portfolio.html`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const logs = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(300000);
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 300)));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const real = await page.evaluate(() => document.querySelector('.main--real') !== null || Boolean(window.__test?.city?.credits));
await page.click('#row-sg');
await page.waitForTimeout(400);
await page.click('#enter-country');
await page.waitForSelector('#take-off:not([disabled])', { timeout: 60000 });
await page.evaluate((a) => document.querySelector('#avatar-' + a)?.click(), avatar);
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('#take-off').click());
await page.waitForSelector('.loading', { state: 'detached', timeout: 300000 });
await page.evaluate(() => document.querySelector('#tour-skip')?.click());
if (await page.evaluate(() => Boolean(window.__test))) await page.evaluate(() => window.__test.arrive());

// wait for tiles to stream in: the panel should hold a varied image, not one flat colour
await page.waitForFunction(
  () => {
    const el = document.querySelector('.hud-map canvas');
    if (!el) return false;
    const { data } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4) {
      if (seen.size > 40) return true;
      seen.add((data[i] >> 4) + ',' + (data[i + 1] >> 4) + ',' + (data[i + 2] >> 4));
    }
    return false;
  },
  null,
  { timeout: settle * 1000, polling: 1000 },
).catch(() => logs.push('WARN: minimap never became varied within ' + settle + 's'));

const stat = await page.evaluate(() => {
  const el = document.querySelector('.hud-map canvas');
  if (!el) return { ok: false, why: 'no .hud-map canvas' };
  const { data } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
  const seen = new Set();
  const quad = [new Set(), new Set(), new Set(), new Set()];
  let dark = 0, n = 0;
  for (let y = 0; y < el.height; y++) {
    for (let x = 0; x < el.width; x++) {
      const i = (y * el.width + x) * 4;
      const key = (data[i] >> 4) + ',' + (data[i + 1] >> 4) + ',' + (data[i + 2] >> 4);
      if (seen.size < 4096) seen.add(key);
      quad[(y > el.height / 2 ? 2 : 0) + (x > el.width / 2 ? 1 : 0)].add(key);
      if (data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40) dark++;
      n++;
    }
  }
  return { ok: true, size: [el.width, el.height], distinct: seen.size, corner: quad.map((q) => q.size), darkPct: Math.round((dark / n) * 100), display: getComputedStyle(el.closest('.hud-map')).display };
});

const box = await page.evaluate(() => {
  const r = document.querySelector('.hud-map').getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
await page.screenshot({ path: `${out}/full.png` });
await page.screenshot({ path: `${out}/panel.png`, clip: box });
await page.locator('.hud-bl').screenshot({ path: `${out}/hud-bl.png` }).catch(() => {});
console.log('REAL', real);
console.log('STAT', JSON.stringify(stat));
console.log('LOGS', JSON.stringify(logs.slice(0, 10)));
await browser.close();
server.close();
