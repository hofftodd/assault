import { Painter } from './painter';
import type { Rgba } from './pixelSprite';

/** Matches the original: a small ring with four dots around it. */
const RETICLE = [
  '.....WW.....',
  '.....WW.....',
  '............',
  '....WWWW....',
  '...W....W...',
  'WW.W....W.WW',
  'WW.W....W.WW',
  '...W....W...',
  '....WWWW....',
  '............',
  '.....WW.....',
  '.....WW.....',
];

/**
 * Nuke aiming reticle: white with a dark outline, so the scene can tint it red
 * once it reaches maximum range.
 */
export function crosshairArt(): Rgba {
  const p = new Painter(RETICLE[0].length + 2, RETICLE.length + 2);
  RETICLE.forEach((row, y) => [...row].forEach((ch, x) => ch === 'W' && p.px(x + 1, y + 1, [255, 255, 255])));
  p.outline();
  return p.toRgba();
}

/** A thin white ring for the nuke shockwave; the scene scales it up as it expands. */
export function shockwaveArt(radius = 32): Rgba {
  const size = radius * 2 + 3;
  const p = new Painter(size, size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (Math.abs(d - radius) < 0.8) p.px(x, y, [255, 255, 255]);
      else if (Math.abs(d - radius) < 1.6) p.px(x, y, [170, 210, 255], 160);
    }
  }
  return p.toRgba();
}
