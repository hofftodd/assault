import type { PixelArt } from './pixelSprite';

const TANK_PALETTE: Record<string, number> = {
  k: 0x18181f, // outline
  K: 0x333333,
  d: 0x574b3f,
  G: 0x656467,
  g: 0x888888,
  c: 0x9c9c69,
  C: 0xc5c2a3,
  w: 0xd9d6b5,
  W: 0xeeeebb,
  b: 0x414159,
  B: 0x6068a0,
  y: 0xe8c040,
  r: 0xd03030,
  a: 0x60c8e0,
  A: 0xb8f0ff,
};

/** The player's tank, facing up: twin barrels, cream hull, blue tread pods. */
export const PLAYER_TANK: PixelArt = {
  palette: TANK_PALETTE,
  rows: [
    '........kWkkWk........',
    '........kwkkwk........',
    '........kCkkCk........',
    '........kwkkwk........',
    '..kkk...kwkkwk...kkk..',
    '.kyyyk..kCkkCk..kyyyk.',
    '.kgggk.kkgkkgkk.kgggk.',
    '.kBBBkkwWWCCWWwkkBBBk.',
    '.kbbbkkCwaaaawCkkbbbk.',
    '.kBBBkkCaaAAaaCkkBBBk.',
    '.kbbbkkgCwwwwCgkkbbbk.',
    '.kBBBkkGgCCCCgGkkBBBk.',
    '.kbbbkwwKGGGGKwwkbbbk.',
    '.kBBBkWwwwwwwwwWkBBBk.',
    '.kbbbkCwwyrrywwCkbbbk.',
    '.kBBBkCwwwrrwwwCkBBBk.',
    '.kbbbkcCCwwwwCCckbbbk.',
    '.kBBBkgcCCCCCCcgkBBBk.',
    '.kbbbkGgcwWWwcgGkbbbk.',
    '.kBBBkKGgCwwCgGKkBBBk.',
    '.kbbbkKdGgCCgGdKkbbbk.',
    '.kBBBkkKdGggGdKkkBBBk.',
    '.krrrk.kKKddKKk.krrrk.',
    '..kkk...kkkkkk...kkk..',
  ],
};

/** Hull colours swapped for dark armour plating: the tank's belly, seen mid-flip. */
export const PLAYER_TANK_BELLY: PixelArt = {
  palette: TANK_PALETTE,
  rows: PLAYER_TANK.rows.map((row, y) =>
    [...row]
      .map((ch, x) => (y >= 7 && x >= 6 && x <= 15 && 'wWCcgGaAyrdK'.includes(ch) ? ((x + y) % 2 ? 'G' : 'K') : ch))
      .join(''),
  ),
};

/** Small tank for the lives counter. */
export const LIFE_ICON: PixelArt = {
  palette: TANK_PALETTE,
  rows: [
    '..W.W..',
    '.kwkwk.',
    'bkwWwkb',
    'BkCaCkB',
    'bkwWwkb',
    'BkCwCkB',
    'bkkkkkb',
  ],
};
