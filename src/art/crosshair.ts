import { ART_SCALE, Painter } from './painter';
import type { Rgba } from './pixelSprite';

/**
 * Nuke aiming reticle, after the original: a small ring with four dots around
 * it. Drawn white with a dark outline so the scene can tint it red once it
 * reaches maximum range.
 */
export function crosshairArt(): Rgba {
  const size = 14;
  const c = size / 2;
  const p = new Painter(size, size);
  const white: [number, number, number] = [255, 255, 255];
  p.each(0, 0, size, size, (x, y, X, Y) => {
    const d = Math.hypot(x - c, y - c);
    if (Math.abs(d - 2.6) < 0.55) p.dot(X, Y, white);
  });
  for (const [dx, dy] of [[0, -5.2], [0, 5.2], [-5.2, 0], [5.2, 0]]) {
    p.each(c + dx - 1, c + dy - 1, c + dx + 1, c + dy + 1, (x, y, X, Y) => {
      if (Math.hypot(x - c - dx, y - c - dy) < 0.95) p.dot(X, Y, white);
    });
  }
  p.outline();
  return p.toRgba();
}

/** Radius (logical px) of the shockwave ring texture; the scene scales it to the blast. */
/** Drawn at the nuke's full blast radius (WEAPON_TUNING.nukeBlastRadius), so the ring stays crisp. */
export const SHOCKWAVE_RADIUS = 52;

/** A thin white ring for the nuke shockwave; the scene scales it up as it expands. */
export function shockwaveArt(): Rgba {
  const r = SHOCKWAVE_RADIUS;
  const size = r * 2 + 8;
  const c = size / 2;
  const p = new Painter(size, size, ART_SCALE);
  p.each(0, 0, size, size, (x, y, X, Y) => {
    const off = Math.abs(Math.hypot(x - c, y - c) - r);
    if (off < 0.9) p.dot(X, Y, [255, 255, 255]);
    else if (off < 1.8) p.dot(X, Y, [190, 220, 255], 170);
    else if (off < 2.8) p.dot(X, Y, [120, 170, 255], 70);
  });
  return p.toRgba();
}
