# Assault (1988, Namco) Clone — Plan

## Context
Todd wants a nostalgic remake of Namco's 1988 arcade game *Assault* that runs on
Windows, macOS and Linux, is built only with free tools, plays like the original
and performs well. The repo (`hofftodd/assault`, branch `claude/eager-keller-tsnkvf`)
is empty.

Sources:
- the Wikipedia article (fetched)
- a photo of the cabinet's control instruction plate (from Todd)
- StrategyWiki pages (PDFs from Todd): Gameplay, Walkthrough, Progress Planetary
  Circumstances (stage 1), Crops Grow in River Side (stages 3–5 and 10), and
  And Reconstruct Our Ruined Home (stages 6–9 and 11)

The YouTube video is not downloadable from this sandbox, since YouTube requires
sign-in from cloud IPs. Memorial Land Forever (stage 2) has no write-up yet.

## Decisions (agreed with Todd)
- **Stack:** TypeScript + **Phaser 3** (WebGL), built with Vite and unit-tested
  with Vitest. It runs in any browser on all three OSes. A Tauri or Electron
  wrapper is optional later. The workload is tiny for a modern GPU: about 224×288,
  roughly 100 sprites, and one camera transform for the world rotation.
- **Input:** keyboard first. WASD = left lever, IJKL = right lever, Space = fire.
  Keys can be rebound. Gamepad support comes later behind the same abstraction.
- **Only the 7 paired combinations on the cabinet plate act.** Single-lever input
  and levers pushed together are ignored.
- **Art:** original retro pixel art in the 1988 style (Okawara-esque mecha), not
  ripped assets. **Native 224×288 portrait** (a vertical monitor, confirmed by
  StrategyWiki's original screenshot), integer-scaled (e.g. 3× = 672×864),
  letterboxed on wide screens, with `pixelArt: true`.

### Visual reference (screenshots from Todd and StrategyWiki)
- **The player tank is anchored at lower-center (about x=112, y=225 of 288),
  not at screen center,** so most of the view is ahead of the tank. The camera
  rotates around that point.
- HUD: pink "1UPSCORE" at top-left with the score below it in white with a blue
  shadow; "TOPSCORE" at top-right; **remaining lives as small tank icons at
  bottom-left**. Nothing else on screen during play.
- Terrain palette:
  - olive/khaki textured ground
  - grey-white rocky cliffs fringed with green moss/foliage
  - beyond the edge, a **black starfield void** with a teal outline (the
    floating continents)
  - scattered round green bushes and grey rock mounds that **cast soft dark
    shadows toward the upper-left**
- Sprites: the player tank is white/silver with blue tread pods and twin barrels.
  Type 1 enemy tanks are rust-orange with blue treads, drawn at arbitrary
  rotations, so sprites must look good rotated.
- Title screen: a chrome "ASSAULT" logo over a purple-to-blue gradient sky with
  the tank below, then "© 1988 NAMCO / ALL RIGHTS RESERVED". Ours will use an
  original logo and our own credit line.
- High-score screen: "RECORD OF THE BEST SCORE", with columns RANK / SCORE / STG /
  COMMANDER. Default table: TOP 30000 02 BLAZER, 2ND 25000 02 GROBDA, 3RD 22000
  02 LEOPARD, 4TH 18000 01 PANTHER, 5TH 15000 01 LYNX.

## Game requirements

### Controls (cabinet plate + StrategyWiki)
| L | R | Maneuver | Keys |
|---|---|---|---|
| ↑ | ↑ | Forward | W+I |
| ↓ | ↓ | Back | S+K |
| ↓ | ↑ | Turn left | S+I |
| ↑ | ↓ | Turn right | W+K |
| ← | ← | Roll left: the tank flips sideways; it can fire and fits narrow gaps | A+J |
| → | → | Roll right | D+L |
| ← | → | **Wheelie**: the tank stops, rears up, and fire launches a nuclear missile | A+L |
- A fire button on each lever (keyboard: Space). **Max 3 regular shots on screen.**
- **Nuke recharge is 2.5 s,** except while raised on a jump zone.
- Nukes fired during a wheelie also hit **airborne targets** (Generators hovering
  overhead).

### Structure: 4 areas, 11 stages
| Stage | Area | Time limit |
|---|---|---|
| 1 | Progress Planetary Circumstances | 2:15 |
| 2 | Memorial Land Forever | ? (no write-up) |
| 3, 4, 5 | Crops Grow in River Side | 1:50, 2:10, 6:00 |
| 6, 7, 8, 9 | And Reconstruct Our Ruined Home | 3:30, 2:30, 2:30, ? |
| 10 | Crops Grow in River Side (revisited, populated) | 4:30 |
| 11 | And Reconstruct Our Ruined Home (final) | 4:30 |
- Areas are large shared maps. Consecutive stages in an area continue through
  **exit gates that slide open**. Moving between areas works like this: the tank
  drives onto an exit hatch or launch pad, "NOW YOU ASSAULT ON NEXT STAGE!!" is
  shown, the tank is raised high, then dropped into the next area.
- Terrain looks like **floating continents**: olive ground with rocky edges over a
  black void. Area 3 has rivers, water and a hedge maze with dead ends. Area 4 is
  a 3×3 grid of mechanical base rooms.
- **Stage clear:** destroy all the Cannons. "PLAYER 1UP STAGE nn CLEAR" is shown,
  then "TIME BONUS! ss*50 POINTS", worth **50 points per second remaining**. The
  timer only appears when **under 100 s** remain. **Time out = lose a life.**
  Optionally recreate the 0-seconds wraparound bonus bug as an easter egg.
- Arrow circles on screen point toward the exit.
- **One hit kills.** "YOU WERE HIT" is shown. Single player only.
- Stages 6 and later use **tougher enemy variants** (more hits).
- Ending text: "CONGRATULATIONS! YOU REGAIN YOUR MOTHER PLANET AND ETERNAL
  PEACE!" Then a tank spec sheet ("NATIVE DEFENCE FORCE HIGH-MANEUVER BATTLE
  TANK"), credits, and 7-character high-score entry with either lever.
- Title screen: "1UPSCORE / TOPSCORE 30000 / PUSH 1P BUTTON". Optional round
  select: GRAND ASSAULT (start at stage 1) or HALF ASSAULT (start at stage 6, no
  ending).

### Enemy behavior rules
- **Dormant until the tank approaches.** Going up on a jump zone **wakes every
  enemy in view**, and they aim at the tank's landing.
- Enemies and craters **despawn when far away**: slightly beyond the nuke range
  while raised.
- **Destroyed tanks leave craters that slow the tank.** Rough terrain slows it
  too.
- Some spawn dynamically: Type 4 tanks **emerge from water**, UFO Launchers
  **emerge from holes** that open in the ground, and Generators **hover in from
  above**.

### Jump zones
- Pentagonal pads that flash red. They raise the tank into a zoomed-out bird's-eye
  view. While raised, the tank fires nukes with no recharge and is safe until it
  drops.
- **3 uses each,** then the pad turns solid black.

### Enemy roster (hits: normal / stages 6+ ; points ; weapon)
| Enemy | Hits | Points | Fires |
|---|---|---|---|
| Type 1 Tank | 1 | 100 | orange shots |
| Type 1 Armoured Tank | 3 / 4 | 100 | orange shots |
| Type 2 Tank | 1 / 4 | 200 | orange shots |
| Type 3 Tank | 1 / 3 | 300 | pink shots |
| Type 4 Tank (rises from water) | 12 (9+3) | 500+500 | pink shots |
| 101 Scouter | 1 | 500 | orange shots |
| 501 Fourlegs (hovers) | 1 | 200 | small missiles |
| Type 5 Tank (large) | 8 / 30 | 800 | small missiles |
| Type 6 Tank (large) | 16 / 48 | 1500 | pink shots |
| Type 7A Tank (large) | 48 (16 early) | 2500 | small missiles |
| Type 7B Tank (large) | 16 / 48 | 2500 | **orange shots in 16 directions** |
| Torchika Type 1 / Type 2 (pillbox) | 1 | 200 | 4-way / 8-way orange |
| Parking Tank (static, harmless) | 1 | 1000 | — |
| UFO Launcher (from hole) | 1 nuke only | 800 | laser beams |
| Red Generator (airborne) | 8 nukes | 5000 | drops small missiles |
| Black Generator (airborne) | 20 nukes | 5000 | drops small missiles |
| Type 1 / 2 / 3 Cannon | 10 / 20 / 32 | 1200 | pink shots |
- **Generators: a single nuke into the centre hole kills them instantly.**
- Projectile classes: orange shots, pink shots, small missiles and lasers.
  Whether the player can shoot down a projectile depends on its class (Wikipedia
  says some can be shot down). Assume missiles are shootable and the others are
  not, and tune later.

### Stage 1 script (Progress Planetary Circumstances): our first faithful target
The map is an F-shaped corridor: start at the bottom, then go up and around to a
base at the top right.
1. Forward: 4 × Type 1 Tank. Turn left: 4 × Type 1. Turn right: 5 × Type 1.
   Turn left: 4 × Type 1.
2. A Type 2 Torchika (8-way), then a **jump zone**.
3. Turn left: up to 22 × Type 1, 12 × Type 2 and 1 × Type 5.
4. Turn right: 2 × Type 1 Torchika, then 2 × Type 2 Torchika, then 4 × Type 1
   Tank.
5. 2 × **Type 1 Cannon** (10 hits each). That's the stage clear, followed by the
   exit hatch. Time limit 2:15.

Later stages are scripted from the same walkthroughs and kept as data.

## Architecture
```
package.json, tsconfig.json, vite.config.ts, index.html
src/main.ts                 Phaser.Game config (224x288 portrait, pixelArt, Scale.FIT, integer zoom)
src/input/levers.ts         keyboard -> {left: Dir, right: Dir}, with rebinding
src/input/maneuver.ts       pure resolveManeuver(l, r) -> Maneuver   (unit-tested)
src/config/enemies.ts       roster above as data (hits normal/hard, points, weapon, nukeOnly, airborne)
src/config/stages.ts        stage -> area, time limit, hard flag, spawn script, cannons, exit
src/scenes/Boot.ts          generate textures from pixel-art data, build SFX
src/scenes/Title.ts         attract/title, PUSH 1P BUTTON, high-score table
src/scenes/Game.ts          area map, camera rotation/zoom, collisions, dormancy/despawn, gates
src/scenes/Hud.ts           non-rotating: 1UP score, top score, lives, timer (<100s), exit arrow, banners
src/entities/PlayerTank.ts  states: DRIVE | ROLL | WHEELIE | RAISED | DEAD | SCRIPTED (stage-clear moves)
src/entities/Shot.ts, Nuke.ts, EnemyProjectile.ts, Explosion.ts, Crater.ts   (pooled)
src/entities/JumpZone.ts    3 uses, flashing red -> black, wakes enemies in view
src/entities/enemies/*.ts   Tank (by type), Torchika, Cannon, UFOLauncher, Generator, Fourlegs, ParkingTank
src/art/sprites.ts          pixel art as palette + ASCII grids -> textures
src/audio/sfx.ts            procedural retro SFX (WebAudio); original chiptune later
tests/*.test.ts             Vitest
```
Key mechanics:
- Rotating view: the camera keeps the tank at lower-center (112,225) and uses
  `camera.setRotation(-tank.heading)`. It zoom-tweens out when RAISED. The HUD is
  its own scene, so it doesn't rotate.
- Fire rules: max 3 regular shots. Nukes come from WHEELIE or RAISED, with a 2.5 s
  cooldown that is waived while RAISED. A nuke arcs (scale up then down), then
  deals radius damage. A wheelie nuke can also hit airborne Generators.
- Damage: `hits[hard ? 1 : 0]` per enemy, plus `nukeOnly` and `airborne` flags.
- Activation: dormant until within a wake radius or until a jump zone fires.
  Despawn beyond a far radius.

## Milestones
1. Scaffold (Vite/TS/Phaser/Vitest), levers and maneuver with tests, the tank
   driving on a test map (floating ground over a void) with the rotating camera.
2. Regular shots (3-cap), roll/flip, wheelie with nukes, blast radius and
   cooldown.
3. Enemy framework with dormancy and despawn: Type 1/2/5 tanks, Torchikas, Type 1
   Cannon, enemy projectiles, one-hit death, lives, score, HUD and SFX.
   Pixel-art set v1.
4. **A faithful Stage 1:** the F-shaped map, the scripted waves above, jump zone
   with RAISED/zoom/wake, craters, timer and time bonus, cannons, exit hatch and
   transition, title screen and high scores (localStorage).
5. Stages 3–11 from the walkthrough data, the remaining enemy types, gates and
   hatches, and the ending. Stage 2 gets designed once reference material turns
   up. Optional Tauri build and gamepad support.

## Verification
- `npm run test`: Vitest covers all 25 lever combinations, the 3-shot cap, the
  nuke cooldown (waived while raised), jump-zone use counting, nuke-only and
  hard-mode damage, time bonus math and cannon-gated exit.
- `npm run build`, then a Playwright smoke test against `vite preview` (using the
  pre-installed Chromium): press W+I and A+L+Space, take screenshots, and assert
  no console errors.
- Manual playtest in a browser against the walkthroughs.

## Legal note
For personal or nostalgic use. All art and sound are original; we take the
mechanics and stage scripts from public guides. Use a distinct title if it's ever
shared publicly.
