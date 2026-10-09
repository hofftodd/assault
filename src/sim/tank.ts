import { drive, steering, type Maneuver } from '../input/maneuver';
import type { Terrain } from './terrain';

export type TankMode = 'drive' | 'roll' | 'wheelie';

export const TANK_TUNING = {
  /** px/s */
  forwardSpeed: 44,
  backSpeed: 30,
  /** rad/s, for pivot turns */
  turnRate: (135 * Math.PI) / 180,
  /** lateral px/s while flipping over */
  rollSpeed: 70,
  /** seconds per flip */
  rollDuration: 0.45,
  /** collision radius while upright, and while flipped on its side */
  radius: 7,
  rollRadius: 4,
  /** seconds to rear up into a wheelie (and to drop back down) */
  wheelieRiseTime: 0.15,
};

export interface Tank {
  x: number;
  y: number;
  /** Radians clockwise from "up" (world -Y). */
  heading: number;
  mode: TankMode;
  /** Seconds spent in the current mode. */
  modeTime: number;
  /** -1 = rolling left, 1 = rolling right. */
  rollDir: -1 | 1;
  /** 0 = flat on the ground, 1 = fully reared up. */
  lift: number;
}

export function createTank(x: number, y: number, heading = 0): Tank {
  return { x, y, heading, mode: 'drive', modeTime: 0, rollDir: 1, lift: 0 };
}

export function forwardVector(heading: number): { x: number; y: number } {
  return { x: Math.sin(heading), y: -Math.cos(heading) };
}

export function rightVector(heading: number): { x: number; y: number } {
  return { x: Math.cos(heading), y: Math.sin(heading) };
}

/** Progress through the current flip, 0..1. */
export function rollProgress(t: Tank): number {
  return t.mode === 'roll' ? Math.min(1, t.modeTime / TANK_TUNING.rollDuration) : 0;
}

export function fits(terrain: Terrain, x: number, y: number, r: number): boolean {
  if (terrain.solidAt(x, y)) return false;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    if (terrain.solidAt(x + Math.cos(a) * r, y + Math.sin(a) * r)) return false;
  }
  return true;
}

/** Move by (dx, dy), sliding along walls when the full move is blocked. */
function moveBy(t: Tank, terrain: Terrain, dx: number, dy: number, r: number): void {
  if (fits(terrain, t.x + dx, t.y + dy, r)) {
    t.x += dx;
    t.y += dy;
    return;
  }
  if (dx && fits(terrain, t.x + dx, t.y, r)) t.x += dx;
  else if (dy && fits(terrain, t.x, t.y + dy, r)) t.y += dy;
}

function setMode(t: Tank, mode: TankMode): void {
  t.mode = mode;
  t.modeTime = 0;
}

export function stepTank(t: Tank, maneuver: Maneuver, dt: number, terrain: Terrain): void {
  const T = TANK_TUNING;
  t.modeTime += dt;

  if (t.mode === 'roll' && t.modeTime >= T.rollDuration) setMode(t, 'drive');
  if (t.mode === 'wheelie' && maneuver !== 'wheelie') setMode(t, 'drive');

  if (t.mode === 'drive' && t.lift === 0) {
    if (maneuver === 'rollLeft' || maneuver === 'rollRight') {
      setMode(t, 'roll');
      t.rollDir = maneuver === 'rollLeft' ? -1 : 1;
    } else if (maneuver === 'wheelie') {
      setMode(t, 'wheelie');
    }
  }

  const liftRate = dt / T.wheelieRiseTime;
  t.lift = t.mode === 'wheelie' ? Math.min(1, t.lift + liftRate) : Math.max(0, t.lift - liftRate);

  // After squeezing through a gap on its side, the tank may not fit upright yet;
  // keep using the narrow radius until it does, so it can never get wedged.
  const upright = fits(terrain, t.x, t.y, T.radius);
  const r = t.mode === 'roll' || !upright ? T.rollRadius : T.radius;
  const speed = terrain.speedAt(t.x, t.y);

  if (t.mode === 'roll') {
    const v = rightVector(t.heading);
    const d = T.rollSpeed * speed * dt * t.rollDir;
    moveBy(t, terrain, v.x * d, v.y * d, r);
    return;
  }
  if (t.mode === 'wheelie' || t.lift > 0) return;

  t.heading += steering(maneuver) * T.turnRate * dt;
  const go = drive(maneuver);
  if (go !== 0) {
    const v = forwardVector(t.heading);
    const d = (go > 0 ? T.forwardSpeed : -T.backSpeed) * speed * dt;
    moveBy(t, terrain, v.x * d, v.y * d, r);
  }
  t.heading = ((t.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}
