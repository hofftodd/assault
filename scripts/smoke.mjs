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
  await page.goto('http://localhost:4173/?peaceful');
  await page.waitForFunction(() => window.__assault?.tank, null, { timeout: 15000 });
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

  await hold(['KeyA', 'KeyL'], 300);
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

  // Phase 2: combat against the test map's enemies.
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.__assault?.world, null, { timeout: 15000 });
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
  await page.waitForFunction(() => window.__assault.world.state === 'playing' && window.__assault.world.lives === 3, null, { timeout: 8000 }).catch(() => {});
  const fresh = await world();
  check(fresh.state === 'playing' && fresh.lives === 3 && fresh.score === 0 && fresh.enemies.length === 18, 'a fresh game starts after GAME OVER');

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
