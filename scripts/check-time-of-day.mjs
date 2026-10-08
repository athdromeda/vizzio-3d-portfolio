import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 660 } });

try {
  const fragment = readFileSync('artifact/vizzio-3d-portfolio.html', 'utf8');
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${fragment}</body></html>`, { waitUntil: 'load' });
  await page.click('#row-sg');
  await page.click('#enter-country');
  await page.waitForSelector('#take-off:not([disabled])', { timeout: 60000 });

  if (await page.locator('#light-day, #light-dusk, #light-night').count()) throw new Error('Time selector must be hidden before flight');

  await page.click('#take-off');
  await page.waitForSelector('.loading', { state: 'detached', timeout: 120000 });
  if (await page.locator('#light-day, #light-dusk, #light-night').count()) throw new Error('Time selector must be hidden during the city tour');
  await page.click('#tour-skip');
  await page.waitForSelector('#light-night', { timeout: 10000 });

  if (await page.evaluate(() => Boolean(window.__test))) {
    await page.evaluate(() => window.__test.flight.pos.set(-3000, 150, -3000));
    await page.waitForFunction(() => !document.querySelector('.hud-prompts')?.textContent?.includes('Open'));
    const openShortcut = page.locator('.hud-keys li').filter({ hasText: 'Open a landmark' });
    if (await openShortcut.count()) throw new Error('E shortcut must be hidden when no landmark is in range');
  }

  const labels = await page.locator('[aria-label="City time"] button').allTextContents();
  if (labels.join(',') !== 'Day,Dusk,Night') throw new Error(`Unexpected time labels: ${labels.join(',')}`);
  if ((await page.getAttribute('#light-day', 'aria-pressed')) !== 'true') throw new Error('Day must be selected by default');

  await page.click('#light-night');
  if ((await page.getAttribute('#light-night', 'aria-pressed')) !== 'true') throw new Error('Night selection did not update');

  await page.keyboard.press('m');
  await page.waitForSelector('.main.is-map');
  await page.waitForFunction(() => !document.querySelector('#light-day, #light-dusk, #light-night'));
  await page.keyboard.press('Escape');
  await page.waitForSelector('#light-night');
  if ((await page.getAttribute('#light-night', 'aria-pressed')) !== 'true') throw new Error('Night selection was not preserved after closing the map');
  console.log('time-of-day selector: ok');
} finally {
  await browser.close();
}
