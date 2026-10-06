// WebGL cannot read CSS variables, so the 3D scenes use this mirror of tokens.css.
// Keep the two in sync; do not add colors here that are not in tokens.css.
export const PALETTE = {
  space: 0x04070d,
  ink: 0xf1f5fa,
  shell: 0xe6ebf4, // light body panels (ink, slightly cooled)
  graphite: 0x2a3444, // anodised dark metal (space-2, lifted so it reads on the dark ground)
  carbon: 0x10151d, // carbon fibre
  steel: 0xb8c2d2, // bare machined metal
  fabric: 0x2c3647, // flight-suit cloth
  pad: 0x1c2740, // landing pad under previews
  signal: 0x2f5bff,
  signalSoft: 0x7fa0ff,
  live: 0x3ddca0,
} as const;
