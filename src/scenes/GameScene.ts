import Phaser from 'phaser';
import { renderTerrain } from '../art/terrainRender';
import { addRgbaTexture } from '../art/textures';
import { DEFAULT_BINDINGS } from '../input/bindings';
import { KeyboardLevers } from '../input/keyboardLevers';
import { SESSION_KEY, type Session } from '../session';
import { createTank, forwardVector, rollProgress, stepTank, type Tank } from '../sim/tank';
import { TileTerrain } from '../sim/terrain';
import { TEST_MAP } from '../stages/testMap';

/** Simulation tick, decoupled from the display refresh rate. */
const STEP = 1 / 60;

/** Where the player's tank sits on screen; the world rotates around this point. */
export const TANK_SCREEN_X = 112;
export const TANK_SCREEN_Y = 225;

/** World-space offset of cast shadows (light from the lower right). */
const SHADOW_X = -2;
const SHADOW_Y = -3;

export class GameScene extends Phaser.Scene {
  private terrain!: TileTerrain;
  private tank!: Tank;
  private levers!: KeyboardLevers;
  private session!: Session;
  private tankSprite!: Phaser.GameObjects.Image;
  private tankShadow!: Phaser.GameObjects.Image;
  private acc = 0;

  constructor() {
    super('game');
  }

  create(): void {
    this.session = this.registry.get(SESSION_KEY);
    this.terrain = new TileTerrain(TEST_MAP, 16, 1);
    addRgbaTexture(this, 'terrain', renderTerrain(this.terrain));
    this.add.image(0, 0, 'terrain').setOrigin(0, 0);

    this.tank = createTank(this.terrain.start.x, this.terrain.start.y);
    this.tankShadow = this.add.image(0, 0, 'tank').setTintFill(0x000000).setAlpha(0.35);
    this.tankSprite = this.add.image(0, 0, 'tank');

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setOrigin(TANK_SCREEN_X / cam.width, TANK_SCREEN_Y / cam.height);

    this.levers = new KeyboardLevers(window, DEFAULT_BINDINGS);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.levers.destroy());
    window.addEventListener('keydown', this.onToggleDebug);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', this.onToggleDebug));

    (window as unknown as { __assault: unknown }).__assault = { game: this.game, tank: this.tank, levers: this.levers };
    this.syncView();
  }

  update(_time: number, delta: number): void {
    this.acc += Math.min(delta, 250) / 1000;
    while (this.acc >= STEP) {
      stepTank(this.tank, this.levers.maneuver, STEP, this.terrain);
      this.acc -= STEP;
    }
    this.levers.consumeFirePresses();
    this.levers.consumeStartPresses();

    Object.assign(this.session.debug, {
      left: this.levers.left.dir,
      right: this.levers.right.dir,
      maneuver: this.levers.maneuver,
      mode: this.tank.mode,
    });
    this.syncView();
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
  }

  private onToggleDebug = (e: KeyboardEvent): void => {
    if (e.code === 'Backquote') this.session.showDebug = !this.session.showDebug;
  };
}
