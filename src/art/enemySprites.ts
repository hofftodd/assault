import { hash2 } from '../sim/noise';
import { Painter, shade } from './painter';
import type { RGB } from './palette';
import type { Rgba } from './pixelSprite';

// Ramps (dark to light), sampled from the original's sprites.
const RUST: RGB[] = [[89, 50, 40], [125, 76, 56], [143, 93, 64], [162, 110, 73], [180, 127, 82], [198, 144, 90], [217, 163, 99]];
const SLATE_TREAD: RGB[] = [[40, 40, 56], [65, 65, 89], [76, 76, 88], [91, 91, 116]];
const BLUE: RGB[] = [[24, 64, 88], [40, 72, 104], [48, 88, 120], [72, 112, 152], [88, 136, 184], [120, 176, 224]];
const GREY_TREAD: RGB[] = [[36, 36, 36], [48, 48, 48], [80, 80, 80], [112, 112, 112], [144, 144, 144]];
const STEEL: RGB[] = [[32, 48, 64], [48, 64, 80], [64, 80, 96], [80, 96, 112], [88, 104, 128], [104, 120, 144], [152, 152, 152]];
const BUNKER: RGB[] = [[54, 54, 69], [60, 61, 76], [66, 68, 83], [72, 75, 91], [78, 82, 98], [90, 96, 113], [120, 124, 140]];
const RED: RGB[] = [[110, 0, 0], [170, 0, 0], [224, 0, 0], [255, 80, 80], [255, 170, 170]];
const PALE: RGB[] = [[85, 85, 85], [102, 102, 102], [119, 119, 119], [136, 136, 136], [180, 180, 180], [225, 225, 225]];
const JADE: RGB[] = [[30, 62, 52], [46, 78, 67], [54, 86, 75], [71, 103, 91], [79, 111, 99], [95, 128, 115], [103, 136, 123], [120, 152, 139], [136, 169, 155], [170, 200, 186]];

interface TankLook {
  /** Body width and total length including barrels (px). */
  w: number;
  h: number;
  treadW: number;
  barrelLen: number;
  /** Barrel x offsets from the centre line. */
  barrels: number[];
  barrelW: number;
  turretR: number;
  hull: RGB[];
  tread: RGB[];
  turret: RGB[];
  barrel: RGB;
  extras?: (p: Painter, g: { cx: number; cy: number; top: number; bodyH: number }) => void;
}

/** A top-down tank facing up: treads, slab hull, shaded turret, barrels, outline. */
function tankArt(l: TankLook): Rgba {
  const p = new Painter(l.w + 2, l.h + 2);
  const top = 1 + l.barrelLen;
  const bodyH = l.h - l.barrelLen;
  p.tread(1, top, l.treadW, bodyH, l.tread);
  p.tread(1 + l.w - l.treadW, top, l.treadW, bodyH, l.tread);
  p.slab(1 + l.treadW, top + 1, l.w - 2 * l.treadW, bodyH - 2, l.hull);
  const cx = 1 + l.w / 2 - 0.5;
  const cy = top + bodyH * 0.42;
  for (const bx of l.barrels) p.rect(Math.round(cx + bx - (l.barrelW - 1) / 2), 1, l.barrelW, Math.ceil(cy - 1), l.barrel);
  p.disc(cx, cy, l.turretR, l.turret);
  l.extras?.(p, { cx, cy, top, bodyH });
  p.outline();
  return p.toRgba();
}

export const TYPE1_TANK = (): Rgba =>
  tankArt({ w: 14, h: 18, treadW: 3, barrelLen: 4, barrels: [0], barrelW: 2, turretR: 3.4, hull: RUST, tread: SLATE_TREAD, turret: RUST, barrel: RUST[6] });

export const TYPE2_TANK = (): Rgba =>
  tankArt({ w: 16, h: 19, treadW: 4, barrelLen: 4, barrels: [-2, 2], barrelW: 1, turretR: 3.8, hull: BLUE, tread: GREY_TREAD, turret: BLUE, barrel: GREY_TREAD[4] });

export const TYPE5_TANK = (): Rgba =>
  tankArt({
    w: 28,
    h: 36,
    treadW: 7,
    barrelLen: 5,
    barrels: [-3, 3],
    barrelW: 2,
    turretR: 6,
    hull: STEEL,
    tread: GREY_TREAD,
    turret: STEEL,
    barrel: STEEL[6],
    extras: (p, { cx, cy }) => {
      // Missile racks either side of the turret, red warheads forward.
      for (const side of [-1, 1]) {
        const x = Math.round(cx + side * 9 - 1.5);
        p.slab(x, Math.round(cy + 2), 4, 9, PALE);
        p.rect(x, Math.round(cy + 1), 4, 1, RED[2]);
      }
    },
  });

/** Concrete pillbox: a cross of armoured arms around a red core, with 4 or 8 gun ports. */
export function torchikaArt(ports: 4 | 8): Rgba {
  const p = new Painter(30, 30);
  const c = 14.5;
  p.slab(3, 3, 24, 24, ports === 4 ? BUNKER : PALE.slice(0, 4));
  const arm = ports === 4 ? BLUE : PALE.slice(2);
  p.slab(3, 12, 24, 6, arm);
  p.slab(12, 3, 6, 24, arm);
  for (let i = 0; i < ports; i++) {
    const a = (i * 2 * Math.PI) / ports;
    const r = i % 2 && ports === 8 ? 8.5 : 10.5;
    p.rect(Math.round(c + Math.sin(a) * r - 1), Math.round(c - Math.cos(a) * r - 1), 2, 2, RED[1]);
  }
  p.disc(c, c, 4.6, RED);
  p.outline();
  return p.toRgba();
}

/** Three-barrelled fortress cannon (the stage-end gatekeeper), facing up. */
export function cannonArt(): Rgba {
  const p = new Painter(50, 54);
  p.slab(6, 34, 38, 18, JADE.slice(0, 6));
  for (const bx of [-9, 0, 9]) {
    p.rect(25 + bx - 2, 3, 4, 22, JADE[7]);
    p.rect(25 + bx - 2, 3, 1, 22, JADE[5]);
    p.rect(25 + bx + 1, 3, 1, 22, JADE[8]);
    p.rect(25 + bx - 2, 3, 4, 3, JADE[2]);
  }
  p.disc(25, 33, 17, JADE);
  p.disc(25, 33, 5, JADE.slice(2));
  p.outline();
  return p.toRgba();
}

const ORANGE: RGB[] = [[150, 50, 10], [230, 110, 20], [255, 170, 60], [255, 230, 150]];
const PINK: RGB[] = [[150, 40, 100], [220, 90, 170], [255, 150, 215], [255, 225, 240]];

/** Round enemy bullet, bright with a dark outline so it reads over any ground. */
export function bulletArt(kind: 'orange' | 'pink'): Rgba {
  const p = new Painter(7, 7);
  p.disc(3, 3, 2.2, kind === 'orange' ? ORANGE : PINK);
  p.outline();
  return p.toRgba();
}

export { missileArt } from './playerArt';

/** Scorched crater left by a destroyed tank (semi-transparent, drawn on the ground). */
export function craterArt(): Rgba {
  const size = 20;
  const p = new Painter(size, size);
  const c = size / 2;
  p.each(0, 0, size, size, (x, y, X, Y) => {
    const d = Math.hypot(x - c, y - c) / 8.5 + (hash2(X, Y, 41) - 0.5) * 0.25;
    if (d > 1) return;
    const rim = d > 0.72;
    // The raised rim catches the light from the lower right; the hollow sits in shade.
    const lit = rim ? 0.6 + ((x - c) + (y - c)) / 40 : 0.15 + d * 0.3;
    p.dot(X, Y, shade([[34, 28, 8], [50, 42, 12], [66, 56, 16], [110, 96, 40], [140, 124, 60]], lit), rim ? 230 : 200);
  });
  return p.toRgba();
}

const PINK_HULL: RGB[] = [[96, 52, 66], [128, 74, 88], [158, 98, 110], [186, 124, 134], [212, 152, 158], [236, 190, 192]];

export const TYPE3_TANK = (): Rgba =>
  tankArt({ w: 15, h: 19, treadW: 3, barrelLen: 5, barrels: [0], barrelW: 2, turretR: 3.6, hull: PINK_HULL, tread: SLATE_TREAD, turret: PINK_HULL, barrel: PALE[4] });

/** A tank left parked in the fields: long hull, turret turned aside, no crew. */
export const PARKING_TANK = (): Rgba =>
  tankArt({ w: 16, h: 22, treadW: 4, barrelLen: 2, barrels: [-3], barrelW: 2, turretR: 4, hull: JADE, tread: GREY_TREAD, turret: JADE.slice(2), barrel: RED[2] });

const UFO_WHITE: RGB[] = [[90, 110, 100], [130, 160, 146], [170, 200, 186], [205, 228, 216], [235, 248, 240]];
const UFO_GREEN: RGB[] = [[20, 70, 50], [30, 110, 70], [50, 150, 90], [90, 200, 130]];

/** UFO launcher: a white saucer pod with green fins and a glowing core, seen from above. */
export function ufoArt(): Rgba {
  const p = new Painter(22, 22);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const fin = (r: number, da: number): [number, number] => [10.5 + Math.cos(a + da) * r, 10.5 + Math.sin(a + da) * r];
    p.polygon([fin(4, -0.5), fin(10.5, -0.12), fin(10.5, 0.12), fin(4, 0.5)], () => UFO_GREEN[2]);
  }
  p.disc(10.5, 10.5, 6.5, UFO_WHITE);
  p.disc(10.5, 10.5, 2.6, UFO_GREEN);
  p.outline();
  return p.toRgba();
}

/** Thin laser bolt, flying up. */
export function laserArt(): Rgba {
  const p = new Painter(3, 12);
  p.each(0, 0, 3, 12, (x, y, X, Y) => {
    const core = Math.abs(x - 1.5);
    const fade = y > 9 ? (12 - y) / 3 : 1;
    if (core < 0.45) p.dot(X, Y, y < 2 ? [255, 255, 255] : [150, 255, 255], Math.round(255 * fade));
    else if (y > 1 && core < 1.4) p.dot(X, Y, [40, 160, 220], Math.round(170 * fade * (1.4 - core)));
  });
  return p.toRgba();
}

/** The pit a UFO launcher rises out of: sandy rim, black depths. */
export function holeArt(): Rgba {
  const size = 26;
  const c = size / 2;
  const p = new Painter(size, size);
  p.each(0, 0, size, size, (x, y, X, Y) => {
    const d = Math.hypot(x - c, y - c) / 12 + (hash2(X, Y, 51) - 0.5) * 0.12;
    if (d > 1) return;
    if (d > 0.72) p.dot(X, Y, shade([[70, 60, 12], [110, 96, 40], [150, 136, 80]], 0.4 + ((x - c) + (y - c)) / 30));
    else p.dot(X, Y, d > 0.55 ? [20, 16, 6] : [4, 4, 4]);
  });
  return p.toRgba();
}

const COPPER: RGB[] = [[92, 44, 30], [128, 64, 44], [160, 86, 60], [190, 110, 80], [214, 138, 104], [236, 170, 140], [250, 206, 182]];
const TAN: RGB[] = [[96, 74, 52], [130, 102, 74], [162, 132, 100], [192, 162, 128], [218, 190, 156], [240, 220, 190]];
const GOLD: RGB[] = [[100, 64, 8], [150, 100, 10], [196, 140, 20], [230, 180, 40], [250, 214, 90], [255, 240, 160]];
const TEAL: RGB[] = [[30, 60, 64], [50, 90, 96], [80, 130, 134], [120, 170, 170], [170, 210, 206], [220, 240, 236]];
const GEN_RED: RGB[] = [[90, 24, 24], [136, 40, 36], [176, 64, 56], [208, 92, 80], [232, 128, 112], [250, 170, 150]];
const GEN_BLACK: RGB[] = [[28, 28, 32], [44, 44, 50], [62, 62, 70], [84, 84, 92], [110, 110, 118], [140, 140, 148]];
const LAVENDER: RGB[] = [[60, 60, 110], [90, 90, 150], [120, 120, 190], [160, 160, 220], [200, 200, 245]];

/** Armoured Type 1: the light tank with bolted-on grey plates over its hull and treads. */
export const TYPE1A_TANK = (): Rgba =>
  tankArt({
    w: 14,
    h: 18,
    treadW: 3,
    barrelLen: 4,
    barrels: [0],
    barrelW: 2,
    turretR: 3.4,
    hull: RUST,
    tread: SLATE_TREAD,
    turret: RUST,
    barrel: PALE[5],
    extras: (p, { top, bodyH }) => {
      p.slab(2, top + bodyH - 6, 10, 4, PALE);
      p.rect(1, top + 2, 3, 2, PALE[4]);
      p.rect(11, top + 2, 3, 2, PALE[4]);
    },
  });

/** Type 4: an amphibious tank, pale tan, with flotation pods either side of the bow. */
export const TYPE4_TANK = (): Rgba =>
  tankArt({
    w: 18,
    h: 24,
    treadW: 4,
    barrelLen: 5,
    barrels: [0],
    barrelW: 2,
    turretR: 4.2,
    hull: TAN,
    tread: GREY_TREAD,
    turret: TAN.slice(1),
    barrel: TAN[5],
    extras: (p, { top }) => {
      for (const x of [1, 13]) p.slab(x, top - 1, 5, 9, TAN.slice(2));
    },
  });

/** Type 6: a broad copper heavy tank with a chevron glacis and a single long gun. */
export const TYPE6_TANK = (): Rgba =>
  tankArt({
    w: 28,
    h: 32,
    treadW: 6,
    barrelLen: 6,
    barrels: [0],
    barrelW: 3,
    turretR: 6,
    hull: COPPER,
    tread: GREY_TREAD,
    turret: COPPER.slice(1),
    barrel: PALE[4],
    extras: (p, { cx, top }) => {
      for (let i = 0; i < 4; i++) p.rect(Math.round(cx - 7 + i), top + 3 + i, 2, 1, COPPER[6]);
      for (let i = 0; i < 4; i++) p.rect(Math.round(cx + 6 - i), top + 3 + i, 2, 1, COPPER[6]);
    },
  });

/** Type 7-A: a long copper tank with missile racks along its flanks. */
export const TYPE7A_TANK = (): Rgba =>
  tankArt({
    w: 28,
    h: 38,
    treadW: 5,
    barrelLen: 5,
    barrels: [0],
    barrelW: 2,
    turretR: 5.5,
    hull: COPPER,
    tread: GREY_TREAD,
    turret: COPPER.slice(1),
    barrel: PALE[5],
    extras: (p, { cx, cy }) => {
      for (const side of [-1, 1]) {
        const x = Math.round(cx + side * 8 - 1.5);
        p.slab(x, Math.round(cy + 4), 4, 12, PALE);
        for (let i = 0; i < 3; i++) p.rect(x, Math.round(cy + 4 + i * 4), 4, 1, RED[2]);
      }
    },
  });

/** Type 7-B: the copper heavy with a turret of sixteen gun ports. */
export const TYPE7B_TANK = (): Rgba =>
  tankArt({
    w: 28,
    h: 38,
    treadW: 5,
    barrelLen: 3,
    barrels: [-4, 4],
    barrelW: 2,
    turretR: 8,
    hull: COPPER,
    tread: GREY_TREAD,
    turret: COPPER.slice(2),
    barrel: COPPER[5],
    extras: (p, { cx, cy }) => {
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        p.rect(Math.round(cx + Math.sin(a) * 7 - 0.5), Math.round(cy - Math.cos(a) * 7 - 0.5), 1, 1, ORANGE[2]);
      }
      p.disc(cx, cy, 3, LAVENDER);
    },
  });

/** 101 Scouter: a small, quick, gold half-track. */
export const SCOUTER = (): Rgba =>
  tankArt({ w: 14, h: 17, treadW: 3, barrelLen: 3, barrels: [0], barrelW: 2, turretR: 3, hull: GOLD, tread: SLATE_TREAD, turret: GOLD.slice(1), barrel: GOLD[5] });

/** 501 Fourlegs: a hovering drone, four legs splayed in an X with glowing orange feet. */
export function fourlegsArt(): Rgba {
  const p = new Painter(20, 20);
  const c = 9.5;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    for (let r = 2; r <= 7; r += 0.5) p.rect(Math.round(c + Math.cos(a) * r - 0.5), Math.round(c + Math.sin(a) * r - 0.5), 2, 2, TEAL[1 + (r > 5 ? 1 : 2)]);
    p.disc(c + Math.cos(a) * 8, c + Math.sin(a) * 8, 1.6, ORANGE);
  }
  p.slab(7, 5, 6, 10, TEAL.slice(2));
  p.disc(c, c - 1, 2.2, LAVENDER);
  p.outline();
  return p.toRgba();
}

/**
 * Generator: a huge three-armed flying fortress. Pods with portholes on each arm,
 * missile tubes, and the black centre hole a lucky nuke can drop straight into.
 */
export function generatorArt(black = false): Rgba {
  const body = black ? GEN_BLACK : GEN_RED;
  const pods = black ? ORANGE : LAVENDER;
  const size = 76;
  const c = (size - 1) / 2;
  const p = new Painter(size, size);
  const arm = (a: number) => {
    const at = (r: number, da = 0): [number, number] => [c + Math.sin(a + da) * r, c - Math.cos(a + da) * r];
    p.polygon([at(8, -1.1), at(31, -0.3), at(34, 0), at(31, 0.3), at(8, 1.1)], (x, y) =>
      shade(body, 0.45 + ((x - c) + (y - c)) / 90 + (hash2(x | 0, y | 0, 7) - 0.5) * 0.1),
    );
    const [px, py] = at(24);
    p.disc(px, py, 7, PALE);
    p.disc(px, py, 4.5, pods);
    for (let i = -1; i <= 1; i++) p.rect(Math.round(px - 3), Math.round(py + i * 1.6), 6, 1, pods[pods.length - 1]);
  };
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) arm(a);
  // Missile tubes between the arms.
  for (const a of [Math.PI / 3, Math.PI, (5 * Math.PI) / 3]) {
    const x = c + Math.sin(a) * 20;
    const y = c - Math.cos(a) * 20;
    p.disc(x, y, 4, GREY_TREAD.slice(1));
    p.disc(x, y, 2, RED);
  }
  p.disc(c, c, 13, body);
  p.disc(c, c, 9, GREY_TREAD.slice(0, 2));
  p.disc(c, c, 6.5, [[4, 10, 6], [8, 20, 12]]);
  p.outline();
  return p.toRgba();
}

/** Type 2 cannon: the fortress gun with four long barrels. */
export function cannon2Art(): Rgba {
  const p = new Painter(50, 56);
  p.slab(6, 36, 38, 18, JADE.slice(0, 6));
  for (const bx of [-10.5, -3.5, 3.5, 10.5]) {
    p.rect(25 + bx - 2, 2, 4, 26, JADE[7]);
    p.rect(25 + bx - 2, 2, 1, 26, JADE[5]);
    p.rect(25 + bx + 1, 2, 1, 26, JADE[8]);
    p.rect(25 + bx - 2, 2, 4, 3, JADE[2]);
  }
  p.disc(25, 35, 17, JADE);
  p.disc(25, 35, 5, JADE.slice(2));
  p.outline();
  return p.toRgba();
}

/** Type 3 cannon: an armoured head with ribbed flanks, glaring red eyes and three stubby guns. */
export function cannon3Art(): Rgba {
  const p = new Painter(52, 56);
  p.slab(5, 12, 42, 34, JADE.slice(0, 7));
  for (let y = 14; y < 44; y += 4) {
    p.rect(1, y, 5, 2, JADE[3]);
    p.rect(46, y, 5, 2, JADE[3]);
  }
  for (const bx of [-8, 0, 8]) {
    p.rect(26 + bx - 2, 1, 4, 14, PALE[3]);
    p.rect(26 + bx - 2, 1, 1, 14, PALE[1]);
  }
  p.slab(12, 18, 28, 8, JADE.slice(3));
  p.rect(16, 28, 6, 3, RED[2]);
  p.rect(30, 28, 6, 3, RED[2]);
  p.slab(18, 36, 16, 8, JADE.slice(1, 5));
  p.outline();
  return p.toRgba();
}
