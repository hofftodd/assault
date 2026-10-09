import { describe, expect, it } from 'vitest';
import { angleDiff, ENEMIES, headingTo, PROJECTILES, type Spawn } from '../src/sim/enemies';
import { createTank, stepTank } from '../src/sim/tank';
import { WEAPON_TUNING } from '../src/sim/weapons';
import { TileTerrain } from '../src/sim/terrain';
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
    const w = new World(field(), [{ kind: 'type1', tx: 50, ty: 10 }], { startReady: false, lives: 3 });
    run(w, 1);
    expect(w.enemies[0].state).toBe('dormant');
    const near = new World(field(), [{ kind: 'type1', tx: 50, ty: 42 }], { startReady: false, lives: 3 });
    run(near, DT);
    expect(near.enemies[0].state).toBe('active');
  });

  it('roll towards the player and stop at their preferred range', () => {
    const w = new World(field(), [{ kind: 'type1', tx: 50, ty: 40 }], { startReady: false, lives: 3, seed: 2 });
    w.invulnerable = 1e9;
    run(w, 6);
    const e = w.enemies[0];
    const d = Math.hypot(e.x - w.tank.x, e.y - w.tank.y);
    expect(d).toBeLessThan(ENEMIES.type1.preferredRange + 10);
    expect(d).toBeGreaterThan(ENEMIES.type1.radius + 7);
  });

  it('can be woken all at once (jump zones)', () => {
    const w = new World(field(), [{ kind: 'torchika1', tx: 50, ty: 30 }, { kind: 'torchika1', tx: 50, ty: 5 }], { startReady: false, lives: 3 });
    w.wakeAllWithin(800);
    expect(w.enemies.map((e) => e.state)).toEqual(['active', 'active']);
  });

  it('disappear once the player is far away', () => {
    const w = new World(field(), [{ kind: 'torchika1', tx: 50, ty: 45 }], { startReady: false, lives: 3 });
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
      const w = new World(field(), [{ kind, tx: 50, ty: 45 }], { startReady: false, lives: 3 });
      w.invulnerable = 1e9;
      const fired = run(w, ENEMIES[kind].fireInterval * 1.5).find((e) => e.type === 'enemyFired');
      expect(fired, kind).toBeDefined();
      expect(w.projectiles.length % count).toBe(0);
    }
  });

  it('destroys the player in one hit, then respawns them with a spare life', () => {
    const w = new World(field(), [{ kind: 'torchika1', tx: 50, ty: 46 }], { startReady: false, lives: 3 });
    const events = run(w, 4);
    expect(types(events)).toContain('playerHit');
    expect(w.lives).toBe(2);
    expect(types(events)).toContain('respawn');
    expect(['ready', 'playing']).toContain(w.state);
    expect(w.projectiles).toHaveLength(0);
  });

  it('protects the player briefly after respawning', () => {
    const w = new World(field(), [{ kind: 'torchika2', tx: 50, ty: 46 }], { startReady: false, lives: 3 });
    const events = run(w, 3.5);
    expect(types(events).filter((t) => t === 'playerHit')).toHaveLength(1);
  });

  it('ends the game when the last life is lost', () => {
    const w = new World(field(), [{ kind: 'torchika2', tx: 50, ty: 46 }], { startReady: false, lives: 1 });
    const events = run(w, WORLD_TUNING.deathDelay + 2);
    expect(types(events)).toContain('gameOver');
    expect(w.state).toBe('gameOver');
  });

  it('cannot hit a tank on its side as easily: rolling shrinks the target', () => {
    expect(WORLD_TUNING.playerRollHitRadius).toBeLessThan(WORLD_TUNING.playerHitRadius);
  });

  it('missiles home in on the player', () => {
    const w = new World(field(), [{ kind: 'type5', tx: 44, ty: 44, facing: 135 }], { startReady: false, lives: 3 });
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
    const w = new World(field(), [ahead('torchika1')], { startReady: false, lives: 3 });
    w.invulnerable = 1e9;
    w.step(DT, 'idle', FIRE);
    const events = run(w, 0.6);
    const kill = events.find((e) => e.type === 'enemyKilled');
    expect(kill).toMatchObject({ points: 200 });
    expect(w.score).toBe(200);
    expect(w.enemies).toHaveLength(0);
  });

  it('tougher enemies take several shots', () => {
    const w = new World(field(), [ahead('cannon1', 7)], { startReady: false, lives: 3 });
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
    const w = new World(field(), [ahead('type2')], { startReady: false, lives: 3, hard: true });
    expect(w.enemies[0].hp).toBe(ENEMIES.type2.hits[1]);
  });

  it('nukes damage everything inside the blast', () => {
    const range = WEAPON_TUNING.nukeRange / TILE;
    const w = new World(
      field(),
      // Pillboxes stay put while the crosshair slides out.
      [ahead('torchika1', range), { kind: 'torchika2', tx: 51, ty: 50 - range }, { kind: 'type5', tx: 50, ty: 50 - range - 40 }],
      { startReady: false, lives: 3 },
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
    const w = new World(field(), [ahead('type1', 2)], { startReady: false, lives: 3 });
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
    const w = new World(field(), [], { startReady: false, lives: 3 });
    w.projectiles.push({ kind: 'missile', x: w.tank.x, y: w.tank.y - 40, heading: Math.PI, life: 4 });
    w.invulnerable = 1e9;
    w.step(DT, 'idle', FIRE);
    expect(types(run(w, 0.3))).toContain('projectileShotDown');
    expect(w.projectiles).toHaveLength(0);
  });

  it('awards extra lives at score thresholds', () => {
    const w = new World(field(), [ahead('torchika1')], { startReady: false, lives: 3, score: WORLD_TUNING.extendFirst - 100 });
    w.invulnerable = 1e9;
    w.step(DT, 'idle', FIRE);
    expect(types(run(w, 0.6))).toContain('extend');
    expect(w.lives).toBe(4);
  });
});

describe('stage flow', () => {
  const cannons: Spawn[] = [{ kind: 'cannon1', tx: 50, ty: 46 }];
  const killAll = (w: World) => {
    for (const e of w.enemies) e.hp = 0.001;
    w.step(DT, 'idle', FIRE);
    run(w, 0.6);
  };

  it('starts with a READY pause in which nothing moves', () => {
    const w = new World(field(), [{ kind: 'type1', tx: 50, ty: 46 }], { lives: 3 });
    expect(w.state).toBe('ready');
    run(w, 1, 'forward');
    expect(w.tank.y).toBe(50.5 * TILE);
    run(w, WORLD_TUNING.readyTime);
    expect(w.state).toBe('playing');
  });

  it('counts the clock down and costs a life at time up, restarting the clock', () => {
    const w = new World(field(), [], { startReady: false, lives: 3, timeLimit: 2 });
    const events = run(w, 2.1);
    expect(events.find((e) => e.type === 'playerHit')).toMatchObject({ cause: 'timeUp' });
    expect(w.lives).toBe(2);
    run(w, WORLD_TUNING.deathDelay + 0.1);
    expect(w.timeLeft).toBe(2);
  });

  it('clears the stage when every cannon is destroyed, then pays 50 points per second left', () => {
    const w = new World(field(), cannons, { startReady: false, lives: 3, timeLimit: 100 });
    w.invulnerable = 1e9;
    w.enemies[0].hp = 1;
    const shooter = w.enemies[0];
    w.tank.heading = 0;
    w.tank.y = shooter.y + 60;
    w.step(DT, 'idle', FIRE);
    const ev = run(w, 0.6);
    expect(types(ev)).toContain('stageClear');
    expect(w.state).toBe('cleared');
    const left = Math.floor(w.timeLeft);
    const bonus = run(w, WORLD_TUNING.clearMessageTime).find((e) => e.type === 'timeBonus');
    expect(bonus).toMatchObject({ seconds: left, points: left * 50 });
    expect(w.score).toBe(1200 + left * 50);
  });

  it('then drives onto the exit hatch and drops through', () => {
    const terrain = { ...field(), hatch: { x: 50.5 * TILE, y: 40.5 * TILE } };
    const w = new World(terrain, cannons, { startReady: false, lives: 3, timeLimit: 100 });
    killAll(w);
    const events = run(w, WORLD_TUNING.clearMessageTime + WORLD_TUNING.bonusMessageTime + 8);
    expect(types(events)).toContain('hatchDrop');
    expect(w.state).toBe('done');
    expect(w.tank.x).toBeCloseTo(terrain.hatch.x);
    expect(w.tank.y).toBeCloseTo(terrain.hatch.y);
  });

  it('a jump zone raises the tank: safe from fire, wakes enemies, nukes without recharge', () => {
    const terrain = { ...field(), jumpZones: [{ x: 50.5 * TILE, y: 48.5 * TILE }] };
    const w = new World(terrain, [{ kind: 'torchika2', tx: 50, ty: 36 }], { startReady: false, lives: 3 });
    const ev = run(w, 1, 'forward');
    expect(types(ev)).toContain('raised');
    expect(w.raised).toBeGreaterThan(0);
    expect(w.enemies[0].state).toBe('active');
    const hits = run(w, 3).filter((e) => e.type === 'playerHit');
    expect(hits).toHaveLength(0);
    let nukes = 0;
    for (let i = 0; i < 3; i++) {
      nukes += w.step(DT, 'idle', FIRE).filter((e) => e.type === 'fired' && e.what === 'nuke').length;
      run(w, 0.25);
    }
    expect(nukes).toBe(3);
  });

  it('jump zones work three times, and only after driving off and back on', () => {
    const z = { x: 50.5 * TILE, y: 48.5 * TILE };
    const w = new World({ ...field(), jumpZones: [z] }, [], { startReady: false, lives: 3 });
    let raises = 0;
    for (let i = 0; i < 5; i++) {
      w.tank.x = z.x;
      w.tank.y = z.y + 60;
      w.tank.heading = 0;
      raises += types(run(w, 1.6, 'forward')).filter((t) => t === 'raised').length;
      run(w, WORLD_TUNING.raisedTime + 0.1);
      run(w, 0.4, 'forward');
    }
    expect(raises).toBe(3);
    expect(w.jumpZones[0].usesLeft).toBe(0);
  });

  it('leads the guide arrow along the route, then to the hatch', () => {
    const hatch = { x: 50.5 * TILE, y: 10 * TILE };
    const guide = [{ x: 50.5 * TILE, y: 40 * TILE }];
    const w = new World({ ...field(), hatch }, [], { startReady: false, lives: 3, guide });
    expect(w.guideTarget).toEqual(guide[0]);
    run(w, 3, 'forward');
    expect(w.guideTarget).toEqual(hatch);
  });
});

describe('waves and UFO launchers', () => {
  it('launchers stay underground until their wave is destroyed, then rise and fight', () => {
    const w = new World(
      field(),
      [
        { kind: 'torchika1', tx: 50, ty: 46, group: 1 },
        { kind: 'ufo', tx: 54, ty: 45, after: 1 },
      ],
      { startReady: false, lives: 3 },
    );
    w.invulnerable = 1e9;
    run(w, 1);
    const ufo = w.enemies.find((e) => e.kind === 'ufo')!;
    expect(ufo.state).toBe('hidden');
    w.step(DT, 'idle', FIRE);
    const ev = run(w, 0.5);
    expect(types(ev)).toContain('enemyEmerging');
    expect(ufo.state).toBe('emerging');
    run(w, WORLD_TUNING.emergeTime);
    expect(ufo.state).toBe('active');
  });

  it('launchers shrug off regular shots but fall to a nuke', () => {
    const w = new World(field(), [{ kind: 'ufo', tx: 50, ty: 46 }], { startReady: false, lives: 3 });
    w.invulnerable = 1e9;
    w.step(DT, 'idle', FIRE);
    const ev = run(w, 0.4);
    expect(types(ev)).toContain('deflected');
    expect(w.enemies).toHaveLength(1);
    run(w, 0.3 + WEAPON_TUNING.nukeAimTime * 0.5, 'wheelie');
    w.step(DT, 'wheelie', FIRE);
    const killed = run(w, WEAPON_TUNING.nukeFlightTime + 0.1, 'wheelie').find((e) => e.type === 'enemyKilled');
    expect(killed).toMatchObject({ points: 800 });
  });

  it('a parked tank never fires', () => {
    const w = new World(field(), [{ kind: 'parking', tx: 50, ty: 47 }], { startReady: false, lives: 3 });
    expect(types(run(w, 5))).not.toContain('enemyFired');
  });
});

describe('area 3: gates, hovering and airborne enemies', () => {
  it('a gate blocks the way until the cannons fall, then slides open and the tank drives through', () => {
    // A real tile map: a corridor north, a gate across it, cannons before it and the exit beyond.
    const map = [
      '#######',
      '#..X..#',
      '#.....#',
      '#GGGGG#',
      '#.....#',
      '#..C..#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#..P..#',
      '#######',
    ];
    const t = new TileTerrain(map, TILE, 1);
    expect(t.solidAt(3.5 * TILE, 3.5 * TILE)).toBe(true);
    const w = new World(t, t.spawns, { startReady: false, lives: 3, exit: 'gate' });
    w.invulnerable = 1e9;
    for (const e of w.enemies) e.hp = 0.001;
    w.step(DT, 'idle', FIRE);
    const events = run(w, 0.6 + WORLD_TUNING.clearMessageTime + WORLD_TUNING.bonusMessageTime + 10);
    expect(types(events)).toContain('gateOpen');
    expect(types(events)).not.toContain('hatchDrop');
    expect(t.solidAt(3.5 * TILE, 3.5 * TILE)).toBe(false);
    expect(w.state).toBe('done');
    expect(w.tank.y).toBeCloseTo(1.5 * TILE);
  });

  it('a launch exit fires the tank off the pad instead of dropping it through a hatch', () => {
    const terrain = { ...field(), hatch: { x: 50.5 * TILE, y: 44.5 * TILE } };
    const w = new World(terrain, [{ kind: 'cannon3', tx: 50, ty: 46 }], { startReady: false, lives: 3, exit: 'launch' });
    for (const e of w.enemies) e.hp = 0.001;
    w.step(DT, 'idle', FIRE);
    const events = run(w, 0.6 + WORLD_TUNING.clearMessageTime + WORLD_TUNING.bonusMessageTime + 8);
    expect(types(events)).toContain('stageClear');
    expect(types(events)).toContain('launch');
    expect(w.state).toBe('done');
  });

  it("shells pass beneath a generator; each nuke is one hit, unless it drops down the centre hole", () => {
    const w = new World(field(), [{ kind: 'generator', tx: 50, ty: 45 }], { startReady: false, lives: 3 });
    w.invulnerable = 1e9;
    const g = w.enemies[0];
    w.step(DT, 'idle', FIRE);
    run(w, 0.3);
    expect(g.hp).toBe(ENEMIES.generator.hits[0]);
    (w as unknown as { applyNuke: (b: object) => void }).applyNuke({ kind: 'nuke', x: g.x + 20, y: g.y, radius: 30 });
    expect(g.hp).toBe(ENEMIES.generator.hits[0] - 1);
    (w as unknown as { applyNuke: (b: object) => void }).applyNuke({ kind: 'nuke', x: g.x + 2, y: g.y, radius: 30 });
    expect(g.state).toBe('dead');
  });

  it('fourlegs hover across the void that stops tanks', () => {
    const chasm = (_x: number, y: number) => y > 37 * TILE && y < 44 * TILE;
    const w = new World(field(chasm), [{ kind: 'fourlegs', tx: 50, ty: 34 }, { kind: 'type1', tx: 52, ty: 34 }], { startReady: false, lives: 3 });
    w.invulnerable = 1e9;
    w.wakeAllWithin(1000);
    run(w, 6);
    const [legs, tank] = w.enemies;
    expect(legs.y).toBeGreaterThan(44 * TILE);
    expect(tank.y).toBeLessThan(38 * TILE);
  });
});

describe('enemy marksmanship across the stages', () => {
  /** Fire a stationary Type 1 at a still player for a while; returns its aim errors (rad). */
  const volleys = (difficulty?: number) => {
    const w = new World(field(), [{ kind: 'type1', tx: 50, ty: 45 }], { startReady: false, lives: 3, difficulty, seed: 5 });
    w.invulnerable = 1e9;
    const e = w.enemies[0];
    const errors: number[] = [];
    for (let i = 0; i < Math.round(60 / DT); i++) {
      e.x = 50.5 * TILE;
      e.y = 45.5 * TILE;
      for (const ev of w.step(DT, 'idle', NO_FIRE)) {
        if (ev.type !== 'enemyFired') continue;
        const p = w.projectiles[w.projectiles.length - 1];
        errors.push(Math.abs(angleDiff(p.heading, headingTo(p.x, p.y, w.tank.x, w.tank.y))));
      }
    }
    return errors;
  };

  it('early stages scatter their aim and fire less often; late stages aim close', () => {
    const early = volleys(0);
    const late = volleys(1);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(early)).toBeGreaterThan(0.12);
    expect(mean(late)).toBeLessThan(0.08);
    expect(early.length).toBeLessThan(late.length);
    expect(Math.max(...early)).toBeLessThanOrEqual(WORLD_TUNING.aimSpread[0] + 0.01);
  });

  it('early shells fly slower but just as far', () => {
    const w = new World(field(), [{ kind: 'type1', tx: 50, ty: 45 }], { startReady: false, lives: 3, difficulty: 0 });
    w.invulnerable = 1e9;
    while (!w.step(DT, 'idle', NO_FIRE).some((e) => e.type === 'enemyFired'));
    const p = w.projectiles[0];
    expect(p.life).toBeCloseTo(PROJECTILES.orange.life / WORLD_TUNING.shotSpeed[0], 1);
    const start = { x: p.x, y: p.y };
    w.step(DT, 'idle', NO_FIRE);
    expect(Math.hypot(p.x - start.x, p.y - start.y)).toBeCloseTo(PROJECTILES.orange.speed * WORLD_TUNING.shotSpeed[0] * DT, 2);
  });
});
