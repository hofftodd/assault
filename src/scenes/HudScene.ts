import Phaser from 'phaser';
import { HUD_PINK, HUD_SHADOW_BLUE, HUD_WHITE } from '../art/palette';
import { FONT_KEY } from '../art/textures';
import { SESSION_KEY, type Session } from '../session';

const MAX_LIFE_ICONS = 8;

/** Score and lives overlay, drawn by its own (never rotated) camera. */
export class HudScene extends Phaser.Scene {
  private session!: Session;
  private score!: Phaser.GameObjects.BitmapText;
  private topScore!: Phaser.GameObjects.BitmapText;
  private lifeIcons: Phaser.GameObjects.Image[] = [];
  private debug!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('hud');
  }

  create(): void {
    this.session = this.registry.get(SESSION_KEY);
    const label = (x: number, text: string) =>
      this.add.bitmapText(x, 4, FONT_KEY, text).setTint(HUD_PINK).setDropShadow(1, 1, 0x000000, 1);
    const number = (x: number) =>
      this.add.bitmapText(x, 13, FONT_KEY, '').setOrigin(1, 0).setTint(HUD_WHITE).setDropShadow(1, 1, HUD_SHADOW_BLUE, 1);

    label(10, '1UPSCORE');
    this.score = number(58);
    label(166, 'TOPSCORE');
    this.topScore = number(214);

    for (let i = 0; i < MAX_LIFE_ICONS; i++) this.lifeIcons.push(this.add.image(9 + i * 9, 277, 'lifeIcon'));

    this.debug = this.add.bitmapText(220, 246, FONT_KEY, '').setOrigin(1, 0).setTint(0x9cf0c0).setDropShadow(1, 1, 0x000000, 1);
  }

  update(): void {
    const s = this.session;
    this.score.setText(String(s.score));
    this.topScore.setText(String(Math.max(s.topScore, s.score)));
    // The life in play isn't shown, only the spares.
    this.lifeIcons.forEach((icon, i) => icon.setVisible(i < s.lives - 1));

    this.debug.setVisible(s.showDebug);
    if (s.showDebug) {
      const d = s.debug;
      this.debug.setText(`L ${d.left.toUpperCase()} R ${d.right.toUpperCase()}\n${d.maneuver.toUpperCase()}\n${d.mode.toUpperCase()}`);
    }
  }
}
