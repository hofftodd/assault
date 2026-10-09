import Phaser from 'phaser';
import { renderTerrain } from '../art/terrainRender';
import { addRgbaTexture } from '../art/textures';
import type { Sfx } from '../audio/sfx';
import { DEFAULT_BINDINGS } from '../input/bindings';
import { KeyboardLevers } from '../input/keyboardLevers';
import { SESSION_KEY, SFX_KEY, STARTING_LIVES, type Session } from '../session';
import type { Enemy, EnemyKind } from '../sim/enemies';
import { forwardVector, rollProgress } from '../sim/tank';
import { TileTerrain } from '../sim/terrain';
import { nukePosition, WEAPON_TUNING, type Blast } from '../sim/weapons';
import { World, type Crater, type WorldEvent } from '../sim/world';
import { TEST_MAP, TEST_SPAWNS } from '../stages/testMap';

/** Simulation tick, decoupled from the display refresh rate. */
const STEP = 1 / 60;

/** Where the player's tank sits on screen; the world rotates around this point. */
export const TANK_SCREEN_X = 112;
export const TANK_SCREEN_Y = 225;

/** World-space offset of cast shadows (light from the lower right). */
const SHADOW_X = -2;
const SHADOW_Y = -3;

/** Seconds the GAME OVER banner shows before a fresh game starts. */
const GAME_OVER_HOLD = 4;

const enum Depth {
  Terrain = 0,
  Crater = 1,
  Shadow = 2,
  Enemy = 3,
  Tank = 4,
  Shot = 5,
  EnemyShot = 6,
  Nuke = 7,
  Explosion = 8,
}

/** Emplacements keep their art upright; vehicles and turrets turn. */
const FIXED_FACING: Partial<Record<EnemyKind, boolean>> = { torchika1: true, torchika2: true };

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
  private shotSprites: Phaser.GameObjects.Image[] = [];
  private nukeSprites: { shell: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image }[] = [];
  private projectileSprites: Phaser.GameObjects.Image[] = [];
  private enemyViews = new Map<number, EnemyView>();
  private craterViews = new Map<Crater, Phaser.GameObjects.Image>();
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
    this.acc = 0;

    const terrain = new TileTerrain(TEST_MAP, 16, 1);
    if (!this.textures.exists('terrain')) addRgbaTexture(this, 'terrain', renderTerrain(terrain));
    this.add.image(0, 0, 'terrain').setOrigin(0, 0).setDepth(Depth.Terrain);

    // ?peaceful starts without enemies (handy for testing controls).
    const spawns = new URLSearchParams(window.location.search).has('peaceful') ? [] : TEST_SPAWNS;
    this.world = new World(terrain, spawns, { lives: this.session.lives, score: this.session.score, seed: Date.now() });
    this.tankShadow = this.add.image(0, 0, 'tank').setTintFill(0x000000).setAlpha(0.35).setDepth(Depth.Shadow);
    this.tankSprite = this.add.image(0, 0, 'tank').setDepth(Depth.Tank);

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setOrigin(TANK_SCREEN_X / cam.width, TANK_SCREEN_Y / cam.height);

    this.levers = new KeyboardLevers(window, DEFAULT_BINDINGS);
    window.addEventListener('keydown', this.onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.levers.destroy();
      window.removeEventListener('keydown', this.onKey);
    });

    (window as unknown as { __assault: unknown }).__assault = {
      game: this.game,
      world: this.world,
      tank: this.world.tank,
      weapons: this.world.weapons,
      levers: this.levers,
      blasts: [] as Blast[],
    };
    this.syncView();
  }

  update(_time: number, delta: number): void {
    let presses = this.levers.consumeFirePresses();
    this.levers.consumeStartPresses();
    this.acc += Math.min(delta, 250) / 1000;
    while (this.acc >= STEP) {
      for (const e of this.world.step(STEP, this.levers.maneuver, { held: this.levers.fire, presses })) this.handle(e);
      presses = 0;
      this.acc -= STEP;
    }

    if (this.world.state === 'gameOver' && this.world.stateTime >= GAME_OVER_HOLD) {
      this.session.topScore = Math.max(this.session.topScore, this.world.score);
      this.session.score = 0;
      this.session.lives = STARTING_LIVES;
      this.scene.restart();
      return;
    }

    this.session.score = this.world.score;
    this.session.lives = this.world.lives;
    Object.assign(this.session.debug, {
      left: this.levers.left.dir,
      right: this.levers.right.dir,
      maneuver: this.levers.maneuver,
      mode: this.world.tank.mode,
      nukeCooldown: this.world.weapons.nukeCooldown,
    });
    this.syncView();
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
        this.explosion(e.enemy.x, e.enemy.y, e.enemy.kind === 'type5' || e.enemy.kind === 'cannon1' ? 'blastAnim' : 'boomAnim');
        this.sfx.play('enemyDie');
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
        this.session.message = 'YOU WERE HIT';
        break;
      case 'respawn':
        this.session.message = null;
        break;
      case 'gameOver':
        this.session.message = 'GAME OVER';
        break;
      case 'extend':
        this.sfx.play('extend');
        break;
    }
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
    const visible = w.state === 'playing' && (w.invulnerable === 0 || Math.floor(w.invulnerable * 10) % 2 === 0);

    for (const img of [this.tankSprite, this.tankShadow]) {
      img.setRotation(t.heading).setVisible(visible);
      img.setScale(Math.max(0.12, Math.abs(flip)), 1 - 0.22 * t.lift);
    }
    this.tankSprite.setTexture(flip < 0 ? 'tankBelly' : 'tank');
    this.tankSprite.setPosition(t.x + fwd.x * rear, t.y + fwd.y * rear);
    const lifted = 1 + hop / 3 + t.lift * 1.5;
    this.tankShadow.setPosition(t.x + SHADOW_X * lifted, t.y + SHADOW_Y * lifted);

    this.syncEnemies();
    this.syncCraters();
    this.syncShots();
    this.syncNukes();
    this.syncProjectiles();
  }

  private syncEnemies(): void {
    const alive = new Set<number>();
    for (const e of this.world.enemies) {
      alive.add(e.id);
      const v = this.enemyViews.get(e.id) ?? this.addEnemyView(e);
      const rot = FIXED_FACING[e.kind] ? 0 : e.heading;
      v.body.setPosition(e.x, e.y).setRotation(rot);
      v.shadow.setPosition(e.x + SHADOW_X, e.y + SHADOW_Y).setRotation(rot);
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
      if (p) img.setTexture(p.kind).setPosition(p.x, p.y).setRotation(p.kind === 'missile' ? p.heading : this.world.tank.heading);
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
