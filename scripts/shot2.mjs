import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [mode, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const logs = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(m.text().slice(0, 160)));
page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 300)));
if (mode === 'glb') {
  await page.goto('http://localhost:4173/', { waitUntil: 'load' });
} else {
  const frag = readFileSync('artifact/vizzio-3d-portfolio.html', 'utf8');
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#faf9f5}[hidden]{display:none!important}</style></head><body>${frag}</body></html>`, { waitUntil: 'load' });
}
await page.waitForTimeout(1200);
await page.click('#row-sg');
await page.waitForTimeout(600);
await page.click('#enter-country');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/${mode}-kite.png` });
await page.click('#avatar-scout');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/${mode}-scout.png` });
if (mode !== 'glb') {
  await page.click('#avatar-delta');
  await page.click('#take-off');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${mode}-delta.png` });
  await page.setViewportSize({ width: 400, height: 800 });
  await page.waitForTimeout(1000);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: `${out}/${mode}-phone.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.click('#back-to-globe');
  await page.waitForTimeout(1500);
  const panelBack = await page.locator('.panel h2').textContent().catch(() => null);
  console.log(JSON.stringify({ overflow, panelBack }));
}
console.log(JSON.stringify(logs));
await browser.close();
