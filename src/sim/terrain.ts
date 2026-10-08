import { fbm, valueNoise } from './noise';

export const Material = {
  Void: 0,
  Rock: 1,
  Ground: 2,
  Rough: 3,
} as const;
export type Material = (typeof Material)[keyof typeof Material];

export type DecorKind = 'bush' | 'boulder';

export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
}

/** Anything the tank can collide with and drive over. */
export interface Terrain {
  solidAt(x: number, y: number): boolean;
  speedAt(x: number, y: number): number;
}

/**
 * Tile map legend (one character per tile):
 *   ' ' void   '#' rock   '.' ground   ',' rough ground
 *   'b' bush on ground   'o' boulder on ground   'P' player start on ground
 */
const LEGEND: Record<string, Material> = {
  ' ': Material.Void,
  '#': Material.Rock,
  '.': Material.Ground,
  ',': Material.Rough,
  b: Material.Ground,
  o: Material.Ground,
  P: Material.Ground,
};

/** How far (px) tile boundaries are pushed around so cliffs look natural. */
const JITTER = 9;
const ROUGH_SPEED = 0.55;

export class TileTerrain implements Terrain {
  readonly cols: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  readonly decor: Decor[] = [];
  readonly start = { x: 0, y: 0 };
  private readonly tiles: Uint8Array;

  constructor(
    map: readonly string[],
    readonly tileSize: number,
    readonly seed: number,
  ) {
    this.rows = map.length;
    this.cols = map[0].length;
    this.width = this.cols * tileSize;
    this.height = this.rows * tileSize;
    this.tiles = new Uint8Array(this.cols * this.rows);
    map.forEach((row, ty) => {
      if (row.length !== this.cols) throw new Error(`map row ${ty} has ${row.length} columns, expected ${this.cols}`);
      [...row].forEach((ch, tx) => {
        const m = LEGEND[ch];
        if (m === undefined) throw new Error(`unknown map character '${ch}' at ${tx},${ty}`);
        this.tiles[ty * this.cols + tx] = m;
        const cx = (tx + 0.5) * tileSize;
        const cy = (ty + 0.5) * tileSize;
        if (ch === 'b') this.decor.push({ kind: 'bush', x: cx, y: cy });
        if (ch === 'o') this.decor.push({ kind: 'boulder', x: cx, y: cy });
        if (ch === 'P') Object.assign(this.start, { x: cx, y: cy });
      });
    });
  }

  tileAt(tx: number, ty: number): Material {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return Material.Void;
    return this.tiles[ty * this.cols + tx] as Material;
  }

  /** Material at a world position, with noisy boundaries between tiles. */
  materialAt(x: number, y: number): Material {
    const s = this.seed;
    const jx = (fbm(x / 30, y / 30, s + 1, 2) - 0.5) * 2 * JITTER + (valueNoise(x / 5, y / 5, s + 7) - 0.5) * 3;
    const jy = (fbm(x / 30, y / 30, s + 2, 2) - 0.5) * 2 * JITTER + (valueNoise(x / 5, y / 5, s + 8) - 0.5) * 3;
    return this.tileAt(Math.floor((x + jx) / this.tileSize), Math.floor((y + jy) / this.tileSize));
  }

  solidAt(x: number, y: number): boolean {
    const m = this.materialAt(x, y);
    return m === Material.Void || m === Material.Rock;
  }

  speedAt(x: number, y: number): number {
    return this.materialAt(x, y) === Material.Rough ? ROUGH_SPEED : 1;
  }

  /** Cliffs stop shots; they fly on over open ground and the void. */
  blocksShotsAt(x: number, y: number): boolean {
    return this.materialAt(x, y) === Material.Rock;
  }
}
