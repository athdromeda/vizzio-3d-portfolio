import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two builds from one config:
// - `npm run build`           production: hashed files in dist/assets, the real-city code in its own chunk.
// - `npm run build:artifact`  the single-file preview (everything inlined into one HTML page).
export default defineConfig(({ mode }) => {
  const single = mode === 'artifact';
  return {
    base: './',
    plugins: [react(), ...(single ? [viteSingleFile()] : [])],
    build: {
      target: 'es2022',
      cssCodeSplit: false,
      // three.js is most of the bundle and cannot be split further without lazy-loading the city
      chunkSizeWarningLimit: 1600,
    },
  };
});
