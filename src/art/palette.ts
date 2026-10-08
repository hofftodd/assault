/** RGB triples. Shades are sampled from the original's stage 1 to match its look. */
export type RGB = readonly [number, number, number];

export const GROUND: RGB[] = [
  [89, 78, 14],
  [93, 82, 16],
  [97, 86, 18],
  [101, 90, 20],
  [105, 94, 22],
];

/** Ground darkened by a cast shadow. */
export const GROUND_SHADOW: RGB[] = [
  [77, 66, 8],
  [81, 70, 10],
  [85, 74, 12],
];

/** Dark reddish greys up to near-white: the cloudy cliffs. */
export const ROCK: RGB[] = [
  [26, 14, 14],
  [32, 21, 21],
  [39, 28, 28],
  [46, 35, 35],
  [52, 42, 42],
  [59, 49, 49],
  [65, 56, 56],
  [72, 63, 63],
  [79, 70, 70],
  [85, 77, 77],
  [92, 84, 84],
  [98, 91, 91],
  [110, 103, 103],
  [122, 116, 116],
  [134, 129, 129],
  [146, 142, 142],
  [158, 155, 155],
  [170, 167, 167],
  [178, 175, 175],
  [184, 182, 182],
  [191, 189, 189],
];

export const MOSS: RGB[] = [
  [13, 32, 1],
  [20, 41, 3],
  [27, 49, 5],
  [34, 58, 7],
  [41, 66, 9],
  [55, 83, 12],
  [61, 92, 14],
  [68, 100, 16],
  [75, 109, 18],
  [82, 117, 19],
];

/** Glow along the rim of a floating continent, nearest the rock first. */
export const VOID_RIM: RGB[] = [
  [55, 93, 80],
  [54, 71, 68],
  [35, 43, 41],
];

export const STARS: RGB[] = [
  [102, 102, 128],
  [60, 60, 96],
  [30, 30, 58],
  [160, 150, 190],
];

export const PEBBLE: RGB[] = [
  [156, 156, 105],
  [211, 211, 160],
  [65, 54, 2],
];

export const HUD_PINK = 0xffa5da;
export const HUD_WHITE = 0xffffff;
export const HUD_SHADOW_BLUE = 0x0000ff;
