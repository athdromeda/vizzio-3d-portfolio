// Lands the pilot, walks, rides a parked motorbike and takes off again; a screenshot and a line of state per step.
// Needs a test build: VITE_TEST=1 npm run build:artifact   (rebuild without it before publishing)
// usage: node scripts/shot-ground.mjs <outDir> [width] [height] [avatar]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const [out, w = '1280', h = '720', avatar = 'kite'] = process.argv.slice(2);
const AT = (process.env.AT ?? '-742,300,0.2').split(',').map(Number);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const logs = [];
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.setDefaultTimeout(300000);
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(m.text().slice(0, 600)));
page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 600)));
const frag = readFileSync('artifact/vizzio-3d-portfolio.html', 'utf8');
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#faf9f5}[hidden]{display:none!important}</style></head><body>${frag}</body></html>`,
  { waitUntil: 'load' },
);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/g-00-globe.png` });
await page.click('#row-sg');
await page.waitForTimeout(400);
await page.click('#enter-country');
await page.waitForSelector('#take-off:not([disabled])', { timeout: 60000 });
await page.evaluate((a) => document.querySelector('#avatar-' + a)?.click(), avatar);
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('#take-off').click());
await page.waitForSelector('.loading', { state: 'detached', timeout: 300000 });
await page.evaluate(() => document.querySelector('#tour-skip')?.click());
await page.waitForFunction(() => window.__test, null, { timeout: 120000 });

const frames = async (n) => {
  const from = await page.evaluate(() => window.__test.frames());
  await page.waitForFunction((to) => window.__test.frames() >= to, from + n, { timeout: 600000, polling: 500 });
};
const state = () =>
  page.evaluate(() => {
    const t = window.__test, g = t.ground, f = t.flight, m = t.travel.mode;
    const r = (v) => Math.round(v * 100) / 100;
    return {
      mode: m,
      pos: (m === 'fly' ? f : g).pos.toArray().map(r),
      speed: r(m === 'fly' ? f.speed : g.speed),
      airborne: g.airborne,
      lean: r(g.lean),
      spots: t.travel.spots.length,
      near: !!t.travel.near,
      prompts: [...document.querySelectorAll('.hud-prompt')].map((e) => e.textContent),
      keys: [...document.querySelectorAll('.hud-keys li, .hud-keys dt, .hud-keys dd')].map((e) => e.textContent).join(' | ').slice(0, 400),
    };
  });
let n = 1;
const step = async (name, wait = 8) => {
  await frames(wait);
  await page.screenshot({ path: `${out}/g-${String(n++).padStart(2, '0')}-${name}.png` });
  console.log(name, JSON.stringify(await state()));
};
const hold = async (codes, seconds) => {
  for (const c of codes) await page.keyboard.down(c);
  await page.evaluate((s) => window.__test.sim(s), seconds);
  for (const c of codes) await page.keyboard.up(c);
};

// low over a street
await page.evaluate(([x, z, yaw]) => {
  const t = window.__test;
  t.arrive();
  t.flight.pos.set(x, 30, z);
  t.flight.vel.set(0, 0, 0);
  t.flight.yaw = t.flight.aimYaw = yaw;
  t.flight.pitch = t.flight.aimPitch = 0;
}, AT);
await step('low');
await page.keyboard.press('KeyG');
if (avatar !== 'kite') {
  // only the pilot can land: for the machines G must do nothing
  await step('g-pressed', 6);
  console.log(JSON.stringify(logs));
  await browser.close();
  process.exit(0);
}
await page.evaluate(() => window.__test.sim(0.6));
await step('descending', 3);
await page.evaluate(() => window.__test.sim(8));
await step('landed');
// standing in a traffic lane for a whole signal cycle: the cars must not pass through him, they push him along
{
  const before = await state();
  const seen = [];
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(4000);
    seen.push(await page.evaluate(() => { const t = window.__test; const count = (o) => (o.isInstancedMesh ? o.count : 0) + o.children.reduce((n, c) => n + count(c), 0); return { obstacles: t.city.obstacles.length, instances: count(t.city.group), z: Math.round(t.ground.pos.z * 10) / 10, y: Math.round(t.ground.pos.y * 10) / 10 }; }));
  }
  console.log('in-lane', JSON.stringify({ from: before.pos, seen }));
  await step('pushed-by-traffic', 2);
  // back to where the walk test starts
  await page.evaluate(([x, z, yaw]) => { const t = window.__test; t.ground.pos.set(x + 11, 0, z); t.ground.yaw = t.ground.aimYaw = yaw; }, AT);
  await frames(4);
}
await hold(['KeyW'], 1.5);
await step('walked-forward', 3);
await hold(['KeyA'], 1);
await step('walked-left', 3);
await hold(['KeyS'], 1);
await step('walked-back', 3);
await hold(['KeyW', 'ShiftLeft'], 1.2);
await page.keyboard.down('Space');
await page.evaluate(() => window.__test.sim(0.25));
await page.keyboard.up('Space');
await step('jump', 2);
await page.evaluate(() => window.__test.sim(2));

// walk up to the nearest parked bike
const spot = await page.evaluate(() => {
  const t = window.__test, p = t.ground.pos;
  const s = [...t.travel.spots].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  if (!s) return null;
  // stand 2 m to its left, facing along it
  p.set(s.x - Math.cos(s.yaw) * 2, 0, s.z - Math.sin(s.yaw) * 2);
  t.ground.yaw = t.ground.aimYaw = s.yaw + 0.9;
  return { x: s.x, z: s.z, yaw: s.yaw };
});
console.log('nearest bike', JSON.stringify(spot));
await step('at-bike', 14);
await page.keyboard.press('KeyF');
await step('mounted', 14);
// out onto the road, straighten up, then open it up
await hold(['KeyW'], 0.8);
await hold(['KeyW', 'KeyA'], 0.35);
await step('pull-out', 3);
await hold(['KeyW'], 2.2);
await page.keyboard.press('KeyH');
await step('riding-horn', 2);
await hold(['KeyW', 'KeyD'], 0.45);
await step('lean-right', 2);
await hold(['KeyW', 'KeyA'], 0.45);
await page.keyboard.down('Space');
await page.evaluate(() => window.__test.sim(0.12));
await page.keyboard.up('Space');
await step('bike-jump', 1);
await hold(['KeyS'], 3);
await hold(['KeyS'], 1.5);
await step('reversing', 3);
await page.evaluate(() => window.__test.sim(3));
await page.keyboard.press('KeyF');
await step('dismounted', 14);
await page.keyboard.press('KeyG');
await page.evaluate(() => window.__test.sim(2.5));
await step('airborne-again', 8);

const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log(JSON.stringify({ overflow }));
console.log(JSON.stringify(logs.filter((l) => !l.includes('ERR_TUNNEL') && !l.includes('THREE.Clock') && !l.includes('PCFSoft'))));
await browser.close();
