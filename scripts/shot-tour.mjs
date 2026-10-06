// Walks the city statistics tour and takes a screenshot per chapter.
// usage: node scripts/shot-tour.mjs <outDir> <width> <height>
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const [out, w = '1280', h = '720'] = process.argv.slice(2);
const SETTLE = Number(process.env.SETTLE ?? 7000);
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
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/t-0-first-frame.png` });
const ids = (process.env.CHAPTERS ?? 'welcome,population,business,investment,environment,transport,economy,tourism').split(',');
let n = 1;
for (const id of ids) {
  await page.evaluate((i) => document.querySelector('#tour-' + i).click(), id);
  await page.waitForTimeout(SETTLE);
  await page.screenshot({ path: `${out}/t-${n++}-${id}.png` });
}
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await page.evaluate(() => document.querySelector('#tour-skip').click());
await page.waitForTimeout(Number(process.env.AFTER ?? 30000));
await page.screenshot({ path: `${out}/t-${n}-flight.png` });
const tourGone = (await page.locator('.tour').count()) === 0;
console.log(JSON.stringify({ overflow, tourGone }));
console.log(JSON.stringify(logs.filter((l) => !l.includes('ERR_TUNNEL') && !l.includes('THREE.Clock') && !l.includes('PCFSoft'))));
await browser.close();
