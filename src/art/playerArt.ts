import { Painter, shade } from './painter';
import type { RGB } from './palette';
import type { Rgba } from './pixelSprite';

// Ramps, dark to light.
const CREAM: RGB[] = [[96, 90, 70], [140, 134, 108], [178, 172, 144], [205, 200, 172], [226, 222, 194], [242, 240, 218]];
const TREAD_BLUE: RGB[] = [[36, 38, 62], [58, 62, 98], [84, 92, 146], [118, 128, 186]];
const PLATE: RGB[] = [[34, 34, 40], [52, 52, 60], [72, 72, 82], [96, 96, 108]];
const GUN: RGB[] = [[70, 70, 82], [120, 120, 134], [186, 186, 198], [236, 236, 244]];
const GLASS: RGB[] = [[30, 90, 120], [60, 160, 200], [130, 220, 245], [210, 248, 255]];

/** Light from the lower right: brighter towards +x, +y within a box. */
const lit = (x: number, y: number, x0: number, y0: number, w: number, h: number) => ((x - x0) / w + (y - y0) / h) / 2;

/**
 * The player's tank, facing up, 22x24 logical px: one long central cannon, a
 * cream hull with a glass canopy, blue tread pods with cream caps, and a rounded
 * three-lobed rear, after the original. `belly` draws its underside, seen mid-roll.
 */
export function playerTankArt(belly = false): Rgba {
  const p = new Painter(22, 24);
  const hull = belly ? PLATE : CREAM;

  // Tread pods with cream end caps.
  for (const x0 of [1, 16]) {
    p.tread(x0, 6.5, 5, 14.5, TREAD_BLUE);
    for (const [cy, top] of [[5.2, true], [21.6, false]] as const) {
      p.each(x0, cy - 1.6, x0 + 5, cy + 1.6, (x, y, X, Y) => {
        const nx = (x - x0 - 2.5) / 2.5;
        const ny = (y - cy) / 1.6;
        if (nx * nx + ny * ny > 1.05) return;
        p.dot(X, Y, shade(CREAM, 0.35 + nx * 0.25 + ny * 0.25 + (top ? 0.15 : 0)));
      });
    }
  }

  // Hull: a tapered cream body between the pods, with a rounded rear lobe.
  const body: [number, number][] = [
    [7, 7.5],
    [15, 7.5],
    [16.5, 11],
    [16.5, 19],
    [14.5, 22],
    [7.5, 22],
    [5.5, 19],
    [5.5, 11],
  ];
  p.polygon(body, (x, y) => shade(hull, 0.3 + lit(x, y, 5.5, 7.5, 11, 14.5) * 0.65));
  p.each(8, 20, 14, 24, (x, y, X, Y) => {
    if (Math.hypot(x - 11, y - 21.4) < 2.4) p.dot(X, Y, shade(hull, 0.45 + (x - 11 + y - 21.4) * 0.08));
  });

  if (belly) {
    // Underside: cross-braced armour plating.
    p.each(6, 9, 16, 21, (x, y, X, Y) => {
      const brace = Math.abs(((x - 6) - (y - 9)) % 4) < 0.6 || Math.abs(((x - 6) + (y - 9)) % 4) < 0.6;
      if (brace) p.dot(X, Y, PLATE[3]);
    });
  } else {
    // Canopy, gun mount, warning light, engine vent and panel lines.
    p.polygon(
      [
        [8, 9],
        [14, 9],
        [13.5, 12],
        [8.5, 12],
      ],
      (x, y) => shade(GLASS, 0.2 + lit(x, y, 8, 9, 6, 3) * 0.9),
    );
    p.slab(9.5, 6, 3, 4, CREAM.slice(1));
    p.disc(10.5, 13, 0.9, [[150, 20, 20], [220, 40, 40], [255, 120, 110]]);
    p.slab(8.5, 15.5, 5, 2.5, PLATE);
    p.rect(6, 14, 0.5, 5, CREAM[1]);
    p.rect(15.5, 14, 0.5, 5, CREAM[1]);
  }

  // The long central cannon, with a bright muzzle.
  p.each(10, 0, 12, 7, (x, y, X, Y) => {
    const t = (x - 10) / 2;
    p.dot(X, Y, y < 1 ? GUN[3] : shade(GUN, 0.2 + t * 0.75));
  });

  p.outline();
  return p.toRgba();
}

const GLOW_YELLOW: RGB[] = [[200, 110, 20], [255, 170, 40], [255, 225, 110], [255, 255, 230]];

/** Regular cannon shot, flying up: a hot core with a fading tail (3x6 logical). */
export function shotArt(): Rgba {
  const p = new Painter(3, 6);
  p.each(0, 0, 3, 6, (x, y, X, Y) => {
    const d = Math.abs(x - 1.5);
    const head = Math.hypot(x - 1.5, y - 1.6) < 1.3;
    if (head) p.dot(X, Y, shade(GLOW_YELLOW, 1 - Math.hypot(x - 1.5, y - 1.6) / 1.4));
    else if (y > 2 && d < 0.8 - (y - 2) * 0.12) p.dot(X, Y, y < 4 ? [255, 150, 40] : [210, 60, 20], Math.round(255 * (1 - (y - 2) / 4)));
  });
  return p.toRgba();
}

/** Artillery shell lobbed from a wheelie, flying up (5x10 logical). */
export function nukeShellArt(): Rgba {
  const p = new Painter(5, 10);
  p.polygon(
    [
      [2.5, 0],
      [4, 2],
      [4, 7],
      [1, 7],
      [1, 2],
    ],
    (x) => shade(CREAM, 0.25 + (x - 1) / 3.5),
  );
  p.rect(1, 4.5, 3, 1, [200, 40, 40]);
  p.polygon(
    [
      [0.2, 5.5],
      [1, 5],
      [1, 7.5],
      [0.2, 8],
    ],
    () => GUN[1],
  );
  p.polygon(
    [
      [4.8, 5.5],
      [4, 5],
      [4, 7.5],
      [4.8, 8],
    ],
    () => GUN[2],
  );
  p.outline();
  // Exhaust flame below the outline.
  p.each(1.5, 7.6, 3.5, 10, (x, y, X, Y) => {
    if (Math.abs(x - 2.5) < 1 - (y - 7.6) * 0.35) p.dot(X, Y, y < 8.6 ? [255, 230, 120] : [255, 130, 30]);
  });
  return p.toRgba();
}

/** Homing missile, flying up (3x7 logical). */
export function missileArt(): Rgba {
  const p = new Painter(3, 7);
  p.polygon(
    [
      [1.5, 0],
      [2.6, 1.5],
      [2.6, 5],
      [0.4, 5],
      [0.4, 1.5],
    ],
    (x, y) => (y < 1.4 ? [220, 40, 40] : shade(CREAM, 0.3 + (x - 0.4) / 3)),
  );
  p.outline();
  p.each(0.8, 5.2, 2.2, 7, (x, y, X, Y) => {
    if (Math.abs(x - 1.5) < 0.7 - (y - 5.2) * 0.3) p.dot(X, Y, y < 6 ? [255, 230, 120] : [255, 130, 30]);
  });
  return p.toRgba();
}
