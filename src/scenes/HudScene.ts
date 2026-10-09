import Phaser from 'phaser';
import { ART_SCALE } from '../art/painter';
import { HUD_PINK, HUD_SHADOW_BLUE, HUD_WHITE } from '../art/palette';
import { FONT_KEY } from '../art/textures';
import { SESSION_KEY, type Session } from '../session';

const MAX_LIFE_ICONS = 8;
const CLOCK_RED = 0xff3030;

/** Score, clock, lives, banners and the guide arrow, drawn by their own (never rotated) camera. */
export class HudScene extends Phaser.Scene {
  private session!: Session;
  private score!: Phaser.GameObjects.BitmapText;
  private topScore!: Phaser.GameObjects.BitmapText;
  private clockLabel!: Phaser.GameObjects.BitmapText;
  private clock!: Phaser.GameObjects.BitmapText;
  private lifeIcons: Phaser.GameObjects.Image[] = [];
  private debug!: Phaser.GameObjects.BitmapText;
  private banner!: Phaser.GameObjects.BitmapText;
  private arrow!: Phaser.GameObjects.Image;

  constructor() {
    super('hud');
  }

  create(): void {
    // Laid out on the original 224x288 grid, shown at the canvas's finer resolution.
    this.cameras.main.setZoom(ART_SCALE).centerOn(112, 144);
    this.session = this.registry.get(SESSION_KEY);
    this.lifeIcons = [];
    const label = (x: number, text: string) =>
      this.add.bitmapText(x, 4, FONT_KEY, text).setTint(HUD_PINK).setDropShadow(1, 1, 0x000000, 1);
    const number = (x: number) =>
      this.add.bitmapText(x, 13, FONT_KEY, '').setOrigin(1, 0).setTint(HUD_WHITE).setDropShadow(1, 1, HUD_SHADOW_BLUE, 1);

    label(10, '1UPSCORE');
    this.score = number(58);
    label(166, 'TOPSCORE');
    this.topScore = number(214);
    this.clockLabel = label(100, 'TIME');
    // The clock digits are drawn double size, as in the original.
    this.clock = this.add.bitmapText(112, 12, FONT_KEY, '').setOrigin(0.5, 0).setScale(2).setDropShadow(1, 1, HUD_SHADOW_BLUE, 1);

    for (let i = 0; i < MAX_LIFE_ICONS; i++) this.lifeIcons.push(this.add.image(9 + i * 9, 277, 'lifeIcon'));

    this.arrow = this.add.image(112, 112, 'guideArrow').setVisible(false);
    this.banner = this.add
      .bitmapText(112, 128, FONT_KEY, '')
      .setOrigin(0.5)
      .setCenterAlign()
      .setTint(HUD_PINK)
      .setDropShadow(1, 1, 0x000000, 1);
    this.debug = this.add.bitmapText(220, 238, FONT_KEY, '').setOrigin(1, 0).setTint(0x9cf0c0).setDropShadow(1, 1, 0x000000, 1);
  }

  update(): void {
    const s = this.session;
    this.score.setText(String(s.score));
    this.topScore.setText(String(Math.max(s.topScore, s.score)));
    // The life in play isn't shown, only the spares.
    this.lifeIcons.forEach((icon, i) => icon.setVisible(i < s.lives - 1));

    const showClock = s.clock !== null;
    this.clockLabel.setVisible(showClock);
    this.clock.setVisible(showClock);
    if (showClock) this.clock.setText(String(s.clock).padStart(2, '0')).setTint(s.clockRed ? CLOCK_RED : HUD_WHITE);

    this.banner.setText(s.message ?? '');
    this.arrow.setVisible(s.guideAngle !== null && !s.message);
    if (s.guideAngle !== null) this.arrow.setRotation(s.guideAngle);

    this.debug.setVisible(s.showDebug);
    if (s.showDebug) {
      const d = s.debug;
      const nuke = d.nukeCooldown > 0 ? `NUKE ${d.nukeCooldown.toFixed(1)}` : 'NUKE OK';
      this.debug.setText(`L ${d.left.toUpperCase()} R ${d.right.toUpperCase()}\n${d.maneuver.toUpperCase()}\n${d.mode.toUpperCase()}\n${nuke}`);
    }
  }
}
