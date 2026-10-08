import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(300000);
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5176');
  await page.locator('#row-sg').click();
  await page.locator('#enter-country').click();
  await page.locator('#take-off:not([disabled])').waitFor();
  await page.locator('#take-off').click();
  await page.locator('.loading').waitFor({ state: 'detached' });
  await page.locator('#tour-skip').click();
  await page.waitForFunction(() => window.__test);
  await page.waitForFunction(() => {
    const test = window.__test;
    return test.city.surfaceBelow?.(test.flight.pos.x, test.flight.pos.y, test.flight.pos.z) != null;
  });

  await page.evaluate(() => {
    const test = window.__test;
    test.arrive();
    const floor = test.city.surfaceBelow(test.flight.pos.x, test.flight.pos.y, test.flight.pos.z);
    test.flight.pos.y = floor + 30;
    test.flight.vel.set(0, 0, 0);
    test.travel.canLand = true;
    test.toggle();
  });
  await page.locator('.land-confirm').waitFor();
  await page.evaluate(() => document.querySelector('.land-confirm .cta')?.click());
  await page.waitForFunction(() => window.__test?.world() === 'simple');
  await page.waitForFunction(() => window.__test?.travel.mode === 'walk');
  const started = Date.now();
  await page.evaluate(() => window.__test.toggle());

  await page.locator('.takeoff-transition').waitFor({ timeout: 2000 });
  const phase = await page.locator('.takeoff-transition').getAttribute('data-phase');
  if (phase !== 'capture' && phase !== 'loading') throw new Error(`Unexpected takeoff phase: ${phase}`);

  await page.waitForFunction(() => document.querySelector('.takeoff-transition')?.getAttribute('data-phase') === 'loading');
  const snapshotVisible = await page.locator('.takeoff-transition canvas').evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) return false;
    const points = [[0.2, 0.2], [0.5, 0.25], [0.8, 0.2], [0.5, 0.5], [0.5, 0.8]];
    return points.some(([x, y]) => {
      const pixel = ctx.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data;
      return pixel[0] + pixel[1] + pixel[2] > 12;
    });
  });
  if (!snapshotVisible) throw new Error('Captured generated-city frame is blank');

  await page.waitForFunction(() => {
    const el = document.querySelector('.takeoff-transition');
    return !el || el.getAttribute('data-phase') !== 'loading';
  }, null, { timeout: 60000 });
  const finalPhase = await page.locator('.takeoff-transition').getAttribute('data-phase').catch(() => null);
  if (finalPhase === 'timeout') throw new Error('Takeoff cover never revealed the real city');
  await page.locator('.takeoff-transition').waitFor({ state: 'detached', timeout: 5000 });

  const state = await page.evaluate(() => ({ world: window.__test.world(), mode: window.__test.travel.mode }));
  if (state.world !== 'real' || state.mode !== 'fly') throw new Error(`Unexpected final state: ${JSON.stringify(state)}`);

  await page.screenshot({ path: '.playwright-mcp/takeoff-revealed.png' });
  console.log(`PASS: held frame hid the warm-up, revealed once the sky drew (${Date.now() - started} ms from takeoff)`);
} finally {
  await browser.close();
}
