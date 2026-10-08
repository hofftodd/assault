import Phaser from 'phaser';
import { renderExplosion } from '../art/explosions';
import { LIFE_ICON, NUKE_SHELL, PLAYER_TANK, PLAYER_TANK_BELLY, SHOT } from '../art/sprites';
import { addAnimationStrip, addPixelArt, addPixelFont } from '../art/textures';
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
    addPixelArt(this, 'shot', SHOT);
    addPixelArt(this, 'nukeShell', NUKE_SHELL);
    addAnimationStrip(this, 'sparkAnim', renderExplosion(12, 5, 3), 30);
    addAnimationStrip(this, 'blastAnim', renderExplosion(56, 10, 5), 16);
    this.registry.set(SESSION_KEY, createSession());
    this.scene.start('game');
    this.scene.launch('hud');
  }
}
