import type { Spawn } from '../sim/enemies';

/**
 * Milestone 1 proving ground: a loop of corridors around a floating-void island,
 * with rough patches, bushes and boulders. Legend in sim/terrain.ts.
 */
export const TEST_MAP: readonly string[] = [
  '                                        ',
  '                                        ',
  '    ################################    ',
  '   ##################################   ',
  '   ##..b......,,,,,,......o.....b..##   ',
  '   ##......o..,,,,,,,,,.....b......##   ',
  '   ##.b.........,,,,,,.............##   ',
  '   ##........o..........b......o...##   ',
  '   ##........##############........##   ',
  '   ##...b....###        ###..o.....##   ',
  '   ##........###        ###........##   ',
  '   ##,,,.....###        ###......b.##   ',
  '   ##,,,,....###        ###........##   ',
  '   ##,,,,..o.###        ###.,,,,...##   ',
  '   ##,,,.....###        ###.,,,,,..##   ',
  '   ##........###        ###..,,,...##   ',
  '   ##..b.....###        ###........##   ',
  '   ##........###        ###....o...##   ',
  '   ##.....o..###        ###........##   ',
  '   ##........###        ###.b......##   ',
  '   ##........###        ###........##   ',
  '   ##...b....###        ###........##   ',
  '   ##........##############......o.##   ',
  '   ##......o......b................##   ',
  '   ##..............................##   ',
  '   ##.b........,,,,,,.........b....##   ',
  '   ##........,,,,,,,,,,............##   ',
  '   ##...o.......,,,,,,.......o.....##   ',
  '   ##..............P...............##   ',
  '   ##......b...............b.......##   ',
  '   ##################################   ',
  '    ################################    ',
  '                                        ',
  '                                        ',
];

/** Enemies around the loop, in tile coordinates. Facing is in degrees (0 = up). */
export const TEST_SPAWNS: readonly Spawn[] = [
  // Bottom right: a first group of light tanks.
  { kind: 'type1', tx: 31, ty: 24, facing: 270 },
  { kind: 'type1', tx: 33, ty: 25, facing: 270 },
  { kind: 'type1', tx: 32, ty: 27, facing: 270 },
  { kind: 'type1', tx: 34, ty: 23, facing: 270 },
  // Right corridor: a pillbox and a squad of twin-barrel tanks.
  { kind: 'torchika1', tx: 30, ty: 17 },
  { kind: 'type2', tx: 28, ty: 12 },
  { kind: 'type2', tx: 31, ty: 11 },
  { kind: 'type2', tx: 33, ty: 13 },
  // Top: an eight-way pillbox, more light tanks and a heavy missile tank.
  { kind: 'torchika2', tx: 21, ty: 5 },
  { kind: 'type1', tx: 26, ty: 5, facing: 90 },
  { kind: 'type1', tx: 24, ty: 6, facing: 90 },
  { kind: 'type1', tx: 16, ty: 6, facing: 90 },
  { kind: 'type1', tx: 14, ty: 5, facing: 90 },
  { kind: 'type5', tx: 9, ty: 6, facing: 90 },
  // Left corridor: two cannons guarding the way back to the start.
  { kind: 'cannon1', tx: 7, ty: 15 },
  { kind: 'cannon1', tx: 11, ty: 15 },
  { kind: 'type1', tx: 8, ty: 19 },
  { kind: 'type1', tx: 10, ty: 20 },
];
