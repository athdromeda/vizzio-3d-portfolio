import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const logs = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1.5 });
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(m.text().slice(0, 200)));
page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 300)));
const frag = readFileSync('artifact/vizzio-3d-portfolio.html', 'utf8');
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#faf9f5}[hidden]{display:none!important}</style></head><body>${frag}</body></html>`, { waitUntil: 'load' });
await page.waitForTimeout(1000);
await page.click('#row-sg');
await page.waitForTimeout(500);
await page.click('#enter-country');
await page.waitForTimeout(2500);
const clip = { x: 430, y: 70, width: 1000, height: 640 };
for (const id of ['kite', 'scout', 'delta']) {
  await page.click('#avatar-' + id);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/v3-${id}.png`, clip });
}
await page.click('#avatar-kite');
await page.waitForTimeout(5200);
await page.screenshot({ path: `${out}/v3-kite-b.png`, clip });
await page.screenshot({ path: `${out}/v3-full.png` });
console.log(JSON.stringify(logs));
await browser.close();
