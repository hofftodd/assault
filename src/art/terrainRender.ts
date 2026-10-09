import { fbm, hash2 } from '../sim/noise';
import { Material, type Decor, type TileTerrain } from '../sim/terrain';
import { GROUND, GROUND_SHADOW, MOSS, PEBBLE, ROCK, STARS, VOID_RIM, type RGB } from './palette';
import { ART_SCALE } from './painter';
import type { Rgba } from './pixelSprite';

/** Light comes from the lower right, so shadows fall up and to the left. */
const SHADOW_DX = -4;
const SHADOW_DY = -8;

const pick = (ramp: readonly RGB[], t: number): RGB => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];

/**
 * Approximate Euclidean distance (px) from every pixel to the nearest pixel
 * where `target` is true, via a two-pass chamfer transform (one pass each way).
 */
function distanceField(mat: Uint8Array, w: number, h: number, target: (m: number) => boolean): Float32Array {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = target(mat[i]) ? 0 : 1e9;
  const D = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 1);
        if (x > 0) v = Math.min(v, d[i - w - 1] + D);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + D);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 1);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + D);
        if (x > 0) v = Math.min(v, d[i + w - 1] + D);
      }
      d[i] = v;
    }
  }
  return d;
}

const WATER: RGB[] = [
  [24, 92, 70],
  [34, 112, 80],
  [44, 132, 92],
  [60, 150, 110],
  [110, 190, 160],
];

/** Dark leafy crop rows and thickets. */
const CROP: RGB[] = [
  [20, 34, 12],
  [32, 50, 18],
  [44, 66, 24],
  [58, 84, 30],
  [80, 108, 46],
];

const CONCRETE: RGB[] = [
  [62, 62, 74],
  [78, 78, 92],
  [92, 92, 106],
  [104, 104, 118],
  [120, 120, 134],
];

/**
 * Paint a stage's terrain. The texture has `k` pixels per world pixel: every
 * pixel samples the terrain and the noise at its own (sub-world-pixel) position,
 * so a finer `k` adds real detail: crisper cliff edges, finer grain, smoother foam.
 */
export function renderTerrain(t: TileTerrain, k = ART_SCALE): Rgba {
  const { width: lw, height: lh, seed: s } = t;
  const w = Math.round(lw * k);
  const h = Math.round(lh * k);
  // Smooth noise is sampled on a coarse grid (`step` world px apart, matched to how
  // fast each pattern varies) and interpolated for every texture pixel.
  interface Grid {
    g: Float32Array;
    gw: number;
    gh: number;
    step: number;
    fn: (x: number, y: number) => number;
  }
  /** A lazily filled grid: points are computed the first time something nearby reads them. */
  const grid = (step: number, fn: (x: number, y: number) => number): Grid => {
    const gw = Math.ceil(lw / step) + 3;
    const gh = Math.ceil(lh / step) + 3;
    return { g: new Float32Array(gw * gh).fill(NaN), gw, gh, step, fn };
  };
  const point = (gr: Grid, i: number): number => {
    let v = gr.g[i];
    if (v !== v) {
      v = gr.fn(((i % gr.gw) - 1) * gr.step, (((i / gr.gw) | 0) - 1) * gr.step);
      gr.g[i] = v;
    }
    return v;
  };
  const sample = (gr: Grid, x: number, y: number): number => {
    const fx = Math.min(gr.gw - 2.001, Math.max(0, x / gr.step + 1));
    const fy = Math.min(gr.gh - 2.001, Math.max(0, y / gr.step + 1));
    const x0 = fx | 0;
    const y0 = fy | 0;
    const tx = fx - x0;
    const ty = fy - y0;
    const i = y0 * gr.gw + x0;
    const p00 = point(gr, i);
    const p10 = point(gr, i + 1);
    const p01 = point(gr, i + gr.gw);
    const p11 = point(gr, i + gr.gw + 1);
    const a = p00 + (p10 - p00) * tx;
    const b = p01 + (p11 - p01) * tx;
    return a + (b - a) * ty;
  };
  const jitterX = grid(2, (x, y) => t.jitterX(x, y));
  const jitterY = grid(2, (x, y) => t.jitterY(x, y));
  const groundTone = grid(3, (x, y) => fbm(x / 12, y / 12, s + 20, 2));
  const leafyF = grid(1, (x, y) => fbm(x / 4, y / 4, s + 50, 2));
  const clumpF = grid(1, (x, y) => fbm(x / 4, y / 4, s + 40, 2));
  const billowF = grid(2, (x, y) => Math.abs(2 * fbm(x / 14, y / 14, s + 30, 3) - 1));
  const rippleF = grid(1.25, (x, y) => fbm(x / 5, y / 2.5, s + 71, 2));
  const leafF = grid(1, (x, y) => fbm(x / 2, y / 2, s + 81, 2));

  const mat = new Uint8Array(w * h);
  for (let Y = 0; Y < h; Y++) {
    const ly = (Y + 0.5) / k;
    for (let X = 0; X < w; X++) {
      const lx = (X + 0.5) / k;
      mat[Y * w + X] = t.materialJittered(lx, ly, sample(jitterX, lx, ly), sample(jitterY, lx, ly));
    }
  }

  // Distance fields (in world px) are computed on a world-resolution copy of the
  // materials and read back at each texture pixel; they only steer soft effects.
  const lmat = new Uint8Array(lw * lh);
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) lmat[y * lw + x] = mat[Math.floor((y + 0.5) * k) * w + Math.floor((x + 0.5) * k)];
  const lRock = distanceField(lmat, lw, lh, (m) => m === Material.Rock);
  const lOpen = distanceField(
    lmat,
    lw,
    lh,
    (m) => m === Material.Ground || m === Material.Rough || m === Material.Concrete || m === Material.Crop || m === Material.Water,
  );
  const lLand = distanceField(lmat, lw, lh, (m) => m !== Material.Water);
  const at = (f: Float32Array, X: number, Y: number) => f[Math.min(lh - 1, (Y / k) | 0) * lw + Math.min(lw - 1, (X / k) | 0)];
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (X: number, Y: number, c: RGB) => {
    const i = (Y * w + X) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  };
  const slab = 24 * k;

  for (let Y = 0; Y < h; Y++) {
    const y = (Y + 0.5) / k - 0.5;
    for (let X = 0; X < w; X++) {
      const x = (X + 0.5) / k - 0.5;
      const i = Y * w + X;
      const m = mat[i];
      const grain = hash2(X, Y, s);
      switch (m) {
        case Material.Ground: {
          const rock = at(lRock, X, Y);
          const leafy = sample(leafyF, x, y);
          if (rock <= 3 && leafy > 0.5 + rock * 0.06) {
            put(X, Y, pick(MOSS, leafy * 0.9 + grain * 0.2));
            break;
          }
          put(X, Y, pick(GROUND, grain * 0.55 + sample(groundTone, x, y) * 0.6 - 0.05));
          break;
        }
        case Material.Rough: {
          const clump = sample(clumpF, x, y);
          if (grain > 0.985) put(X, Y, PEBBLE[Math.floor(hash2(X, Y, s + 3) * PEBBLE.length)]);
          else put(X, Y, clump > 0.55 ? pick(GROUND_SHADOW, grain) : pick(GROUND, grain * 0.5));
          break;
        }
        case Material.Rock: {
          // A thick, clumpy fringe of foliage where the cliffs meet the ground.
          const toGround = at(lOpen, X, Y);
          const leafy = sample(leafyF, x, y);
          if (toGround <= 2 || leafy > 0.3 + toGround * 0.05) {
            const leafLight = sample(leafyF, x + 1, y + 1) - leafy;
            put(X, Y, pick(MOSS, 0.25 + leafy * 0.8 + leafLight * 4 + grain * 0.2));
            break;
          }
          // Puffy, cloud-like boulders: billow noise makes round puffs with dark creases
          // between them, shaded by the slope towards the light (lower right).
          const puff = sample(billowF, x, y);
          const toLight = sample(billowF, x + 2, y + 2) - puff;
          put(X, Y, pick(ROCK, Math.sqrt(puff) * 1.1 + toLight * 3 + grain * 0.05 - 0.15));
          break;
        }
        case Material.Water: {
          // Ripples, lighter towards the shore, with a pale foam line at the edge.
          const shore = at(lLand, X, Y);
          if (shore <= 1.2) {
            put(X, Y, WATER[4]);
            break;
          }
          const ripple = sample(rippleF, x, y);
          put(X, Y, pick(WATER, 0.35 + (ripple - 0.5) * 0.7 + Math.max(0, 3 - shore) * 0.12 + (grain - 0.5) * 0.1));
          break;
        }
        case Material.Crop: {
          // Rows of leafy plants, lit from the lower right.
          const row = (x + y * 0.15) % 4 < 2 ? 0.15 : 0;
          const leaf = sample(leafF, x, y);
          put(X, Y, pick(CROP, leaf * 0.9 + row + (grain - 0.5) * 0.25));
          break;
        }
        case Material.Concrete: {
          // Large paving slabs with dark seams and a lit lip; each slab slightly different.
          const sx = Math.floor(X / slab);
          const sy = Math.floor(Y / slab);
          const seam = X % slab === 0 || Y % slab === 0;
          const lip = X % slab === slab - 1 || Y % slab === slab - 1;
          const tone = 0.35 + hash2(sx, sy, s + 61) * 0.3 + (grain - 0.5) * 0.12;
          put(X, Y, seam ? CONCRETE[0] : lip ? CONCRETE[4] : pick(CONCRETE, tone));
          break;
        }
        default: {
          const rim = at(lRock, X, Y);
          if (rim <= 2) put(X, Y, VOID_RIM[Math.max(0, Math.min(VOID_RIM.length - 1, Math.floor(rim) - 1))]);
          else if (hash2(X >> 1, Y >> 1, s) > 0.994 && (X & 1) === 0 && (Y & 1) === 0) put(X, Y, STARS[Math.floor(hash2(X, Y, s + 9) * STARS.length)]);
          else put(X, Y, [0, 0, 0]);
        }
      }
    }
  }

  for (const d of t.decor) drawDecor(d, data, w, h, mat, s, k);
  return { width: w, height: h, data };
}

function drawDecor(d: Decor, data: Uint8ClampedArray, w: number, h: number, mat: Uint8Array, s: number, k: number): void {
  const r = d.kind === 'bush' ? 7 : 8;
  const cx = Math.round(d.x);
  const cy = Math.round(d.y);
  const blobAt = (x: number, y: number, ox: number, oy: number) => {
    const dx = x - (cx + ox);
    const dy = y - (cy + oy);
    const edge = r + (fbm(x / 2.5, y / 2.5, s + cx * 7 + cy, 1) - 0.5) * 2.2;
    return dx * dx + dy * dy <= edge * edge;
  };
  const span = (lo: number, hi: number, f: (X: number, Y: number, x: number, y: number) => void) => {
    for (let Y = Math.floor((cy + lo) * k); Y <= Math.ceil((cy + hi) * k); Y++) {
      for (let X = Math.floor((cx + lo) * k); X <= Math.ceil((cx + hi) * k); X++) {
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        f(X, Y, (X + 0.5) / k - 0.5, (Y + 0.5) / k - 0.5);
      }
    }
  };
  // Shadow first, only darkening open ground.
  span(-r * 2, r * 2, (X, Y, x, y) => {
    const m = mat[Y * w + X];
    if ((m !== Material.Ground && m !== Material.Rough) || !blobAt(x, y, SHADOW_DX, SHADOW_DY)) return;
    const i = (Y * w + X) * 4;
    const c = GROUND_SHADOW[Math.floor(hash2(X, Y, s + 11) * GROUND_SHADOW.length)];
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
  });
  span(-r - 2, r + 2, (X, Y, x, y) => {
    if (!blobAt(x, y, 0, 0)) return;
    // Sphere shading, brighter towards the lower right, with leaf or stone texture.
    const nx = (x - cx) / r;
    const ny = (y - cy) / r;
    const light = 0.5 + (nx + ny) * 0.35 + (hash2(X, Y, s + 13) - 0.5) * 0.3;
    let c: RGB;
    if (d.kind === 'bush') c = pick(MOSS, light + (fbm(x / 1.5, y / 1.5, s + 19, 1) - 0.5) * 0.35);
    else c = fbm(x / 3, y / 3, s + 17, 1) > 0.62 ? pick(MOSS, light * 0.6) : pick(ROCK, 0.25 + light * 0.5);
    const i = (Y * w + X) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  });
}
