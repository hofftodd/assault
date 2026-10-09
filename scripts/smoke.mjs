// End-to-end smoke test: serves the production build, drives the tank with real
// key presses in headless Chromium, checks it responds, and saves screenshots.
//   npm run build && npm run smoke
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { preview } from 'vite';

const OUT = 'smoke-output';
mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

try {
  const page = await browser.newPage({ viewport: { width: 672, height: 864 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  // Phase 1: controls and weapons, with no enemies around.
  await page.goto('http://localhost:4173/?map=test&peaceful');
  await page.waitForFunction(() => window.__assault?.world?.state === 'playing', null, { timeout: 15000 });
  const tank = () => page.evaluate(() => ({ ...window.__assault.tank }));
  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
  };
  const release = async (keys) => {
    for (const k of keys) await page.keyboard.up(k);
  };
  const shot = (name) => page.locator('canvas').screenshot({ path: `${OUT}/${name}.png` });

  await page.waitForTimeout(300);
  await shot('01-start');
  const start = await tank();
  const weapons = () => page.evaluate(() => ({ shots: window.__assault.weapons.shots.length, nukes: window.__assault.weapons.nukes.length, cooldown: window.__assault.weapons.nukeCooldown }));
  const blastKinds = () => page.evaluate(() => window.__assault.blasts.map((b) => b.kind));

  // Facing the cliffs around the void island: shots fly up and burst on the rock.
  for (let i = 0; i < 5; i++) await page.keyboard.press('Space');
  // Presses are handled one per tick; give the game a few frames to catch up.
  await page.waitForTimeout(100);
  const salvo = await weapons();
  check(salvo.shots === 3, `rapid fire is capped at three shots on screen (${salvo.shots})`);
  await page.waitForTimeout(60);
  await shot('01b-shots');
  await page.waitForTimeout(700);
  check((await blastKinds()).includes('shot'), 'shots burst against the cliff');

  await hold(['KeyW', 'KeyI'], 1200);
  await release(['KeyW', 'KeyI']);
  const afterForward = await tank();
  check(afterForward.y < start.y - 20, `both levers forward drives up the map (y ${start.y.toFixed(1)} -> ${afterForward.y.toFixed(1)})`);
  await shot('02-forward');

  await hold(['KeyW'], 400);
  await release(['KeyW']);
  const afterSingle = await tank();
  check(afterSingle.x === afterForward.x && afterSingle.y === afterForward.y && afterSingle.heading === afterForward.heading, 'a single lever does nothing');

  await hold(['KeyW', 'KeyK'], 500);
  await release(['KeyW', 'KeyK']);
  const afterTurn = await tank();
  check(afterTurn.heading > 0.5 && afterTurn.heading < 2, `left forward + right back turns right (heading ${afterTurn.heading.toFixed(2)} rad)`);
  await hold(['KeyW', 'KeyI'], 600);
  await release(['KeyW', 'KeyI']);
  await shot('03-turned-world-rotated');

  await hold(['KeyA', 'KeyL'], 400);
  const midWheelie = await tank();
  check(midWheelie.mode === 'wheelie' && midWheelie.lift === 1, `levers apart pops a wheelie (mode ${midWheelie.mode}, lift ${midWheelie.lift})`);
  await shot('04-wheelie');
  await release(['KeyA', 'KeyL']);
  await page.waitForTimeout(300);
  check((await tank()).lift === 0, 'releasing the levers drops the wheelie');

  const beforeRoll = await tank();
  await hold(['KeyD', 'KeyL'], 200);
  check((await tank()).mode === 'roll', 'both levers right starts a roll');
  await shot('05-roll');
  await release(['KeyD', 'KeyL']);
  await page.waitForTimeout(500);
  const afterRoll = await tank();
  const moved = Math.hypot(afterRoll.x - beforeRoll.x, afterRoll.y - beforeRoll.y);
  check(moved > 15 && afterRoll.heading === beforeRoll.heading, `roll moves sideways without turning (${moved.toFixed(1)} px)`);

  // Wheelie: the crosshair slides out (white) and turns red at full range; then fire.
  const aim = () => page.evaluate(() => ({ aiming: window.__assault.weapons.aiming, aim: window.__assault.weapons.aim, max: window.__assault.weapons.aimAtMax }));
  await hold(['KeyA', 'KeyL'], 600);
  const early = await aim();
  check(early.aiming && !early.max && early.aim > 30, `a wheelie shows the crosshair sliding out (${early.aim.toFixed(0)} px, white)`);
  await shot('04b-crosshair-white');
  await page.waitForTimeout(900);
  const full = await aim();
  check(full.max, `the crosshair turns red at full range (${full.aim.toFixed(0)} px)`);
  await shot('04c-crosshair-red');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  const launched = await weapons();
  check(launched.nukes === 1, `fire during a wheelie launches one nuke (${launched.nukes})`);
  check(launched.cooldown > 2, `a second nuke is refused while recharging (cooldown ${launched.cooldown.toFixed(2)} s)`);
  await page.waitForTimeout(300);
  await shot('06-nuke-in-flight');
  await page.waitForTimeout(600);
  await shot('07-nuke-blast');
  await release(['KeyA', 'KeyL']);
  check((await blastKinds()).includes('nuke'), 'the nuke explodes where it lands');

  // The one-handed arrow scheme, from the open ground at the start.
  await page.evaluate(() => Object.assign(window.__assault.tank, { x: 19.5 * 16, y: 28.5 * 16, heading: 0 }));
  const a0 = await tank();
  await hold(['ArrowUp'], 500);
  await release(['ArrowUp']);
  const a1 = await tank();
  const movedA = Math.hypot(a1.x - a0.x, a1.y - a0.y);
  check(movedA > 10, `arrow up drives forward (${movedA.toFixed(1)} px)`);
  await hold(['ArrowLeft', 'ArrowRight'], 300);
  check((await tank()).mode === 'wheelie', 'left + right arrows pop a wheelie');
  await release(['ArrowLeft', 'ArrowRight']);
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(60);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(60);
  check((await tank()).mode === 'roll', 'a double tap of the right arrow rolls');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(500);

  // Phase 2: combat against the test map's enemies.
  await page.goto('http://localhost:4173/?map=test');
  await page.waitForFunction(() => window.__assault?.world?.state === 'playing', null, { timeout: 15000 });
  const world = () =>
    page.evaluate(() => {
      const w = window.__assault.world;
      return { state: w.state, score: w.score, lives: w.lives, enemies: w.enemies.map((e) => e.kind), craters: w.craters.length };
    });
  const initial = await world();
  check(initial.enemies.length === 18 && initial.lives === 3 && initial.score === 0, `enemies are placed (${initial.enemies.length}), 3 lives, score 0`);

  // Park below the four-way pillbox, facing it, and shoot it.
  await page.evaluate(() => Object.assign(window.__assault.world.tank, { x: 30.5 * 16, y: 17.5 * 16 + 70, heading: 0 }));
  await page.waitForTimeout(100);
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  const afterKill = await world();
  check(!afterKill.enemies.includes('torchika1') && afterKill.score >= 200, `a shot destroys the pillbox and scores (score ${afterKill.score})`);
  await shot('08-combat');

  // Sit still in front of the tank squad until their fire gets through.
  await page.waitForFunction(() => window.__assault.world.state === 'dying', null, { timeout: 15000 }).catch(() => {});
  const hit = await world();
  check(hit.state === 'dying' && hit.lives === 2, `enemy fire destroys the tank (state ${hit.state}, lives ${hit.lives})`);
  await page.waitForTimeout(300);
  await shot('09-you-were-hit');

  // Lose the remaining lives: the game ends, then starts afresh.
  await page.evaluate(() => (window.__assault.world.lives = 0));
  await page.waitForFunction(() => window.__assault.world.state === 'gameOver', null, { timeout: 5000 }).catch(() => {});
  check((await world()).state === 'gameOver', 'losing the last life ends the game');
  await shot('10-game-over');

  await page.waitForFunction(() => window.__assault.scene === 'title', null, { timeout: 8000 }).catch(() => {});
  check(await page.evaluate(() => window.__assault.scene === 'title'), 'after GAME OVER the title screen returns');

  // Phase 3: stage 1 from the title screen, through to the stage clear and high-score entry.
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.__assault?.scene === 'title', null, { timeout: 15000 });
  await page.waitForTimeout(400);
  await shot('11-title');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__assault?.scene === 'game', null, { timeout: 5000 });
  await page.waitForTimeout(500);
  await shot('12-stage1-ready');
  await page.waitForFunction(() => window.__assault.world.state === 'playing', null, { timeout: 5000 });
  const s1 = await page.evaluate(() => ({ stage: window.__assault.stage, time: window.__assault.world.timeLeft, zones: window.__assault.world.jumpZones.length, cannons: window.__assault.world.enemies.filter((e) => e.kind === 'cannon1').length }));
  check(s1.stage === 1 && s1.time > 130 && s1.time <= 135 && s1.zones === 1 && s1.cannons === 2, `stage 1 starts with a 2:15 clock, a jump zone and two cannons (${JSON.stringify(s1)})`);
  await page.waitForTimeout(800);
  await shot('13-stage1-playing');

  // Ride the jump zone up.
  await page.evaluate(() => {
    const w = window.__assault.world;
    const z = w.jumpZones[0];
    w.invulnerable = 1e9;
    Object.assign(w.tank, { x: z.x, y: z.y + 30, heading: 0 });
  });
  await hold(['KeyW', 'KeyI'], 900);
  await release(['KeyW', 'KeyI']);
  const up = await page.evaluate(() => ({ raised: window.__assault.world.raised, uses: window.__assault.world.jumpZones[0].usesLeft }));
  check(up.raised > 0 && up.uses === 2, `driving onto the jump zone raises the tank (${JSON.stringify(up)})`);
  await page.waitForTimeout(500);
  await shot('14-raised');

  // Clear the stage: a big score to qualify for the table, then the cannons fall.
  await page.waitForFunction(() => window.__assault.world.raised === 0, null, { timeout: 8000 });
  await page.evaluate(() => {
    const w = window.__assault.world;
    w.score = 50000;
    const h = w.terrain.hatch;
    Object.assign(w.tank, { x: h.x, y: h.y + 80, heading: 0 });
    for (let i = w.enemies.length - 1; i >= 0; i--) if (w.enemies[i].kind === 'cannon1') w.enemies.splice(i, 1);
  });
  await page.waitForFunction(() => window.__assault.world.state === 'cleared', null, { timeout: 3000 }).catch(() => {});
  check((await page.evaluate(() => window.__assault.world.state)) === 'cleared', 'destroying both cannons clears the stage');
  await page.waitForTimeout(600);
  await shot('15-stage-clear');
  await page.waitForTimeout(2400);
  const bonus = await page.evaluate(() => window.__assault.world.bonus);
  check(bonus.points === bonus.seconds * 50 && bonus.seconds > 0, `time bonus pays 50 per second (${bonus.seconds} s, ${bonus.points} pts)`);
  await shot('16-time-bonus');
  await page.waitForFunction(() => window.__assault.world.state === 'exiting', null, { timeout: 5000 });
  await page.waitForTimeout(1500);
  await shot('17-hatch');
  await page.waitForFunction(() => window.__assault.world.state === 'done' || window.__assault.stage === 2, null, { timeout: 12000 }).catch(() => {});
  check(await page.evaluate(() => window.__assault.world.state === 'done' || window.__assault.stage === 2), 'the tank drives onto the hatch and drops through');

  // Phase 4: stage 2 follows, with UFO launchers rising once their wave is destroyed.
  await page.waitForFunction(() => window.__assault.stage === 2 && window.__assault.world.state === 'playing', null, { timeout: 10000 }).catch(() => {});
  const s2 = await page.evaluate(() => {
    const w = window.__assault.world;
    return { stage: window.__assault.stage, time: w.timeLeft, hidden: w.enemies.filter((e) => e.state === 'hidden').length, zones: w.jumpZones.length };
  });
  check(s2.stage === 2 && s2.time > 155 && s2.hidden === 16 && s2.zones === 2, `stage 2 follows: 2:40 clock, 16 buried UFO launchers, 2 jump zones (${JSON.stringify(s2)})`);
  await page.waitForTimeout(600);
  await shot('18-stage2');
  await page.evaluate(() => {
    const w = window.__assault.world;
    w.invulnerable = 1e9;
    for (let i = w.enemies.length - 1; i >= 0; i--) if (w.enemies[i].group === 1) w.enemies.splice(i, 1);
  });
  await page.waitForTimeout(900);
  const rising = await page.evaluate(() => window.__assault.world.enemies.filter((e) => e.kind === 'ufo' && e.state !== 'hidden').length);
  check(rising === 3, `wiping out the first wave raises three UFO launchers (${rising})`);
  await page.waitForTimeout(400);
  await shot('18b-ufos-rising');

  // End the game on a qualifying score: time runs out on the last life.
  await page.evaluate(() => {
    const w = window.__assault.world;
    w.lives = 1;
    w.invulnerable = 0;
    w.timeLeft = 0.05;
  });
  await page.waitForFunction(() => window.__assault.scene === 'nameEntry', null, { timeout: 12000 }).catch(() => {});
  check(await page.evaluate(() => window.__assault.scene === 'nameEntry'), 'a top score leads to name entry');
  await page.keyboard.type('TODD');
  await page.waitForTimeout(300);
  await shot('19-name-entry');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__assault.scene === 'title', null, { timeout: 5000 }).catch(() => {});
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('assault.highScores.v1') ?? '[]'));
  check(saved[0]?.name === 'TODD' && saved[0]?.score >= 50000 && saved[0]?.stage === '02', `the new top score is saved (${JSON.stringify(saved[0])})`);
  await page.waitForTimeout(7300);
  await shot('20-how-to-play');

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(`\nall checks passed; screenshots in ${OUT}/`);
