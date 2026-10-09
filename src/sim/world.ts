import { steering, type Maneuver } from '../input/maneuver';
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
  /** "PLAYER 1 READY" pause at the start of a stage and after losing a life. */
  readyTime: 1.6,
  /** Jump zones: trigger radius (px), seconds aloft, uses each, and how far around the tank they wake enemies. */
  jumpRadius: 14,
  raisedTime: 5,
  jumpUses: 3,
  jumpWakeRadius: 300,
  /** Stage clear: seconds of "STAGE CLEAR" before the time bonus, then before driving to the hatch. */
  clearMessageTime: 2.2,
  bonusMessageTime: 2.4,
  /** Time bonus per whole second left on the clock. */
  timeBonusPerSecond: 50,
  /** Speed (px/s) of the automatic drive onto the exit hatch, and seconds on the hatch before dropping through. */
  hatchDriveSpeed: 40,
  hatchDropTime: 2.6,
  /** Guide arrow: a waypoint counts as reached within this many px. */
  guideReach: 72,
  /** Seconds a UFO launcher takes to rise out of its hole. */
  emergeTime: 1.4,
  /** Extra lives (a guess: the original's thresholds are unknown). */
  extendFirst: 20000,
  extendEvery: 70000,
};

export interface StageTerrain extends Terrain, ShotTerrain {
  readonly tileSize: number;
  readonly start: { x: number; y: number };
  readonly jumpZones?: readonly { x: number; y: number }[];
  readonly hatch?: { x: number; y: number } | null;
}

export interface JumpZone {
  x: number;
  y: number;
  usesLeft: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Crater {
  x: number;
  y: number;
}

/**
 * ready: "PLAYER 1 READY", nothing moves.  playing: normal play (the tank may be
 * raised on a jump zone).  dying: wrecked, before the next life.  cleared: all
 * cannons down, showing STAGE CLEAR then the time bonus.  exiting: driving onto
 * the hatch and dropping through.  done: the stage is over.  gameOver: no lives left.
 */
export type WorldState = 'ready' | 'playing' | 'dying' | 'cleared' | 'exiting' | 'done' | 'gameOver';

export type DeathCause = 'hit' | 'timeUp';

export type WorldEvent =
  | { type: 'fired'; what: FireEvent }
  | { type: 'roll' }
  | { type: 'blast'; blast: Blast }
  | { type: 'enemyHit'; enemy: Enemy }
  | { type: 'deflected'; enemy: Enemy }
  | { type: 'enemyEmerging'; enemy: Enemy }
  | { type: 'enemyKilled'; enemy: Enemy; points: number }
  | { type: 'enemyFired'; enemy: Enemy; projectile: ProjectileKind }
  | { type: 'projectileShotDown'; x: number; y: number }
  | { type: 'projectileHitWall'; x: number; y: number }
  | { type: 'playerHit'; x: number; y: number; cause: DeathCause }
  | { type: 'raised' }
  | { type: 'landed' }
  | { type: 'stageClear' }
  | { type: 'timeBonus'; seconds: number; points: number }
  | { type: 'hatchDrop' }
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
  /** Seconds on the clock; omit for no time limit. */
  timeLimit?: number;
  /** Route for the guide arrow (world coordinates). */
  guide?: readonly Point[];
  /** Start in the READY pause (default true). */
  startReady?: boolean;
  /** Initial tank heading in radians (0 = up the map). */
  startHeading?: number;
}

export class World {
  readonly tank: Tank;
  readonly weapons = new Weapons();
  readonly enemies: Enemy[] = [];
  readonly projectiles: EnemyProjectile[] = [];
  readonly craters: Crater[] = [];
  state: WorldState;
  /** Seconds since the state last changed. */
  stateTime = 0;
  invulnerable = 0;
  /** Seconds left on the stage clock (Infinity without a time limit). */
  timeLeft: number;
  readonly timeLimit: number;
  readonly jumpZones: JumpZone[];
  /** Seconds left aloft on a jump zone, or 0 on the ground. */
  raised = 0;
  /** Why the last life was lost. */
  deathCause: DeathCause = 'hit';
  /** Time bonus awarded at the last stage clear. */
  bonus = { seconds: 0, points: 0 };
  private guide: Point[];
  private guideIndex = 0;
  /** The jump zone the tank is sitting on, which can't re-trigger until it drives off. */
  private onZone: JumpZone | null = null;
  private readonly hasCannons: boolean;
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
    this.tank = createTank(terrain.start.x, terrain.start.y, opts.startHeading ?? 0);
    this.state = opts.startReady === false ? 'playing' : 'ready';
    this.timeLimit = opts.timeLimit ?? Infinity;
    this.timeLeft = this.timeLimit;
    this.jumpZones = (terrain.jumpZones ?? []).map((z) => ({ x: z.x, y: z.y, usesLeft: WORLD_TUNING.jumpUses }));
    this.guide = [...(opts.guide ?? [])];
    this.hasCannons = spawns.some((s) => s.kind === 'cannon1');
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
        state: s.after !== undefined ? 'hidden' : 'dormant',
        fireTimer: 0,
        flank: this.rng.range(-40, 40),
        flash: 0,
        group: s.group,
        after: s.after,
        emergeTime: 0,
      });
    });
    this.playerGround = {
      solidAt: (x, y) =>
        terrain.solidAt(x, y) || this.enemies.some((e) => tangible(e) && (x - e.x) ** 2 + (y - e.y) ** 2 < ENEMIES[e.kind].radius ** 2),
      speedAt: (x, y) =>
        terrain.speedAt(x, y) *
        (this.craters.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < WORLD_TUNING.craterRadius ** 2) ? WORLD_TUNING.craterSlow : 1),
    };
  }

  step(dt: number, maneuver: Maneuver, fire: FireInput): WorldEvent[] {
    this.events = [];
    this.stateTime += dt;
    const T = WORLD_TUNING;

    switch (this.state) {
      case 'ready':
        if (this.stateTime >= T.readyTime) this.setState('playing');
        break;
      case 'dying':
        if (this.stateTime < T.deathDelay) break;
        if (this.lives > 0) {
          this.setState('ready');
          this.invulnerable = T.respawnInvulnerability;
          this.projectiles.length = 0;
          if (this.deathCause === 'timeUp') this.timeLeft = this.timeLimit;
          this.events.push({ type: 'respawn' });
        } else {
          this.setState('gameOver');
          this.events.push({ type: 'gameOver' });
        }
        break;
      case 'cleared':
        if (this.bonus.points === 0 && this.stateTime >= T.clearMessageTime) this.awardTimeBonus();
        if (this.stateTime >= T.clearMessageTime + T.bonusMessageTime) this.setState('exiting');
        break;
      case 'exiting':
        this.driveToHatch(dt);
        break;
    }

    if (this.state === 'playing') {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      this.stepPlayer(dt, maneuver, fire);
      if (this.state === 'playing' && this.timeLeft === 0) this.playerDies('timeUp');
      this.advanceGuide();
    }
    if (this.state !== 'gameOver' && this.state !== 'ready') {
      this.stepEnemies(dt);
      this.stepProjectiles(dt);
    }
    if (this.state === 'cleared' || this.state === 'exiting') this.stepWeaponsOnly(dt);
    this.removeDead();
    if (this.state === 'playing' && this.hasCannons && !this.enemies.some((e) => e.kind === 'cannon1')) this.stageClear();
    return this.events;
  }

  /** Where the guide arrow points: the next waypoint on the route, then the exit hatch. */
  get guideTarget(): Point | null {
    if (this.guideIndex < this.guide.length) return this.guide[this.guideIndex];
    return this.terrain.hatch ?? null;
  }

  private advanceGuide(): void {
    const g = this.guide[this.guideIndex];
    if (g && Math.hypot(g.x - this.tank.x, g.y - this.tank.y) < WORLD_TUNING.guideReach) this.guideIndex++;
  }

  private stageClear(): void {
    this.setState('cleared');
    this.raised = 0;
    this.tank.mode = 'drive';
    this.tank.lift = 0;
    this.projectiles.length = 0;
    this.bonus = { seconds: 0, points: 0 };
    this.events.push({ type: 'stageClear' });
  }

  private awardTimeBonus(): void {
    const seconds = Number.isFinite(this.timeLeft) ? Math.floor(this.timeLeft) : 0;
    this.bonus = { seconds, points: seconds * WORLD_TUNING.timeBonusPerSecond };
    if (this.bonus.points === 0) this.bonus.points = -1; // mark as awarded
    else this.addScore(this.bonus.points);
    this.events.push({ type: 'timeBonus', seconds, points: Math.max(0, this.bonus.points) });
  }

  /** Scripted ending: turn towards the hatch, drive onto it, then drop through. */
  private driveToHatch(dt: number): void {
    const h = this.terrain.hatch;
    const t = this.tank;
    if (!h) {
      if (this.stateTime >= WORLD_TUNING.hatchDropTime) this.setState('done');
      return;
    }
    const dist = Math.hypot(h.x - t.x, h.y - t.y);
    if (dist > 1) {
      const want = headingTo(t.x, t.y, h.x, h.y);
      t.heading += clamp(angleDiff(t.heading, want), TANK_TUNING.turnRate * dt);
      if (Math.abs(angleDiff(t.heading, want)) < 0.2) {
        const step = Math.min(dist, WORLD_TUNING.hatchDriveSpeed * dt);
        t.x += ((h.x - t.x) / dist) * step;
        t.y += ((h.y - t.y) / dist) * step;
      }
      this.stateTime = 0;
      if (Math.hypot(h.x - t.x, h.y - t.y) <= 1) {
        t.x = h.x;
        t.y = h.y;
        this.events.push({ type: 'hatchDrop' });
      }
      return;
    }
    if (this.stateTime >= WORLD_TUNING.hatchDropTime) this.setState('done');
  }

  /** Let shells already in flight land after the stage is won. */
  private stepWeaponsOnly(dt: number): void {
    for (const blast of this.weapons.step(dt, this.tank, { held: false, presses: 0 }, this.terrain)) {
      this.events.push({ type: 'blast', blast });
    }
    this.weapons.events.length = 0;
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
    const raised = this.raised > 0;
    if (raised) {
      // Aloft: the tank can turn to aim, but not drive, roll or wheelie.
      this.raised = Math.max(0, this.raised - dt);
      const turn = steering(maneuver);
      if (turn) stepTank(this.tank, turn < 0 ? 'turnLeft' : 'turnRight', dt, this.playerGround);
      if (this.raised === 0) this.events.push({ type: 'landed' });
    } else {
      const wasRolling = this.tank.mode === 'roll';
      stepTank(this.tank, maneuver, dt, this.playerGround);
      if (this.tank.mode === 'roll' && !wasRolling) this.events.push({ type: 'roll' });
      this.checkJumpZones();
    }

    const blasts = this.weapons.step(dt, this.tank, fire, this.terrain, raised);
    for (const what of this.weapons.events) this.events.push({ type: 'fired', what });
    this.weapons.events.length = 0;
    for (const blast of blasts) {
      this.events.push({ type: 'blast', blast });
      if (blast.kind === 'nuke') this.applyNuke(blast);
    }

    for (const shot of [...this.weapons.shots]) {
      const target = this.enemies.find((e) => tangible(e) && Math.hypot(shot.x - e.x, shot.y - e.y) <= ENEMIES[e.kind].radius + 1.5);
      if (target) {
        this.weapons.removeShot(shot);
        this.damage(target, 1, false);
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

  private checkJumpZones(): void {
    const t = this.tank;
    const zone = this.jumpZones.find((z) => Math.hypot(z.x - t.x, z.y - t.y) <= WORLD_TUNING.jumpRadius);
    if (this.onZone && zone !== this.onZone) this.onZone = null;
    if (!zone || zone === this.onZone || zone.usesLeft === 0 || t.mode !== 'drive' || t.lift > 0) return;
    zone.usesLeft--;
    this.onZone = zone;
    this.raised = WORLD_TUNING.raisedTime;
    t.x = zone.x;
    t.y = zone.y;
    this.wakeAllWithin(WORLD_TUNING.jumpWakeRadius);
    this.events.push({ type: 'raised' });
  }

  private applyNuke(blast: Blast): void {
    for (const e of this.enemies) {
      if (tangible(e) && blastHits(blast, e.x, e.y, ENEMIES[e.kind].radius)) this.damage(e, WORLD_TUNING.nukeDamage, true);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (blastHits(blast, p.x, p.y, PROJECTILES[p.kind].radius)) this.projectiles.splice(i, 1);
    }
  }

  private damage(e: Enemy, hits: number, byNuke: boolean): void {
    if (e.state === 'dormant') this.wake(e);
    if (ENEMIES[e.kind].nukeOnly && !byNuke) {
      this.events.push({ type: 'deflected', enemy: e });
      return;
    }
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
      if (e.state === 'hidden') {
        // Rises once every enemy of its trigger wave has been destroyed (or left behind).
        if (this.enemies.some((o) => o.group === e.after && o.state !== 'dead')) continue;
        e.state = 'emerging';
        e.emergeTime = 0;
        this.events.push({ type: 'enemyEmerging', enemy: e });
        continue;
      }
      if (e.state === 'emerging') {
        e.emergeTime += dt;
        if (e.emergeTime >= WORLD_TUNING.emergeTime) this.wake(e);
        continue;
      }
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

      if (this.state !== 'playing' || spec.harmless || dist > spec.fireRange) continue;
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
      this.enemies.every((o) => o === e || !tangible(o) || Math.hypot(x - o.x, y - o.y) > r + ENEMIES[o.kind].radius);
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
      } else if (
        this.state === 'playing' &&
        this.invulnerable === 0 &&
        this.raised === 0 &&
        Math.hypot(p.x - t.x, p.y - t.y) <= spec.radius + hitRadius
      ) {
        this.projectiles.splice(i, 1);
        this.playerDies('hit');
      }
    }
  }

  private playerDies(cause: DeathCause): void {
    this.lives--;
    this.deathCause = cause;
    this.raised = 0;
    this.tank.mode = 'drive';
    this.tank.lift = 0;
    this.setState('dying');
    this.weapons.shots.length = 0;
    this.weapons.nukes.length = 0;
    this.events.push({ type: 'playerHit', x: this.tank.x, y: this.tank.y, cause });
  }

  private removeDead(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].state === 'dead') this.enemies.splice(i, 1);
    for (let i = this.craters.length - 1; i >= 0; i--) {
      if (this.distToPlayer(this.craters[i]) > WORLD_TUNING.despawnRadius) this.craters.splice(i, 1);
    }
  }
}

/** Enemies that can be hit and collided with (not underground, rising or destroyed). */
const tangible = (e: Enemy) => e.state === 'dormant' || e.state === 'active';

const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
