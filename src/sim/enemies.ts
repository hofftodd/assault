/**
 * Enemy roster. Hits and points are from the StrategyWiki Gameplay page; movement
 * and fire-rate numbers are estimates to tune against the original.
 */
export type EnemyKind = 'type1' | 'type2' | 'type5' | 'torchika1' | 'torchika2' | 'cannon1';

export type ProjectileKind = 'orange' | 'pink' | 'missile';

export interface ProjectileSpec {
  speed: number;
  radius: number;
  life: number;
  /** Can the player's cannon shoot it down? */
  shootable: boolean;
  /** Steering towards the player, rad/s (0 = flies straight). */
  homing: number;
}

export const PROJECTILES: Record<ProjectileKind, ProjectileSpec> = {
  orange: { speed: 85, radius: 2, life: 3.5, shootable: false, homing: 0 },
  pink: { speed: 105, radius: 2, life: 3.5, shootable: false, homing: 0 },
  missile: { speed: 62, radius: 2, life: 4, shootable: true, homing: 1.3 },
};

export type FirePattern =
  /** Shots aimed at the player, `count` side by side `spacing` px apart. */
  | { kind: 'aimed'; projectile: ProjectileKind; count: number; spacing: number }
  /** A ring of `count` shots fired in all directions. */
  | { kind: 'radial'; projectile: ProjectileKind; count: number };

export interface EnemySpec {
  /** Hits to destroy: [normal stages, stages 6 and later]. */
  hits: [number, number];
  points: number;
  /** Collision radius (px). */
  radius: number;
  /** Driving speed (px/s); 0 for emplacements. */
  speed: number;
  /** rad/s, for the hull (tanks) or turret (cannons). */
  turnRate: number;
  /** Tanks close in to about this distance before stopping. */
  preferredRange: number;
  fire: FirePattern;
  /** Seconds between volleys (randomised ±30%). */
  fireInterval: number;
  /** Only fires when the player is this close. */
  fireRange: number;
  /** Wakes up when the player comes this close. */
  wakeRadius: number;
  /** Destroyed vehicles leave a crater that slows the player. */
  leavesCrater: boolean;
  /** Draw with the big explosion. */
  large: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemySpec> = {
  type1: {
    hits: [1, 1],
    points: 100,
    radius: 7,
    speed: 30,
    turnRate: 2.2,
    preferredRange: 70,
    fire: { kind: 'aimed', projectile: 'orange', count: 1, spacing: 0 },
    fireInterval: 2.2,
    fireRange: 170,
    wakeRadius: 170,
    leavesCrater: true,
    large: false,
  },
  type2: {
    hits: [1, 4],
    points: 200,
    radius: 8,
    speed: 36,
    turnRate: 2.4,
    preferredRange: 80,
    fire: { kind: 'aimed', projectile: 'orange', count: 2, spacing: 5 },
    fireInterval: 2.0,
    fireRange: 180,
    wakeRadius: 170,
    leavesCrater: true,
    large: false,
  },
  type5: {
    hits: [8, 30],
    points: 800,
    radius: 14,
    speed: 18,
    turnRate: 1.1,
    preferredRange: 110,
    fire: { kind: 'aimed', projectile: 'missile', count: 2, spacing: 14 },
    fireInterval: 3.0,
    fireRange: 200,
    wakeRadius: 190,
    leavesCrater: true,
    large: true,
  },
  torchika1: {
    hits: [1, 1],
    points: 200,
    radius: 12,
    speed: 0,
    turnRate: 0,
    preferredRange: 0,
    fire: { kind: 'radial', projectile: 'orange', count: 4 },
    fireInterval: 2.4,
    fireRange: 160,
    wakeRadius: 170,
    leavesCrater: false,
    large: false,
  },
  torchika2: {
    hits: [1, 1],
    points: 200,
    radius: 12,
    speed: 0,
    turnRate: 0,
    preferredRange: 0,
    fire: { kind: 'radial', projectile: 'orange', count: 8 },
    fireInterval: 2.8,
    fireRange: 160,
    wakeRadius: 170,
    leavesCrater: false,
    large: false,
  },
  cannon1: {
    hits: [10, 10],
    points: 1200,
    radius: 21,
    speed: 0,
    turnRate: 0.9,
    preferredRange: 0,
    fire: { kind: 'aimed', projectile: 'pink', count: 3, spacing: 7 },
    fireInterval: 1.8,
    fireRange: 210,
    wakeRadius: 210,
    leavesCrater: false,
    large: true,
  },
};

export type EnemyState = 'dormant' | 'active' | 'dead';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  /** Hull heading for tanks, turret heading for cannons (0 = up, clockwise). */
  heading: number;
  hp: number;
  state: EnemyState;
  fireTimer: number;
  /** Sideways offset (px) this tank aims to approach from, so groups fan out. */
  flank: number;
  /** Seconds left of the white damage flash. */
  flash: number;
}

export interface EnemyProjectile {
  kind: ProjectileKind;
  x: number;
  y: number;
  heading: number;
  life: number;
}

/** A spawn point in tile coordinates. */
export interface Spawn {
  kind: EnemyKind;
  tx: number;
  ty: number;
  /** Initial heading in degrees (0 = up). */
  facing?: number;
}

/** Heading (0 = up, clockwise) pointing from (x0, y0) towards (x1, y1). */
export function headingTo(x0: number, y0: number, x1: number, y1: number): number {
  return Math.atan2(x1 - x0, -(y1 - y0));
}

/** Signed smallest difference b - a, in (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}
