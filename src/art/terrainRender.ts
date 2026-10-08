import { fbm, hash2 } from '../sim/noise';
import { Material, type Decor, type TileTerrain } from '../sim/terrain';
import { GROUND, GROUND_SHADOW, MOSS, PEBBLE, ROCK, STARS, VOID_RIM, type RGB } from './palette';
import type { Rgba } from './pixelSprite';

/** Light comes from the lower right, so shadows fall up and to the left. */
const SHADOW_DX = -4;
const SHADOW_DY = -8;

const pick = (ramp: readonly RGB[], t: number): RGB => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];

/** Distance (in px, up to `max`) from (x, y) to the nearest pixel of material `m`, or Infinity. */
function nearest(mat: Uint8Array, w: number, h: number, x: number, y: number, m: number, max: number): number {
  let best = Infinity;
  for (let dy = -max; dy <= max; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= h) continue;
    for (let dx = -max; dx <= max; dx++) {
      const xx = x + dx;
      if (xx < 0 || xx >= w || mat[yy * w + xx] !== m) continue;
      const d = Math.hypot(dx, dy);
      if (d < best) best = d;
    }
  }
  return best <= max ? best : Infinity;
}

export function renderTerrain(t: TileTerrain): Rgba {
  const { width: w, height: h, seed: s } = t;
  const mat = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mat[y * w + x] = t.materialAt(x + 0.5, y + 0.5);

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
      const m = mat[y * w + x];
      const grain = hash2(x, y, s);
      switch (m) {
        case Material.Ground: {
          const toRock = nearest(mat, w, h, x, y, Material.Rock, 3);
          if (toRock <= 3 && fbm(x / 4, y / 4, s + 50, 2) > 0.5 + toRock * 0.06) {
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
          const toGround = Math.min(
            nearest(mat, w, h, x, y, Material.Ground, 7),
            nearest(mat, w, h, x, y, Material.Rough, 7),
          );
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
        default: {
          const rim = nearest(mat, w, h, x, y, Material.Rock, 2);
          if (rim <= 2) put(x, y, VOID_RIM[Math.min(VOID_RIM.length - 1, Math.floor(rim) - 1)]);
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
