import { fbm, hash2 } from '../sim/noise';
import { Material, type Decor, type TileTerrain } from '../sim/terrain';
import { GROUND, GROUND_SHADOW, MOSS, PEBBLE, ROCK, STARS, VOID_RIM, type RGB } from './palette';
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

const CONCRETE: RGB[] = [
  [62, 62, 74],
  [78, 78, 92],
  [92, 92, 106],
  [104, 104, 118],
  [120, 120, 134],
];

export function renderTerrain(t: TileTerrain): Rgba {
  const { width: w, height: h, seed: s } = t;
  const mat = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mat[y * w + x] = t.materialAt(x + 0.5, y + 0.5);

  const toRock = distanceField(mat, w, h, (m) => m === Material.Rock);
  const toOpen = distanceField(mat, w, h, (m) => m === Material.Ground || m === Material.Rough || m === Material.Concrete);
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (x: number, y: number, c: RGB) => {
    const i = (y * w + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = mat[i];
      const grain = hash2(x, y, s);
      switch (m) {
        case Material.Ground: {
          const rock = toRock[i];
          if (rock <= 3 && fbm(x / 4, y / 4, s + 50, 2) > 0.5 + rock * 0.06) {
            put(x, y, pick(MOSS, fbm(x / 4, y / 4, s + 50, 2) * 0.9 + grain * 0.2));
            break;
          }
          put(x, y, pick(GROUND, grain * 0.55 + fbm(x / 12, y / 12, s + 20, 2) * 0.6 - 0.05));
          break;
        }
        case Material.Rough: {
          const clump = fbm(x / 4, y / 4, s + 40, 2);
          if (grain > 0.985) put(x, y, PEBBLE[Math.floor(hash2(x, y, s + 3) * PEBBLE.length)]);
          else put(x, y, clump > 0.55 ? pick(GROUND_SHADOW, grain) : pick(GROUND, grain * 0.5));
          break;
        }
        case Material.Rock: {
          // A thick, clumpy fringe of foliage where the cliffs meet the ground.
          const toGround = toOpen[i];
          const leafy = fbm(x / 4, y / 4, s + 50, 2);
          if (toGround <= 2 || leafy > 0.3 + toGround * 0.05) {
            const leafLight = fbm((x + 1) / 4, (y + 1) / 4, s + 50, 2) - leafy;
            put(x, y, pick(MOSS, 0.25 + leafy * 0.8 + leafLight * 4 + grain * 0.2));
            break;
          }
          // Puffy, cloud-like boulders: billow noise makes round puffs with dark creases
          // between them, shaded by the slope towards the light (lower right).
          const billow = (bx: number, by: number) => Math.abs(2 * fbm(bx / 14, by / 14, s + 30, 3) - 1);
          const puff = billow(x, y);
          const toLight = billow(x + 2, y + 2) - puff;
          put(x, y, pick(ROCK, Math.sqrt(puff) * 1.1 + toLight * 3 + grain * 0.05 - 0.15));
          break;
        }
        case Material.Concrete: {
          // Large paving slabs with dark seams; each slab slightly different.
          const sx = Math.floor(x / 24);
          const sy = Math.floor(y / 24);
          const seam = x % 24 === 0 || y % 24 === 0;
          const lip = x % 24 === 23 || y % 24 === 23;
          const tone = 0.35 + hash2(sx, sy, s + 61) * 0.3 + (grain - 0.5) * 0.12;
          put(x, y, seam ? CONCRETE[0] : lip ? CONCRETE[4] : pick(CONCRETE, tone));
          break;
        }
        default: {
          const rim = toRock[i];
          if (rim <= 2) put(x, y, VOID_RIM[Math.max(0, Math.min(VOID_RIM.length - 1, Math.floor(rim) - 1))]);
          else if (grain > 0.994) put(x, y, STARS[Math.floor(hash2(x, y, s + 9) * STARS.length)]);
          else put(x, y, [0, 0, 0]);
        }
      }
    }
  }

  for (const d of t.decor) drawDecor(d, data, w, h, mat, s);
  return { width: w, height: h, data };
}

function drawDecor(d: Decor, data: Uint8ClampedArray, w: number, h: number, mat: Uint8Array, s: number): void {
  const r = d.kind === 'bush' ? 7 : 8;
  const cx = Math.round(d.x);
  const cy = Math.round(d.y);
  const blobAt = (x: number, y: number, ox: number, oy: number) => {
    const dx = x - (cx + ox);
    const dy = y - (cy + oy);
    const edge = r + (fbm(x / 2.5, y / 2.5, s + cx * 7 + cy, 1) - 0.5) * 2.2;
    return dx * dx + dy * dy <= edge * edge;
  };
  // Shadow first, only darkening open ground.
  for (let y = cy - r * 2; y <= cy + r * 2; y++) {
    for (let x = cx - r * 2; x <= cx + r * 2; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const m = mat[y * w + x];
      if ((m !== Material.Ground && m !== Material.Rough) || !blobAt(x, y, SHADOW_DX, SHADOW_DY)) continue;
      const i = (y * w + x) * 4;
      const c = GROUND_SHADOW[Math.floor(hash2(x, y, s + 11) * GROUND_SHADOW.length)];
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
    }
  }
  for (let y = cy - r - 2; y <= cy + r + 2; y++) {
    for (let x = cx - r - 2; x <= cx + r + 2; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || !blobAt(x, y, 0, 0)) continue;
      // Simple sphere shading: brighter towards the lower right.
      const nx = (x - cx) / r;
      const ny = (y - cy) / r;
      const light = 0.5 + (nx + ny) * 0.35 + (hash2(x, y, s + 13) - 0.5) * 0.3;
      let c: RGB;
      if (d.kind === 'bush') c = pick(MOSS, light);
      else c = fbm(x / 3, y / 3, s + 17, 1) > 0.62 ? pick(MOSS, light * 0.6) : pick(ROCK, 0.25 + light * 0.5);
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
}
