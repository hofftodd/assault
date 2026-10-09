import Phaser from 'phaser';
import { renderTerrain } from '../art/terrainRender';
import { addRgbaTexture } from '../art/textures';
import type { Sfx } from '../audio/sfx';
import { DEFAULT_BINDINGS } from '../input/bindings';
import { KeyboardLevers } from '../input/keyboardLevers';
import { rankFor } from '../highScores';
import { SESSION_KEY, SFX_KEY, type Session } from '../session';
import { ENEMIES, headingTo, type Enemy, type EnemyKind } from '../sim/enemies';
import { forwardVector, rollProgress } from '../sim/tank';
import { TileTerrain } from '../sim/terrain';
import { nukePosition, WEAPON_TUNING, type Blast } from '../sim/weapons';
import { World, WORLD_TUNING, type Crater, type JumpZone, type WorldEvent } from '../sim/world';
import { STAGES, type StageDef } from '../stages/stages';
import { TEST_MAP, TEST_SPAWNS } from '../stages/testMap';

/** Simulation tick, decoupled from the display refresh rate. */
const STEP = 1 / 60;

/** Where the player's tank sits on screen; the world rotates around this point. */
export const TANK_SCREEN_X = 112;
export const TANK_SCREEN_Y = 225;

/** World-space offset of cast shadows (light from the lower right). */
const SHADOW_X = -2;
const SHADOW_Y = -3;

/** Seconds the GAME OVER banner shows before moving on. */
const GAME_OVER_HOLD = 4;
/** Seconds the end-of-content message shows after the last stage. */
const ENDING_HOLD = 7;
/** Camera zoom while raised on a jump zone. */
const RAISED_ZOOM = 0.55;

/** The proving-ground map (?map=test): no clock, no cannons. */
const TEST_STAGE: StageDef = { number: 0, area: 'TEST', timeLimit: Infinity, hard: false, seed: 1, map: [...TEST_MAP], guide: [] };

const pad2 = (n: number) => String(n).padStart(2, '0');

const enum Depth {
  Terrain = 0,
  Crater = 1,
  Pad = 1.5,
  Shadow = 2,
  Enemy = 3,
  Tank = 4,
  Shot = 5,
  EnemyShot = 6,
  Nuke = 7,
  Explosion = 8,
  Crosshair = 9,
}

/** Crosshair tint once the nuke aim reaches maximum range. */
const CROSSHAIR_MAX_TINT = 0xff3030;

/** Emplacements keep their art upright; vehicles and turrets turn. */
const FIXED_FACING: Partial<Record<EnemyKind, boolean>> = { torchika1: true, torchika2: true, ufo: true, parking: true };

interface EnemyView {
  body: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

export class GameScene extends Phaser.Scene {
  private world!: World;
  private levers!: KeyboardLevers;
  private sfx!: Sfx;
  private session!: Session;
  private tankSprite!: Phaser.GameObjects.Image;
  private tankShadow!: Phaser.GameObjects.Image;
  private crosshair!: Phaser.GameObjects.Image;
  private shotSprites: Phaser.GameObjects.Image[] = [];
  private nukeSprites: { shell: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image }[] = [];
  private projectileSprites: Phaser.GameObjects.Image[] = [];
  private enemyViews = new Map<number, EnemyView>();
  private craterViews = new Map<Crater, Phaser.GameObjects.Image>();
  private zoneViews = new Map<JumpZone, Phaser.GameObjects.Image>();
  private stage!: StageDef;
  private testMap = false;
  /** Seconds since the last stage finished, while showing the end-of-content message. */
  private endingTime = -1;
  private leaving = false;
  private acc = 0;

  constructor() {
    super('game');
  }

  create(): void {
    this.session = this.registry.get(SESSION_KEY);
    this.sfx = this.registry.get(SFX_KEY);
    this.session.message = null;
    this.shotSprites = [];
    this.nukeSprites = [];
    this.projectileSprites = [];
    this.enemyViews = new Map();
    this.craterViews = new Map();
    this.zoneViews = new Map();
    this.endingTime = -1;
    this.leaving = false;
    this.acc = 0;

    // ?map=test plays the proving ground; ?peaceful removes the enemies.
    const params = new URLSearchParams(window.location.search);
    this.testMap = params.get('map') === 'test';
    this.stage = this.testMap ? TEST_STAGE : STAGES[this.session.stageIndex];
    const st = this.stage;
    if (!this.testMap) this.session.stageReached = pad2(st.number);

    const terrain = new TileTerrain(st.map, 16, st.seed);
    const key = `terrain-${st.number}`;
    if (!this.textures.exists(key)) addRgbaTexture(this, key, renderTerrain(terrain));
    this.add.image(0, 0, key).setOrigin(0, 0).setDepth(Depth.Terrain);
    if (terrain.hatch) this.add.image(terrain.hatch.x, terrain.hatch.y, 'hatch').setDepth(Depth.Pad);

    const spawns = params.has('peaceful') ? [] : this.testMap ? TEST_SPAWNS : [...terrain.spawns, ...(st.spawns ?? [])];
    const tile = (p: [number, number]) => ({ x: (p[0] + 0.5) * 16, y: (p[1] + 0.5) * 16 });
    this.world = new World(terrain, spawns, {
      lives: this.session.lives,
      score: this.session.score,
      seed: Date.now(),
      hard: st.hard,
      timeLimit: st.timeLimit,
      guide: st.guide.map(tile),
      startHeading: ((st.startHeading ?? 0) * Math.PI) / 180,
    });
    for (const z of this.world.jumpZones) this.zoneViews.set(z, this.add.image(z.x, z.y, 'jumpZone').setDepth(Depth.Pad));
    this.tankShadow = this.add.image(0, 0, 'tank').setTintFill(0x000000).setAlpha(0.35).setDepth(Depth.Shadow);
    this.tankSprite = this.add.image(0, 0, 'tank').setDepth(Depth.Tank);
    this.crosshair = this.add.image(0, 0, 'crosshair').setDepth(Depth.Crosshair).setVisible(false);

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setOrigin(TANK_SCREEN_X / cam.width, TANK_SCREEN_Y / cam.height);
    cam.setZoom(1);
    cam.fadeIn(400);

    this.levers = new KeyboardLevers(window, DEFAULT_BINDINGS);
    window.addEventListener('keydown', this.onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.levers.destroy();
      window.removeEventListener('keydown', this.onKey);
    });

    (window as unknown as { __assault: unknown }).__assault = {
      game: this.game,
      scene: 'game',
      stage: st.number,
      world: this.world,
      tank: this.world.tank,
      weapons: this.world.weapons,
      levers: this.levers,
      blasts: [] as Blast[],
    };
    this.syncView();
  }

  update(_time: number, delta: number): void {
    if (this.leaving) return;
    let presses = this.levers.consumeFirePresses();
    this.levers.consumeStartPresses();
    this.acc += Math.min(delta, 250) / 1000;
    while (this.acc >= STEP) {
      for (const e of this.world.step(STEP, this.levers.maneuver, { held: this.levers.fire, presses })) this.handle(e);
      presses = 0;
      this.acc -= STEP;
    }

    const w = this.world;
    this.session.score = w.score;
    this.session.lives = w.lives;
    this.session.topScore = Math.max(this.session.topScore, w.score);

    if (w.state === 'gameOver' && w.stateTime >= GAME_OVER_HOLD) return this.finishGame();
    if (w.state === 'done') {
      if (this.endingTime < 0) this.stageDone();
      else if ((this.endingTime += delta / 1000) >= ENDING_HOLD) return this.finishGame();
    }

    this.updateHud();
    Object.assign(this.session.debug, {
      left: this.levers.left.dir,
      right: this.levers.right.dir,
      maneuver: this.levers.maneuver,
      mode: w.tank.mode,
      nukeCooldown: w.weapons.nukeCooldown,
    });
    this.syncView();
  }

  /** Move on after the hatch drop: the next stage, or the end of what's built so far. */
  private stageDone(): void {
    const next = this.session.stageIndex + 1;
    if (!this.testMap && next < STAGES.length) {
      this.session.stageIndex = next;
      this.leaving = true;
      this.scene.restart();
      return;
    }
    this.endingTime = 0;
  }

  /** Leave the game: high-score entry if the score made the table, otherwise the title screen. */
  private finishGame(): void {
    this.leaving = true;
    this.session.message = null;
    this.session.clock = null;
    this.session.guideAngle = null;
    this.scene.stop('hud');
    const qualifies = rankFor(this.session.highScores, this.session.score) >= 0;
    this.scene.start(qualifies ? 'nameEntry' : 'title');
  }

  /** Banner text, clock and guide arrow for the HUD scene. */
  private updateHud(): void {
    const w = this.world;
    const T = WORLD_TUNING;
    const s = this.session;
    switch (w.state) {
      case 'ready':
        s.message = 'PLAYER\n\n1\n\nREADY';
        break;
      case 'dying':
        s.message = w.deathCause === 'timeUp' ? 'PLAYER 1UP\n\nTIME UP' : 'YOU WERE HIT';
        break;
      case 'cleared':
        s.message =
          w.stateTime < T.clearMessageTime
            ? `PLAYER 1UP\n\n\nSTAGE ${pad2(this.stage.number)} CLEAR`
            : `TIME BONUS!\n\n${w.bonus.seconds}*50 POINTS\n\n= ${Math.max(0, w.bonus.points)} POINTS`;
        break;
      case 'exiting':
        s.message = 'NOW YOU ASSAULT ON\n\nNEXT STAGE!!';
        break;
      case 'done':
        s.message = `CONGRATULATIONS!\n\nSTAGE ${pad2(this.stage.number)} IS YOURS.\n\n\nMORE STAGES ARE\n\nON THE WAY...`;
        break;
      case 'gameOver':
        s.message = 'GAME OVER';
        break;
      default:
        s.message = null;
    }

    // The clock appears under 100 seconds; it flashes red at 60 and 30 and stays red for the last 10.
    const t = w.timeLeft;
    const showClock = Number.isFinite(t) && t < 100 && w.state !== 'done' && w.state !== 'gameOver';
    s.clock = showClock ? Math.floor(t) : null;
    const blink = Math.floor(t * 4) % 2 === 0;
    s.clockRed = t <= 10 || ((t <= 60 && t > 57) || (t <= 30 && t > 27)) && blink;

    // Guide arrow: shown when the route turns away from the tank's heading, and every few seconds anyway.
    const g = w.guideTarget;
    s.guideAngle = null;
    if (g && w.state === 'playing' && w.raised === 0) {
      let a = headingTo(w.tank.x, w.tank.y, g.x, g.y) - w.tank.heading;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      const flash = this.time.now % 5000 < 1600;
      if (Math.abs(a) > 0.6 || flash) s.guideAngle = a;
    }
  }

  private handle(e: WorldEvent): void {
    switch (e.type) {
      case 'fired':
        this.sfx.play(e.what === 'denied' ? 'empty' : e.what === 'nuke' ? 'nukeLaunch' : 'shot');
        break;
      case 'roll':
        this.sfx.play('roll');
        break;
      case 'blast':
        (window as unknown as { __assault: { blasts: Blast[] } }).__assault.blasts.push(e.blast);
        if (e.blast.kind === 'nuke') {
          this.explosion(e.blast.x, e.blast.y, 'blastAnim');
          this.shockwave(e.blast.x, e.blast.y, e.blast.radius);
          this.cameras.main.shake(250, 0.012);
          this.sfx.play('nukeBlast');
        } else {
          this.explosion(e.blast.x, e.blast.y, 'sparkAnim');
          this.sfx.play('shotHit');
        }
        break;
      case 'enemyHit':
        this.explosion(e.enemy.x, e.enemy.y, 'sparkAnim');
        this.sfx.play('armorHit');
        break;
      case 'enemyKilled':
        if (ENEMIES[e.enemy.kind].large) {
          this.explosion(e.enemy.x, e.enemy.y, 'blastAnim');
          this.cameras.main.flash(70, 255, 255, 255);
        } else {
          this.explosion(e.enemy.x, e.enemy.y, 'boomAnim');
        }
        this.sfx.play('enemyDie');
        break;
      case 'deflected':
        this.explosion(e.enemy.x, e.enemy.y, 'sparkAnim');
        this.sfx.play('empty');
        break;
      case 'enemyEmerging':
        this.tweens.add({
          targets: this.add.image(e.enemy.x, e.enemy.y, 'hole').setDepth(Depth.Crater).setScale(0.2),
          scale: 1,
          duration: 500,
          ease: 'Back.easeOut',
        });
        this.sfx.play('raise');
        break;
      case 'enemyFired':
        this.sfx.play('enemyShot');
        break;
      case 'projectileShotDown':
      case 'projectileHitWall':
        this.explosion(e.x, e.y, 'sparkAnim');
        break;
      case 'playerHit':
        this.explosion(e.x, e.y, 'blastAnim');
        this.cameras.main.shake(400, 0.02);
        this.sfx.play('playerDie');
        this.zoomTo(1);
        break;
      case 'raised':
        this.sfx.play('raise');
        this.zoomTo(RAISED_ZOOM);
        break;
      case 'landed':
        this.zoomTo(1);
        break;
      case 'stageClear':
        this.sfx.play('clear');
        this.zoomTo(1);
        break;
      case 'timeBonus':
        if (e.points > 0) this.sfx.play('extend');
        break;
      case 'hatchDrop':
        this.sfx.play('hatch');
        this.hatchDrop();
        break;
      case 'extend':
        this.sfx.play('extend');
        break;
    }
  }

  private zoomTo(zoom: number): void {
    this.tweens.killTweensOf(this.cameras.main);
    this.tweens.add({ targets: this.cameras.main, zoom, duration: 600, ease: 'Sine.easeInOut' });
  }

  /** The hatch iris opens beneath the tank, which sinks through, then the screen fades out. */
  private hatchDrop(): void {
    const h = this.world.terrain.hatch;
    if (!h) return;
    const hole = this.add.circle(h.x, h.y, 1, 0x000000).setDepth(Depth.Pad + 0.1);
    this.tweens.add({ targets: hole, radius: 13, duration: 700, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: [this.tankSprite], scale: 0.3, delay: 700, duration: 900, ease: 'Cubic.easeIn' });
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.time.delayedCall(1700, () => this.cameras.main.fadeIn(1));
  }

  /** As in the original: the screen dims while a white ring sweeps out over the blast area. */
  private shockwave(x: number, y: number, radius: number): void {
    const t = this.world.tank;
    const dim = this.add.rectangle(t.x, t.y, 800, 800, 0x000000, 0.5).setDepth(Depth.Explosion - 0.5);
    const ring = this.add.image(x, y, 'shockwave').setDepth(Depth.Explosion + 0.5).setScale(0.15);
    const full = radius / 32;
    this.tweens.add({ targets: ring, scale: full, duration: 380, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: ring, alpha: 0, delay: 380, duration: 260, onComplete: () => ring.destroy() });
    this.tweens.add({ targets: dim, alpha: 0, delay: 250, duration: 400, onComplete: () => dim.destroy() });
  }

  private explosion(x: number, y: number, anim: string): void {
    const s = this.add.sprite(x, y, anim).setDepth(Depth.Explosion).setRotation(this.world.tank.heading);
    s.play(anim).once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  private syncView(): void {
    const w = this.world;
    const t = w.tank;
    const cam = this.cameras.main;
    cam.setRotation(-t.heading);
    cam.setScroll(t.x - cam.width * cam.originX, t.y - cam.height * cam.originY);

    // Rolling: the tank flips over sideways once per roll, showing its belly halfway.
    const flip = Math.cos(rollProgress(t) * 2 * Math.PI);
    const hop = Math.sin(rollProgress(t) * Math.PI) * 3;
    // Wheelie: the nose rears up, foreshortening the hull and lifting it off its shadow.
    const fwd = forwardVector(t.heading);
    const rear = t.lift * 3;
    // Hidden while wrecked; blinking while invulnerable after returning.
    const shown = w.state === 'playing' || w.state === 'ready' || w.state === 'cleared' || w.state === 'exiting';
    const visible = shown && (w.invulnerable === 0 || Math.floor(w.invulnerable * 10) % 2 === 0);
    // Raised on a jump zone: the tank looms larger and its shadow falls far away.
    const height = w.raised > 0 ? 1 : 0;

    if (w.state !== 'done') {
      for (const img of [this.tankSprite, this.tankShadow]) {
        img.setRotation(t.heading).setVisible(visible);
        if (w.state !== 'exiting') img.setScale(Math.max(0.12, Math.abs(flip)) * (1 + height * 0.25), (1 - 0.22 * t.lift) * (1 + height * 0.25));
      }
    } else {
      this.tankSprite.setVisible(false);
      this.tankShadow.setVisible(false);
    }
    this.tankSprite.setTexture(flip < 0 ? 'tankBelly' : 'tank');
    this.tankSprite.setPosition(t.x + fwd.x * rear, t.y + fwd.y * rear);
    const lifted = 1 + hop / 3 + t.lift * 1.5 + height * 6;
    this.tankShadow.setPosition(t.x + SHADOW_X * lifted, t.y + SHADOW_Y * lifted).setVisible(visible && w.state !== 'exiting');

    for (const [z, img] of this.zoneViews) {
      if (z.usesLeft === 0) img.setTexture('jumpZoneSpent').clearTint();
      else if (Math.floor(this.time.now / 250) % 2) img.setTint(0xffb0b0);
      else img.clearTint();
    }

    // Nuke aim: the crosshair slides out from the tank, white, and turns red at full range.
    const wpn = w.weapons;
    this.crosshair.setVisible(w.state === 'playing' && wpn.aiming);
    this.crosshair.setScale(1 / this.cameras.main.zoom);
    if (wpn.aiming) {
      const c = wpn.crosshair(t);
      this.crosshair.setPosition(c.x, c.y).setRotation(t.heading);
      if (wpn.aimAtMax) this.crosshair.setTint(CROSSHAIR_MAX_TINT);
      else this.crosshair.clearTint();
    }

    this.syncEnemies();
    this.syncCraters();
    this.syncShots();
    this.syncNukes();
    this.syncProjectiles();
  }

  private syncEnemies(): void {
    const alive = new Set<number>();
    for (const e of this.world.enemies) {
      if (e.state === 'hidden') continue;
      alive.add(e.id);
      const v = this.enemyViews.get(e.id) ?? this.addEnemyView(e);
      const rot = FIXED_FACING[e.kind] ? 0 : e.heading;
      // Rising out of its hole: grows from nothing, its shadow drawing away as it lifts.
      const rise = e.state === 'emerging' ? Math.min(1, e.emergeTime / WORLD_TUNING.emergeTime) : 1;
      const lift = e.kind === 'ufo' ? 1.8 : 1;
      v.body.setPosition(e.x, e.y).setRotation(rot).setScale(rise);
      v.shadow.setPosition(e.x + SHADOW_X * lift * rise, e.y + SHADOW_Y * lift * rise).setRotation(rot).setScale(rise);
      if (e.flash > 0) v.body.setTintFill(0xffffff);
      else v.body.clearTint();
    }
    for (const [id, v] of this.enemyViews) {
      if (alive.has(id)) continue;
      v.body.destroy();
      v.shadow.destroy();
      this.enemyViews.delete(id);
    }
  }

  private addEnemyView(e: Enemy): EnemyView {
    const v = {
      shadow: this.add.image(e.x, e.y, e.kind).setTintFill(0x000000).setAlpha(0.35).setDepth(Depth.Shadow),
      body: this.add.image(e.x, e.y, e.kind).setDepth(Depth.Enemy),
    };
    this.enemyViews.set(e.id, v);
    return v;
  }

  private syncCraters(): void {
    const live = new Set(this.world.craters);
    for (const c of live) {
      if (!this.craterViews.has(c)) this.craterViews.set(c, this.add.image(c.x, c.y, 'crater').setDepth(Depth.Crater));
    }
    for (const [c, img] of this.craterViews) {
      if (live.has(c)) continue;
      img.destroy();
      this.craterViews.delete(c);
    }
  }

  private syncShots(): void {
    const shots = this.world.weapons.shots;
    while (this.shotSprites.length < shots.length) this.shotSprites.push(this.add.image(0, 0, 'shot').setDepth(Depth.Shot));
    this.shotSprites.forEach((img, i) => {
      const s = shots[i];
      img.setVisible(!!s);
      if (s) img.setPosition(s.x, s.y).setRotation(s.heading);
    });
  }

  private syncProjectiles(): void {
    const ps = this.world.projectiles;
    while (this.projectileSprites.length < ps.length) this.projectileSprites.push(this.add.image(0, 0, 'orange').setDepth(Depth.EnemyShot));
    this.projectileSprites.forEach((img, i) => {
      const p = ps[i];
      img.setVisible(!!p);
      if (p) img.setTexture(p.kind).setPosition(p.x, p.y).setRotation(p.kind === 'missile' || p.kind === 'laser' ? p.heading : this.world.tank.heading);
    });
  }

  private syncNukes(): void {
    const nukes = this.world.weapons.nukes;
    while (this.nukeSprites.length < nukes.length) {
      this.nukeSprites.push({
        shadow: this.add.image(0, 0, 'nukeShell').setTintFill(0x000000).setAlpha(0.4).setDepth(Depth.Shadow),
        shell: this.add.image(0, 0, 'nukeShell').setDepth(Depth.Nuke),
      });
    }
    this.nukeSprites.forEach(({ shell, shadow }, i) => {
      const n = nukes[i];
      shell.setVisible(!!n);
      shadow.setVisible(!!n);
      if (!n) return;
      // Seen from above, height shows as size; the shadow drifts away from the shell as it climbs.
      const p = nukePosition(n);
      const h = p.height / WEAPON_TUNING.nukeApex;
      shell.setPosition(p.x, p.y).setRotation(n.heading).setScale(1 + h * 0.9);
      shadow.setPosition(p.x + SHADOW_X * (1 + h * 4), p.y + SHADOW_Y * (1 + h * 4)).setRotation(n.heading).setScale(1 - h * 0.3);
    });
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Backquote') this.session.showDebug = !this.session.showDebug;
    if (e.code === 'KeyM') this.sfx.toggleMute();
  };
}
