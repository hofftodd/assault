import Phaser from 'phaser';
import {
  bulletArt,
  cannon2Art,
  cannon3Art,
  cannonArt,
  fourlegsArt,
  generatorArt,
  craterArt,
  holeArt,
  laserArt,
  missileArt,
  PARKING_TANK,
  SCOUTER,
  torchikaArt,
  TYPE1_TANK,
  TYPE1A_TANK,
  TYPE2_TANK,
  TYPE3_TANK,
  TYPE4_TANK,
  TYPE5_TANK,
  TYPE6_TANK,
  TYPE7A_TANK,
  TYPE7B_TANK,
  ufoArt,
} from '../art/enemySprites';
import { crosshairArt, shockwaveArt } from '../art/crosshair';
import { guideArrowArt, hatchArt, jumpZoneArt } from '../art/stageArt';
import { renderExplosion } from '../art/explosions';
import { ART_SCALE } from '../art/painter';
import { nukeShellArt, playerTankArt, shotArt } from '../art/playerArt';
import { LIFE_ICON } from '../art/sprites';
import { addAnimationStrip, addPixelArt, addPixelFont, addRgbaTexture } from '../art/textures';
import { Sfx } from '../audio/sfx';
import { createSession, SESSION_KEY, SFX_KEY } from '../session';
import { STAGES } from '../stages/stages';
import { TEST_MAP } from '../stages/testMap';
import { requestTerrain } from '../art/terrainCache';

/** Builds every procedural texture, then starts play. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    addPixelFont(this);
    // World art is drawn at ART_SCALE; HUD art (the life icon) at the original resolution.
    addRgbaTexture(this, 'tank', playerTankArt());
    addRgbaTexture(this, 'tankBelly', playerTankArt(true));
    addPixelArt(this, 'lifeIcon', LIFE_ICON);
    addRgbaTexture(this, 'shot', shotArt());
    addRgbaTexture(this, 'nukeShell', nukeShellArt());
    const K = ART_SCALE;
    addAnimationStrip(this, 'sparkAnim', renderExplosion(12 * K, 5, 3), 30);
    addAnimationStrip(this, 'blastAnim', renderExplosion(56 * K, 10, 5), 16);
    addAnimationStrip(this, 'boomAnim', renderExplosion(32 * K, 8, 7), 20);
    // Enemy textures are keyed by EnemyKind / ProjectileKind.
    addRgbaTexture(this, 'type1', TYPE1_TANK());
    addRgbaTexture(this, 'type2', TYPE2_TANK());
    addRgbaTexture(this, 'type3', TYPE3_TANK());
    addRgbaTexture(this, 'type5', TYPE5_TANK());
    addRgbaTexture(this, 'type1a', TYPE1A_TANK());
    addRgbaTexture(this, 'type4', TYPE4_TANK());
    addRgbaTexture(this, 'type6', TYPE6_TANK());
    addRgbaTexture(this, 'type7a', TYPE7A_TANK());
    addRgbaTexture(this, 'type7b', TYPE7B_TANK());
    addRgbaTexture(this, 'scouter', SCOUTER());
    addRgbaTexture(this, 'fourlegs', fourlegsArt());
    addRgbaTexture(this, 'generator', generatorArt());
    addRgbaTexture(this, 'cannon2', cannon2Art());
    addRgbaTexture(this, 'cannon3', cannon3Art());
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

    // Start painting the first stage's terrain while the title screen shows.
    const first = params.get('map') === 'test' ? null : STAGES[session.stageIndex];
    if (first) void requestTerrain(`terrain-${first.number}`, first.map, first.seed);
    else void requestTerrain('terrain-0', TEST_MAP, 1);
    if (params.has('play') || params.get('map') === 'test') {
      this.scene.start('game');
      this.scene.launch('hud');
    } else {
      this.scene.start('title');
    }
  }
}
