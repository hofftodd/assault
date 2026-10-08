import Phaser from 'phaser';
import { LIFE_ICON, PLAYER_TANK, PLAYER_TANK_BELLY } from '../art/sprites';
import { addPixelArt, addPixelFont } from '../art/textures';
import { createSession, SESSION_KEY } from '../session';

/** Builds every procedural texture, then starts play. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    addPixelFont(this);
    addPixelArt(this, 'tank', PLAYER_TANK);
    addPixelArt(this, 'tankBelly', PLAYER_TANK_BELLY);
    addPixelArt(this, 'lifeIcon', LIFE_ICON);
    this.registry.set(SESSION_KEY, createSession());
    this.scene.start('game');
    this.scene.launch('hud');
  }
}
