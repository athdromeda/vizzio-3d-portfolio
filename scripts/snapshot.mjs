// Writes every source file into one JSON map, kept next to the preview as a backup.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const skip = new Set(['node_modules', 'dist', 'dist-harness', 'dist-real', 'artifact', 'package-lock.json', '.git']);
const out = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p) : (out[p] = readFileSync(p, 'utf8'));
  }
};
walk('.');
writeFileSync('artifact/source.json', JSON.stringify(out, null, 1));
console.log(Object.keys(out).length + ' files -> artifact/source.json');
