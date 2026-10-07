/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cesium ion access token. When set, the city is real 3D tiles. */
  readonly VITE_CESIUM_ION_TOKEN?: string;
  /** Set for test builds only: exposes the simulation to scripts/shot-ground.mjs. */
  readonly VITE_TEST?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
