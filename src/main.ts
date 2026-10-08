import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import './style.css';

/** The original's vertical monitor resolution. */
const WIDTH = 224;
const HEIGHT = 288;

/** Largest whole-number scale that fits the window, so every pixel stays square. */
const fitZoom = () => Math.max(1, Math.floor(Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT)));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#000000',
  pixelArt: true,
  scale: { mode: Phaser.Scale.NONE, zoom: fitZoom() },
  scene: [BootScene, GameScene, HudScene],
});

window.addEventListener('resize', () => game.scale.setZoom(fitZoom()));
