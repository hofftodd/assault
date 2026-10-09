import { describe, expect, it } from 'vitest';
import { createTank, stepTank, type Tank } from '../src/sim/tank';
import { blastHits, nukePosition, Weapons, WEAPON_TUNING as W, type Blast, type FireInput } from '../src/sim/weapons';
import type { Terrain } from '../src/sim/terrain';

const DT = 1 / 60;
const open: Terrain & { blocksShotsAt(x: number, y: number): boolean } = {
  solidAt: () => false,
  speedAt: () => 1,
  blocksShotsAt: () => false,
};
const press: FireInput = { held: true, presses: 1 };
const idle: FireInput = { held: false, presses: 0 };

/** Step the weapons for `seconds` with no fire input, collecting blasts. */
function advance(w: Weapons, tank: Tank, seconds: number, terrain = open, raised = false): Blast[] {
  const out: Blast[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) out.push(...w.step(DT, tank, idle, terrain, raised));
  return out;
}

function wheelie(): Tank {
  const t = createTank(100, 300);
  for (let i = 0; i < 30; i++) stepTank(t, 'wheelie', DT, open);
  return t;
}

describe('regular shots', () => {
  it('fires forward from alternating barrels', () => {
    const w = new Weapons();
    const t = createTank(100, 300);
    w.step(DT, t, press, open);
    w.step(DT, t, press, open);
    const [a, b] = w.shots;
    expect(a.vy).toBeCloseTo(-W.shotSpeed);
    expect(a.vx).toBeCloseTo(0);
    expect(a.x).not.toBeCloseTo(b.x);
    expect(a.y).toBeLessThan(300);
  });

  it('allows at most three shots on screen', () => {
    const w = new Weapons();
    const t = createTank(100, 300);
    for (let i = 0; i < 6; i++) w.step(DT, t, press, open);
    expect(w.shots.length).toBe(W.maxShots);
  });

  it('handles several taps arriving in the same tick, one shot per tick', () => {
    const w = new Weapons();
    const t = createTank(100, 300);
    w.step(DT, t, { held: false, presses: 5 }, open);
    expect(w.shots.length).toBe(1);
    advance(w, t, 5 * DT);
    expect(w.shots.length).toBe(W.maxShots);
    advance(w, t, W.shotLife + 0.1);
    expect(w.shots.length).toBe(0);
  });

  it('can fire again once a shot expires', () => {
    const w = new Weapons();
    const t = createTank(100, 300);
    for (let i = 0; i < 3; i++) w.step(DT, t, press, open);
    advance(w, t, W.shotLife + 0.1);
    expect(w.shots.length).toBe(0);
    w.step(DT, t, press, open);
    expect(w.shots.length).toBe(1);
  });

  it('auto-repeats while fire is held', () => {
    const w = new Weapons();
    const t = createTank(100, 300);
    let fired = 0;
    for (let i = 0; i < Math.round(1 / DT); i++) {
      const before = w.shots.length;
      w.step(DT, t, { held: true, presses: i === 0 ? 1 : 0 }, open);
      if (w.shots.length > before) fired++;
    }
    expect(fired).toBeGreaterThanOrEqual(4);
  });

  it('is stopped by cliffs, leaving a small impact', () => {
    const wall = { ...open, blocksShotsAt: (_x: number, y: number) => y < 250 };
    const w = new Weapons();
    const t = createTank(100, 300);
    w.step(DT, t, press, wall);
    const blasts = advance(w, t, 0.5, wall);
    expect(w.shots.length).toBe(0);
    expect(blasts).toHaveLength(1);
    expect(blasts[0].kind).toBe('shot');
    expect(blasts[0].y).toBeLessThan(250);
  });

  it('can be fired mid-roll', () => {
    const w = new Weapons();
    const t = createTank(100, 300);
    stepTank(t, 'rollLeft', DT, open);
    expect(t.mode).toBe('roll');
    w.step(DT, t, press, open);
    expect(w.shots.length).toBe(1);
  });
});

describe('nukes', () => {
  it('fire only from a full wheelie, instead of regular shots', () => {
    const w = new Weapons();
    const t = wheelie();
    w.step(DT, t, press, open);
    expect(w.nukes.length).toBe(1);
    expect(w.shots.length).toBe(0);
  });

  it('show a crosshair that slides out from close range, reaching max range (red) after the aim time', () => {
    const w = new Weapons();
    const t = wheelie();
    w.step(DT, t, idle, open);
    expect(w.aiming).toBe(true);
    expect(w.aim).toBeCloseTo(W.nukeMinRange);
    advance(w, t, W.nukeAimTime / 2);
    expect(w.aim).toBeGreaterThan(W.nukeMinRange + 20);
    expect(w.aim).toBeLessThan(W.nukeRange - 20);
    expect(w.aimAtMax).toBe(false);
    advance(w, t, W.nukeAimTime / 2 + 0.05);
    expect(w.aim).toBe(W.nukeRange);
    expect(w.aimAtMax).toBe(true);
    advance(w, t, 1);
    expect(w.aim).toBe(W.nukeRange);
  });

  it('hide the crosshair outside a wheelie', () => {
    const w = new Weapons();
    w.step(DT, createTank(100, 300), idle, open);
    expect(w.aiming).toBe(false);
  });

  it('land where the crosshair was: fire early for a short lob', () => {
    const w = new Weapons();
    const t = wheelie();
    w.step(DT, t, idle, open);
    w.step(DT, t, press, open);
    const blasts = advance(w, t, W.nukeFlightTime + 0.05);
    expect(blasts).toHaveLength(1);
    expect(300 - blasts[0].y).toBeLessThan(W.nukeMinRange + 5);
  });

  it('lob to full range in a high arc once the crosshair is maxed out', () => {
    const w = new Weapons();
    const t = wheelie();
    advance(w, t, W.nukeAimTime + 0.1);
    w.step(DT, t, press, open);
    const mid = nukePosition({ ...w.nukes[0], t: w.nukes[0].duration / 2 });
    expect(mid.height).toBeCloseTo(W.nukeApex);
    expect(w.nukes[0].duration).toBeCloseTo(W.nukeFlightTime);
    const blasts = advance(w, t, W.nukeFlightTime + 0.05);
    expect(blasts).toEqual([{ kind: 'nuke', x: expect.closeTo(100), y: expect.closeTo(300 - W.nukeRange), radius: W.nukeBlastRadius }]);
  });

  it('snap the crosshair back in after firing', () => {
    const w = new Weapons();
    const t = wheelie();
    advance(w, t, W.nukeAimTime + 0.1);
    w.step(DT, t, press, open);
    expect(w.aim).toBe(W.nukeMinRange);
  });

  it('fly over cliffs', () => {
    const cliffs = { ...open, blocksShotsAt: () => true };
    const w = new Weapons();
    const t = wheelie();
    w.step(DT, t, press, cliffs);
    expect(advance(w, t, W.nukeFlightTime + 0.05, cliffs).map((b) => b.kind)).toEqual(['nuke']);
  });

  it('need 2.5 s to recharge', () => {
    const w = new Weapons();
    const t = wheelie();
    w.step(DT, t, press, open);
    w.step(DT, t, press, open);
    expect(w.nukes.length).toBe(1);
    expect(w.events).toEqual(['nuke', 'denied']);
    advance(w, t, W.nukeCooldown - 0.1);
    w.step(DT, t, press, open);
    expect(w.nukes.length).toBe(0);
    advance(w, t, 0.2);
    w.step(DT, t, press, open);
    expect(w.nukes.length).toBe(1);
  });

  it('have no recharge while raised by a jump zone', () => {
    const w = new Weapons();
    const t = createTank(100, 300);
    for (let i = 0; i < 3; i++) {
      w.step(DT, t, press, open, true);
      advance(w, t, 0.25, open, true);
    }
    expect(w.events.filter((e) => e === 'nuke')).toHaveLength(3);
    expect(w.nukeCooldown).toBe(0);
  });
});

describe('blastHits', () => {
  const blast: Blast = { kind: 'nuke', x: 0, y: 0, radius: 30 };
  it('reaches anything overlapping the blast radius', () => {
    expect(blastHits(blast, 35, 0, 6)).toBe(true);
    expect(blastHits(blast, 37, 0, 6)).toBe(false);
  });
});
