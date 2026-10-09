import type { RGB } from './palette';
import type { Rgba } from './pixelSprite';

export const OUTLINE: RGB = [24, 24, 31];

/**
 * Texture pixels per world pixel. The game simulates and lays out everything in
 * world pixels (the original's 224x288 screen); art is drawn this many times finer
 * and shown at 1/ART_SCALE, so it stays the same size but gains detail.
 */
export const ART_SCALE = 2;

/** Pick from a dark-to-light colour ramp with t in [0, 1]. */
export const shade = (ramp: readonly RGB[], t: number): RGB =>
  ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];

/**
 * A tiny pixel painter for procedurally drawn sprites. Everything is lit from
 * the lower right, matching the cast shadows on the terrain.
 *
 * Shapes are given in logical pixels; the canvas is `k` times finer. Each
 * primitive is evaluated per canvas pixel, so curves, shading and outlines gain
 * detail at higher `k` while the sprite keeps its logical size.
 */
export class Painter {
  readonly data: Uint8ClampedArray;
  /** Canvas size in real pixels. */
  readonly pw: number;
  readonly ph: number;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly k = ART_SCALE,
  ) {
    this.pw = Math.round(width * k);
    this.ph = Math.round(height * k);
    this.data = new Uint8ClampedArray(this.pw * this.ph * 4);
  }

  /** Set one canvas pixel (real coordinates). */
  dot(X: number, Y: number, c: RGB, alpha = 255): void {
    if (X < 0 || Y < 0 || X >= this.pw || Y >= this.ph) return;
    const i = (Y * this.pw + X) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = alpha;
  }

  /** Fill one logical pixel. */
  px(x: number, y: number, c: RGB, alpha = 255): void {
    const X0 = Math.round(x) * this.k;
    const Y0 = Math.round(y) * this.k;
    for (let Y = Y0; Y < Y0 + this.k; Y++) for (let X = X0; X < X0 + this.k; X++) this.dot(X, Y, c, alpha);
  }

  /**
   * Visit every canvas pixel whose centre falls in the logical box, passing the
   * pixel's centre in logical coordinates (where logical pixel x spans [x, x+1)).
   */
  each(x0: number, y0: number, x1: number, y1: number, fn: (lx: number, ly: number, X: number, Y: number) => void): void {
    const k = this.k;
    for (let Y = Math.max(0, Math.floor(y0 * k)); Y < Math.min(this.ph, Math.ceil(y1 * k)); Y++) {
      const ly = (Y + 0.5) / k;
      if (ly < y0 || ly >= y1) continue;
      for (let X = Math.max(0, Math.floor(x0 * k)); X < Math.min(this.pw, Math.ceil(x1 * k)); X++) {
        const lx = (X + 0.5) / k;
        if (lx >= x0 && lx < x1) fn(lx, ly, X, Y);
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    this.each(x, y, x + w, y + h, (_lx, _ly, X, Y) => this.dot(X, Y, c));
  }

  /** A rectangle shaded like a slab: a bevel lit from the lower right, darker towards the upper left. */
  slab(x: number, y: number, w: number, h: number, ramp: readonly RGB[]): void {
    const bevel = 1 / this.k;
    this.each(x, y, x + w, y + h, (lx, ly, X, Y) => {
      const fx = lx - x;
      const fy = ly - y;
      const edge = fx < bevel || fy < bevel ? -0.25 : fx > w - bevel || fy > h - bevel ? 0.25 : 0;
      this.dot(X, Y, shade(ramp, 0.55 + edge + ((fx / w + fy / h) / 2 - 0.5) * 0.4));
    });
  }

  /** A sphere-shaded disc centred on logical pixel (cx, cy). */
  disc(cx: number, cy: number, r: number, ramp: readonly RGB[]): void {
    const ox = cx + 0.5;
    const oy = cy + 0.5;
    this.each(ox - r - 1, oy - r - 1, ox + r + 1, oy + r + 1, (lx, ly, X, Y) => {
      const nx = (lx - ox) / r;
      const ny = (ly - oy) / r;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) return;
      const nz = Math.sqrt(1 - d2);
      // Light from the lower right and above.
      const lit = Math.max(0, nx * 0.45 + ny * 0.45 + nz * 0.77);
      this.dot(X, Y, shade(ramp, lit * 0.9 + 0.08));
    });
  }

  /** Tread: dark rims, track links with a lit edge, and a highlight down the outer side. */
  tread(x: number, y: number, w: number, h: number, ramp: readonly RGB[]): void {
    const k = this.k;
    const pitch = Math.max(2, Math.round(1.5 * k));
    this.each(x, y, x + w, y + h, (lx, _ly, X, Y) => {
      const fx = lx - x;
      const rim = fx < 1 / k || fx > w - 1 / k;
      const row = (Y - Math.floor(y * k)) % pitch;
      const lit = fx > w - 2 / k ? 1 : 0;
      this.dot(X, Y, rim ? ramp[0] : row === 0 ? ramp[0] : row === pitch - 1 ? ramp[1] : ramp[Math.min(ramp.length - 1, 2 + lit)]);
    });
  }

  /** Fill a polygon (even-odd rule, logical coordinates), colouring each pixel with `paint(x, y)`. */
  polygon(points: readonly [number, number][], paint: (x: number, y: number) => RGB | null): void {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    this.each(Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1, (lx, ly, X, Y) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (yi > ly !== yj > ly && lx < ((xj - xi) * (ly - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) return;
      const c = paint(lx - 0.5, ly - 0.5);
      if (c) this.dot(X, Y, c);
    });
  }

  /** Draw a dark outline, one real pixel wide, around everything painted so far. */
  outline(c: RGB = OUTLINE): void {
    const w = this.pw;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < this.ph && this.data[(y * w + x) * 4 + 3] > 0;
    const edge: [number, number][] = [];
    for (let y = 0; y < this.ph; y++) {
      for (let x = 0; x < w; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) edge.push([x, y]);
      }
    }
    for (const [x, y] of edge) this.dot(x, y, c);
  }

  toRgba(): Rgba {
    return { width: this.pw, height: this.ph, data: this.data };
  }
}
