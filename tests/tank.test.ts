import { describe, expect, it } from 'vitest';
import { createTank, fits, stepTank, TANK_TUNING, type Tank } from '../src/sim/tank';
import type { Maneuver } from '../src/input/maneuver';
import type { Terrain } from '../src/sim/terrain';

/** Open ground everywhere, with optional solid rectangles and a rough band. */
function terrain(walls: [number, number, number, number][] = [], roughBelowY = Infinity): Terrain {
  return {
    solidAt: (x, y) => walls.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1),
    speedAt: (_x, y) => (y >= roughBelowY ? 0.5 : 1),
  };
}

function run(t: Tank, m: Maneuver, seconds: number, ter = terrain()): Tank {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) stepTank(t, m, dt, ter);
  return t;
}

describe('driving', () => {
  it('moves forward along its heading (0 = up the screen)', () => {
    const t = run(createTank(100, 100), 'forward', 1);
    expect(t.x).toBeCloseTo(100);
    expect(t.y).toBeCloseTo(100 - TANK_TUNING.forwardSpeed, 0);
  });

  it('backs up more slowly than it drives forward', () => {
    const t = run(createTank(100, 100), 'back', 1);
    expect(t.y).toBeCloseTo(100 + TANK_TUNING.backSpeed, 0);
  });

  it('pivots in place when turning', () => {
    const t = run(createTank(100, 100), 'turnRight', 0.5);
    expect(t.x).toBe(100);
    expect(t.y).toBe(100);
    expect(t.heading).toBeCloseTo(TANK_TUNING.turnRate * 0.5, 1);
  });

  it('turns right clockwise: after a quarter turn, forward is +X', () => {
    const t = createTank(100, 100, Math.PI / 2);
    run(t, 'forward', 1);
    expect(t.x).toBeGreaterThan(140);
    expect(t.y).toBeCloseTo(100);
  });

  it('keeps heading within [0, 2π)', () => {
    const t = run(createTank(0, 0), 'turnLeft', 0.2);
    expect(t.heading).toBeGreaterThanOrEqual(0);
    expect(t.heading).toBeLessThan(2 * Math.PI);
  });

  it('slows down on rough ground', () => {
    const t = run(createTank(100, 100), 'back', 1, terrain([], 0));
    expect(t.y).toBeCloseTo(100 + TANK_TUNING.backSpeed * 0.5, 0);
  });

  it('stops at walls and slides along them', () => {
    // Wall above the tank; heading up-right should slide right along it.
    const wall = terrain([[0, 0, 400, 90]]);
    const t = createTank(100, 100, Math.PI / 4);
    run(t, 'forward', 1, wall);
    expect(t.y).toBeGreaterThanOrEqual(90 + TANK_TUNING.radius - 1);
    expect(t.x).toBeGreaterThan(120);
  });
});

describe('roll', () => {
  it('flips sideways in the lever direction for a fixed time', () => {
    const t = createTank(100, 100);
    stepTank(t, 'rollRight', 1 / 60, terrain());
    expect(t.mode).toBe('roll');
    run(t, 'idle', TANK_TUNING.rollDuration + 2 / 60);
    expect(t.mode).toBe('drive');
    expect(t.x).toBeCloseTo(100 + TANK_TUNING.rollSpeed * TANK_TUNING.rollDuration, -1);
    expect(t.y).toBeCloseTo(100);
  });

  it('rolls left relative to the tank, not the screen', () => {
    const t = createTank(100, 100, Math.PI / 2); // facing +X, so left is -Y
    run(t, 'rollLeft', TANK_TUNING.rollDuration);
    expect(t.y).toBeLessThan(80);
  });

  it('squeezes through a gap too narrow to drive through upright', () => {
    // Vertical slot 10px wide: wider than the roll radius, narrower than upright.
    const slot = terrain([
      [150, 0, 200, 95],
      [150, 105, 200, 400],
    ]);
    expect(fits(slot, 175, 100, TANK_TUNING.radius)).toBe(false);
    const t = createTank(130, 100); // facing up; rolling right heads into the slot
    run(t, 'rollRight', 2, slot);
    expect(t.x).toBeGreaterThan(200);
  });
});

describe('wheelie', () => {
  it('stops the tank and rears it up while held', () => {
    const t = createTank(100, 100);
    run(t, 'wheelie', 0.5);
    expect(t.mode).toBe('wheelie');
    expect(t.lift).toBe(1);
    expect(t.x).toBe(100);
    expect(t.y).toBe(100);
  });

  it('drops back down on release before it can drive again', () => {
    const t = run(createTank(100, 100), 'wheelie', 0.5);
    stepTank(t, 'forward', 1 / 60, terrain());
    expect(t.mode).toBe('drive');
    expect(t.lift).toBeGreaterThan(0);
    expect(t.y).toBe(100);
    run(t, 'forward', 0.5);
    expect(t.lift).toBe(0);
    expect(t.y).toBeLessThan(100);
  });
});
