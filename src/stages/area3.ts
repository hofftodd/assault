import { AREA3_TERRAIN } from './area3Map';
import { MapCarver } from './carve';
import { Layout } from './layout';
import type { StageDef } from './stages';

/**
 * Area 3, "Crops Grow in River Side": one map shared by stages 3, 4 and 5 (and later
 * 10). Each stage plays on its own crop of the map; stages 3 and 4 end at gates that
 * slide open onto the next stage, and stage 5 at a launch pad. Coordinates below are
 * area tiles; each stage's map, spawns and route are shifted into its crop.
 */
const AREA = 'CROPS GROW IN RIVER SIDE';

/** Gateway batteries, in area tiles. */
const BATTERY3 = { x: 92, y: 78, w: 14, h: 12, gateY: 86 };
const BATTERY4 = { x: 52, y: 109, w: 15, h: 13, gateY: 110 };
const BATTERY5 = { x: 68, y: 150, w: 13, h: 22, gateX: 76 };

/** The terrain every stage of the area shares: bases, batteries (gates open) and the hedge rows. */
function areaMap(seed: number): MapCarver {
  const c = MapCarver.fromRows(AREA3_TERRAIN, seed);
  // Jump-zone plates and batteries come through the conversion as concrete smudges.
  c.replace(0, 0, c.cols, c.rows, '=', '.');

  // The north-west base: paved yards with two lawns where tanks are parked, and the runway.
  c.rect(11, 8, 27, 29, '=');
  c.rect(38, 9, 41, 3, '=');
  c.rect(23, 24, 11, 11, '.').rect(12, 18, 7, 6, '.');

  // Gateway batteries across the passages: a paved floor between walls.
  for (const b of [BATTERY3, BATTERY4]) {
    c.rect(b.x - 3, b.y, 3, b.h, '#').rect(b.x + b.w, b.y, 3, b.h, '#');
    c.rect(b.x, b.y, b.w, b.h, '=');
  }
  c.rect(BATTERY5.x, BATTERY5.y, BATTERY5.w, BATTERY5.h, '=');
  // The launch pad beyond the last battery.
  c.rect(83, 158, 5, 5, '=');

  // The hedge rows before the last battery: four lanes, the outer two dead ends.
  for (const y of [155, 160, 165]) c.rect(28, y, 35, 1, 'h');
  c.rect(61, 150, 2, 5, 'h').rect(61, 166, 2, 6, 'h');
  return c;
}

/**
 * Stage 3: the tank lands at the foot of the eastern lobe, facing the cliff. Left, up
 * the lobe past seven Type 3s; left again along the top past Type 1s and two
 * sixteen-way Type 7-Bs; then south past Type 3s and armoured Type 1s to three Type 1
 * cannons and a Type 2 cannon in front of the gates. 1:50 on the clock.
 */
export function stage3(): StageDef {
  const L = new Layout(areaMap(33), { x: 84, y: 34, w: 56, h: 66 });
  const c = L.c;
  const b = BATTERY3;
  c.rect(b.x, b.gateY, b.w, 2, 'G');
  c.put(94, 81, 'C').put(97, 81, 'C').put(103, 81, 'C');
  c.put(98, 94, 'X');
  c.put(124, 80, 'P');
  L.reserve(124, 80);

  L.group(124, 60, 4, [['type3', 7]]);
  L.group(110, 44, 5, [['type1', 6], ['type7b', 2]]);
  L.group(100, 62, 6, [['type3', 4], ['type1a', 5]]);
  L.spawns.push({ kind: 'cannon2', tx: 100, ty: 81 });

  return L.finish(
    { number: 3, area: AREA, timeLimit: 110, hard: false, seed: 33, startHeading: 90, exit: 'gate' },
    [
      [124, 66],
      [122, 46],
      [104, 44],
      [98, 58],
      [98, 74],
    ],
  );
}

/**
 * Stage 4: through the gates into the cratered valley. Type 1s, then two jump zones;
 * on past Type 5s, Type 3s and Type 1s; left along the foot of the valley under a
 * Generator, then north to the seven Type 1 cannons before the next gates. 2:10.
 */
export function stage4(): StageDef {
  const L = new Layout(areaMap(44), { x: 46, y: 84, w: 82, h: 54 });
  const c = L.c;
  const b = BATTERY4;
  c.rect(b.x, b.gateY, b.w, 2, 'G');
  for (const x of [54, 57, 60, 63]) c.put(x, 114, 'C');
  for (const x of [55, 58, 61]) c.put(x, 118, 'C');
  c.put(59, 104, 'X');
  c.put(98, 94, 'P');
  c.put(108, 103, 'J').put(113, 121, 'J');
  L.reserve(98, 94).reserve(108, 103).reserve(113, 121);

  L.group(97, 103, 4, [['type1', 6]]);
  L.group(103, 128, 6, [['type5', 5], ['type3', 3], ['type1', 5]]);
  L.spawns.push({ kind: 'generator', tx: 76, ty: 129 });

  return L.finish(
    { number: 4, area: AREA, timeLimit: 130, hard: false, seed: 44, startHeading: 180, exit: 'gate' },
    [
      [95, 101],
      [108, 108],
      [112, 125],
      [95, 130],
      [70, 130],
      [59, 124],
    ],
  );
}

/**
 * Stage 5, the long one. North up the river valley (amphibious Type 4s surface from
 * the water) past two jump zones and swarms of hovering Fourlegs; west across the
 * base, where UFO launchers rise and a dozen tanks sit parked; south down the western
 * river past two more jump zones and the heaviest armour yet; then east through the
 * hedge rows to six Type 1 cannons and a Type 3, and the launch pad beyond. 6:00.
 */
export function stage5(): StageDef {
  const L = new Layout(areaMap(55), { x: 0, y: 0, w: 92, h: 175 });
  const c = L.c;
  const b = BATTERY5;
  c.rect(b.gateX, b.y, 2, b.h, 'G');
  for (const y of [152, 155, 158, 164, 167, 170]) c.put(71, y, 'C');
  c.put(85, 160, 'H');
  c.put(59, 104, 'P');
  const zones: [number, number][] = [
    [79, 78],
    [74, 43],
    [25, 81],
    [29, 115],
  ];
  for (const [x, y] of zones) c.put(x, y, 'J');
  L.reserve(59, 104);
  for (const [x, y] of zones) L.reserve(x, y);

  // North up the river valley.
  L.group(60, 96, 3, [['type1a', 2]]);
  const heavy = L.group(60, 87, 4, [['type5', 1], ['type7b', 1]]);
  L.group(62, 81, 3, [['type4', 2]], heavy);
  L.group(68, 66, 5, [['fourlegs', 8]]);
  const t5 = L.group(60, 58, 3, [['type5', 1]]);
  L.group(64, 54, 4, [['type4', 3]], t5);
  L.group(66, 47, 6, [['type1', 8], ['type3', 8]]);
  L.group(72, 32, 4, [['fourlegs', 6]]);
  L.group(68, 24, 3, [['type1', 3]]);
  L.group(70, 16, 5, [['fourlegs', 8]]);
  // West across the base.
  L.ufos(52, 14, 4, 4, L.group(60, 13, 3, [['scouter', 2], ['type7a', 1]]));
  L.ufos(42, 14, 3, 2, L.group(44, 5, 3, [['scouter', 4]]));
  L.ufos(24, 5, 3, 2, L.group(32, 5, 3, [['scouter', 3]]));
  L.group(28, 29, 4, [['parking', 6]]);
  L.group(15, 20, 2, [['parking', 6]]);
  L.group(8, 28, 3, [['scouter', 1]]);
  // South down the western river.
  L.group(11, 40, 3, [['scouter', 2]]);
  L.ufos(12, 56, 4, 4, L.group(12, 48, 3, [['scouter', 2]]));
  L.ufos(14, 70, 3, 2, L.group(12, 63, 4, [['fourlegs', 8]]));
  L.group(13, 74, 4, [['type6', 2], ['type1a', 3]]);
  L.group(10, 86, 4, [['fourlegs', 10]]);
  const fives = L.group(12, 93, 4, [['type5', 4]]);
  L.group(14, 99, 4, [['type4', 3]], fives);
  L.group(12, 104, 4, [['fourlegs', 6]]);
  L.group(12, 108, 4, [['type3', 6]]);
  const pair = L.group(10, 112, 3, [['type7b', 1], ['type5', 1]]);
  L.ufos(14, 122, 5, 7, pair);
  L.group(12, 128, 4, [['type4', 3]], pair);
  L.group(12, 133, 4, [['fourlegs', 6]]);
  const last = L.group(12, 139, 3, [['type5', 1], ['type1a', 1]]);
  L.ufos(12, 145, 4, 6, last);
  L.group(14, 157, 7, [['type5', 4], ['type6', 4], ['type7a', 2], ['type7b', 1]]);
  // East through the hedge rows to the battery.
  L.group(40, 162, 2, [['scouter', 3]]);
  L.group(40, 168, 2, [['scouter', 3]]);
  L.group(64, 160, 3, [['type3', 7]]);
  L.spawns.push({ kind: 'cannon3', tx: 71, ty: 161 });

  return L.finish(
    { number: 5, area: AREA, timeLimit: 360, hard: false, seed: 55, startHeading: 0, exit: 'launch' },
    [
      [59, 92],
      [62, 70],
      [66, 50],
      [70, 22],
      [50, 7],
      [20, 6],
      [8, 30],
      [12, 60],
      [14, 90],
      [14, 120],
      [14, 150],
      [30, 162],
      [58, 162],
      [66, 161],
    ],
  );
}

/**
 * Stage 10: back on area 3, now fully manned. East along the southern corridor under
 * the Black Generator, past heavy tanks; north through the rice paddies; up the
 * winding north-eastern paths through armour, UFO launchers and Type 5s; then the
 * battery of four Type 1, four Type 2 and four Type 3 cannons, and the launch pad
 * back to the enemy base. Enemies take the second-half hit counts. 4:30.
 */
export function stage10(): StageDef {
  const L = new Layout(areaMap(110), { x: 82, y: 0, w: 94, h: 175 });
  const c = L.c;
  // The north-east battery, and the launch pad below it.
  c.rect(115, 10, 14, 13, '=').rect(119, 23, 5, 8, '=');
  c.put(121, 28, 'H');
  c.put(92, 162, 'P');
  L.reserve(92, 162).reserve(121, 28);
  const kinds = ['cannon1', 'cannon2', 'cannon3'] as const;
  kinds.forEach((kind, row) => {
    for (const x of [117, 120, 123, 126]) L.place(kind, x, 12 + row * 3);
  });

  // East along the southern corridor.
  L.group(102, 161, 2, [['type1a', 1]]);
  L.group(111, 158, 4, [['fourlegs', 8]]);
  L.place('generator2', 119, 160);
  L.group(127, 162, 3, [['type7b', 2]]);
  L.group(133, 158, 2, [['type3', 1]]);
  L.group(140, 156, 3, [['type7a', 2]]);
  L.group(147, 150, 4, [['type6', 3]]);
  // North through the paddies.
  L.group(150, 138, 4, [['type3', 9]]);
  L.group(152, 128, 3, [['fourlegs', 4]]);
  L.group(150, 118, 4, [['type7a', 2], ['type7b', 2]]);
  L.group(148, 104, 3, [['scouter', 4]]);
  L.group(152, 96, 3, [['fourlegs', 4]]);
  L.group(150, 88, 3, [['type3', 4]]);
  // Up the winding paths.
  L.group(162, 80, 3, [['type1a', 6]]);
  L.group(168, 62, 2, [['type5', 1]]);
  L.ufos(165, 30, 3, 4, L.group(160, 42, 4, [['type1a', 11]]));
  L.ufos(145, 16, 3, 3, L.group(152, 20, 3, [['type5', 2]]));
  L.group(130, 5, 5, [['type1a', 17]]);

  return L.finish(
    { number: 10, area: AREA, timeLimit: 270, hard: true, seed: 110, startHeading: 90, exit: 'launch' },
    [
      [104, 162],
      [130, 162],
      [146, 146],
      [150, 125],
      [152, 92],
      [165, 70],
      [166, 42],
      [160, 20],
      [142, 12],
      [126, 5],
      [121, 8],
    ],
  );
}
