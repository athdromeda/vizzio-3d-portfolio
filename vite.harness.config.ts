import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Development harness: the city alone on one page (see dev/harness.ts).
export default defineConfig({
  root: 'dev',
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2022', outDir: '../dist-harness', emptyOutDir: true, rollupOptions: { input: 'dev/harness.html' } },
});
