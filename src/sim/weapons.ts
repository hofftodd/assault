import { forwardVector, rightVector, type Tank } from './tank';

export const WEAPON_TUNING = {
  /** The original allows at most three regular shots on screen. */
  maxShots: 3,
  /** px/s */
  shotSpeed: 240,
  /** seconds before a shot that hit nothing fizzles out */
  shotLife: 0.85,
  /** holding fire repeats this often (seconds) */
  autoFireInterval: 0.2,
  /** muzzle position: distance ahead of the tank centre, and each barrel's sideways offset */
  muzzleForward: 12,
  barrelOffset: 2.5,
  /** nukes lob forward this far (px) over this long (s), then explode */
  nukeRange: 120,
  nukeFlightTime: 0.9,
  /** peak height of the arc, used for drawing (px) */
  nukeApex: 26,
  nukeBlastRadius: 30,
  /** after firing a nuke the tank must wait this long (s), except while raised by a jump zone */
  nukeCooldown: 2.5,
};

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  life: number;
}

export interface Nuke {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  heading: number;
  t: number;
}

export type BlastKind = 'shot' | 'nuke';

/** An impact this tick: where to draw an explosion and apply damage. */
export interface Blast {
  kind: BlastKind;
  x: number;
  y: number;
  radius: number;
}

/** What the weapons need to know about the ground: cliffs stop shots, the void doesn't. */
export interface ShotTerrain {
  blocksShotsAt(x: number, y: number): boolean;
}

/** What a trigger pull did: fired a shot, launched a nuke, or was refused (nuke recharging). */
export type FireEvent = 'shot' | 'nuke' | 'denied';

export interface FireInput {
  /** Fire button currently held. */
  held: boolean;
  /** Fresh presses since the last step. */
  presses: number;
}

/** Position of a nuke along its arc; height is 0 at launch and landing. */
export function nukePosition(n: Nuke): { x: number; y: number; height: number; progress: number } {
  const p = Math.min(1, n.t / WEAPON_TUNING.nukeFlightTime);
  return {
    x: n.fromX + (n.toX - n.fromX) * p,
    y: n.fromY + (n.toY - n.fromY) * p,
    height: Math.sin(p * Math.PI) * WEAPON_TUNING.nukeApex,
    progress: p,
  };
}

export class Weapons {
  readonly shots: Shot[] = [];
  readonly nukes: Nuke[] = [];
  /** Trigger results since the caller last cleared this list. */
  readonly events: FireEvent[] = [];
  /** Seconds until another nuke can be fired. */
  nukeCooldown = 0;
  private barrel: -1 | 1 = 1;
  private autoTimer = 0;
  /** Presses not yet acted on; one is handled per tick so quick taps aren't lost. */
  private pendingPresses = 0;

  /** Advance one tick. `raised` = lifted by a jump zone: nukes, no cooldown. */
  step(dt: number, tank: Tank, fire: FireInput, terrain: ShotTerrain, raised = false): Blast[] {
    const W = WEAPON_TUNING;
    const blasts: Blast[] = [];
    this.nukeCooldown = Math.max(0, this.nukeCooldown - dt);
    this.autoTimer = Math.max(0, this.autoTimer - dt);

    this.pendingPresses = Math.min(W.maxShots, this.pendingPresses + fire.presses);
    const pressed = this.pendingPresses > 0;
    if (pressed) this.pendingPresses--;
    const triggered = pressed || (fire.held && this.autoTimer === 0);
    if (triggered) {
      this.autoTimer = W.autoFireInterval;
      const nukeReady = raised || (tank.mode === 'wheelie' && tank.lift >= 1);
      if (nukeReady) {
        if (raised || this.nukeCooldown === 0) this.launchNuke(tank, raised);
        else if (pressed) this.events.push('denied');
      } else if (tank.mode !== 'wheelie' && tank.lift === 0 && this.shots.length < W.maxShots) {
        this.fireShot(tank);
      }
    }

    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (terrain.blocksShotsAt(s.x, s.y)) {
        blasts.push({ kind: 'shot', x: s.x, y: s.y, radius: 2 });
        this.shots.splice(i, 1);
      } else if (s.life <= 0) {
        this.shots.splice(i, 1);
      }
    }

    for (let i = this.nukes.length - 1; i >= 0; i--) {
      const n = this.nukes[i];
      n.t += dt;
      if (n.t >= W.nukeFlightTime) {
        blasts.push({ kind: 'nuke', x: n.toX, y: n.toY, radius: W.nukeBlastRadius });
        this.nukes.splice(i, 1);
      }
    }
    return blasts;
  }

  /** Remove a shot that hit something (enemy collision is handled by the caller). */
  removeShot(shot: Shot): void {
    const i = this.shots.indexOf(shot);
    if (i >= 0) this.shots.splice(i, 1);
  }

  private fireShot(t: Tank): void {
    const W = WEAPON_TUNING;
    const f = forwardVector(t.heading);
    const r = rightVector(t.heading);
    const side = W.barrelOffset * this.barrel;
    this.barrel = this.barrel === 1 ? -1 : 1;
    this.events.push('shot');
    this.shots.push({
      x: t.x + f.x * W.muzzleForward + r.x * side,
      y: t.y + f.y * W.muzzleForward + r.y * side,
      vx: f.x * W.shotSpeed,
      vy: f.y * W.shotSpeed,
      heading: t.heading,
      life: W.shotLife,
    });
  }

  private launchNuke(t: Tank, raised: boolean): void {
    const W = WEAPON_TUNING;
    const f = forwardVector(t.heading);
    this.nukes.push({
      fromX: t.x + f.x * 6,
      fromY: t.y + f.y * 6,
      toX: t.x + f.x * W.nukeRange,
      toY: t.y + f.y * W.nukeRange,
      heading: t.heading,
      t: 0,
    });
    if (!raised) this.nukeCooldown = W.nukeCooldown;
    this.events.push('nuke');
  }
}

/** Whether a blast reaches something at (x, y) with collision radius `r`. */
export function blastHits(blast: Blast, x: number, y: number, r: number): boolean {
  return Math.hypot(x - blast.x, y - blast.y) <= blast.radius + r;
}
