import type { RGB } from './palette';
import type { Rgba } from './pixelSprite';

export const OUTLINE: RGB = [24, 24, 31];

/** Pick from a dark-to-light colour ramp with t in [0, 1]. */
export const shade = (ramp: readonly RGB[], t: number): RGB =>
  ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];

/**
 * A tiny pixel painter for procedurally drawn sprites. Everything is lit from
 * the lower right, matching the cast shadows on the terrain.
 */
export class Painter {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  px(x: number, y: number, c: RGB, alpha = 255): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = alpha;
  }

  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c);
  }

  /** A rectangle shaded like a slab: lighter towards the lower right edge. */
  slab(x: number, y: number, w: number, h: number, ramp: readonly RGB[]): void {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const edge = xx === 0 || yy === 0 ? -0.25 : xx === w - 1 || yy === h - 1 ? 0.25 : 0;
        this.px(x + xx, y + yy, shade(ramp, 0.55 + edge + ((xx / w + yy / h) / 2 - 0.5) * 0.4));
      }
    }
  }

  /** A sphere-shaded disc. */
  disc(cx: number, cy: number, r: number, ramp: readonly RGB[]): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const nx = (x - cx) / r;
        const ny = (y - cy) / r;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2);
        // Light from the lower right and above.
        const lit = Math.max(0, nx * 0.45 + ny * 0.45 + nz * 0.77);
        this.px(x, y, shade(ramp, lit * 0.9 + 0.08));
      }
    }
  }

  /** Tread: dark rim with alternating link rows. */
  tread(x: number, y: number, w: number, h: number, ramp: readonly RGB[]): void {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const rim = xx === 0 || xx === w - 1;
        this.px(x + xx, y + yy, rim ? ramp[0] : yy % 2 ? ramp[1] : ramp[Math.min(ramp.length - 1, 2 + (xx === w - 2 ? 1 : 0))]);
      }
    }
  }

  /** Draw a dark 1px outline around everything painted so far. */
  outline(c: RGB = OUTLINE): void {
    const w = this.width;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < this.height && this.data[(y * w + x) * 4 + 3] > 0;
    const edge: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < w; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) edge.push([x, y]);
      }
    }
    for (const [x, y] of edge) this.px(x, y, c);
  }

  toRgba(): Rgba {
    return { width: this.width, height: this.height, data: this.data };
  }
}
