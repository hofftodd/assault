import Phaser from 'phaser';
import { ART_SCALE } from '../art/painter';
import { HUD_PINK, HUD_SHADOW_BLUE, HUD_WHITE } from '../art/palette';
import { FONT_KEY } from '../art/textures';
import type { Sfx } from '../audio/sfx';
import { insertScore, NAME_LENGTH, RANK_LABELS, rankFor, saveScores } from '../highScores';
import { DEFAULT_BINDINGS } from '../input/bindings';
import { SESSION_KEY, SFX_KEY, type Session } from '../session';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!? ';
/** Seconds before the entry closes on its own, as on the arcade. */
const TIME_LIMIT = 30;

/**
 * High-score name entry. Type the name (Backspace to fix, Enter when done), or
 * pick letters arcade-style: arrow up/down cycles the letter, fire accepts it.
 */
export class NameEntryScene extends Phaser.Scene {
  private session!: Session;
  private sfx!: Sfx;
  private name = '';
  private letter = 0;
  private rank = 0;
  private left = TIME_LIMIT;
  private nameText!: Phaser.GameObjects.BitmapText;
  private timerText!: Phaser.GameObjects.BitmapText;
  private done = false;

  constructor() {
    super('nameEntry');
  }

  create(): void {
    // Laid out on the original 224x288 grid, shown at the canvas's finer resolution.
    this.cameras.main.setZoom(ART_SCALE).centerOn(112, 144);
    this.session = this.registry.get(SESSION_KEY);
    this.sfx = this.registry.get(SFX_KEY);
    this.name = '';
    this.letter = 0;
    this.left = TIME_LIMIT;
    this.done = false;
    this.rank = rankFor(this.session.highScores, this.session.score);
    this.cameras.main.setBackgroundColor(0x000000).fadeIn(300);

    const text = (y: number, s: string, tint = HUD_WHITE, scale = 1) =>
      this.add.bitmapText(112, y, FONT_KEY, s).setOrigin(0.5, 0).setCenterAlign().setScale(scale).setTint(tint).setDropShadow(1, 1, HUD_SHADOW_BLUE, 1);
    text(40, 'CONGRATULATIONS!', HUD_PINK, 2);
    text(76, `YOUR SCORE  ${this.session.score}\n\nRANKS ${RANK_LABELS[this.rank]}`);
    text(120, 'ENTER YOUR NAME, COMMANDER', HUD_PINK);
    this.nameText = text(146, '', HUD_WHITE, 2);
    text(196, 'TYPE YOUR NAME, OR USE\n\nUP/DOWN AND FIRE TO PICK\n\nLETTERS. ENTER WHEN DONE.', HUD_PINK);
    this.timerText = text(260, '');

    window.addEventListener('keydown', this.onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', this.onKey));
    (window as unknown as { __assault: unknown }).__assault = { game: this.game, scene: 'nameEntry' };
  }

  update(time: number, delta: number): void {
    if (this.done) return;
    this.left -= delta / 1000;
    if (this.left <= 0) return this.finish();
    const cursor = this.name.length < NAME_LENGTH && Math.floor(time / 250) % 2 === 0 ? LETTERS[this.letter] : ' ';
    this.nameText.setText((this.name + cursor).padEnd(NAME_LENGTH, '.'));
    this.timerText.setText(String(Math.ceil(this.left)));
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.done) return;
    const b = DEFAULT_BINDINGS;
    const up = e.code === 'ArrowUp';
    const down = e.code === 'ArrowDown';
    if (e.code === 'Enter') {
      e.preventDefault();
      return this.finish();
    }
    if (e.code === 'Backspace') {
      e.preventDefault();
      this.name = this.name.slice(0, -1);
      return;
    }
    if (up || down) {
      e.preventDefault();
      this.letter = (this.letter + (up ? 1 : -1) + LETTERS.length) % LETTERS.length;
      this.sfx.play('tick');
      return;
    }
    if (b.fire.includes(e.code)) {
      e.preventDefault();
      if (this.name.length < NAME_LENGTH) this.name += LETTERS[this.letter];
      this.sfx.play('tick');
      if (this.name.length === NAME_LENGTH) this.finish();
      return;
    }
    if (/^Key[A-Z]$|^Digit[0-9]$/.test(e.code) && this.name.length < NAME_LENGTH) {
      this.name += e.code.slice(-1);
      this.sfx.play('tick');
    }
  };

  private finish(): void {
    if (this.done) return;
    this.done = true;
    const s = this.session;
    const name = this.name.trim() || 'NONAME';
    s.highScores = insertScore(s.highScores, { score: s.score, stage: s.stageReached, name });
    s.topScore = Math.max(s.topScore, s.highScores[0].score);
    saveScores(s.highScores);
    this.cameras.main.fadeOut(400);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('title'));
  }
}
