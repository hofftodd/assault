import Phaser from 'phaser';
import { renderTerrain } from '../art/terrainRender';
import { addRgbaTexture } from '../art/textures';
import { Sfx } from '../audio/sfx';
import { DEFAULT_BINDINGS } from '../input/bindings';
import { KeyboardLevers } from '../input/keyboardLevers';
import { SESSION_KEY, type Session } from '../session';
import { createTank, forwardVector, rollProgress, stepTank, type Tank } from '../sim/tank';
import { TileTerrain } from '../sim/terrain';
import { nukePosition, Weapons, WEAPON_TUNING, type Blast } from '../sim/weapons';
import { TEST_MAP } from '../stages/testMap';

/** Simulation tick, decoupled from the display refresh rate. */
const STEP = 1 / 60;

/** Where the player's tank sits on screen; the world rotates around this point. */
export const TANK_SCREEN_X = 112;
export const TANK_SCREEN_Y = 225;

/** World-space offset of cast shadows (light from the lower right). */
const SHADOW_X = -2;
const SHADOW_Y = -3;

const enum Depth {
  Terrain = 0,
  Shadow = 1,
  Tank = 2,
  Shot = 3,
  Nuke = 4,
  Explosion = 5,
}

export class GameScene extends Phaser.Scene {
  private terrain!: TileTerrain;
  private tank!: Tank;
  private weapons!: Weapons;
  private levers!: KeyboardLevers;
  private sfx!: Sfx;
  private session!: Session;
  private tankSprite!: Phaser.GameObjects.Image;
  private tankShadow!: Phaser.GameObjects.Image;
  private shotSprites: Phaser.GameObjects.Image[] = [];
  private nukeSprites: { shell: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image }[] = [];
  private acc = 0;

  constructor() {
    super('game');
  }

  create(): void {
    this.session = this.registry.get(SESSION_KEY);
    this.terrain = new TileTerrain(TEST_MAP, 16, 1);
    addRgbaTexture(this, 'terrain', renderTerrain(this.terrain));
    this.add.image(0, 0, 'terrain').setOrigin(0, 0).setDepth(Depth.Terrain);

    this.tank = createTank(this.terrain.start.x, this.terrain.start.y);
    this.weapons = new Weapons();
    this.tankShadow = this.add.image(0, 0, 'tank').setTintFill(0x000000).setAlpha(0.35).setDepth(Depth.Shadow);
    this.tankSprite = this.add.image(0, 0, 'tank').setDepth(Depth.Tank);

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setOrigin(TANK_SCREEN_X / cam.width, TANK_SCREEN_Y / cam.height);

    this.levers = new KeyboardLevers(window, DEFAULT_BINDINGS);
    this.sfx = new Sfx(window);
    window.addEventListener('keydown', this.onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.levers.destroy();
      window.removeEventListener('keydown', this.onKey);
    });

    (window as unknown as { __assault: unknown }).__assault = {
      game: this.game,
      tank: this.tank,
      weapons: this.weapons,
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
      const wasRolling = this.tank.mode === 'roll';
      stepTank(this.tank, this.levers.maneuver, STEP, this.terrain);
      if (this.tank.mode === 'roll' && !wasRolling) this.sfx.play('roll');
      const blasts = this.weapons.step(STEP, this.tank, { held: this.levers.fire, presses }, this.terrain);
      presses = 0;
      for (const b of blasts) this.explode(b);
      this.acc -= STEP;
    }
    for (const e of this.weapons.events) this.sfx.play(e === 'denied' ? 'empty' : e === 'nuke' ? 'nukeLaunch' : 'shot');
    this.weapons.events.length = 0;

    Object.assign(this.session.debug, {
      left: this.levers.left.dir,
      right: this.levers.right.dir,
      maneuver: this.levers.maneuver,
      mode: this.tank.mode,
      nukeCooldown: this.weapons.nukeCooldown,
    });
    this.syncView();
  }

  private explode(b: Blast): void {
    (window as unknown as { __assault: { blasts: Blast[] } }).__assault.blasts.push(b);
    const anim = b.kind === 'nuke' ? 'blastAnim' : 'sparkAnim';
    const s = this.add.sprite(b.x, b.y, anim).setDepth(Depth.Explosion).setRotation(this.tank.heading);
    s.play(anim).once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
    if (b.kind === 'nuke') {
      this.cameras.main.shake(250, 0.012);
      this.sfx.play('nukeBlast');
    } else {
      this.sfx.play('shotHit');
    }
  }

  private syncView(): void {
    const t = this.tank;
    const cam = this.cameras.main;
    cam.setRotation(-t.heading);
    cam.setScroll(t.x - cam.width * cam.originX, t.y - cam.height * cam.originY);

    // Rolling: the tank flips over sideways once per roll, showing its belly halfway.
    const flip = Math.cos(rollProgress(t) * 2 * Math.PI);
    const hop = Math.sin(rollProgress(t) * Math.PI) * 3;
    // Wheelie: the nose rears up, foreshortening the hull and lifting it off its shadow.
    const fwd = forwardVector(t.heading);
    const rear = t.lift * 3;

    for (const img of [this.tankSprite, this.tankShadow]) {
      img.setRotation(t.heading);
      img.setScale(Math.max(0.12, Math.abs(flip)), 1 - 0.22 * t.lift);
    }
    this.tankSprite.setTexture(flip < 0 ? 'tankBelly' : 'tank');
    this.tankSprite.setPosition(t.x + fwd.x * rear, t.y + fwd.y * rear);
    const lifted = 1 + hop / 3 + t.lift * 1.5;
    this.tankShadow.setPosition(t.x + SHADOW_X * lifted, t.y + SHADOW_Y * lifted);

    this.syncShots();
    this.syncNukes();
  }

  private syncShots(): void {
    const shots = this.weapons.shots;
    while (this.shotSprites.length < shots.length) this.shotSprites.push(this.add.image(0, 0, 'shot').setDepth(Depth.Shot));
    this.shotSprites.forEach((img, i) => {
      const s = shots[i];
      img.setVisible(!!s);
      if (s) img.setPosition(s.x, s.y).setRotation(s.heading);
    });
  }

  private syncNukes(): void {
    const nukes = this.weapons.nukes;
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
