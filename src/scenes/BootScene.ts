import Phaser from 'phaser';
import {
  bulletArt,
  cannonArt,
  craterArt,
  holeArt,
  laserArt,
  missileArt,
  PARKING_TANK,
  torchikaArt,
  TYPE1_TANK,
  TYPE2_TANK,
  TYPE3_TANK,
  TYPE5_TANK,
  ufoArt,
} from '../art/enemySprites';
import { crosshairArt, shockwaveArt } from '../art/crosshair';
import { guideArrowArt, hatchArt, jumpZoneArt } from '../art/stageArt';
import { renderExplosion } from '../art/explosions';
import { LIFE_ICON, NUKE_SHELL, PLAYER_TANK, PLAYER_TANK_BELLY, SHOT } from '../art/sprites';
import { addAnimationStrip, addPixelArt, addPixelFont, addRgbaTexture } from '../art/textures';
import { Sfx } from '../audio/sfx';
import { createSession, SESSION_KEY, SFX_KEY } from '../session';
import { STAGES } from '../stages/stages';

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
    addAnimationStrip(this, 'boomAnim', renderExplosion(32, 8, 7), 20);
    // Enemy textures are keyed by EnemyKind / ProjectileKind.
    addRgbaTexture(this, 'type1', TYPE1_TANK());
    addRgbaTexture(this, 'type2', TYPE2_TANK());
    addRgbaTexture(this, 'type3', TYPE3_TANK());
    addRgbaTexture(this, 'type5', TYPE5_TANK());
    addRgbaTexture(this, 'ufo', ufoArt());
    addRgbaTexture(this, 'parking', PARKING_TANK());
    addRgbaTexture(this, 'laser', laserArt());
    addRgbaTexture(this, 'hole', holeArt());
    addRgbaTexture(this, 'torchika1', torchikaArt(4));
    addRgbaTexture(this, 'torchika2', torchikaArt(8));
    addRgbaTexture(this, 'cannon1', cannonArt());
    addRgbaTexture(this, 'orange', bulletArt('orange'));
    addRgbaTexture(this, 'pink', bulletArt('pink'));
    addRgbaTexture(this, 'missile', missileArt());
    addRgbaTexture(this, 'crater', craterArt());
    addRgbaTexture(this, 'crosshair', crosshairArt());
    addRgbaTexture(this, 'shockwave', shockwaveArt());
    addRgbaTexture(this, 'jumpZone', jumpZoneArt(false));
    addRgbaTexture(this, 'jumpZoneSpent', jumpZoneArt(true));
    addRgbaTexture(this, 'hatch', hatchArt());
    addRgbaTexture(this, 'guideArrow', guideArrowArt());
    const session = createSession();
    this.registry.set(SESSION_KEY, session);
    this.registry.set(SFX_KEY, new Sfx(window));
    // ?play (and the test map) skip the title screen; ?stage=N starts at stage N.
    const params = new URLSearchParams(window.location.search);
    const stage = Number(params.get('stage'));
    if (stage >= 1 && stage <= STAGES.length) session.stageIndex = stage - 1;
    if (params.has('play') || params.get('map') === 'test') {
      this.scene.start('game');
      this.scene.launch('hud');
    } else {
      this.scene.start('title');
    }
  }
}
