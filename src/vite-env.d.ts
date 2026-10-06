/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google Maps Platform key with the Map Tiles API enabled. When set, the city is real 3D tiles. */
  readonly VITE_GOOGLE_MAPS_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
