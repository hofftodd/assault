import { fbm, hash2 } from '../sim/noise';
import type { RGB } from './palette';
import type { Rgba } from './pixelSprite';

/** Hottest first: white core, yellow, orange, red, then smoke. */
const FIRE: RGB[] = [
  [255, 255, 230],
  [255, 230, 120],
  [255, 190, 60],
  [240, 130, 30],
  [200, 70, 20],
  [150, 40, 20],
  [96, 72, 64],
  [64, 52, 50],
];

/**
 * A fireball animation as a horizontal strip of `frames` square frames of `size` px:
 * it flashes, swells with a ragged edge, cools from white through red, then breaks up into smoke.
 */
export function renderExplosion(size: number, frames: number, seed: number): Rgba {
  const width = size * frames;
  const data = new Uint8ClampedArray(width * size * 4);
  const c = (size - 1) / 2;
  for (let f = 0; f < frames; f++) {
    const p = f / (frames - 1);
    const radius = (size / 2) * (0.35 + 0.65 * (1 - (1 - p) * (1 - p)));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm((x * 6) / size, (y * 6) / size, seed + f * 3, 2);
        const d = Math.hypot(x - c, y - c) + (n - 0.5) * radius * 0.6;
        if (d > radius) continue;
        // Late frames: the cloud thins out into holes.
        if (p > 0.5 && fbm((x * 9) / size, (y * 9) / size, seed + 77, 2) < (p - 0.5) * 1.6) continue;
        const heat = (1 - d / radius) * (1 - p * 0.85) + (hash2(x, y, seed + f) - 0.5) * 0.15;
        const col = FIRE[Math.max(0, Math.min(FIRE.length - 1, Math.floor((1 - heat * 1.6) * FIRE.length)))];
        const i = (y * width + f * size + x) * 4;
        data[i] = col[0];
        data[i + 1] = col[1];
        data[i + 2] = col[2];
        data[i + 3] = 255;
      }
    }
  }
  return { width, height: size, data };
}
