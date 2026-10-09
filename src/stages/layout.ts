import type { EnemyKind, Spawn } from '../sim/enemies';
import type { MapCarver } from './carve';
import type { StageDef } from './stages';

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Helpers for laying out one stage on a shared area map, in area tiles: enemy waves,
 * buried launchers, and the crop of the map the stage plays on.
 */
export class Layout {
  readonly spawns: Spawn[] = [];
  private readonly taken: [number, number][] = [];
  private wave = 0;

  constructor(
    readonly c: MapCarver,
    private readonly crop: Crop,
  ) {}

  /** A group of enemies scattered around a point; returns its wave number. */
  group(cx: number, cy: number, r: number, units: [EnemyKind, number][], after?: number): number {
    const group = ++this.wave;
    for (const [kind, n] of units) {
      for (const [tx, ty] of this.c.scatter(cx, cy, n, r, this.taken)) this.spawns.push({ kind, tx, ty, group, after, facing: 180 });
    }
    return group;
  }

  /** UFO launchers in holes that open once wave `after` is gone. */
  ufos(cx: number, cy: number, r: number, n: number, after: number): void {
    for (const [tx, ty] of this.c.scatter(cx, cy, n, r, this.taken, 3)) this.spawns.push({ kind: 'ufo', tx, ty, after });
  }

  /** One enemy at a fixed tile. */
  place(kind: EnemyKind, tx: number, ty: number, facing = 180): this {
    this.spawns.push({ kind, tx, ty, facing });
    this.taken.push([tx, ty]);
    return this;
  }

  /** Keep scattered enemies out of a lane along the route, so it can be driven once they're shot. */
  reservePath(points: [number, number][]): this {
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let k = 0; k <= steps; k++) this.taken.push([Math.round(x0 + ((x1 - x0) * k) / steps), Math.round(y0 + ((y1 - y0) * k) / steps)]);
    }
    return this;
  }

  /** Keep spawns off a tile (a start pad or a jump zone). */
  reserve(tx: number, ty: number): this {
    this.taken.push([tx, ty]);
    return this;
  }

  /** The stage's map, spawns and route, shifted into its crop. */
  finish(def: Omit<StageDef, 'map' | 'spawns' | 'guide'>, guide: [number, number][]): StageDef {
    const { x, y, w, h } = this.crop;
    const map = this.c.toRows().slice(y, y + h).map((r) => r.slice(x, x + w));
    const spawns = this.spawns.map((s) => ({ ...s, tx: s.tx - x, ty: s.ty - y }));
    return { ...def, map, spawns, guide: guide.map((p) => this.snap(p)).map(([gx, gy]) => [gx - x, gy - y]) };
  }

  /** The nearest drivable tile to a route point (the converted map's edges are rough). */
  private snap([px, py]: [number, number]): [number, number] {
    for (let r = 0; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && '.,=f'.includes(this.c.get(px + dx, py + dy))) return [px + dx, py + dy];
        }
      }
    }
    return [px, py];
  }
}
