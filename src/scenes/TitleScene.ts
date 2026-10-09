import Phaser from 'phaser';
import { HUD_PINK, HUD_SHADOW_BLUE, HUD_WHITE } from '../art/palette';
import { FONT_KEY } from '../art/textures';
import type { Sfx } from '../audio/sfx';
import { RANK_LABELS } from '../highScores';
import { DEFAULT_BINDINGS } from '../input/bindings';
import { newGame, SESSION_KEY, SFX_KEY, type Session } from '../session';

/** Seconds each attract page (title, high scores) stays up. */
const PAGE_TIME = 7;

/** Title / attract screen: alternates the logo with the high-score table until 1P start. */
export class TitleScene extends Phaser.Scene {
  private session!: Session;
  private sfx!: Sfx;
  private logoPage!: Phaser.GameObjects.Container;
  private scorePage!: Phaser.GameObjects.Container;
  private scoreRows!: Phaser.GameObjects.BitmapText;
  private push!: Phaser.GameObjects.BitmapText;
  private starting = false;
  private elapsed = 0;

  constructor() {
    super('title');
  }

  create(): void {
    this.session = this.registry.get(SESSION_KEY);
    this.sfx = this.registry.get(SFX_KEY);
    this.starting = false;
    this.elapsed = 0;
    this.cameras.main.setBackgroundColor(0x000000).fadeIn(300);

    // Sky: deep purple fading to blue, with a bright horizon line.
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x0a0420, 0x0a0420, 0x3a4a9a, 0x3a4a9a, 1);
    sky.fillRect(0, 26, 224, 150);
    sky.fillStyle(0xc8d0ff, 1).fillRect(0, 176, 224, 1);

    const text = (x: number, y: number, s: string, tint = HUD_WHITE) =>
      this.add.bitmapText(x, y, FONT_KEY, s).setOrigin(0.5, 0).setCenterAlign().setTint(tint).setDropShadow(1, 1, 0x000000, 1);

    // Logo: chunky gradient letters with a dark outline, over the tank.
    const logoShadow = this.add.bitmapText(113, 59, FONT_KEY, 'ASSAULT').setOrigin(0.5).setScale(5).setTint(0x100820);
    const logo = this.add.bitmapText(112, 57, FONT_KEY, 'ASSAULT').setOrigin(0.5).setScale(5);
    logo.setTint(0xfff0d0, 0xfff0d0, 0xe03030, 0xe03030);
    const tank = this.add.image(112, 128, 'tank').setScale(3);
    const tankShadow = this.add.image(106, 120, 'tank').setScale(3).setTintFill(0x000000).setAlpha(0.35);
    this.logoPage = this.add.container(0, 0, [
      logoShadow,
      logo,
      tankShadow,
      tank,
      text(112, 214, "A FAN REMAKE OF\n\nNAMCO'S 1988 ARCADE GAME"),
      text(112, 244, 'ALL ART AND SOUND ORIGINAL', HUD_PINK),
    ]);

    this.scoreRows = this.add.bitmapText(14, 190, FONT_KEY, '').setTint(HUD_WHITE).setDropShadow(1, 1, HUD_SHADOW_BLUE, 1);
    const recordTitle = this.add
      .bitmapText(112, 64, FONT_KEY, 'RECORD\nOF\nTHE BEST SCORE')
      .setOrigin(0.5)
      .setCenterAlign()
      .setScale(2)
      .setTint(0xffe0f0, 0xffe0f0, 0xd04070, 0xd04070);
    this.scorePage = this.add.container(0, 0, [recordTitle, text(112, 178, 'RANK  SCORE STG COMMANDER', HUD_PINK), this.scoreRows]);

    this.add.bitmapText(10, 4, FONT_KEY, '1UPSCORE').setTint(HUD_PINK);
    this.add.bitmapText(166, 4, FONT_KEY, 'TOPSCORE').setTint(HUD_PINK);
    const scores = this.add.bitmapText(214, 13, FONT_KEY, '').setOrigin(1, 0).setTint(HUD_WHITE).setDropShadow(1, 1, HUD_SHADOW_BLUE, 1);
    const last = this.add.bitmapText(58, 13, FONT_KEY, '').setOrigin(1, 0).setTint(HUD_WHITE).setDropShadow(1, 1, HUD_SHADOW_BLUE, 1);
    scores.setText(String(this.session.topScore));
    last.setText(String(this.session.score));

    this.push = text(112, 278, 'PUSH 1P BUTTON', HUD_PINK);

    window.addEventListener('keydown', this.onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', this.onKey));
    (window as unknown as { __assault: unknown }).__assault = { game: this.game, scene: 'title' };
  }

  update(time: number, delta: number): void {
    this.elapsed += delta / 1000;
    const onScores = Math.floor(this.elapsed / PAGE_TIME) % 2 === 1;
    this.logoPage.setVisible(!onScores);
    this.scorePage.setVisible(onScores);
    if (onScores) {
      this.scoreRows.setText(
        this.session.highScores
          .map((e, i) => `${RANK_LABELS[i]} ${String(e.score).padStart(7)}  ${e.stage}  ${e.name}`)
          .join('\n\n'),
      );
    }
    this.push.setVisible(Math.floor(time / 500) % 2 === 0);
  }

  private onKey = (e: KeyboardEvent): void => {
    const start = [...DEFAULT_BINDINGS.start, ...DEFAULT_BINDINGS.fire].includes(e.code);
    if (!start || this.starting) return;
    e.preventDefault();
    this.starting = true;
    this.sfx.play('coin');
    newGame(this.session);
    this.cameras.main.fadeOut(300);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('game');
      this.scene.launch('hud');
    });
  };
}
