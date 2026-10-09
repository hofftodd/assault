import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { NameEntryScene } from './scenes/NameEntryScene';
import { TitleScene } from './scenes/TitleScene';
import { ART_SCALE } from './art/painter';
import './style.css';

/** The original's vertical monitor resolution (224x288), drawn at ART_SCALE for finer detail. */
const WIDTH = 224 * ART_SCALE;
const HEIGHT = 288 * ART_SCALE;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#000000',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, GameScene, HudScene, NameEntryScene],
});

