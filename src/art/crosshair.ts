import { Painter } from './painter';
import type { Rgba } from './pixelSprite';

const RETICLE = [
  'WWW.....WWW',
  'W.........W',
  'W.........W',
  '...........',
  '.....W.....',
  '....WWW....',
  '.....W.....',
  '...........',
  'W.........W',
  'W.........W',
  'WWW.....WWW',
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
