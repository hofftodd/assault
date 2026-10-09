import Phaser from 'phaser';
import { SHOCKWAVE_RADIUS } from '../art/crosshair';
import { ART_SCALE } from '../art/painter';
import { releaseTerrain, requestTerrain } from '../art/terrainCache';
import { addTiledTexture } from '../art/textures';
import type { Sfx } from '../audio/sfx';
import { stageTrack } from '../audio/songs';
import { DEFAULT_BINDINGS } from '../input/bindings';
import { KeyboardLevers } from '../input/keyboardLevers';
import { rankFor } from '../highScores';
import { SESSION_KEY, SFX_KEY, type Session } from '../session';
import { ENEMIES, headingTo, type Enemy, type EnemyKind } from '../sim/enemies';
import { forwardVector, rollProgress } from '../sim/tank';
import { TileTerrain } from '../sim/terrain';
import { nukePosition, WEAPON_TUNING, type Blast } from '../sim/weapons';
import { World, WORLD_TUNING, type Crater, type JumpZone, type WorldEvent, type WorldState } from '../sim/world';
import { STAGES, type StageDef } from '../stages/stages';
import { TEST_MAP, TEST_SPAWNS } from '../stages/testMap';

/** Simulation tick, decoupled from the display refresh rate. */
const STEP = 1 / 60;

/** Game time simulated since the page loaded, across stages (exposed for tests). */
let simClock = 0;

/** Where the player's tank sits on the 224x288 screen; the world rotates around this point. */
export const TANK_SCREEN_X = 112;
export const TANK_SCREEN_Y = 225;

/** World-space offset of cast shadows (light from the lower right). */
const SHADOW_X = -2;
const SHADOW_Y = -3;

/** Seconds the GAME OVER banner shows before moving on. */
const GAME_OVER_HOLD = 4;
/** Seconds the end-of-content message shows after the last stage built so far. */
const ENDING_HOLD = 7;

/** The final stage, whose launch ends the war. */
const FINAL_STAGE = 11;

/** The ending after the final stage: a page at a time, each shown for `hold` seconds. */
const FINALE: { hold: number; text: string }[] = [
  { hold: 6, text: 'CONGRATULATIONS!\n\n\nYOU REGAIN\n\nYOUR MOTHER PLANET\n\nAND ETERNAL PEACE!' },
  {
    hold: 9,
    text: [
      'NATIVE DEFENCE FORCE',
      'HIGH-MANEUVER BATTLE TANK',
      '',
      '<BASIC DATA>',
      'LENGTH         16.80M',
      'WIDTH          12.55M',
      'OVERALL HEIGHT  3.05M',
      '',
      '<ENGINE>',
      'TYPE      VLT-AUSF.2',
      'POWER       14,400HP',
      'MAX SPEED    70KM/H',
      '',
      '<WEAPONS>',
      '225MM GUN LAUNCHER *1',
      '75MM FLAMETHROWER  *1',
    ].join('\n'),
  },
  { hold: 6, text: "A FAN REMAKE OF\n\nNAMCO'S 1988 ASSAULT\n\n\n\nTHE END\n\n\nMANY THANKS\n\nFOR YOUR PLAY!" },
];
/** Camera zoom while raised on a jump zone. */
const RAISED_ZOOM = 0.55;

/** The proving-ground map (?map=test): no clock, no cannons. */
const TEST_STAGE: StageDef = { number: 0, area: 'TEST', timeLimit: Infinity, hard: false, seed: 1, map: [...TEST_MAP], guide: [] };

const pad2 = (n: number) => String(n).padStart(2, '0');

/** World sprites are drawn ART_SCALE times finer than world pixels; show them at this scale. */
const S = 1 / ART_SCALE;

type TerrainTiles = ReturnType<typeof addTiledTexture>;
/** Terrain textures already on the GPU, by stage key; they persist across scene restarts. */
const TERRAIN_TILES = new Map<string, TerrainTiles>();

const enum Depth {
  Terrain = 0,
  Crater = 1,
  Pad = 1.5,
  Shadow = 2,
  Enemy = 3,
  Tank = 4,
  Shot = 5,
  EnemyShot = 6,
  Nuke = 7,
  Explosion = 8,
  Crosshair = 9,
}

/** Crosshair tint once the nuke aim reaches maximum range. */
const CROSSHAIR_MAX_TINT = 0xff3030;

/** Emplacements keep their art upright; vehicles and turrets turn. */
const FIXED_FACING: Partial<Record<EnemyKind, boolean>> = { torchika1: true, torchika2: true, ufo: true, parking: true, generator: true, generator2: true };

/** How high flying enemies ride above their shadows (shadow offset multiplier). */
const FLYING_LIFT: Partial<Record<EnemyKind, number>> = { ufo: 1.8, fourlegs: 3, generator: 9, generator2: 9 };

interface EnemyView {
  body: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

export class GameScene extends Phaser.Scene {
  private world!: World;
  private levers!: KeyboardLevers;
  private sfx!: Sfx;
  private session!: Session;
  private tankSprite!: Phaser.GameObjects.Image;
  private tankShadow!: Phaser.GameObjects.Image;
  private crosshair!: Phaser.GameObjects.Image;
  private shotSprites: Phaser.GameObjects.Image[] = [];
  private nukeSprites: { shell: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image }[] = [];
  private projectileSprites: Phaser.GameObjects.Image[] = [];
  private enemyViews = new Map<number, EnemyView>();
  private craterViews = new Map<Crater, Phaser.GameObjects.Image>();
  private zoneViews = new Map<JumpZone, Phaser.GameObjects.Image>();
  private stage!: StageDef;
  private gatePanels: { panel: Phaser.GameObjects.Container; dx: number; dy: number }[] = [];
  private testMap = false;
  private terrainReady = false;
  /** Seconds since the last stage finished, while showing the end-of-content message. */
  private endingTime = -1;
  private leaving = false;
  private acc = 0;
  /** The world state the soundtrack last reacted to. */
  private musicState: WorldState | null = null;

  constructor() {
    super('game');
  }

  create(): void {
    this.session = this.registry.get(SESSION_KEY);
    this.sfx = this.registry.get(SFX_KEY);
    this.session.message = null;
    this.shotSprites = [];
    this.nukeSprites = [];
    this.projectileSprites = [];
    this.enemyViews = new Map();
    this.craterViews = new Map();
    this.zoneViews = new Map();
    this.endingTime = -1;
    this.leaving = false;
    this.acc = 0;
    this.musicState = null;

    // ?map=test plays the proving ground; ?peaceful removes the enemies.
    const params = new URLSearchParams(window.location.search);
    this.testMap = params.get('map') === 'test';
    this.stage = this.testMap ? TEST_STAGE : STAGES[this.session.stageIndex];
    const st = this.stage;
    if (!this.testMap) this.session.stageReached = pad2(st.number);

    const terrain = new TileTerrain(st.map, 16, st.seed);
    // The terrain paints in a background worker (usually already done, requested ahead
    // of time); play holds on the READY screen until it arrives.
    this.terrainReady = false;
    const key = `terrain-${st.number}`;
    const placeTiles = (tiles: TerrainTiles) => {
      for (const tile of tiles) this.add.image(tile.x * S, tile.y * S, tile.key).setOrigin(0, 0).setDepth(Depth.Terrain).setScale(S);
      this.terrainReady = true;
    };
    const uploaded = TERRAIN_TILES.get(key);
    if (uploaded) placeTiles(uploaded);
    else
      void requestTerrain(key, st.map, st.seed).then((img) => {
        if (!this.sys.isActive() || this.terrainReady) return;
        const tiles = addTiledTexture(this, key, img);
        TERRAIN_TILES.set(key, tiles);
        releaseTerrain(key);
        placeTiles(tiles);
      });
    // Start painting the next stage while this one is played.
    const next = STAGES[this.session.stageIndex + 1];
    if (next && !this.testMap && !TERRAIN_TILES.has(`terrain-${next.number}`)) void requestTerrain(`terrain-${next.number}`, next.map, next.seed);
    if (terrain.hatch && st.exit !== 'gate') this.add.image(terrain.hatch.x, terrain.hatch.y, 'hatch').setDepth(Depth.Pad).setScale(S);
    this.gatePanels = terrain.gate ? this.addGate(terrain.gate) : [];

    const spawns = params.has('peaceful') ? [] : this.testMap ? TEST_SPAWNS : [...terrain.spawns, ...(st.spawns ?? [])];
    const tile = (p: [number, number]) => ({ x: (p[0] + 0.5) * 16, y: (p[1] + 0.5) * 16 });
    this.world = new World(terrain, spawns, {
      lives: this.session.lives,
      score: this.session.score,
      // ?seed=N makes enemy behaviour repeatable (the smoke test uses it).
      seed: Number(params.get('seed')) || Date.now(),
      hard: st.hard,
      timeLimit: st.timeLimit,
      guide: st.guide.map(tile),
      startHeading: ((st.startHeading ?? 0) * Math.PI) / 180,
      exit: st.exit,
      // Enemies shoot better stage by stage (the proving ground plays like the last stage).
      difficulty: this.testMap ? 1 : this.session.stageIndex / Math.max(1, STAGES.length - 1),
    });
    for (const z of this.world.jumpZones) this.zoneViews.set(z, this.add.image(z.x, z.y, 'jumpZone').setDepth(Depth.Pad).setScale(S));
    this.tankShadow = this.add.image(0, 0, 'tank').setTintFill(0x000000).setAlpha(0.35).setDepth(Depth.Shadow);
    this.tankSprite = this.add.image(0, 0, 'tank').setDepth(Depth.Tank);
    this.crosshair = this.add.image(0, 0, 'crosshair').setDepth(Depth.Crosshair).setVisible(false);

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setOrigin((TANK_SCREEN_X * ART_SCALE) / cam.width, (TANK_SCREEN_Y * ART_SCALE) / cam.height);
    cam.setZoom(ART_SCALE);
    cam.fadeIn(400);

    this.levers = new KeyboardLevers(window, DEFAULT_BINDINGS);
    window.addEventListener('keydown', this.onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.levers.destroy();
      window.removeEventListener('keydown', this.onKey);
    });

    const sfx = this.sfx;
    (window as unknown as { __assault: unknown }).__assault = {
      game: this.game,
      scene: 'game',
      stage: st.number,
      world: this.world,
      tank: this.world.tank,
      weapons: this.world.weapons,
      levers: this.levers,
      blasts: [] as Blast[],
      /** Seconds of game time simulated since the page loaded (lets tests wait in game time). */
      get simTime() {
        return simClock;
      },
      /** The soundtrack track last cued. */
      get music() {
        return sfx.track;
      },
    };
    this.syncView();
  }

  update(_time: number, delta: number): void {
    if (this.leaving) return;
    if (!this.terrainReady) {
      this.session.message = 'PLAYER\n\n1\n\nREADY';
      return;
    }
    let presses = this.levers.consumeFirePresses();
    this.levers.consumeStartPresses();
    this.acc += Math.min(delta, 250) / 1000;
    while (this.acc >= STEP) {
      for (const e of this.world.step(STEP, this.levers.maneuver, { held: this.levers.fire, presses })) this.handle(e);
      presses = 0;
      this.acc -= STEP;
      simClock += STEP;
    }

    const w = this.world;
    this.cueMusic();
    this.session.score = w.score;
    this.session.lives = w.lives;
    this.session.topScore = Math.max(this.session.topScore, w.score);

    if (w.state === 'gameOver' && w.stateTime >= GAME_OVER_HOLD) return this.finishGame();
    if (w.state === 'done') {
      if (this.endingTime < 0) this.stageDone();
      else if ((this.endingTime += delta / 1000) >= this.endingLength()) return this.finishGame();
    }

    this.updateHud();
    Object.assign(this.session.debug, {
      left: this.levers.left.dir,
      right: this.levers.right.dir,
      maneuver: this.levers.maneuver,
      mode: w.tank.mode,
      nukeCooldown: w.weapons.nukeCooldown,
    });
    this.syncView();
  }

  /** Move on after the hatch drop: the next stage, or the end of what's built so far. */
  private stageDone(): void {
    const next = this.session.stageIndex + 1;
    if (!this.testMap && next < STAGES.length) {
      this.session.stageIndex = next;
      this.leaving = true;
      this.scene.restart();
      return;
    }
    this.endingTime = 0;
    // The war is won: the field fades to black behind the closing pages.
    if (this.stage.number === FINAL_STAGE) this.time.delayedCall(2100, () => this.cameras.main.fadeOut(1200, 0, 0, 0));
  }

  private endingLength(): number {
    return this.stage.number === FINAL_STAGE ? FINALE.reduce((t, p) => t + p.hold, 0) : ENDING_HOLD;
  }

  /** The closing page showing `t` seconds into the ending. */
  private finalePage(t: number): string {
    for (const p of FINALE) {
      if (t < p.hold) return p.text;
      t -= p.hold;
    }
    return '';
  }

  /** Leave the game: high-score entry if the score made the table, otherwise the title screen. */
  private finishGame(): void {
    this.leaving = true;
    this.session.message = null;
    this.session.clock = null;
    this.session.guideAngle = null;
    this.scene.stop('hud');
    const qualifies = rankFor(this.session.highScores, this.session.score) >= 0;
    this.scene.start(qualifies ? 'nameEntry' : 'title');
  }

  /** Banner text, clock and guide arrow for the HUD scene. */
  private updateHud(): void {
    const w = this.world;
    const T = WORLD_TUNING;
    const s = this.session;
    switch (w.state) {
      case 'ready':
        s.message = 'PLAYER\n\n1\n\nREADY';
        break;
      case 'dying':
        s.message = w.deathCause === 'timeUp' ? 'PLAYER 1UP\n\nTIME UP' : 'YOU WERE HIT';
        break;
      case 'cleared':
        s.message =
          w.stateTime < T.clearMessageTime
            ? `PLAYER 1UP\n\n\nSTAGE ${pad2(this.stage.number)} CLEAR`
            : `TIME BONUS!\n\n${w.bonus.seconds}*50 POINTS\n\n= ${Math.max(0, w.bonus.points)} POINTS`;
        break;
      case 'exiting':
        s.message =
          w.exit === 'gate' ? null : this.stage.number === FINAL_STAGE ? 'CONGRATULATIONS!' : 'NOW YOU ASSAULT ON\n\nNEXT STAGE!!';
        break;
      case 'done':
        if (this.stage.number === FINAL_STAGE) {
          s.message = this.finalePage(Math.max(0, this.endingTime));
          break;
        }
        s.message = `CONGRATULATIONS!\n\nSTAGE ${pad2(this.stage.number)} IS YOURS.\n\n\nMORE STAGES ARE\n\nON THE WAY...`;
        break;
      case 'gameOver':
        s.message = 'GAME OVER';
        break;
      default:
        s.message = null;
    }

    // The clock appears under 100 seconds; it flashes red at 60 and 30 and stays red for the last 10.
    const t = w.timeLeft;
    const showClock = Number.isFinite(t) && t < 100 && w.state !== 'done' && w.state !== 'gameOver';
    s.clock = showClock ? Math.floor(t) : null;
    const blink = Math.floor(t * 4) % 2 === 0;
    s.clockRed = t <= 10 || ((t <= 60 && t > 57) || (t <= 30 && t > 27)) && blink;

    // Guide arrow: shown when the route turns away from the tank's heading, and every few seconds anyway.
    const g = w.guideTarget;
    s.guideAngle = null;
    if (g && w.state === 'playing' && w.raised === 0) {
      let a = headingTo(w.tank.x, w.tank.y, g.x, g.y) - w.tank.heading;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      const flash = this.time.now % 5000 < 1600;
      if (Math.abs(a) > 0.6 || flash) s.guideAngle = a;
    }
  }

  private handle(e: WorldEvent): void {
    switch (e.type) {
      case 'fired':
        this.sfx.play(e.what === 'denied' ? 'empty' : e.what === 'nuke' ? 'nukeLaunch' : 'shot');
        break;
      case 'roll':
        this.sfx.play('roll');
        break;
      case 'blast':
        (window as unknown as { __assault: { blasts: Blast[] } }).__assault.blasts.push(e.blast);
        if (e.blast.kind === 'nuke') {
          this.shockwave(e.blast.x, e.blast.y, e.blast.radius);
          this.cameras.main.shake(380, 0.016);
          this.sfx.play('nukeBlast');
        } else {
          this.explosion(e.blast.x, e.blast.y, 'sparkAnim');
          this.sfx.play('shotHit');
        }
        break;
      case 'enemyHit':
        this.explosion(e.enemy.x, e.enemy.y, 'sparkAnim');
        this.sfx.play('armorHit');
        break;
      case 'enemyKilled':
        if (ENEMIES[e.enemy.kind].large) {
          this.explosion(e.enemy.x, e.enemy.y, 'blastAnim');
          this.cameras.main.flash(70, 255, 255, 255);
        } else {
          this.explosion(e.enemy.x, e.enemy.y, 'boomAnim');
        }
        this.sfx.play('enemyDie');
        break;
      case 'deflected':
        this.explosion(e.enemy.x, e.enemy.y, 'sparkAnim');
        this.sfx.play('empty');
        break;
      case 'enemyEmerging':
        if (ENEMIES[e.enemy.kind].emergeFrom === 'water') {
          // Surfacing: rings of foam spread out around it.
          for (const delay of [0, 300]) {
            const ring = this.add.circle(e.enemy.x, e.enemy.y, 6).setStrokeStyle(1, 0xe0fff8, 0.9).setDepth(Depth.Crater).setDisplaySize(4, 4);
            this.tweens.add({ targets: ring, displayWidth: 40, displayHeight: 40, alpha: 0, delay, duration: 900, onComplete: () => ring.destroy() });
          }
          this.sfx.play('raise');
          break;
        }
        this.tweens.add({
          targets: this.add.image(e.enemy.x, e.enemy.y, 'hole').setDepth(Depth.Crater).setScale(0.2 * S),
          scale: S,
          duration: 500,
          ease: 'Back.easeOut',
        });
        this.sfx.play('raise');
        break;
      case 'enemyFired':
        this.sfx.play('enemyShot');
        break;
      case 'projectileShotDown':
      case 'projectileHitWall':
        this.explosion(e.x, e.y, 'sparkAnim');
        break;
      case 'playerHit':
        this.explosion(e.x, e.y, 'blastAnim');
        this.cameras.main.shake(400, 0.02);
        this.sfx.play('playerDie');
        this.zoomTo(1);
        break;
      case 'raised':
        this.sfx.play('raise');
        this.zoomTo(RAISED_ZOOM);
        break;
      case 'landed':
        this.zoomTo(1);
        break;
      case 'stageClear':
        this.zoomTo(1);
        break;
      case 'timeBonus':
        if (e.points > 0) this.sfx.play('extend');
        break;
      case 'hatchDrop':
        this.sfx.play('hatch');
        this.hatchDrop();
        break;
      case 'gateOpen':
        this.sfx.play('hatch');
        for (const { panel, dx, dy } of this.gatePanels) {
          // The leaves slide away into the walls on either side.
          this.tweens.add({ targets: panel, x: panel.x + dx, y: panel.y + dy, alpha: 0, duration: WORLD_TUNING.gateOpenTime * 1000, ease: 'Sine.easeIn' });
        }
        break;
      case 'launch':
        this.sfx.play('raise');
        this.launch();
        break;
      case 'extend':
        this.sfx.play('extend');
        break;
    }
  }

  /**
   * The soundtrack follows the world: the stage's theme while playing (from the top
   * after READY), silence when the tank is hit, the clear fanfare, the area-clear
   * fanfare on hatches and launch pads, the game-over lament, and the ending anthem.
   */
  private cueMusic(): void {
    const w = this.world;
    if (w.state === this.musicState) return;
    const prev = this.musicState;
    this.musicState = w.state;
    switch (w.state) {
      case 'playing':
        if (prev !== 'playing') this.sfx.music(stageTrack(this.stage.number));
        break;
      case 'dying':
        this.sfx.music(null);
        break;
      case 'cleared':
        this.sfx.music('clear');
        break;
      case 'exiting':
        if (this.stage.number === FINAL_STAGE) this.sfx.music('ending');
        else if (w.exit !== 'gate') this.sfx.music('areaClear');
        break;
      case 'gameOver':
        this.sfx.music('gameOver');
        break;
    }
  }

  private zoomTo(zoom: number): void {
    this.tweens.killTweensOf(this.cameras.main);
    this.tweens.add({ targets: this.cameras.main, zoom: zoom * ART_SCALE, duration: 600, ease: 'Sine.easeInOut' });
  }

  /** The hatch iris opens beneath the tank, which sinks through, then the screen fades out. */
  private hatchDrop(): void {
    const h = this.world.terrain.hatch;
    if (!h) return;
    const hole = this.add.circle(h.x, h.y, 1, 0x000000).setDepth(Depth.Pad + 0.1);
    this.tweens.add({ targets: hole, radius: 13, duration: 700, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: [this.tankSprite], scale: 0.3 * S, delay: 700, duration: 900, ease: 'Cubic.easeIn' });
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.time.delayedCall(1700, () => this.cameras.main.fadeIn(1));
  }

  /** The launch pad fires the tank up into the sky: it looms larger as it rises, then the screen whites out. */
  private launch(): void {
    this.tweens.add({ targets: this.tankSprite, scale: 2.4 * S, duration: 1600, ease: 'Cubic.easeIn' });
    this.tweens.add({ targets: this.tankShadow, alpha: 0, duration: 800 });
    this.zoomTo(0.7);
    this.cameras.main.fadeOut(1600, 255, 255, 255);
    this.time.delayedCall(2000, () => this.cameras.main.fadeIn(1));
  }

  /**
   * Exit gates: two heavy steel leaves with rows of blue lights, meeting in the middle
   * of the gateway. They slide apart (into the walls) once the stage is clear.
   */
  private addGate(g: { x0: number; y0: number; x1: number; y1: number }): { panel: Phaser.GameObjects.Container; dx: number; dy: number }[] {
    const w = g.x1 - g.x0;
    const h = g.y1 - g.y0;
    const across = w >= h;
    const leaves: { panel: Phaser.GameObjects.Container; dx: number; dy: number }[] = [];
    for (const side of [0, 1]) {
      const lw = across ? w / 2 : w;
      const lh = across ? h : h / 2;
      const x = g.x0 + (across ? side * lw : 0);
      const y = g.y0 + (across ? 0 : side * lh);
      const parts: Phaser.GameObjects.GameObject[] = [
        this.add.rectangle(0, 0, lw, lh, 0x3a4458).setOrigin(0, 0).setStrokeStyle(1, 0x161a24),
        this.add.rectangle(1, 1, lw - 2, 1, 0x8a96b0).setOrigin(0, 0),
      ];
      const n = Math.max(1, Math.floor((across ? lw : lh) / 8));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        parts.push(this.add.rectangle(across ? t * lw : lw / 2, across ? lh / 2 : t * lh, 3, 3, 0x60a0ff).setStrokeStyle(1, 0x203060));
      }
      const panel = this.add.container(x, y, parts).setDepth(Depth.Pad + 0.2);
      const away = side === 0 ? -1 : 1;
      leaves.push({ panel, dx: across ? away * lw : 0, dy: across ? 0 : away * lh });
    }
    return leaves;
  }

  /** As in the original: the screen dims while a white ring sweeps out over the blast area. */
  private shockwave(x: number, y: number, radius: number): void {
    const t = this.world.tank;
    const dim = this.add.rectangle(t.x, t.y, 800, 800, 0x000000, 0.5).setDepth(Depth.Explosion - 0.5);
    const full = (radius / SHOCKWAVE_RADIUS) * S;
    // A quick white flash at ground zero, then the ring (and a fainter echo) sweeps out.
    const flash = this.add.circle(x, y, radius * 0.5, 0xffffff, 0.85).setDepth(Depth.Explosion);
    this.tweens.add({ targets: flash, alpha: 0, scale: 0.3, duration: 220, onComplete: () => flash.destroy() });
    for (const [delay, alpha] of [[0, 1], [110, 0.5]] as const) {
      const ring = this.add.image(x, y, 'shockwave').setDepth(Depth.Explosion + 0.5).setScale(0.1 * S).setAlpha(alpha);
      this.tweens.add({ targets: ring, scale: full, delay, duration: 520, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: ring, alpha: 0, delay: delay + 520, duration: 320, onComplete: () => ring.destroy() });
    }
    this.tweens.add({ targets: dim, alpha: 0, delay: 250, duration: 400, onComplete: () => dim.destroy() });
  }

  private explosion(x: number, y: number, anim: string): void {
    const s = this.add.sprite(x, y, anim).setDepth(Depth.Explosion).setRotation(this.world.tank.heading).setScale(S);
    s.play(anim).once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  private syncView(): void {
    const w = this.world;
    const t = w.tank;
    const cam = this.cameras.main;
    cam.setRotation(-t.heading);
    cam.setScroll(t.x - cam.width * cam.originX, t.y - cam.height * cam.originY);

    // Rolling: the tank flips over sideways once per roll, showing its belly halfway.
    const flip = Math.cos(rollProgress(t) * 2 * Math.PI);
    const hop = Math.sin(rollProgress(t) * Math.PI) * 3;
    // Wheelie: the nose rears up, foreshortening the hull and lifting it off its shadow.
    const fwd = forwardVector(t.heading);
    const rear = t.lift * 3;
    // Hidden while wrecked; blinking while invulnerable after returning.
    const shown = w.state === 'playing' || w.state === 'ready' || w.state === 'cleared' || w.state === 'exiting';
    const visible = shown && (w.invulnerable === 0 || Math.floor(w.invulnerable * 10) % 2 === 0);
    // Raised on a jump zone: the tank looms larger and its shadow falls far away.
    const height = w.raised > 0 ? 1 : 0;

    if (w.state !== 'done') {
      for (const img of [this.tankSprite, this.tankShadow]) {
        img.setRotation(t.heading).setVisible(visible);
        if (w.state !== 'exiting') img.setScale(S * Math.max(0.12, Math.abs(flip)) * (1 + height * 0.25), S * (1 - 0.22 * t.lift) * (1 + height * 0.25));
      }
    } else {
      this.tankSprite.setVisible(false);
      this.tankShadow.setVisible(false);
    }
    this.tankSprite.setTexture(flip < 0 ? 'tankBelly' : 'tank');
    this.tankSprite.setPosition(t.x + fwd.x * rear, t.y + fwd.y * rear);
    const lifted = 1 + hop / 3 + t.lift * 1.5 + height * 6;
    this.tankShadow.setPosition(t.x + SHADOW_X * lifted, t.y + SHADOW_Y * lifted).setVisible(visible && w.state !== 'exiting');

    for (const [z, img] of this.zoneViews) {
      if (z.usesLeft === 0) img.setTexture('jumpZoneSpent').clearTint();
      else if (Math.floor(this.time.now / 250) % 2) img.setTint(0xffb0b0);
      else img.clearTint();
    }

    // Nuke aim: the crosshair slides out from the tank, white, and turns red at full range.
    const wpn = w.weapons;
    this.crosshair.setVisible(w.state === 'playing' && wpn.aiming);
    this.crosshair.setScale(1 / this.cameras.main.zoom);
    if (wpn.aiming) {
      const c = wpn.crosshair(t);
      this.crosshair.setPosition(c.x, c.y).setRotation(t.heading);
      if (wpn.aimAtMax) this.crosshair.setTint(CROSSHAIR_MAX_TINT);
      else this.crosshair.clearTint();
    }

    this.syncEnemies();
    this.syncCraters();
    this.syncShots();
    this.syncNukes();
    this.syncProjectiles();
  }

  private syncEnemies(): void {
    const alive = new Set<number>();
    for (const e of this.world.enemies) {
      if (e.state === 'hidden') continue;
      alive.add(e.id);
      const v = this.enemyViews.get(e.id) ?? this.addEnemyView(e);
      // Generators turn slowly as they hover.
      const rot = ENEMIES[e.kind].airborne ? this.time.now / 3000 : FIXED_FACING[e.kind] ? 0 : e.heading;
      // Rising out of its hole: grows from nothing, its shadow drawing away as it lifts.
      const rise = e.state === 'emerging' ? Math.min(1, e.emergeTime / WORLD_TUNING.emergeTime) : 1;
      const lift = FLYING_LIFT[e.kind] ?? 1;
      v.body.setPosition(e.x, e.y).setRotation(rot).setScale(rise * S);
      v.shadow.setPosition(e.x + SHADOW_X * lift * rise, e.y + SHADOW_Y * lift * rise).setRotation(rot).setScale(rise * S);
      if (e.flash > 0) v.body.setTintFill(0xffffff);
      else v.body.clearTint();
    }
    for (const [id, v] of this.enemyViews) {
      if (alive.has(id)) continue;
      v.body.destroy();
      v.shadow.destroy();
      this.enemyViews.delete(id);
    }
  }

  private addEnemyView(e: Enemy): EnemyView {
    const v = {
      shadow: this.add.image(e.x, e.y, e.kind).setTintFill(0x000000).setAlpha(0.35).setDepth(Depth.Shadow),
      // Airborne craft fly above everything on the ground, the player's shells included.
      body: this.add.image(e.x, e.y, e.kind).setDepth(ENEMIES[e.kind].airborne ? Depth.Nuke + 0.5 : Depth.Enemy),
    };
    this.enemyViews.set(e.id, v);
    return v;
  }

  private syncCraters(): void {
    const live = new Set(this.world.craters);
    for (const c of live) {
      if (!this.craterViews.has(c)) this.craterViews.set(c, this.add.image(c.x, c.y, 'crater').setDepth(Depth.Crater).setScale(S));
    }
    for (const [c, img] of this.craterViews) {
      if (live.has(c)) continue;
      img.destroy();
      this.craterViews.delete(c);
    }
  }

  private syncShots(): void {
    const shots = this.world.weapons.shots;
    while (this.shotSprites.length < shots.length) this.shotSprites.push(this.add.image(0, 0, 'shot').setDepth(Depth.Shot).setScale(S));
    this.shotSprites.forEach((img, i) => {
      const s = shots[i];
      img.setVisible(!!s);
      if (s) img.setPosition(s.x, s.y).setRotation(s.heading);
    });
  }

  private syncProjectiles(): void {
    const ps = this.world.projectiles;
    while (this.projectileSprites.length < ps.length) this.projectileSprites.push(this.add.image(0, 0, 'orange').setDepth(Depth.EnemyShot).setScale(S));
    this.projectileSprites.forEach((img, i) => {
      const p = ps[i];
      img.setVisible(!!p);
      if (p) img.setTexture(p.kind).setPosition(p.x, p.y).setRotation(p.kind === 'missile' || p.kind === 'laser' ? p.heading : this.world.tank.heading);
    });
  }

  private syncNukes(): void {
    const nukes = this.world.weapons.nukes;
    while (this.nukeSprites.length < nukes.length) {
      this.nukeSprites.push({
        shadow: this.add.image(0, 0, 'nukeShell').setTintFill(0x000000).setAlpha(0.4).setDepth(Depth.Shadow),
        shell: this.add.image(0, 0, 'nukeShell').setDepth(Depth.Nuke),
      });
    }
    this.nukeSprites.forEach(({ shell, shadow }, i) => {
      const n = nukes[i];
      shell.setVisible(!!n);
      shadow.setVisible(!!n);
      if (!n) return;
      // Seen from above, height shows as size; the shadow drifts away from the shell as it climbs.
      const p = nukePosition(n);
      const h = p.height / WEAPON_TUNING.nukeApex;
      shell.setPosition(p.x, p.y).setRotation(n.heading).setScale(S * (1 + h * 0.9));
      shadow.setPosition(p.x + SHADOW_X * (1 + h * 4), p.y + SHADOW_Y * (1 + h * 4)).setRotation(n.heading).setScale(S * (1 - h * 0.3));
    });
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Backquote') this.session.showDebug = !this.session.showDebug;
    if (e.code === 'KeyM') this.sfx.toggleMute();
  };
}
