import { describe, expect, it } from 'vitest';
import { ENEMIES, type Spawn } from '../src/sim/enemies';
import { createTank, stepTank } from '../src/sim/tank';
import { WEAPON_TUNING } from '../src/sim/weapons';
import { World, WORLD_TUNING, type StageTerrain, type WorldEvent } from '../src/sim/world';

const DT = 1 / 60;
const TILE = 16;

/** An endless open field, with the player starting at tile (50, 50). */
function field(blocks: (x: number, y: number) => boolean = () => false): StageTerrain {
  return {
    tileSize: TILE,
    start: { x: 50.5 * TILE, y: 50.5 * TILE },
    solidAt: blocks,
    speedAt: () => 1,
    blocksShotsAt: blocks,
  };
}

const NO_FIRE = { held: false, presses: 0 };
const FIRE = { held: true, presses: 1 };

function run(w: World, seconds: number, maneuver: Parameters<World['step']>[1] = 'idle'): WorldEvent[] {
  const out: WorldEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) out.push(...w.step(DT, maneuver, NO_FIRE));
  return out;
}

const types = (events: WorldEvent[]) => events.map((e) => e.type);

describe('enemies waking and moving', () => {
  it('stay dormant until the player comes within range', () => {
    const w = new World(field(), [{ kind: 'type1', tx: 50, ty: 10 }], { lives: 3 });
    run(w, 1);
    expect(w.enemies[0].state).toBe('dormant');
    const near = new World(field(), [{ kind: 'type1', tx: 50, ty: 42 }], { lives: 3 });
    run(near, DT);
    expect(near.enemies[0].state).toBe('active');
  });

  it('roll towards the player and stop at their preferred range', () => {
    const w = new World(field(), [{ kind: 'type1', tx: 50, ty: 40 }], { lives: 3, seed: 2 });
    w.invulnerable = 1e9;
    run(w, 6);
    const e = w.enemies[0];
    const d = Math.hypot(e.x - w.tank.x, e.y - w.tank.y);
    expect(d).toBeLessThan(ENEMIES.type1.preferredRange + 10);
    expect(d).toBeGreaterThan(ENEMIES.type1.radius + 7);
  });

  it('can be woken all at once (jump zones)', () => {
    const w = new World(field(), [{ kind: 'torchika1', tx: 50, ty: 30 }, { kind: 'torchika1', tx: 50, ty: 5 }], { lives: 3 });
    w.wakeAllWithin(800);
    expect(w.enemies.map((e) => e.state)).toEqual(['active', 'active']);
  });

  it('disappear once the player is far away', () => {
    const w = new World(field(), [{ kind: 'torchika1', tx: 50, ty: 45 }], { lives: 3 });
    w.invulnerable = 1e9;
    run(w, DT);
    expect(w.enemies[0].state).toBe('active');
    w.tank.y += WORLD_TUNING.despawnRadius + 200;
    run(w, DT);
    expect(w.enemies).toHaveLength(0);
  });
});

describe('enemy fire', () => {
  it('torchikas fire rings of shots in 4 or 8 directions', () => {
    for (const [kind, count] of [['torchika1', 4], ['torchika2', 8]] as const) {
      const w = new World(field(), [{ kind, tx: 50, ty: 45 }], { lives: 3 });
      w.invulnerable = 1e9;
      const fired = run(w, ENEMIES[kind].fireInterval * 1.5).find((e) => e.type === 'enemyFired');
      expect(fired, kind).toBeDefined();
      expect(w.projectiles.length % count).toBe(0);
    }
  });

  it('destroys the player in one hit, then respawns them with a spare life', () => {
    const w = new World(field(), [{ kind: 'torchika1', tx: 50, ty: 46 }], { lives: 3 });
    const events = run(w, 4);
    expect(types(events)).toContain('playerHit');
    expect(w.lives).toBe(2);
    expect(types(events)).toContain('respawn');
    expect(w.state).toBe('playing');
    expect(w.projectiles).toHaveLength(0);
  });

  it('protects the player briefly after respawning', () => {
    const w = new World(field(), [{ kind: 'torchika2', tx: 50, ty: 46 }], { lives: 3 });
    const events = run(w, 3.5);
    expect(types(events).filter((t) => t === 'playerHit')).toHaveLength(1);
  });

  it('ends the game when the last life is lost', () => {
    const w = new World(field(), [{ kind: 'torchika2', tx: 50, ty: 46 }], { lives: 1 });
    const events = run(w, WORLD_TUNING.deathDelay + 2);
    expect(types(events)).toContain('gameOver');
    expect(w.state).toBe('gameOver');
  });

  it('cannot hit a tank on its side as easily: rolling shrinks the target', () => {
    expect(WORLD_TUNING.playerRollHitRadius).toBeLessThan(WORLD_TUNING.playerHitRadius);
  });

  it('missiles home in on the player', () => {
    const w = new World(field(), [{ kind: 'type5', tx: 44, ty: 44, facing: 135 }], { lives: 3 });
    w.invulnerable = 1e9;
    let missile = undefined;
    for (let i = 0; i < 600 && !missile; i++) {
      w.step(DT, 'idle', NO_FIRE);
      missile = w.projectiles.find((p) => p.kind === 'missile');
    }
    expect(missile).toBeDefined();
    const before = Math.hypot(missile!.x - w.tank.x, missile!.y - w.tank.y);
    run(w, 0.5);
    expect(Math.hypot(missile!.x - w.tank.x, missile!.y - w.tank.y)).toBeLessThan(before);
  });
});

describe('damaging enemies', () => {
  /** A target straight ahead of the player (who faces up). */
  const ahead = (kind: Spawn['kind'], tiles = 5): Spawn => ({ kind, tx: 50, ty: 50 - tiles });

  it('shots destroy a one-hit tank and score its points', () => {
    const w = new World(field(), [ahead('torchika1')], { lives: 3 });
    w.invulnerable = 1e9;
    w.step(DT, 'idle', FIRE);
    const events = run(w, 0.6);
    const kill = events.find((e) => e.type === 'enemyKilled');
    expect(kill).toMatchObject({ points: 200 });
    expect(w.score).toBe(200);
    expect(w.enemies).toHaveLength(0);
  });

  it('tougher enemies take several shots', () => {
    const w = new World(field(), [ahead('cannon1', 7)], { lives: 3 });
    w.invulnerable = 1e9;
    let kills = 0;
    let hits = 0;
    for (let i = 0; i < 60 * 8 && kills === 0; i++) {
      const ev = w.step(DT, 'idle', { held: true, presses: i % 6 === 0 ? 1 : 0 });
      hits += ev.filter((e) => e.type === 'enemyHit').length;
      kills += ev.filter((e) => e.type === 'enemyKilled').length;
    }
    expect(kills).toBe(1);
    expect(hits).toBe(ENEMIES.cannon1.hits[0] - 1);
    expect(w.score).toBe(1200);
  });

  it('uses the higher hit counts on hard stages', () => {
    const w = new World(field(), [ahead('type2')], { lives: 3, hard: true });
    expect(w.enemies[0].hp).toBe(ENEMIES.type2.hits[1]);
  });

  it('nukes damage everything inside the blast', () => {
    const range = WEAPON_TUNING.nukeRange / TILE;
    const w = new World(
      field(),
      // Pillboxes stay put while the crosshair slides out.
      [ahead('torchika1', range), { kind: 'torchika2', tx: 51, ty: 50 - range }, { kind: 'type5', tx: 50, ty: 50 - range - 40 }],
      { lives: 3 },
    );
    w.invulnerable = 1e9;
    // Rear up and let the crosshair slide out to full range before firing.
    run(w, 0.3 + WEAPON_TUNING.nukeAimTime, 'wheelie');
    w.step(DT, 'wheelie', FIRE);
    const events = run(w, WEAPON_TUNING.nukeFlightTime + 0.1, 'wheelie');
    expect(events.filter((e) => e.type === 'enemyKilled')).toHaveLength(2);
    expect(w.enemies.map((e) => e.kind)).toEqual(['type5']);
  });

  it('destroyed tanks leave craters that slow the player', () => {
    const w = new World(field(), [ahead('type1', 2)], { lives: 3 });
    w.invulnerable = 1e9;
    const e = w.enemies[0];
    w.step(DT, 'idle', FIRE);
    run(w, 0.3);
    expect(w.craters).toEqual([{ x: e.x, y: e.y }]);

    const slow = createTank(e.x, e.y + 30);
    const fast = createTank(e.x + 100, e.y + 30);
    for (let i = 0; i < 60; i++) {
      stepTank(slow, 'forward', DT, (w as unknown as { playerGround: never }).playerGround);
      stepTank(fast, 'forward', DT, (w as unknown as { playerGround: never }).playerGround);
    }
    expect(e.y + 30 - slow.y).toBeLessThan(e.y + 30 - fast.y);
  });

  it('player shots can knock down missiles', () => {
    const w = new World(field(), [], { lives: 3 });
    w.projectiles.push({ kind: 'missile', x: w.tank.x, y: w.tank.y - 40, heading: Math.PI, life: 4 });
    w.invulnerable = 1e9;
    w.step(DT, 'idle', FIRE);
    expect(types(run(w, 0.3))).toContain('projectileShotDown');
    expect(w.projectiles).toHaveLength(0);
  });

  it('awards extra lives at score thresholds', () => {
    const w = new World(field(), [ahead('torchika1')], { lives: 3, score: WORLD_TUNING.extendFirst - 100 });
    w.invulnerable = 1e9;
    w.step(DT, 'idle', FIRE);
    expect(types(run(w, 0.6))).toContain('extend');
    expect(w.lives).toBe(4);
  });
});
