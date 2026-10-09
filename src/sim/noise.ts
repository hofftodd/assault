/** Deterministic integer hash of a lattice point, returning a value in [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smoothly interpolated value noise in [0, 1). One unit = one lattice cell. */
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Fractal (multi-octave) value noise in [0, 1). */
export function fbm(x: number, y: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x, y, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2;
    y *= 2;
  }
  return sum / norm;
}
