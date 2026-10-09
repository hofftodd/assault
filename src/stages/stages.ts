import type { EnemyKind, Spawn } from '../sim/enemies';
import { MapCarver } from './carve';
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
}

/**
 * Stage 1, "Progress Planetary Circumstances", after the StrategyWiki walkthrough:
 * four bends with groups of light tanks, an 8-way pillbox and a jump zone, a wide
 * field full of tanks, a run past more pillboxes, then two cannons guarding the base.
 */
function stage1(): StageDef {
  const c = new MapCarver(50, 89, 11);
  const route: [number, number][] = [
    [24, 80], // start
    [24, 64], // forward
    [12, 52], // turn left
    [28, 39], // turn right
    [20, 31], // turn left
  ];
  c.corridor(route, 5);
  // The wide field, entered from the bottom right and left at the top right.
  c.disc(17, 21, 10).disc(9, 17, 6).disc(25, 17, 7).disc(15, 13, 6).disc(22, 25, 6);
  // Out of the field: turn right past the pillboxes towards the base.
  c.corridor(
    [
      [26, 13],
      [34, 12],
      [39, 10],
    ],
    4,
  );
  c.rect(33, 3, 13, 8, '=');
  c.cliffs(3);
  c.rough(14, 54, 3).rough(30, 41, 2.5).rough(6, 20, 3).rough(20, 12, 2.5).rough(27, 22, 2);
  c.decorate(0.014, 0.008, [[24, 80], [20, 28], ...route]);

  c.put(24, 80, 'P');
  // Forward: 4 light tanks.
  c.put(22, 72, '1').put(26, 71, '1').put(21, 67, '1').put(27, 66, '1');
  // Turn left: 4 light tanks.
  c.put(18, 58, '1').put(14, 55, '1').put(11, 53, '1').put(15, 51, '1');
  // Turn right: 5 light tanks.
  c.put(19, 47, '1').put(22, 45, '1').put(25, 43, '1').put(28, 41, '1').put(24, 40, '1');
  // Turn left: 4 light tanks, the 8-way pillbox and the jump zone.
  c.put(25, 36, '1').put(23, 33, '1').put(19, 34, '1').put(17, 31, '1');
  c.put(22, 31, 'A');
  c.put(20, 28, 'J');
  // The field: light tanks, twin-barrel tanks and one heavy tank.
  const field: [number, number, string][] = [
    [13, 27, '1'], [17, 26, '1'], [24, 24, '1'], [10, 24, '1'], [14, 23, '1'], [20, 22, '1'], [26, 20, '1'],
    [8, 20, '1'], [11, 19, '1'], [16, 19, '1'], [22, 18, '1'], [28, 16, '1'], [5, 16, '1'], [9, 14, '1'],
    [13, 15, '1'], [18, 15, '1'], [24, 14, '1'], [12, 11, '1'], [16, 10, '1'], [20, 12, '1'], [7, 18, '1'],
    [25, 26, '1'],
    [15, 25, '2'], [21, 25, '2'], [12, 21, '2'], [18, 20, '2'], [24, 19, '2'], [9, 16, '2'], [14, 17, '2'],
    [20, 16, '2'], [26, 15, '2'], [11, 13, '2'], [17, 12, '2'], [22, 11, '2'],
    [15, 13, '5'],
  ];
  for (const [x, y, ch] of field) c.put(x, y, ch);
  // Turn right: two 4-way pillboxes, two 8-way pillboxes, then 4 light tanks.
  c.put(27, 11, 'a').put(30, 14, 'a').put(29, 9, 'A').put(32, 15, 'A');
  c.put(31, 11, '1').put(34, 15, '1').put(35, 14, '1').put(37, 13, '1');
  // The base: two cannons guarding the exit hatch.
  c.put(36, 6, 'C').put(42, 6, 'C');
  c.put(39, 4, 'H');

  return {
    number: 1,
    area: 'PROGRESS PLANETARY CIRCUMSTANCES',
    timeLimit: 135,
    hard: false,
    seed: 11,
    map: c.toRows(),
    guide: [...route.slice(1), [20, 27], [16, 18], [26, 13], [34, 12], [39, 8]],
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

export const STAGES: StageDef[] = [stage1(), stage2()];
