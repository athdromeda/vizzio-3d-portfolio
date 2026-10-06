// Walks a landmark console and takes a screenshot per step.
// usage: node scripts/shot-console.mjs <outDir> <landmark> <width> <height> "<step>,<step>,..."
// a step is a selector to click; "name=selector" names the shot; "wait:ms" waits; "key:Escape" presses a key;
// "real:name:selector" clicks with the real mouse and reports what was under the cursor;
// "drag:selector:dx:dy" drags inside an element; "wheel:selector:dy" scrolls over it.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const [out, landmark = 'stadium', w = '1280', h = '720', steps = ''] = process.argv.slice(2);
const SETTLE = Number(process.env.SETTLE ?? 9000);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const logs = [];
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.setDefaultTimeout(180000);
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
await page.waitForSelector('.loading', { state: 'detached', timeout: 240000 });
// the city statistics tour plays first: skip it
await page.evaluate(() => document.querySelector('#tour-skip')?.click());
await page.waitForTimeout(Number(process.env.FLY ?? 20000));
await page.evaluate((i) => document.querySelector('#marker-' + i).click(), landmark);
await page.waitForTimeout(Number(process.env.OPEN ?? 40000));
await page.screenshot({ path: `${out}/c-${landmark}-0-open.png` });

let n = 1;
const missing = [];
const results = [];
for (const raw of steps.split(',').map((s) => s.trim()).filter(Boolean)) {
  if (raw.startsWith('wait:')) { await page.waitForTimeout(Number(raw.slice(5))); continue; }
  if (raw.startsWith('key:')) { await page.keyboard.press(raw.slice(4)); await page.waitForTimeout(1500); continue; }
  if (raw.startsWith('real:')) {
    // a real mouse click at the element's centre: unlike el.click(), this fails when something else takes the click
    const [, name, sel] = raw.split(':');
    const box = await page.locator(sel).boundingBox();
    if (!box) { missing.push(sel); continue; }
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const top = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('button')?.id ?? document.elementFromPoint(px, py)?.className ?? null, [x, y]);
    await page.mouse.click(x, y);
    await page.waitForTimeout(SETTLE);
    const info = await page.evaluate(() => ({ open: !!document.querySelector('.cctv'), cam: document.querySelector('.cctv-name strong')?.textContent ?? null, ptz: [...document.querySelectorAll('.cctv-data dd')].slice(0, 3).map((e) => e.textContent).join(' ') }));
    results.push({ name, under: top, ...info });
    console.log(JSON.stringify(results[results.length - 1]));
    await page.screenshot({ path: `${out}/c-${landmark}-${n++}-${name}.png` });
    continue;
  }
  if (raw.startsWith('drag:')) {
    const [, sel, dx, dy] = raw.split(':');
    const box = await page.locator(sel).boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height * 0.4;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + Number(dx), y + Number(dy), { steps: 8 });
    await page.mouse.up();
    continue;
  }
  if (raw.startsWith('wheel:')) {
    const [, sel, dy] = raw.split(':');
    const box = await page.locator(sel).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
    await page.mouse.wheel(0, Number(dy));
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
  await page.screenshot({ path: `${out}/c-${landmark}-${n++}-${name}.png` });
}
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log(JSON.stringify({ landmark, missing, overflow }));
console.log(JSON.stringify(logs.filter((l) => !l.includes('ERR_TUNNEL') && !l.includes('THREE.Clock') && !l.includes('PCFSoft'))));
await browser.close();
