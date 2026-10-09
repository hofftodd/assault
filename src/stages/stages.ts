import type { EnemyKind, Spawn } from '../sim/enemies';
import type { ExitKind } from '../sim/world';
import { stage10, stage3, stage4, stage5 } from './area3';
import { stage11, stage6, stage7, stage8, stage9 } from './area4';
import { MapCarver } from './carve';
import { STAGE01_TERRAIN } from './stage01Map';
import { STAGE02_TERRAIN } from './stage02Map';

export interface StageDef {
  /** Number shown as "STAGE nn". */
  number: number;
  /** Name of the area, shown in the ending credits in the original. */
  area: string;
  /** Seconds. */
  timeLimit: number;
  /** Second-half stages: enemies take more hits. */
  hard: boolean;
  seed: number;
  map: string[];
  /** Route (tile coordinates) the guide arrow leads the player along, ending at the stage-end cannons. */
  guide: [number, number][];
  /** Enemies placed in waves, in addition to those marked on the map. */
  spawns?: Spawn[];
  /** Initial heading in degrees (0 = up the map). */
  startHeading?: number;
  /** How the tank leaves once the cannons are down (default: the hatch). */
  exit?: ExitKind;
}

/**
 * Stage 1, "Progress Planetary Circumstances", on the original's F-shaped map. Up from
 * the southern tip past four groups of light tanks, an 8-way pillbox and the jump zone,
 * through the wide field full of tanks, then east past four pillboxes to the two
 * cannons guarding the base. 2:15 on the clock.
 */
function stage1(): StageDef {
  const c = MapCarver.fromRows(STAGE01_TERRAIN, 11);
  // The converted map marks the jump-zone plate as concrete and the cannons as rock; tidy them.
  c.replace(25, 34, 6, 5, '=', '.').put(28, 37, 'J');
  c.rect(40, 8, 14, 7, '=').rect(50, 15, 4, 8, '=');
  c.put(43, 9, 'C').put(43, 13, 'C');
  c.put(51, 21, 'H');
  c.put(10, 84, 'P');
  c.decorate(0.01, 0.006, [[10, 84], [28, 37]]);

  const taken: [number, number][] = [[10, 84], [28, 37], [12, 21]];
  const spawns: Spawn[] = [];
  const tanks = (cx: number, cy: number, r: number, units: [EnemyKind, number][]) => {
    for (const [kind, n] of units) for (const [tx, ty] of c.scatter(cx, cy, n, r, taken)) spawns.push({ kind, tx, ty, facing: 180 });
  };
  const at = (kind: EnemyKind, tx: number, ty: number) => {
    spawns.push({ kind, tx, ty });
    taken.push([tx, ty]);
  };

  // Forward: 4 light tanks.
  tanks(11, 73, 3, [['type1', 4]]);
  // Turn left, up the narrow part: 4 light tanks.
  tanks(9, 59, 2, [['type1', 4]]);
  // Turn right: 5 light tanks.
  tanks(19, 52, 3, [['type1', 5]]);
  // Turn left: 4 light tanks, the 8-way pillbox and the jump zone.
  tanks(30, 44, 2, [['type1', 4]]);
  at('torchika2', 32, 36);
  // Turn left into the field: light tanks, twin-barrel tanks and one heavy tank.
  tanks(15, 26, 6, [['type1', 8], ['type2', 4]]);
  tanks(12, 15, 6, [['type1', 8], ['type2', 4], ['type5', 1]]);
  tanks(22, 11, 5, [['type1', 6], ['type2', 4]]);
  // Turn right: two 4-way pillboxes, two 8-way pillboxes, then 4 light tanks.
  at('torchika1', 27, 9);
  at('torchika1', 27, 15);
  at('torchika2', 33, 11);
  at('torchika2', 33, 13);
  tanks(37, 12, 2, [['type1', 4]]);

  return {
    number: 1,
    area: 'PROGRESS PLANETARY CIRCUMSTANCES',
    timeLimit: 135,
    hard: false,
    seed: 11,
    map: c.toRows(),
    guide: [
      [10, 76],
      [8, 60],
      [16, 52],
      [30, 46],
      [22, 37],
      [18, 28],
      [18, 14],
      [30, 12],
      [38, 11],
    ],
    spawns,
    startHeading: 0,
  };
}

/**
 * Stage 2, "Memorial Land Forever", on the original's map. The walkthrough's waves
 * come in order along the route: each group of tanks, once destroyed, opens holes
 * from which nuke-only UFO launchers rise. Up the west side, east along the top
 * past the ponds, down the east side through the rough ground, then west along
 * the crop fields and south to the two cannons and the exit hatch. 2:40 on the clock.
 */
function stage2(): StageDef {
  const c = MapCarver.fromRows(STAGE02_TERRAIN, 22);
  // The converted map marks the jump-zone plates and the base strip as concrete; tidy them.
  c.replace(40, 29, 13, 11, '=', '.').replace(28, 67, 15, 12, '=', '.');
  c.put(46, 34, 'J').put(35, 73, 'J');
  c.rect(4, 103, 8, 20, '=');
  c.put(6, 106, 'C').put(10, 106, 'C');
  c.put(8, 119, 'H');
  c.put(18, 66, 'P');

  const taken: [number, number][] = [[18, 66], [46, 34], [35, 73]];
  const spawns: Spawn[] = [];
  let wave = 0;
  /** A group of tanks around a point; returns its wave number. */
  const tanks = (cx: number, cy: number, r: number, units: [EnemyKind, number][], group = ++wave): number => {
    for (const [kind, n] of units) for (const [tx, ty] of c.scatter(cx, cy, n, r, taken)) spawns.push({ kind, tx, ty, group });
    return group;
  };
  /** UFO launchers that rise from the ground once `after` is wiped out. */
  const ufos = (cx: number, cy: number, r: number, n: number, after: number) => {
    for (const [tx, ty] of c.scatter(cx, cy, n, r, taken, 3)) spawns.push({ kind: 'ufo', tx, ty, after });
  };

  // North up the west side.
  ufos(17, 50, 4, 3, tanks(18, 57, 4, [['type2', 3]]));
  ufos(18, 32, 5, 4, tanks(18, 41, 5, [['type2', 3], ['type1', 6], ['type3', 1]]));
  // Turn right: east along the top, past the ponds.
  ufos(34, 12, 3, 3, tanks(27, 13, 2, [['type3', 2]]));
  const big = tanks(42, 12, 3, [['type3', 3], ['type2', 6]]);
  tanks(56, 11, 3, [['type2', 6], ['type1', 4]], big);
  tanks(43, 27, 4, [['type2', 6], ['type1', 6]], big);
  ufos(66, 12, 3, 2, big);
  // Turn right: south down the east side, through the rough ground.
  ufos(74, 44, 3, 1, tanks(74, 34, 4, [['type1', 6], ['type3', 6]]));
  ufos(70, 63, 3, 1, tanks(69, 55, 4, [['type1', 4], ['type3', 1]]));
  ufos(64, 81, 3, 2, tanks(71, 73, 4, [['type5', 2]]));
  // The crop fields: a parked tank, worth 1000 points.
  spawns.push({ kind: 'parking', tx: 30, ty: 94, facing: 90 });

  return {
    number: 2,
    area: 'MEMORIAL LAND FOREVER',
    timeLimit: 160,
    hard: false,
    seed: 22,
    map: c.toRows(),
    guide: [
      [18, 56],
      [18, 42],
      [27, 30],
      [25, 16],
      [45, 12],
      [70, 13],
      [69, 30],
      [72, 60],
      [68, 80],
      [56, 92],
      [30, 94],
      [8, 95],
      [8, 102],
    ],
    spawns,
    startHeading: 0,
  };
}

/** All eleven stages, in play order. */
export const STAGES: StageDef[] = [
  stage1(),
  stage2(),
  stage3(),
  stage4(),
  stage5(),
  stage6(),
  stage7(),
  stage8(),
  stage9(),
  stage10(),
  stage11(),
];

/** The play-order index of stage `n` (?stage=N on the URL), or -1. */
export const stageIndexOf = (n: number): number => STAGES.findIndex((s) => s.number === n);
