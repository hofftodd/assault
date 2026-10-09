import type { EnemyKind, Spawn } from './enemies';
import { fbm, valueNoise } from './noise';

export const Material = {
  Void: 0,
  Rock: 1,
  Ground: 2,
  Rough: 3,
  /** Paved base apron: drivable, with crisp straight edges. */
  Concrete: 4,
  /** Ponds and rivers: tanks can't cross, shots fly over. */
  Water: 5,
  /** Crop fields and thickets: drivable but slow. */
  Crop: 6,
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
 *   ' ' void   '#' rock   '.' ground   ',' rough ground   '=' concrete   '~' water   'f' crops
 *   'b' bush   'o' boulder   'P' player start   'J' jump zone   (all on ground)
 *   'H' exit hatch (on concrete)
 *   Enemies on ground: '1' Type 1   '2' Type 2   '5' Type 5   'a' 4-way Torchika   'A' 8-way Torchika
 *   'C' Type 1 cannon (on concrete)
 * Waves that appear in sequence are listed in the stage definition instead.
 */
const LEGEND: Record<string, Material> = {
  ' ': Material.Void,
  '#': Material.Rock,
  '.': Material.Ground,
  ',': Material.Rough,
  '=': Material.Concrete,
  '~': Material.Water,
  f: Material.Crop,
  b: Material.Ground,
  o: Material.Ground,
  P: Material.Ground,
  J: Material.Ground,
  H: Material.Concrete,
  '1': Material.Ground,
  '2': Material.Ground,
  '5': Material.Ground,
  a: Material.Ground,
  A: Material.Ground,
  C: Material.Concrete,
};

const ENEMY_CHARS: Record<string, EnemyKind> = {
  '1': 'type1',
  '2': 'type2',
  '5': 'type5',
  a: 'torchika1',
  A: 'torchika2',
  C: 'cannon1',
};

/** How far (px) tile boundaries are pushed around so cliffs look natural. */
const JITTER = 9;
const ROUGH_SPEED = 0.55;
const CROP_SPEED = 0.75;

export class TileTerrain implements Terrain {
  readonly cols: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  readonly decor: Decor[] = [];
  readonly start = { x: 0, y: 0 };
  /** Enemies placed with map letters. */
  readonly spawns: Spawn[] = [];
  /** World-space centres of jump zones and the exit hatch. */
  readonly jumpZones: { x: number; y: number }[] = [];
  hatch: { x: number; y: number } | null = null;
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
        if (ch === 'J') this.jumpZones.push({ x: cx, y: cy });
        if (ch === 'H') this.hatch = { x: cx, y: cy };
        if (ENEMY_CHARS[ch]) this.spawns.push({ kind: ENEMY_CHARS[ch], tx, ty });
      });
    });
  }

  tileAt(tx: number, ty: number): Material {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return Material.Void;
    return this.tiles[ty * this.cols + tx] as Material;
  }

  /** Material at a world position, with noisy boundaries between natural tiles. */
  materialAt(x: number, y: number): Material {
    return this.materialJittered(x, y, this.jitterX(x, y), this.jitterY(x, y));
  }

  /** How far tile boundaries are pushed around at (x, y), horizontally and vertically. */
  jitterX(x: number, y: number): number {
    const s = this.seed;
    return (fbm(x / 30, y / 30, s + 1, 2) - 0.5) * 2 * JITTER + (valueNoise(x / 5, y / 5, s + 7) - 0.5) * 3;
  }

  jitterY(x: number, y: number): number {
    const s = this.seed;
    return (fbm(x / 30, y / 30, s + 2, 2) - 0.5) * 2 * JITTER + (valueNoise(x / 5, y / 5, s + 8) - 0.5) * 3;
  }

  /** Material at (x, y) given its boundary jitter (lets the renderer interpolate the jitter). */
  materialJittered(x: number, y: number, jx: number, jy: number): Material {
    const ts = this.tileSize;
    // Paved areas keep crisp, straight edges.
    if (this.tileAt(Math.floor(x / ts), Math.floor(y / ts)) === Material.Concrete) return Material.Concrete;
    const m = this.tileAt(Math.floor((x + jx) / ts), Math.floor((y + jy) / ts));
    return m === Material.Concrete ? Material.Ground : m;
  }

  solidAt(x: number, y: number): boolean {
    const m = this.materialAt(x, y);
    return m === Material.Void || m === Material.Rock || m === Material.Water;
  }

  speedAt(x: number, y: number): number {
    const m = this.materialAt(x, y);
    return m === Material.Rough ? ROUGH_SPEED : m === Material.Crop ? CROP_SPEED : 1;
  }

  /** Cliffs stop shots; they fly on over open ground and the void. */
  blocksShotsAt(x: number, y: number): boolean {
    return this.materialAt(x, y) === Material.Rock;
  }
}
