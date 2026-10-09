import { hash2 } from '../sim/noise';
import { Painter, shade } from './painter';
import type { RGB } from './palette';
import { rasterize, type PixelArt, type Rgba } from './pixelSprite';

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

export const MISSILE: PixelArt = {
  palette: { k: 0x18181f, W: 0xe8e8e8, g: 0x9a9aa8, G: 0x5a5a66, r: 0xe02020, y: 0xffe060, o: 0xff9020 },
  rows: ['.r.', 'rWr', 'WgW', 'WgW', 'kGk', '.y.', '.o.'],
};

export const missileArt = (): Rgba => rasterize(MISSILE);

/** Scorched crater left by a destroyed tank (semi-transparent, drawn on the ground). */
export function craterArt(): Rgba {
  const size = 20;
  const p = new Painter(size, size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / 8.5 + (hash2(x, y, 41) - 0.5) * 0.25;
      if (d > 1) continue;
      const rim = d > 0.72;
      // The raised rim catches the light from the lower right; the hollow sits in shade.
      const lit = rim ? 0.6 + ((x - c) + (y - c)) / 40 : 0.15 + d * 0.3;
      p.px(x, y, shade([[34, 28, 8], [50, 42, 12], [66, 56, 16], [110, 96, 40], [140, 124, 60]], lit), rim ? 230 : 200);
    }
  }
  return p.toRgba();
}

const PINK_HULL: RGB[] = [[96, 52, 66], [128, 74, 88], [158, 98, 110], [186, 124, 134], [212, 152, 158], [236, 190, 192]];

export const TYPE3_TANK = (): Rgba =>
  tankArt({ w: 15, h: 19, treadW: 3, barrelLen: 5, barrels: [0], barrelW: 2, turretR: 3.6, hull: PINK_HULL, tread: SLATE_TREAD, turret: PINK_HULL, barrel: PALE[4] });

/** A tank left parked in the fields: long hull, turret turned aside, no crew. */
export const PARKING_TANK = (): Rgba =>
  tankArt({ w: 16, h: 22, treadW: 4, barrelLen: 2, barrels: [-3], barrelW: 2, turretR: 4, hull: RUST, tread: GREY_TREAD, turret: RUST.slice(1), barrel: RUST[5] });

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
  for (let y = 0; y < 12; y++) {
    p.px(1, y, y < 2 ? [255, 255, 255] : [140, 255, 255]);
    if (y > 1 && y < 10) {
      p.px(0, y, [40, 160, 220], 180);
      p.px(2, y, [40, 160, 220], 180);
    }
  }
  return p.toRgba();
}

/** The pit a UFO launcher rises out of: sandy rim, black depths. */
export function holeArt(): Rgba {
  const size = 26;
  const c = (size - 1) / 2;
  const p = new Painter(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / 12 + (hash2(x, y, 51) - 0.5) * 0.12;
      if (d > 1) continue;
      if (d > 0.72) p.px(x, y, shade([[70, 60, 12], [110, 96, 40], [150, 136, 80]], 0.4 + ((x - c) + (y - c)) / 30));
      else p.px(x, y, d > 0.55 ? [20, 16, 6] : [4, 4, 4]);
    }
  }
  return p.toRgba();
}
