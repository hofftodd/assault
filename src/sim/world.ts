import type { Maneuver } from '../input/maneuver';
import {
  angleDiff,
  ENEMIES,
  headingTo,
  PROJECTILES,
  type Enemy,
  type EnemyProjectile,
  type ProjectileKind,
  type Spawn,
} from './enemies';
import { Rng } from './rng';
import { createTank, fits, forwardVector, rightVector, stepTank, TANK_TUNING, type Tank } from './tank';
import type { Terrain } from './terrain';
import { blastHits, Weapons, type Blast, type FireEvent, type FireInput, type ShotTerrain } from './weapons';

export const WORLD_TUNING = {
  /** Player hit radius against enemy fire: upright, and while flipped on its side. */
  playerHitRadius: 5,
  playerRollHitRadius: 3,
  /** Seconds of "YOU WERE HIT" before the tank returns (or the game ends). */
  deathDelay: 2.5,
  /** Seconds of blinking invulnerability after returning. */
  respawnInvulnerability: 2,
  /** Hits a nuke deals to every enemy inside its blast. */
  nukeDamage: 8,
  /** Active enemies (and craters) further than this from the player are removed. */
  despawnRadius: 320,
  craterRadius: 9,
  craterSlow: 0.5,
  /** Extra lives (a guess: the original's thresholds are unknown). */
  extendFirst: 20000,
  extendEvery: 70000,
};

export interface StageTerrain extends Terrain, ShotTerrain {
  readonly tileSize: number;
  readonly start: { x: number; y: number };
}

export interface Crater {
  x: number;
  y: number;
}

export type WorldState = 'playing' | 'dying' | 'gameOver';

export type WorldEvent =
  | { type: 'fired'; what: FireEvent }
  | { type: 'roll' }
  | { type: 'blast'; blast: Blast }
  | { type: 'enemyHit'; enemy: Enemy }
  | { type: 'enemyKilled'; enemy: Enemy; points: number }
  | { type: 'enemyFired'; enemy: Enemy; projectile: ProjectileKind }
  | { type: 'projectileShotDown'; x: number; y: number }
  | { type: 'projectileHitWall'; x: number; y: number }
  | { type: 'playerHit'; x: number; y: number }
  | { type: 'respawn' }
  | { type: 'gameOver' }
  | { type: 'extend' };

export interface WorldOptions {
  lives: number;
  /** Second-half stages: enemies take more hits. */
  hard?: boolean;
  seed?: number;
  /** Score carried in from earlier stages. */
  score?: number;
}

export class World {
  readonly tank: Tank;
  readonly weapons = new Weapons();
  readonly enemies: Enemy[] = [];
  readonly projectiles: EnemyProjectile[] = [];
  readonly craters: Crater[] = [];
  state: WorldState = 'playing';
  /** Seconds since the state last changed. */
  stateTime = 0;
  invulnerable = 0;
  score: number;
  lives: number;
  private nextExtend: number;
  private readonly hard: boolean;
  private readonly rng: Rng;
  /** The ground as the player's tank feels it: enemies block, craters slow. */
  private readonly playerGround: Terrain;
  private events: WorldEvent[] = [];

  constructor(
    readonly terrain: StageTerrain,
    spawns: readonly Spawn[],
    opts: WorldOptions,
  ) {
    this.tank = createTank(terrain.start.x, terrain.start.y);
    this.lives = opts.lives;
    this.hard = opts.hard ?? false;
    this.rng = new Rng(opts.seed ?? 1);
    this.score = opts.score ?? 0;
    this.nextExtend = WORLD_TUNING.extendFirst;
    while (this.nextExtend <= this.score) this.nextExtend += WORLD_TUNING.extendEvery;
    spawns.forEach((s, i) => {
      const spec = ENEMIES[s.kind];
      this.enemies.push({
        id: i + 1,
        kind: s.kind,
        x: (s.tx + 0.5) * terrain.tileSize,
        y: (s.ty + 0.5) * terrain.tileSize,
        heading: ((s.facing ?? 180) * Math.PI) / 180,
        hp: spec.hits[this.hard ? 1 : 0],
        state: 'dormant',
        fireTimer: 0,
        flank: this.rng.range(-40, 40),
        flash: 0,
      });
    });
    this.playerGround = {
      solidAt: (x, y) => terrain.solidAt(x, y) || this.enemies.some((e) => (x - e.x) ** 2 + (y - e.y) ** 2 < ENEMIES[e.kind].radius ** 2),
      speedAt: (x, y) =>
        terrain.speedAt(x, y) *
        (this.craters.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < WORLD_TUNING.craterRadius ** 2) ? WORLD_TUNING.craterSlow : 1),
    };
  }

  step(dt: number, maneuver: Maneuver, fire: FireInput): WorldEvent[] {
    this.events = [];
    this.stateTime += dt;

    if (this.state === 'dying' && this.stateTime >= WORLD_TUNING.deathDelay) {
      if (this.lives > 0) {
        this.setState('playing');
        this.invulnerable = WORLD_TUNING.respawnInvulnerability;
        this.projectiles.length = 0;
        this.events.push({ type: 'respawn' });
      } else {
        this.setState('gameOver');
        this.events.push({ type: 'gameOver' });
      }
    }

    if (this.state === 'playing') this.stepPlayer(dt, maneuver, fire);
    if (this.state !== 'gameOver') {
      this.stepEnemies(dt);
      this.stepProjectiles(dt);
    }
    this.removeDead();
    return this.events;
  }

  /** Wake every dormant enemy within `radius` (a jump zone lifting the tank into view). */
  wakeAllWithin(radius: number): void {
    for (const e of this.enemies) if (e.state === 'dormant' && this.distToPlayer(e) <= radius) this.wake(e);
  }

  private setState(s: WorldState): void {
    this.state = s;
    this.stateTime = 0;
  }

  private stepPlayer(dt: number, maneuver: Maneuver, fire: FireInput): void {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const wasRolling = this.tank.mode === 'roll';
    stepTank(this.tank, maneuver, dt, this.playerGround);
    if (this.tank.mode === 'roll' && !wasRolling) this.events.push({ type: 'roll' });

    const blasts = this.weapons.step(dt, this.tank, fire, this.terrain);
    for (const what of this.weapons.events) this.events.push({ type: 'fired', what });
    this.weapons.events.length = 0;
    for (const blast of blasts) {
      this.events.push({ type: 'blast', blast });
      if (blast.kind === 'nuke') this.applyNuke(blast);
    }

    for (const shot of [...this.weapons.shots]) {
      const target = this.enemies.find((e) => e.state !== 'dead' && Math.hypot(shot.x - e.x, shot.y - e.y) <= ENEMIES[e.kind].radius + 1.5);
      if (target) {
        this.weapons.removeShot(shot);
        this.damage(target, 1);
        continue;
      }
      const missile = this.projectiles.find(
        (p) => PROJECTILES[p.kind].shootable && Math.hypot(shot.x - p.x, shot.y - p.y) <= PROJECTILES[p.kind].radius + 2,
      );
      if (missile) {
        this.weapons.removeShot(shot);
        this.projectiles.splice(this.projectiles.indexOf(missile), 1);
        this.events.push({ type: 'projectileShotDown', x: missile.x, y: missile.y });
      }
    }
  }

  private applyNuke(blast: Blast): void {
    for (const e of this.enemies) {
      if (e.state !== 'dead' && blastHits(blast, e.x, e.y, ENEMIES[e.kind].radius)) this.damage(e, WORLD_TUNING.nukeDamage);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (blastHits(blast, p.x, p.y, PROJECTILES[p.kind].radius)) this.projectiles.splice(i, 1);
    }
  }

  private damage(e: Enemy, hits: number): void {
    if (e.state === 'dormant') this.wake(e);
    e.hp -= hits;
    e.flash = 0.08;
    if (e.hp > 0) {
      this.events.push({ type: 'enemyHit', enemy: e });
      return;
    }
    const spec = ENEMIES[e.kind];
    e.state = 'dead';
    this.addScore(spec.points);
    if (spec.leavesCrater) this.craters.push({ x: e.x, y: e.y });
    this.events.push({ type: 'enemyKilled', enemy: e, points: spec.points });
  }

  private addScore(points: number): void {
    this.score += points;
    while (this.score >= this.nextExtend) {
      this.lives++;
      this.nextExtend += WORLD_TUNING.extendEvery;
      this.events.push({ type: 'extend' });
    }
  }

  private wake(e: Enemy): void {
    const spec = ENEMIES[e.kind];
    e.state = 'active';
    e.fireTimer = spec.fireInterval * this.rng.range(0.3, 1);
  }

  private distToPlayer(e: { x: number; y: number }): number {
    return Math.hypot(e.x - this.tank.x, e.y - this.tank.y);
  }

  private stepEnemies(dt: number): void {
    const t = this.tank;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      e.flash = Math.max(0, e.flash - dt);
      const spec = ENEMIES[e.kind];
      const dist = this.distToPlayer(e);
      if (e.state === 'dormant') {
        if (dist <= spec.wakeRadius) this.wake(e);
        else continue;
      }
      if (dist > WORLD_TUNING.despawnRadius) {
        e.state = 'dead';
        continue;
      }

      const toPlayer = headingTo(e.x, e.y, t.x, t.y);
      if (spec.speed > 0) {
        // Close in from a flank (narrowing as they approach), so groups fan out.
        const r = rightVector(toPlayer);
        const flank = e.flank * Math.min(1, dist / 150);
        const desired = headingTo(e.x, e.y, t.x + r.x * flank, t.y + r.y * flank);
        e.heading += clamp(angleDiff(e.heading, desired), spec.turnRate * dt);
        if (dist > spec.preferredRange && Math.abs(angleDiff(e.heading, desired)) < 0.5) {
          const f = forwardVector(e.heading);
          this.moveEnemy(e, f.x * spec.speed * dt, f.y * spec.speed * dt);
        }
      } else if (spec.turnRate > 0) {
        e.heading += clamp(angleDiff(e.heading, toPlayer), spec.turnRate * dt);
      }

      if (this.state !== 'playing' || dist > spec.fireRange) continue;
      e.fireTimer -= dt;
      if (e.fireTimer > 0) continue;
      if (spec.fire.kind === 'aimed' && Math.abs(angleDiff(e.heading, toPlayer)) > 0.3) continue;
      this.enemyFire(e, toPlayer);
      e.fireTimer = spec.fireInterval * this.rng.range(0.7, 1.3);
    }
  }

  private moveEnemy(e: Enemy, dx: number, dy: number): void {
    const r = ENEMIES[e.kind].radius;
    const clear = (x: number, y: number) =>
      fits(this.terrain, x, y, r) &&
      Math.hypot(x - this.tank.x, y - this.tank.y) > r + TANK_TUNING.radius &&
      this.enemies.every((o) => o === e || o.state === 'dead' || Math.hypot(x - o.x, y - o.y) > r + ENEMIES[o.kind].radius);
    if (clear(e.x + dx, e.y + dy)) {
      e.x += dx;
      e.y += dy;
    } else if (clear(e.x + dx, e.y)) {
      e.x += dx;
    } else if (clear(e.x, e.y + dy)) {
      e.y += dy;
    }
  }

  private enemyFire(e: Enemy, toPlayer: number): void {
    const spec = ENEMIES[e.kind];
    const fire = spec.fire;
    if (fire.kind === 'radial') {
      for (let i = 0; i < fire.count; i++) this.spawnProjectile(fire.projectile, e.x, e.y, (i * 2 * Math.PI) / fire.count);
    } else {
      const f = forwardVector(e.heading);
      const r = rightVector(e.heading);
      for (let i = 0; i < fire.count; i++) {
        const side = (i - (fire.count - 1) / 2) * fire.spacing;
        this.spawnProjectile(fire.projectile, e.x + f.x * spec.radius + r.x * side, e.y + f.y * spec.radius + r.y * side, toPlayer);
      }
    }
    this.events.push({ type: 'enemyFired', enemy: e, projectile: fire.projectile });
  }

  private spawnProjectile(kind: ProjectileKind, x: number, y: number, heading: number): void {
    this.projectiles.push({ kind, x, y, heading, life: PROJECTILES[kind].life });
  }

  private stepProjectiles(dt: number): void {
    const t = this.tank;
    const hitRadius = t.mode === 'roll' ? WORLD_TUNING.playerRollHitRadius : WORLD_TUNING.playerHitRadius;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const spec = PROJECTILES[p.kind];
      if (spec.homing > 0) p.heading += clamp(angleDiff(p.heading, headingTo(p.x, p.y, t.x, t.y)), spec.homing * dt);
      const f = forwardVector(p.heading);
      p.x += f.x * spec.speed * dt;
      p.y += f.y * spec.speed * dt;
      p.life -= dt;
      if (this.terrain.blocksShotsAt(p.x, p.y)) {
        this.projectiles.splice(i, 1);
        this.events.push({ type: 'projectileHitWall', x: p.x, y: p.y });
      } else if (p.life <= 0) {
        this.projectiles.splice(i, 1);
      } else if (this.state === 'playing' && this.invulnerable === 0 && Math.hypot(p.x - t.x, p.y - t.y) <= spec.radius + hitRadius) {
        this.projectiles.splice(i, 1);
        this.playerHit();
      }
    }
  }

  private playerHit(): void {
    this.lives--;
    this.setState('dying');
    this.weapons.shots.length = 0;
    this.weapons.nukes.length = 0;
    this.events.push({ type: 'playerHit', x: this.tank.x, y: this.tank.y });
  }

  private removeDead(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].state === 'dead') this.enemies.splice(i, 1);
    for (let i = this.craters.length - 1; i >= 0; i--) {
      if (this.distToPlayer(this.craters[i]) > WORLD_TUNING.despawnRadius) this.craters.splice(i, 1);
    }
  }
}

const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
