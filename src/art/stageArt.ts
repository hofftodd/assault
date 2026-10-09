import { Painter, shade } from './painter';
import type { RGB } from './palette';
import type { Rgba } from './pixelSprite';

const STEEL: RGB[] = [[50, 52, 70], [70, 72, 96], [88, 92, 120], [108, 112, 140], [130, 136, 166], [160, 166, 196]];
const RED: RGB[] = [[90, 10, 20], [140, 20, 30], [190, 30, 40], [230, 60, 60], [255, 120, 110]];
const DARK: RGB[] = [[18, 18, 24], [28, 28, 36], [38, 38, 48], [50, 50, 62]];

function pentagon(cx: number, cy: number, r: number): [number, number][] {
  return Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

/**
 * Jump zone: a riveted steel pentagon with red arrow markers and a red core.
 * `spent` draws the used-up version, dark with a black core.
 */
export function jumpZoneArt(spent: boolean): Rgba {
  const size = 52;
  const c = (size - 1) / 2;
  const p = new Painter(size, size);
  const plate = spent ? DARK : STEEL;
  const core = spent ? DARK : RED;
  p.polygon(pentagon(c, c + 1, 24), (x, y) => {
    const lit = 0.5 + ((x - c) + (y - c)) / 80 + (((x * 7 + y * 13) % 5) - 2) * 0.02;
    return shade(plate, lit);
  });
  // Ring of plating seams.
  p.polygon(pentagon(c, c + 1, 16), (x, y) => shade(plate, 0.3 + ((x - c) + (y - c)) / 70));
  p.polygon(pentagon(c, c + 1, 14), (x, y) => shade(plate, 0.6 + ((x - c) + (y - c)) / 70));
  // Core and five arrow markers pointing inwards.
  p.polygon(pentagon(c, c + 1, 8), (x, y) => shade(core, 0.55 + ((x - c) + (y - c)) / 30));
  p.polygon(pentagon(c, c + 1, 4), () => (spent ? [6, 6, 8] : RED[0]));
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const tip = 17, base = 21, half = 0.16;
    const pt = (r: number, da: number): [number, number] => [c + Math.cos(a + da) * r, c + 1 + Math.sin(a + da) * r];
    p.polygon([pt(tip, 0), pt(base, half), pt(base, -half)], () => (spent ? DARK[3] : RED[3]));
  }
  p.outline();
  return p.toRgba();
}

/** Exit hatch: a steel frame with blue corner brackets around a closed iris. */
export function hatchArt(): Rgba {
  const size = 44;
  const p = new Painter(size, size);
  p.slab(1, 1, size - 2, size - 2, STEEL);
  const blue: RGB = [60, 110, 230];
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    const x0 = sx > 0 ? 4 : size - 5;
    const y0 = sy > 0 ? 4 : size - 5;
    for (let i = 0; i < 8; i++) {
      p.px(x0 + sx * i, y0, blue);
      p.px(x0, y0 + sy * i, blue);
      p.px(x0 + sx * i, y0 + sy, blue);
      p.px(x0 + sx, y0 + sy * i, blue);
    }
  }
  // Iris: shaded disc split into blades.
  const o = size / 2;
  p.each(0, 0, size, size, (x, y, X, Y) => {
    const d = Math.hypot(x - o, y - o);
    if (d > 14) return;
    if (d > 12.5) {
      p.dot(X, Y, STEEL[0]);
      return;
    }
    const blade = Math.floor(((Math.atan2(y - o, x - o) + Math.PI) / (2 * Math.PI)) * 8 + d / 6) % 2;
    p.dot(X, Y, shade(STEEL, 0.25 + blade * 0.3 + (x - o + y - o) / 60));
  });
  return p.toRgba();
}

/** Guide arrow badge (pointing up): yellow arrow on a dark disc with a light rim. */
export function guideArrowArt(): Rgba {
  const size = 17;
  const c = (size - 1) / 2;
  // Drawn on the HUD, which stays at the original resolution.
  const p = new Painter(size, size, 1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= 8) p.px(x, y, d > 7 ? [170, 170, 190] : [30, 30, 42]);
    }
  }
  const yellow: RGB = [255, 200, 40];
  const hi: RGB = [255, 240, 140];
  p.polygon(
    [
      [c, 2.5],
      [c + 5, 8],
      [c + 2, 8],
      [c + 2, 13],
      [c - 2, 13],
      [c - 2, 8],
      [c - 5, 8],
    ],
    (x) => (x < c ? hi : yellow),
  );
  return p.toRgba();
}
