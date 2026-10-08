import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(300000);

// Ground truth: what the compositor actually shows.
const lit = async () => {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const count = (y) => {
      const row = ctx.getImageData(0, y, c.width, 1).data;
      let n = 0;
      for (let i = 0; i < row.length; i += 4) if (row[i] + row[i + 1] + row[i + 2] > 12) n++;
      return n;
    };
    return { top: count(4), upper: count(Math.floor(c.height * 0.3)), mid: count(Math.floor(c.height / 2)) };
  }, b64);
};

await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5176');
await page.locator('#row-sg').click();
await page.locator('#enter-country').click();
await page.locator('#take-off:not([disabled])').waitFor();
await page.locator('#take-off').click();
await page.locator('.loading').waitFor({ state: 'detached' });
await page.locator('#tour-skip').click();
await page.waitForFunction(() => window.__test);
await page.waitForTimeout(4000);
console.log('real-initial', JSON.stringify(await lit()));

await page.waitForFunction(() => {
  const t = window.__test;
  return t.city.surfaceBelow?.(t.flight.pos.x, t.flight.pos.y, t.flight.pos.z) != null;
});
await page.evaluate(() => {
  const t = window.__test;
  t.arrive();
  const floor = t.city.surfaceBelow(t.flight.pos.x, t.flight.pos.y, t.flight.pos.z);
  t.flight.pos.y = floor + 30;
  t.flight.vel.set(0, 0, 0);
  t.travel.canLand = true;
  t.toggle();
});
await page.locator('.land-confirm').waitFor();
await page.evaluate(() => document.querySelector('.land-confirm .cta')?.click());
await page.waitForFunction(() => window.__test?.world() === 'simple');
await page.waitForFunction(() => window.__test?.travel.mode === 'walk');
await page.waitForTimeout(1500);
console.log('simple', JSON.stringify(await lit()));

const started = Date.now();
await page.evaluate(() => window.__test.toggle());
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(1000);
  console.log('takeoff+' + (i + 1) + 's', JSON.stringify({ ...(await lit()), phase: await page.evaluate(() => document.querySelector('.takeoff-transition')?.getAttribute('data-phase') ?? null), elapsed: Date.now() - started }));
}
await browser.close();
