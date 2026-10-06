// Opens the city map from the toolbar and takes a screenshot per step.
// usage: node scripts/shot-map.mjs <outDir> <width> <height> "<step>,<step>,..."
// a step is a selector to click; "name=selector" names the shot; "wait:ms" waits; "key:KeyM" presses a key;
// "drag:dx:dy" drags the map; "wheel:dy" scrolls it; "shot:name" just waits and takes a picture.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const [out, w = '1280', h = '720', steps = ''] = process.argv.slice(2);
const SETTLE = Number(process.env.SETTLE ?? 20000);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const logs = [];
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.setDefaultTimeout(240000);
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(m.text().slice(0, 600)));
page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 600)));
const frag = readFileSync('artifact/vizzio-3d-portfolio.html', 'utf8');
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#faf9f5}[hidden]{display:none!important}</style></head><body>${frag}</body></html>`,
  { waitUntil: 'load' },
);
await page.waitForTimeout(800);
await page.click('#row-sg');
await page.waitForTimeout(400);
await page.click('#enter-country');
await page.waitForSelector('#take-off:not([disabled])', { timeout: 60000 });
await page.evaluate(() => document.querySelector('#take-off').click());
await page.waitForSelector('.loading', { state: 'detached', timeout: 300000 });
await page.evaluate(() => document.querySelector('#tour-skip')?.click());
await page.waitForTimeout(Number(process.env.FLY ?? 30000));
await page.screenshot({ path: `${out}/m-0-flight.png` });

let n = 1;
const missing = [];
for (const raw of steps.split(',').map((s) => s.trim()).filter(Boolean)) {
  if (raw.startsWith('wait:')) { await page.waitForTimeout(Number(raw.slice(5))); continue; }
  if (raw.startsWith('key:')) { await page.keyboard.press(raw.slice(4)); await page.waitForTimeout(1500); continue; }
  if (raw.startsWith('shot:')) { await page.waitForTimeout(SETTLE); await page.screenshot({ path: `${out}/m-${n++}-${raw.slice(5)}.png` }); continue; }
  if (raw.startsWith('real:')) {
    // a real mouse click at the element's centre
    const [, name, sel] = raw.split(':');
    const box = await page.locator(sel).boundingBox();
    if (!box) { missing.push(sel); continue; }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(SETTLE);
    console.log(JSON.stringify({ name, card: await page.evaluate(() => document.querySelector('.pin-card h3')?.textContent ?? null), menu: await page.evaluate(() => document.querySelector('.map-panel h2')?.textContent ?? null) }));
    await page.screenshot({ path: `${out}/m-${n++}-${name}.png` });
    continue;
  }
  if (raw.startsWith('wheel:')) { await page.mouse.move(Number(w) * 0.55, Number(h) * 0.5); await page.mouse.wheel(0, Number(raw.slice(6))); continue; }
  if (raw.startsWith('drag:')) {
    const [, dx, dy] = raw.split(':').map(Number);
    await page.mouse.move(Number(w) * 0.55, Number(h) * 0.5);
    await page.mouse.down();
    await page.mouse.move(Number(w) * 0.55 + dx, Number(h) * 0.5 + dy, { steps: 6 });
    await page.mouse.up();
    continue;
  }
  const [name, sel] = raw.includes('=') ? raw.split('=') : [raw.replace(/[^a-z0-9]+/gi, '-'), raw];
  const ok = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.click();
    return true;
  }, sel);
  if (!ok) { missing.push(sel); continue; }
  await page.waitForTimeout(SETTLE);
  await page.screenshot({ path: `${out}/m-${n++}-${name}.png` });
}
const info = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  map: !!document.querySelector('.citymap'),
  pins: document.querySelectorAll('.pin').length,
  pinsVisible: [...document.querySelectorAll('.pin')].filter((p) => p.style.visibility === 'visible').length,
  hudHidden: document.querySelector('.hud')?.classList.contains('is-hidden'),
}));
console.log(JSON.stringify({ missing, ...info }));
console.log(JSON.stringify(logs.filter((l) => !l.includes('ERR_TUNNEL') && !l.includes('THREE.Clock') && !l.includes('PCFSoft'))));
await browser.close();
