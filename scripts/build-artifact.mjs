// Turns dist/index.html (single-file Vite build) into a body-only fragment:
// the preview host wraps the page in its own <html>/<head>/<body>.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const pick = (re) => (html.match(re) ?? []).join('\n');

const title = pick(/<title>[\s\S]*?<\/title>/);
const fonts = pick(/<link[^>]+fonts\.googleapis\.com[^>]*>/g);
const styles = pick(/<style[\s\S]*?<\/style>/g);
const scripts = pick(/<script[\s\S]*?<\/script>/g);

mkdirSync('artifact', { recursive: true });
writeFileSync(
  'artifact/vizzio-3d-portfolio.html',
  [title, fonts, styles, '<div id="root"></div>', scripts].join('\n'),
);
console.log('artifact/vizzio-3d-portfolio.html', (html.length / 1024).toFixed(0) + ' KB');
