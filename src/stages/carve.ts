import { hash2 } from '../sim/noise';

/** Builds a tile map (see the legend in sim/terrain.ts) by carving shapes out of the void. */
export class MapCarver {
  private readonly g: string[][];

  constructor(
    readonly cols: number,
    readonly rows: number,
    private readonly seed: number,
  ) {
    this.g = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
  }

  get(tx: number, ty: number): string {
    return this.g[ty]?.[tx] ?? ' ';
  }

  set(tx: number, ty: number, ch: string): void {
    if (tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows) this.g[ty][tx] = ch;
  }

  /** Open ground along a polyline of tile points, `halfWidth` tiles either side. */
  corridor(points: [number, number][], halfWidth: number, ch = '.'): this {
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let k = 0; k <= steps; k++) this.disc(x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps, halfWidth, ch);
    }
    return this;
  }

  disc(cx: number, cy: number, r: number, ch = '.'): this {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, ch);
      }
    }
    return this;
  }

  rect(x: number, y: number, w: number, h: number, ch: string): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, ch);
    return this;
  }

  /** Turn open ground inside a disc into rough ground. */
  rough(cx: number, cy: number, r: number): this {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && this.get(x, y) === '.') this.set(x, y, ',');
      }
    }
    return this;
  }

  /** Ring all open ground and concrete with `thickness` tiles of cliff. */
  cliffs(thickness: number): this {
    const open = (ch: string) => ch !== ' ' && ch !== '#';
    const add: [number, number][] = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (this.get(x, y) !== ' ') continue;
        let near = false;
        for (let dy = -thickness; dy <= thickness && !near; dy++) {
          for (let dx = -thickness; dx <= thickness && !near; dx++) {
            if (dx * dx + dy * dy <= thickness * thickness + 1 && open(this.get(x + dx, y + dy))) near = true;
          }
        }
        if (near) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.set(x, y, '#');
    return this;
  }

  /** Sprinkle bushes and boulders on plain ground, keeping clear of `keepClear` tiles. */
  decorate(bushes: number, boulders: number, keepClear: [number, number][] = []): this {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (this.get(x, y) !== '.') continue;
        if (keepClear.some(([kx, ky]) => Math.abs(kx - x) <= 2 && Math.abs(ky - y) <= 2)) continue;
        const r = hash2(x, y, this.seed + 404);
        if (r < bushes) this.set(x, y, 'b');
        else if (r < bushes + boulders) this.set(x, y, 'o');
      }
    }
    return this;
  }

  /** Place a marker (start, enemy, jump zone, hatch...) on a tile. */
  put(tx: number, ty: number, ch: string): this {
    this.set(tx, ty, ch);
    return this;
  }

  toRows(): string[] {
    return this.g.map((r) => r.join(''));
  }
}
