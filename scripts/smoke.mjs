// End-to-end smoke test: serves the production build, drives the tank with real key
// presses in headless Chromium, checks the game responds, and saves screenshots.
//
//   npm run smoke                              builds, then runs every phase
//   node scripts/smoke.mjs                     runs against the existing build in dist/
//   npm run smoke -- --phase=controls,area3    run only some phases (see PHASES below)
//   npm run smoke -- --repeat=5                run several times and report flaky checks
//   npm run smoke -- --seed=42                 enemy randomness seed (default 1)
//   npm run smoke -- --port=4180               preview server port (default 4173)
//
// Timing: checks wait in *game* time (window.__assault.simTime) or poll until a
// condition holds, never on fixed wall-clock sleeps, so a slow machine can't make a
// check fire early. Wall-clock pauses are only used to frame screenshots.
//
// When a check fails, smoke-output/failures/ gets a screenshot, a JSON snapshot of
// the game state and the recent browser console for it, and the summary lists them.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { preview } from 'vite';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const PORT = Number(args.port ?? 4173);
const SEED = Number(args.seed ?? 1);
const REPEAT = Math.max(1, Number(args.repeat ?? 1));
const BASE = `http://localhost:${PORT}/`;
const OUT = 'smoke-output';
const FAIL_DIR = `${OUT}/failures`;
mkdirSync(OUT, { recursive: true });
rmSync(FAIL_DIR, { recursive: true, force: true });

/** Seconds of wall time allowed for a wait, by default. */
const WAIT = 15;

/**
 * One phase's harness: a fresh browser context and page, with helpers that wait in
 * game time and record checks (and diagnostics for the failures).
 */
class Phase {
  constructor(name, page, results) {
    this.name = name;
    this.page = page;
    this.results = results;
    this.log = [];
    this.errors = [];
    page.on('console', (m) => {
      this.log.push(`[${m.type()}] ${m.text()}`);
      if (this.log.length > 60) this.log.shift();
      if (m.type() === 'error') this.errors.push(m.text());
    });
    page.on('pageerror', (e) => {
      this.log.push(`[pageerror] ${e.stack ?? e}`);
      this.errors.push(String(e));
    });
  }

  /** Load the game with a query string; the smoke seed is added for repeatable enemies. */
  async open(query = '') {
    const q = new URLSearchParams(query);
    q.set('seed', String(SEED));
    await this.page.goto(`${BASE}?${q.toString().replace(/=(&|$)/g, '$1')}`);
    // A build from before the test hooks existed would make every game-time wait time out.
    if (q.has('play') || q.has('map')) {
      const hooked = await this.until(() => window.__assault?.scene === 'game', undefined, 30).then(() => this.eval(() => typeof window.__assault.simTime === 'number'));
      if (!hooked) throw new Error('the build in dist/ has no window.__assault.simTime: rebuild it (npm run build), or run npm run smoke');
    }
  }

  eval(fn, arg) {
    return this.page.evaluate(fn, arg);
  }

  simTime() {
    return this.eval(() => window.__assault?.simTime ?? 0);
  }

  /** Wait until `seconds` of game time have been simulated. */
  async sim(seconds) {
    const until = (await this.simTime()) + seconds;
    await this.page.waitForFunction((t) => (window.__assault?.simTime ?? 0) >= t, until, { timeout: (WAIT + seconds * 4) * 1000, polling: 'raf' });
  }

  /** Poll a predicate in the page until it holds; returns whether it did (never throws). */
  async until(pred, arg, timeout = WAIT) {
    try {
      await this.page.waitForFunction(pred, arg, { timeout: timeout * 1000, polling: 'raf' });
      return true;
    } catch {
      return false;
    }
  }

  async hold(keys, seconds) {
    for (const k of keys) await this.page.keyboard.down(k);
    if (seconds) await this.sim(seconds);
  }

  async release(keys) {
    for (const k of keys) await this.page.keyboard.up(k);
  }

  /** Wall-clock pause, only for framing screenshots (animations, tweens). */
  pause(ms) {
    return this.page.waitForTimeout(ms);
  }

  shot(name) {
    return this.page.locator('canvas').screenshot({ path: `${OUT}/${name}.png` });
  }

  /** Record a check. `name` stays the same run to run; `detail` carries the measured values. */
  async check(name, ok, detail) {
    const shown = detail === undefined ? '' : ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})`;
    console.log(`${ok ? 'ok  ' : 'FAIL'} [${this.name}] ${name}${shown}`);
    const result = { phase: this.name, name, ok, detail: shown };
    this.results.push(result);
    if (!ok) result.artifacts = await this.diagnose(name);
    return ok;
  }

  /** Save a screenshot, a state snapshot and the recent console for a failed check. */
  async diagnose(name) {
    mkdirSync(FAIL_DIR, { recursive: true });
    const base = `${FAIL_DIR}/${this.name}--${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60)}`;
    await this.page.screenshot({ path: `${base}.png` }).catch(() => {});
    const state = await this.eval(snapshot).catch((e) => ({ unavailable: String(e) }));
    writeFileSync(`${base}.json`, JSON.stringify({ check: name, phase: this.name, url: this.page.url(), state, console: this.log }, null, 2));
    return [`${base}.png`, `${base}.json`];
  }
}

/** Runs in the page: a summary of the game state for failure reports. */
function snapshot() {
  const a = window.__assault ?? {};
  const w = a.world;
  const byKind = {};
  for (const e of w?.enemies ?? []) byKind[`${e.kind}/${e.state}`] = (byKind[`${e.kind}/${e.state}`] ?? 0) + 1;
  return {
    scene: a.scene,
    stage: a.stage,
    simTime: a.simTime,
    world: w && {
      state: w.state,
      stateTime: w.stateTime,
      timeLeft: w.timeLeft,
      lives: w.lives,
      score: w.score,
      raised: w.raised,
      invulnerable: w.invulnerable,
      tank: { ...w.tank },
      enemies: byKind,
      projectiles: w.projectiles.length,
      craters: w.craters.length,
      jumpZones: w.jumpZones.map((z) => z.usesLeft),
      gateOpen: w.terrain.gateOpen,
    },
    weapons: a.weapons && { shots: a.weapons.shots.length, nukes: a.weapons.nukes.length, cooldown: a.weapons.nukeCooldown, aiming: a.weapons.aiming, aim: a.weapons.aim },
    blasts: (a.blasts ?? []).map((b) => b.kind),
  };
}

const playing = (stage) => window.__assault?.world?.state === 'playing' && (stage === undefined || window.__assault.stage === stage);
const removeCannons = () => {
  const w = window.__assault.world;
  for (let i = w.enemies.length - 1; i >= 0; i--) if (w.enemies[i].kind.startsWith('cannon')) w.enemies.splice(i, 1);
};

/** Controls and weapons on the proving ground, with no enemies around. */
async function controls(t) {
  await t.open('map=test&peaceful');
  await t.until(playing);
  const tank = () => t.eval(() => ({ ...window.__assault.tank }));
  const weapons = () => t.eval(() => ({ shots: window.__assault.weapons.shots.length, nukes: window.__assault.weapons.nukes.length, cooldown: window.__assault.weapons.nukeCooldown }));
  const blasted = (kind) => t.until((k) => window.__assault.blasts.some((b) => b.kind === k), kind, 5);
  await t.sim(0.3);
  await t.shot('01-start');
  const start = await tank();

  // Facing the cliffs around the void island: shots fly up and burst on the rock.
  for (let i = 0; i < 5; i++) await t.page.keyboard.press('Space');
  await t.sim(0.12); // presses are taken one per tick
  const salvo = await weapons();
  await t.check('rapid fire is capped at three shots on screen', salvo.shots === 3, salvo);
  await t.shot('01b-shots');
  await t.check('shots burst against the cliff', await blasted('shot'));

  await t.hold(['KeyW', 'KeyI'], 1.2);
  await t.release(['KeyW', 'KeyI']);
  const fwd = await tank();
  await t.check('both levers forward drives up the map', fwd.y < start.y - 20, `y ${start.y.toFixed(1)} -> ${fwd.y.toFixed(1)}`);
  await t.shot('02-forward');

  await t.hold(['KeyW'], 0.4);
  await t.release(['KeyW']);
  const single = await tank();
  const arc = Math.hypot(single.x - fwd.x, single.y - fwd.y);
  await t.check('the left lever alone arcs forward to the right', arc > 5 && single.heading > fwd.heading, `${arc.toFixed(1)} px`);
  await t.eval((h) => (window.__assault.tank.heading = h), fwd.heading);

  await t.hold(['KeyW', 'KeyK'], 0.5);
  await t.release(['KeyW', 'KeyK']);
  const turned = await tank();
  await t.check('left forward + right back turns right', turned.heading > 0.5 && turned.heading < 2, `heading ${turned.heading.toFixed(2)} rad`);
  await t.hold(['KeyW', 'KeyI'], 0.6);
  await t.release(['KeyW', 'KeyI']);
  await t.shot('03-turned-world-rotated');

  await t.hold(['KeyA', 'KeyL'], 0.4);
  const wheelie = await tank();
  await t.check('levers apart pops a wheelie', wheelie.mode === 'wheelie' && wheelie.lift === 1, `mode ${wheelie.mode}, lift ${wheelie.lift}`);
  await t.shot('04-wheelie');
  await t.release(['KeyA', 'KeyL']);
  await t.check('releasing the levers drops the wheelie', await t.until(() => window.__assault.tank.lift === 0, undefined, 3));

  const beforeRoll = await tank();
  await t.hold(['KeyD', 'KeyL'], 0.2);
  await t.check('both levers right starts a roll', (await tank()).mode === 'roll');
  await t.shot('05-roll');
  await t.release(['KeyD', 'KeyL']);
  await t.sim(0.5);
  const rolled = await tank();
  const moved = Math.hypot(rolled.x - beforeRoll.x, rolled.y - beforeRoll.y);
  await t.check('roll moves sideways without turning', moved > 15 && rolled.heading === beforeRoll.heading, `${moved.toFixed(1)} px`);

  // Wheelie: the crosshair slides out (white) and turns red at full range; then fire.
  const aim = () => t.eval(() => ({ aiming: window.__assault.weapons.aiming, aim: window.__assault.weapons.aim, max: window.__assault.weapons.aimAtMax }));
  await t.hold(['KeyA', 'KeyL'], 0.6);
  const early = await aim();
  await t.check('a wheelie shows the crosshair sliding out, white', early.aiming && !early.max && early.aim > 30, `${early.aim.toFixed(0)} px`);
  await t.shot('04b-crosshair-white');
  await t.sim(0.9);
  const full = await aim();
  await t.check('the crosshair turns red at full range', full.max, `${full.aim.toFixed(0)} px`);
  await t.shot('04c-crosshair-red');
  await t.page.keyboard.press('Space');
  await t.page.keyboard.press('Space');
  await t.sim(0.1);
  const launched = await weapons();
  await t.check('fire during a wheelie launches one nuke', launched.nukes === 1, launched);
  await t.check('a second nuke is refused while recharging', launched.cooldown > 2, `cooldown ${launched.cooldown.toFixed(2)} s`);
  await t.sim(0.3);
  await t.shot('06-nuke-in-flight');
  await t.check('the nuke explodes where it lands', await blasted('nuke'));
  await t.pause(200);
  await t.shot('07-nuke-blast');
  await t.release(['KeyA', 'KeyL']);

  // The one-handed arrow scheme, from the open ground at the start.
  await t.eval(() => Object.assign(window.__assault.tank, { x: 19.5 * 16, y: 28.5 * 16, heading: 0, mode: 'drive', lift: 0 }));
  await t.sim(0.1);
  const a0 = await tank();
  await t.hold(['ArrowUp'], 0.5);
  await t.release(['ArrowUp']);
  const a1 = await tank();
  await t.check('arrow up drives forward', Math.hypot(a1.x - a0.x, a1.y - a0.y) > 10, `${Math.hypot(a1.x - a0.x, a1.y - a0.y).toFixed(1)} px`);
  await t.hold(['ArrowLeft', 'ArrowRight'], 0.3);
  await t.check('left + right arrows pop a wheelie', (await tank()).mode === 'wheelie');
  await t.release(['ArrowLeft', 'ArrowRight']);
  await t.until(() => window.__assault.tank.mode === 'drive' && window.__assault.tank.lift === 0, undefined, 3);
  // The double tap is timed in wall-clock milliseconds by the input layer, so this pair stays quick.
  await t.page.keyboard.press('ArrowRight');
  await t.pause(60);
  await t.page.keyboard.down('ArrowRight');
  await t.check('a double tap of the right arrow rolls', await t.until(() => window.__assault.tank.mode === 'roll', undefined, 2));
  await t.page.keyboard.up('ArrowRight');

  // Q asks for a second press, then quits to the title screen.
  await t.page.keyboard.press('KeyQ');
  await t.sim(0.1);
  await t.check('one press of Q only asks to confirm', (await t.eval(() => window.__assault.scene)) === 'game');
  await t.shot('07b-quit-confirm');
  await t.page.keyboard.press('KeyQ');
  await t.check('a second press of Q quits to the title screen', await t.until(() => window.__assault.scene === 'title', undefined, 5));
}

/** Combat on the proving ground: shooting, being shot, game over. */
async function combat(t) {
  await t.open('map=test');
  await t.until(playing);
  const world = () =>
    t.eval(() => {
      const w = window.__assault.world;
      return { state: w.state, score: w.score, lives: w.lives, enemies: w.enemies.map((e) => e.kind), craters: w.craters.length };
    });
  const initial = await world();
  await t.check('enemies are placed, 3 lives, score 0', initial.enemies.length === 18 && initial.lives === 3 && initial.score === 0, `${initial.enemies.length} enemies`);

  // Park below the four-way pillbox, facing it, and shoot it.
  await t.eval(() => Object.assign(window.__assault.world.tank, { x: 30.5 * 16, y: 17.5 * 16 + 70, heading: 0 }));
  await t.sim(0.1);
  await t.page.keyboard.press('Space');
  const killed = await t.until(() => !window.__assault.world.enemies.some((e) => e.kind === 'torchika1') && window.__assault.world.score >= 200, undefined, 5);
  await t.check('a shot destroys the pillbox and scores', killed, `score ${(await world()).score}`);
  await t.shot('08-combat');

  // Sit still in front of the tank squad until their fire gets through.
  const hit = await t.until(() => window.__assault.world.state === 'dying', undefined, 30);
  await t.check('enemy fire destroys the tank', hit && (await world()).lives === 2, await world().then((w) => `state ${w.state}, lives ${w.lives}`));
  await t.pause(300);
  await t.shot('09-you-were-hit');

  // Lose the remaining lives: the game ends, then the title screen returns.
  await t.eval(() => (window.__assault.world.lives = 0));
  await t.check('losing the last life ends the game', await t.until(() => window.__assault.world.state === 'gameOver', undefined, 10));
  await t.shot('10-game-over');
  await t.check('after GAME OVER the title screen returns', await t.until(() => window.__assault.scene === 'title', undefined, 12));
}

/** From the title screen through stage 1, the stage clear and hatch, stage 2, and name entry. */
async function campaign(t) {
  await t.open();
  await t.until(() => window.__assault?.scene === 'title');
  await t.pause(400);
  await t.shot('11-title');
  await t.page.keyboard.press('Enter');
  await t.until(() => window.__assault?.scene === 'game', undefined, 8);
  await t.pause(500);
  await t.shot('12-stage1-ready');
  await t.until(playing, undefined, 30);
  const s1 = await t.eval(() => ({
    stage: window.__assault.stage,
    time: window.__assault.world.timeLeft,
    zones: window.__assault.world.jumpZones.length,
    cannons: window.__assault.world.enemies.filter((e) => e.kind === 'cannon1').length,
  }));
  await t.check('stage 1 starts with a 2:15 clock, a jump zone and two cannons', s1.stage === 1 && s1.time > 130 && s1.time <= 135 && s1.zones === 1 && s1.cannons === 2, s1);
  await t.check('stage 1 plays its theme', await t.until(() => window.__assault.music === 'stage1', undefined, 5), await t.eval(() => window.__assault.music));
  await t.sim(0.8);
  await t.shot('13-stage1-playing');

  // Ride the jump zone up.
  await t.eval(() => {
    const w = window.__assault.world;
    const z = w.jumpZones[0];
    w.invulnerable = 1e9;
    Object.assign(w.tank, { x: z.x, y: z.y + 30, heading: 0 });
  });
  await t.hold(['KeyW', 'KeyI']);
  const rose = await t.until(() => window.__assault.world.raised > 0, undefined, 5);
  await t.release(['KeyW', 'KeyI']);
  const up = await t.eval(() => ({ raised: window.__assault.world.raised, uses: window.__assault.world.jumpZones[0].usesLeft }));
  await t.check('driving onto the jump zone raises the tank', rose && up.uses === 2, up);
  await t.sim(0.5);
  await t.shot('14-raised');

  // Clear the stage: a big score to qualify for the table, then the cannons fall.
  await t.until(() => window.__assault.world.raised === 0, undefined, 10);
  await t.eval(() => {
    const w = window.__assault.world;
    w.score = 50000;
    const h = w.terrain.hatch;
    Object.assign(w.tank, { x: h.x, y: h.y + 80, heading: 0 });
  });
  await t.eval(removeCannons);
  await t.check('destroying both cannons clears the stage', await t.until(() => window.__assault.world.state === 'cleared', undefined, 5));
  await t.check('the stage-clear fanfare plays', await t.until(() => window.__assault.music === 'clear', undefined, 3), await t.eval(() => window.__assault.music));
  await t.sim(0.6);
  await t.shot('15-stage-clear');
  await t.until(() => window.__assault.world.bonus.points !== 0, undefined, 8);
  const bonus = await t.eval(() => window.__assault.world.bonus);
  await t.check('time bonus pays 50 per second', bonus.points === bonus.seconds * 50 && bonus.seconds > 0, `${bonus.seconds} s, ${bonus.points} pts`);
  await t.shot('16-time-bonus');
  await t.until(() => window.__assault.world.state === 'exiting', undefined, 8);
  await t.check('leaving by the hatch plays the area-clear fanfare', await t.until(() => window.__assault.music === 'areaClear', undefined, 3), await t.eval(() => window.__assault.music));
  await t.sim(1.5);
  await t.shot('17-hatch');
  // The next stage replaces the world as soon as this one is done, so accept either.
  await t.check('the tank drives onto the hatch and drops through', await t.until(() => window.__assault.world.state === 'done' || window.__assault.stage === 2, undefined, 20));

  // Stage 2 follows, with UFO launchers rising once their wave is destroyed.
  await t.until(() => window.__assault.stage === 2 && window.__assault.world.state === 'playing', undefined, 30);
  const s2 = await t.eval(() => {
    const w = window.__assault.world;
    return { stage: window.__assault.stage, time: w.timeLeft, hidden: w.enemies.filter((e) => e.state === 'hidden').length, zones: w.jumpZones.length };
  });
  await t.check('stage 2 follows: 2:40 clock, 16 buried UFO launchers, 2 jump zones', s2.stage === 2 && s2.time > 155 && s2.hidden === 16 && s2.zones === 2, s2);
  await t.check('stage 2 plays its own theme', await t.until(() => window.__assault.music === 'land', undefined, 5), await t.eval(() => window.__assault.music));
  await t.sim(0.6);
  await t.shot('18-stage2');
  await t.eval(() => {
    const w = window.__assault.world;
    w.invulnerable = 1e9;
    for (let i = w.enemies.length - 1; i >= 0; i--) if (w.enemies[i].group === 1) w.enemies.splice(i, 1);
  });
  const risen = await t.until(() => window.__assault.world.enemies.filter((e) => e.kind === 'ufo' && e.state !== 'hidden').length === 3, undefined, 5);
  await t.check('wiping out the first wave raises three UFO launchers', risen, `${await t.eval(() => window.__assault.world.enemies.filter((e) => e.kind === 'ufo' && e.state !== 'hidden').length)}`);
  await t.sim(0.4);
  await t.shot('18b-ufos-rising');

  // End the game on a qualifying score: time runs out on the last life.
  await t.eval(() => {
    const w = window.__assault.world;
    w.lives = 1;
    w.invulnerable = 0;
    w.timeLeft = 0.05;
  });
  await t.check('a top score leads to name entry', await t.until(() => window.__assault.scene === 'nameEntry', undefined, 15));
  await t.page.keyboard.type('TODD');
  await t.pause(300);
  await t.shot('19-name-entry');
  await t.page.keyboard.press('Enter');
  await t.until(() => window.__assault.scene === 'title', undefined, 8);
  const saved = await t.eval(() => JSON.parse(localStorage.getItem('assault.highScores.v1') ?? '[]')[0]);
  await t.check('the new top score is saved', saved?.name === 'TODD' && saved?.score >= 50000 && saved?.stage === '02', saved);
  // The title screen cycles pages every 7 s; catch the help page.
  await t.pause(7300);
  await t.shot('20-how-to-play');
}

/** Area 3: stage 3's gates open onto stage 4; stage 5 ends on a launch pad. */
async function area3(t) {
  await t.open('play&stage=3');
  await t.until(() => window.__assault?.stage === 3 && window.__assault.world.state === 'playing', undefined, 30);
  const s3 = await t.eval(() => {
    const w = window.__assault.world;
    return { time: w.timeLeft, gate: !!w.terrain.gate, cannons: w.enemies.filter((e) => e.kind.startsWith('cannon')).length, sixteen: w.enemies.filter((e) => e.kind === 'type7b').length };
  });
  await t.check('stage 3: 1:50 clock, exit gates, four cannons, two Type 7-Bs', s3.time > 105 && s3.time <= 110 && s3.gate && s3.cannons === 4 && s3.sixteen === 2, s3);
  await t.check('area 3 plays its theme', await t.until(() => window.__assault.music === 'river', undefined, 5), await t.eval(() => window.__assault.music));
  await t.eval(() => {
    const w = window.__assault.world;
    w.invulnerable = 1e9;
    const g = w.terrain.gate;
    Object.assign(w.tank, { x: (g.x0 + g.x1) / 2, y: g.y0 - 120, heading: Math.PI });
  });
  await t.sim(1.2);
  await t.shot('21-stage3-battery');
  await t.eval(removeCannons);
  await t.until(() => window.__assault.world.state === 'exiting', undefined, 10);
  await t.sim(0.9);
  await t.shot('22-gates-opening');
  await t.check('the gates slide open once the cannons fall', await t.until(() => window.__assault.world.terrain.gateOpen === true || window.__assault.stage === 4, undefined, 5));
  await t.until(() => window.__assault.stage === 4 && window.__assault.world.state === 'playing', undefined, 30);
  const s4 = await t.eval(() => {
    const w = window.__assault.world;
    return { stage: window.__assault.stage, time: w.timeLeft, zones: w.jumpZones.length, generator: w.enemies.some((e) => e.kind === 'generator'), cannons: w.enemies.filter((e) => e.kind === 'cannon1').length };
  });
  await t.check('the tank drives through into stage 4: 2:10, two jump zones, a Generator, seven cannons', s4.stage === 4 && s4.time > 125 && s4.zones === 2 && s4.generator && s4.cannons === 7, s4);
  await t.sim(0.4);
  await t.shot('23-stage4');
  await t.eval(() => {
    const w = window.__assault.world;
    w.invulnerable = 1e9;
    const g = w.enemies.find((e) => e.kind === 'generator');
    Object.assign(w.tank, { x: g.x, y: g.y + 90, heading: 0 });
  });
  await t.sim(1.5);
  await t.shot('24-generator');

  await t.open('play&stage=5');
  await t.until(() => window.__assault?.stage === 5 && window.__assault.world.state === 'playing', undefined, 40);
  const s5 = await t.eval(() => {
    const w = window.__assault.world;
    return { time: w.timeLeft, zones: w.jumpZones.length, exit: w.exit, hidden: w.enemies.filter((e) => e.state === 'hidden').length };
  });
  await t.check('stage 5: 6:00 clock, four jump zones, buried launchers and Type 4s, a launch pad', s5.time > 355 && s5.zones === 4 && s5.exit === 'launch' && s5.hidden > 20, s5);
  await t.eval(() => {
    const w = window.__assault.world;
    w.invulnerable = 1e9;
    for (const e of w.enemies) if (e.kind === 'type4') Object.assign(e, { state: 'emerging', emergeTime: 0.5, after: undefined });
    const e = w.enemies.find((e) => e.kind === 'type4');
    Object.assign(w.tank, { x: e.x, y: e.y + 70, heading: 0 });
  });
  await t.sim(0.9);
  await t.shot('25-type4-surfacing');
  await t.eval(() => {
    const w = window.__assault.world;
    const g = w.terrain.gate;
    Object.assign(w.tank, { x: g.x0 - 100, y: (g.y0 + g.y1) / 2, heading: Math.PI / 2 });
  });
  await t.sim(1.2);
  await t.shot('26-hedges-and-battery');
  await t.eval(removeCannons);
  // Stage 6 replaces the world the moment stage 5 is done, so accept either.
  const launched = await t.until(() => window.__assault.world.state === 'done' || window.__assault.stage === 6, undefined, 30);
  await t.check('stage 5 ends with the tank launched off the pad', launched);
  await t.shot('27-after-stage5');
}

/** Area 4, the enemy base: stage 6, stage 10 back in area 3, and stage 11 to the ending. */
async function area4(t) {
  await t.open('play&stage=6');
  await t.until(() => window.__assault?.stage === 6 && window.__assault.world.state === 'playing', undefined, 40);
  const s6 = await t.eval(() => {
    const w = window.__assault.world;
    return { time: w.timeLeft, gate: !!w.terrain.gate, cannons: w.enemies.filter((e) => e.kind === 'cannon3').length, ufos: w.enemies.filter((e) => e.kind === 'ufo').length };
  });
  await t.check('stage 6: 3:30 clock, gates, two Type 3 cannons, eight buried launchers', s6.time > 205 && s6.gate && s6.cannons === 2 && s6.ufos === 8, s6);
  await t.eval(() => {
    const w = window.__assault.world;
    w.invulnerable = 1e9;
    Object.assign(w.tank, { y: w.tank.y - 200 });
  });
  await t.sim(1.5);
  await t.shot('28-stage6-base');

  await t.open('play&stage=10');
  await t.until(() => window.__assault?.stage === 10 && window.__assault.world.state === 'playing', undefined, 40);
  const s10 = await t.eval(() => {
    const w = window.__assault.world;
    const n = (k) => w.enemies.filter((e) => e.kind === k).length;
    return { time: w.timeLeft, cannons: [n('cannon1'), n('cannon2'), n('cannon3')], black: n('generator2'), exit: w.exit, sixteen: w.enemies.find((e) => e.kind === 'type7b')?.hp };
  });
  await t.check(
    'stage 10: 4:30, four each of Type 1, 2 and 3 cannons, a Black Generator, hard Type 7-Bs',
    s10.time > 265 && s10.cannons.join() === '4,4,4' && s10.black === 1 && s10.exit === 'launch' && s10.sixteen === 48,
    s10,
  );
  await t.eval(() => {
    const w = window.__assault.world;
    w.invulnerable = 1e9;
    const g = w.enemies.find((e) => e.kind === 'generator2');
    Object.assign(w.tank, { x: g.x - 70, y: g.y, heading: Math.PI / 2 });
  });
  await t.sim(1.5);
  await t.shot('28b-stage10-corridor');

  await t.open('play&stage=11');
  await t.until(() => window.__assault?.stage === 11 && window.__assault.world.state === 'playing', undefined, 40);
  const s11 = await t.eval(() => {
    const w = window.__assault.world;
    const n = (k) => w.enemies.filter((e) => e.kind === k).length;
    return { time: w.timeLeft, cannons: n('cannon3'), parking: n('parking'), torchikas: n('torchika1'), sixteen: n('type7b'), black: n('generator2'), exit: w.exit };
  });
  await t.check(
    'stage 11: 4:30, sixteen Type 3 cannons, 108 parked tanks, pillboxes, ten Type 7-Bs and the Black Generator',
    s11.time > 265 && s11.cannons === 16 && s11.parking === 108 && s11.torchikas >= 90 && s11.sixteen === 10 && s11.black === 1 && s11.exit === 'launch',
    s11,
  );
  await t.eval(() => {
    const w = window.__assault.world;
    w.invulnerable = 1e9;
    Object.assign(w.tank, { x: w.tank.x - 120, y: w.tank.y - 90, heading: -Math.PI / 2 });
  });
  await t.sim(1.5);
  await t.shot('29-stage11-pillboxes');
  await t.eval(() => {
    const w = window.__assault.world;
    const g = w.enemies.find((e) => e.kind === 'generator2');
    Object.assign(w.tank, { x: g.x, y: g.y + 80, heading: 0 });
  });
  await t.sim(1.5);
  await t.shot('30-black-generator');
  await t.eval(removeCannons);
  await t.check('clearing stage 11 launches the tank and rolls the ending', await t.until(() => window.__assault.world.state === 'done', undefined, 30));
  await t.pause(3000);
  await t.shot('31-ending');
  await t.pause(6500);
  await t.shot('32-spec-sheet');
}

const PHASES = { controls, combat, campaign, area3, area4 };
const chosen = args.phase ? args.phase.split(',') : Object.keys(PHASES);
for (const p of chosen) if (!PHASES[p]) throw new Error(`unknown phase '${p}' (phases: ${Object.keys(PHASES).join(', ')})`);

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
  for (let run = 1; run <= REPEAT; run++) {
    if (REPEAT > 1) console.log(`\n=== run ${run}/${REPEAT} ===`);
    for (const name of chosen) {
      // Each phase gets its own context: fresh storage, nothing carried over from a failure.
      const context = await browser.newContext({ viewport: { width: 672, height: 864 } });
      const t = new Phase(name, await context.newPage(), results);
      try {
        await PHASES[name](t);
      } catch (e) {
        await t.check('phase runs to the end', false, String(e?.message ?? e).split('\n')[0]);
      }
      await t.check('no console errors', t.errors.length === 0, t.errors.length ? t.errors.join(' | ') : undefined);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

const failed = results.filter((r) => !r.ok);
if (REPEAT > 1) {
  const tally = new Map();
  for (const r of results) {
    const key = `[${r.phase}] ${r.name}`;
    const t = tally.get(key) ?? { pass: 0, fail: 0 };
    t[r.ok ? 'pass' : 'fail']++;
    tally.set(key, t);
  }
  const flaky = [...tally].filter(([, t]) => t.fail > 0);
  console.log(`\n${REPEAT} runs, ${tally.size} checks: ${flaky.length ? 'some failed' : 'all passed every run'}`);
  for (const [key, t] of flaky) console.log(`  ${t.fail}/${t.pass + t.fail} failed  ${key}`);
}
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed:`);
  for (const f of failed) console.error(`  [${f.phase}] ${f.name}${f.detail}\n      ${(f.artifacts ?? []).join('\n      ')}`);
  process.exit(1);
}
console.log(`\nall ${results.length} checks passed; screenshots in ${OUT}/`);
