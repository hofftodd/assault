import { AREA4_INTERIORS } from './area4Map';
import { MapCarver } from './carve';
import { Layout } from './layout';
import type { StageDef } from './stages';

/**
 * Area 4, "And Reconstruct Our Ruined Home": the enemy's base, a 3x3 grid of walled
 * rooms full of machinery. Stages 6, 7 and 8 each clear one room and leave through
 * gates into the next; stage 9 runs down the east rooms to the exit hatch; stage 11,
 * the last, crosses the south and centre rooms to the final launch pad. Coordinates
 * are area tiles; each stage plays on its own crop of the map.
 */
const AREA = 'AND RECONSTRUCT OUR RUINED HOME';

/** Interior spans (tiles) of the rooms' columns and rows. */
const SPANS: [number, number][] = [
  [9, 58],
  [65, 114],
  [121, 170],
];

/** Rooms' walls, interiors (converted machinery on deck) and the passages between them. */
function areaMap(seed: number): MapCarver {
  const c = new MapCarver(180, 178, seed);
  for (const [y0, y1] of SPANS) {
    for (const [x0, x1] of SPANS) {
      c.rect(x0 - 2, y0 - 2, x1 - x0 + 5, y1 - y0 + 5, '#');
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          // A clear strip of deck runs inside the walls.
          const edge = Math.min(x - x0, x1 - x, y - y0, y1 - y) < 2;
          c.set(x, y, !edge && AREA4_INTERIORS[y]?.[x] === 'm' ? 'm' : 'd');
        }
      }
    }
  }
  // Passages: west room up to north-west, along the north rooms, down the east side,
  // and the runway from the south room into the centre.
  c.rect(40, 57, 8, 10, 'd');
  c.rect(57, 18, 10, 8, 'd');
  c.rect(113, 40, 10, 8, 'd');
  c.rect(158, 57, 8, 10, 'd');
  c.rect(130, 113, 8, 10, 'd');
  c.rect(87, 113, 7, 10, 'd');
  return c;
}

/** Clear the machinery from a lane along the route (and around fixed emplacements). */
function clearRoute(c: MapCarver, points: [number, number][], halfWidth = 1.5): void {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let k = 0; k <= steps; k++) clear(c, x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps, halfWidth);
  }
}

function clear(c: MapCarver, cx: number, cy: number, r: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && c.get(x, y) === 'm') c.set(x, y, 'd');
    }
  }
}

/** Start a stage: the area map with its route cleared and kept free of scattered enemies. */
function layout(seed: number, crop: { x: number; y: number; w: number; h: number }, route: [number, number][]): Layout {
  const c = areaMap(seed);
  clearRoute(c, route);
  return new Layout(c, crop).reservePath(route);
}

/** Fixed emplacements (cannons, jump zones, the hatch) get a clearing in the machinery. */
function site(L: Layout, ch: string, x: number, y: number): void {
  clear(L.c, x, y, 2.5);
  L.c.put(x, y, ch);
  L.reserve(x, y);
}

/**
 * Stage 6: landing in the west room. Scouters, then eight UFO launchers rise; more
 * Scouters and a row of parked tanks; two Type 3 cannons guard the gates to the
 * north-west room. 3:30.
 */
export function stage6(): StageDef {
  const route: [number, number][] = [
    [52, 110],
    [52, 94],
    [30, 92],
    [24, 76],
    [43, 70],
    [43, 60],
    [43, 55],
  ];
  const L = layout(66, { x: 3, y: 50, w: 62, h: 71 }, route);
  L.c.rect(40, 63, 8, 2, 'G');
  L.c.put(43, 55, 'X');
  site(L, 'P', 52, 110);
  const scouts = L.group(50, 97, 3, [['scouter', 4]]);
  L.ufos(32, 90, 5, 8, scouts);
  L.group(24, 82, 3, [['scouter', 4]]);
  L.group(17, 70, 3, [['parking', 6]]);
  for (const [x, y] of [
    [36, 70],
    [50, 70],
  ] as const) {
    clear(L.c, x, y, 2.5);
    L.place('cannon3', x, y);
  }
  return L.finish({ number: 6, area: AREA, timeLimit: 210, hard: true, seed: 66, startHeading: 0, exit: 'gate' }, route.slice(1, 5));
}

/**
 * Stage 7: the north-west room. Armoured Type 1s and a jump zone; more armour, parked
 * tanks, a Type 3 cannon, armour with a Type 7-A, and a second Type 3 cannon before
 * the gates to the north room. 2:30.
 */
export function stage7(): StageDef {
  const route: [number, number][] = [
    [43, 55],
    [43, 44],
    [27, 38],
    [22, 24],
    [32, 15],
    [48, 15],
    [53, 21],
    [62, 21],
    [68, 21],
  ];
  const L = layout(77, { x: 3, y: 3, w: 68, h: 60 }, route);
  L.c.rect(59, 18, 2, 8, 'G');
  L.c.put(68, 21, 'X');
  site(L, 'P', 43, 55);
  site(L, 'J', 47, 46);
  L.group(43, 49, 3, [['type1a', 4]]);
  L.group(29, 36, 4, [['type1a', 8]]);
  L.group(21, 28, 2, [['type1a', 1]]);
  L.group(18, 17, 3, [['parking', 6]]);
  L.group(28, 13, 2, [['type1a', 2]]);
  clear(L.c, 40, 11, 2.5);
  L.place('cannon3', 40, 11);
  L.group(48, 18, 3, [['type1a', 3], ['type7a', 1]]);
  clear(L.c, 54, 27, 2.5);
  L.place('cannon3', 54, 27);
  return L.finish({ number: 7, area: AREA, timeLimit: 150, hard: true, seed: 77, startHeading: 0, exit: 'gate' }, route.slice(1, 7));
}

/**
 * Stage 8: the north room. Armour and two Type 2 cannons; parked tanks and Scouters;
 * six sixteen-way Type 7-Bs and a Type 3 cannon; more armour and parked tanks; two
 * more Type 2 cannons before the gates east. 2:30.
 */
export function stage8(): StageDef {
  const route: [number, number][] = [
    [68, 21],
    [73, 22],
    [73, 42],
    [86, 50],
    [104, 50],
    [104, 22],
    [90, 15],
    [84, 30],
    [100, 40],
    [112, 44],
    [118, 44],
    [125, 44],
  ];
  const L = layout(88, { x: 56, y: 3, w: 71, h: 60 }, route);
  L.c.rect(115, 40, 2, 8, 'G');
  L.c.put(125, 44, 'X');
  site(L, 'P', 68, 21);
  L.group(73, 33, 2, [['type1a', 3]]);
  for (const [x, y] of [
    [69, 49],
    [79, 55],
  ] as const) {
    clear(L.c, x, y, 2.5);
    L.place('cannon2', x, y);
  }
  L.group(92, 54, 3, [['parking', 6]]);
  L.group(100, 46, 3, [['scouter', 5]]);
  L.group(105, 34, 5, [['type7b', 6]]);
  clear(L.c, 98, 11, 2.5);
  L.place('cannon3', 98, 11);
  L.group(84, 22, 2, [['type1a', 3]]);
  L.group(92, 30, 3, [['parking', 6]]);
  for (const [x, y] of [
    [109, 37],
    [109, 52],
  ] as const) {
    clear(L.c, x, y, 2.5);
    L.place('cannon2', x, y);
  }
  return L.finish({ number: 8, area: AREA, timeLimit: 150, hard: true, seed: 88, startHeading: 90, exit: 'gate' }, route.slice(1, 10));
}

/**
 * Stage 9: down the east rooms. A jump zone and ten Scouters; armour, Type 2s, Type 3s
 * and heavy tanks through the middle room; a second jump zone, then four pairs of
 * Type 1 and Type 2 cannons around the south-east room, each pair guarded by a
 * Type 7-B, and the exit hatch in the middle. 5:00.
 */
export function stage9(): StageDef {
  const route: [number, number][] = [
    [124, 44],
    [140, 44],
    [152, 50],
    [162, 54],
    [162, 66],
    [156, 76],
    [145, 88],
    [135, 100],
    [134, 112],
    [134, 128],
    [150, 136],
    [162, 150],
    [150, 162],
    [132, 158],
    [145, 148],
  ];
  const L = layout(99, { x: 115, y: 3, w: 62, h: 174 }, route);
  site(L, 'P', 124, 44);
  site(L, 'H', 145, 148);
  site(L, 'J', 131, 47);
  site(L, 'J', 128, 106);
  L.group(146, 41, 5, [['scouter', 10]]);
  L.group(155, 55, 3, [['type1a', 3]]);
  L.group(160, 72, 4, [['scouter', 2], ['type2', 6]]);
  L.group(152, 82, 3, [['type1a', 4]]);
  L.group(144, 91, 4, [['type3', 6]]);
  L.group(139, 95, 2, [['type7a', 1]]);
  L.group(139, 103, 3, [['type7b', 1], ['type7a', 1], ['type1a', 1]]);
  const pairs: [number, number, number, number][] = [
    [127, 128, 139, 125],
    [158, 138, 166, 145],
    [156, 166, 146, 167],
    [126, 152, 126, 142],
  ];
  const guards: [number, number][] = [
    [150, 131],
    [161, 156],
    [138, 163],
  ];
  pairs.forEach(([ax, ay, bx, by], i) => {
    for (const [x, y, kind] of [
      [ax, ay, 'cannon1'],
      [bx, by, 'cannon2'],
    ] as const) {
      clear(L.c, x, y, 2.5);
      L.place(kind, x, y);
    }
    if (guards[i]) L.group(guards[i][0], guards[i][1], 2, [['type7b', 1]]);
  });
  return L.finish({ number: 9, area: AREA, timeLimit: 300, hard: true, seed: 99, startHeading: 90 }, route.slice(1, 14));
}

/**
 * Stage 11, the last: the south room's ranks of pillboxes and parked tanks, with
 * Type 3 cannons in pairs; then up the runway into the centre room, where Type 7-Bs,
 * UFO launchers and the Black Generator guard more parked tanks and cannons around
 * the launch pad that ends the war. 4:30.
 */
export function stage11(): StageDef {
  const route: [number, number][] = [
    [110, 166],
    [108, 128],
    [72, 128],
    [72, 166],
    [90, 166],
    [90, 140],
    [90, 112],
    [106, 106],
    [106, 72],
    [72, 72],
    [72, 106],
    [84, 100],
    [90, 92],
  ];
  const L = layout(111, { x: 58, y: 58, w: 65, h: 119 }, route);
  // The runway cross through the centre room, and the launch pad at its heart.
  clear(L.c, 90, 90, 4);
  L.c.rect(88, 67, 5, 58, '=').rect(67, 88, 46, 5, '=');
  site(L, 'H', 90, 90);
  site(L, 'P', 110, 166);
  const cannons = (pts: [number, number][]) => {
    for (const [x, y] of pts) {
      clear(L.c, x, y, 2.5);
      L.place('cannon3', x, y);
    }
  };

  // The south room: up the east side, west along the top, down the west side, east along the bottom.
  L.group(108, 160, 2, [['torchika1', 3]]);
  cannons([[103, 152], [112, 148]]);
  L.group(104, 142, 3, [['parking', 6]]);
  L.group(106, 134, 3, [['torchika1', 5]]);
  L.group(90, 134, 6, [['torchika1', 25]]);
  L.group(78, 134, 3, [['parking', 6]]);
  cannons([[68, 137], [77, 142]]);
  L.group(76, 152, 4, [['torchika1', 15]]);
  L.group(80, 162, 3, [['parking', 6]]);
  cannons([[98, 162], [104, 168]]);
  L.group(96, 150, 6, [['torchika1', 32]]);
  L.group(84, 146, 3, [['parking', 6]]);
  cannons([[86, 124], [95, 124]]);
  L.group(90, 118, 2, [['torchika1', 2]]);

  // The centre room, anticlockwise from the runway to the launch pad.
  L.group(100, 108, 3, [['type7b', 2]]);
  L.group(108, 98, 3, [['parking', 6]]);
  cannons([[100, 94], [112, 93]]);
  L.group(108, 82, 3, [['parking', 6]]);
  const ne = L.group(104, 72, 2, [['type7b', 1]]);
  L.group(99, 79, 4, [['parking', 12], ['torchika1', 4]]);
  L.ufos(96, 70, 3, 2, ne);
  const n = L.group(86, 72, 2, [['type7b', 1]]);
  L.group(82, 79, 4, [['parking', 12], ['torchika1', 2]]);
  cannons([[78, 68], [84, 84]]);
  L.ufos(76, 70, 3, 2, n);
  L.group(72, 78, 2, [['type7b', 1]]);
  L.group(77, 86, 4, [['parking', 12], ['torchika1', 4]]);
  L.group(71, 96, 3, [['type7b', 4]]);
  L.place('generator2', 78, 98);
  L.group(78, 108, 4, [['parking', 12], ['torchika1', 2]]);
  cannons([[68, 110], [74, 113]]);
  const last = L.group(84, 104, 2, [['type7b', 1]]);
  L.group(97, 100, 3, [['parking', 12], ['torchika1', 4]]);
  L.ufos(95, 86, 3, 2, last);
  L.group(83, 92, 3, [['parking', 12], ['torchika1', 2]]);
  cannons([[96, 96], [84, 96]]);

  return L.finish({ number: 11, area: AREA, timeLimit: 270, hard: true, seed: 111, startHeading: 90, exit: 'launch' }, route.slice(1));
}
