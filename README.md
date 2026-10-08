# Assault (fan remake)

A browser-based fan remake of Namco's 1988 arcade tank shooter *Assault*, built
with TypeScript and [Phaser 3](https://phaser.io/). It runs in any modern browser
on Windows, macOS and Linux.

All art and sound are original and drawn procedurally. The files in `reference/`
are drawing reference only and are never loaded by the game. The full design and
requirements are in [`docs/DESIGN.md`](docs/DESIGN.md).

## Running it

Needs Node.js 20.19+ (22 LTS recommended) and **npm 11+**. npm 10.9 has a bug
that breaks installing Vitest; run `npx npm@11 install` if `npm -v` shows 10.x.

```sh
npm install
npm run dev        # play at http://localhost:5173
npm test           # unit tests
npm run build      # typecheck + production build in dist/
npm run smoke      # after a build: drives the game in headless Chromium, saves screenshots
npm run art        # renders sprites/terrain/font to smoke-output/art/ for inspection
```

## Controls

The original cabinet had two 4-way levers, one per hand. Here the left lever is
**WASD** and the right lever is **IJKL**. Only these pairs do anything:

| Left lever | Right lever | Keys | Move |
|---|---|---|---|
| ↑ | ↑ | W + I | Forward |
| ↓ | ↓ | S + K | Back |
| ↓ | ↑ | S + I | Turn left |
| ↑ | ↓ | W + K | Turn right |
| ← | ← | A + J | Roll left (flip over sideways) |
| → | → | D + L | Roll right |
| ← | → | A + L | Wheelie (stops and rears up; fire launches a nuke) |

**Space** fires: tap or hold. At most three shots can be on screen, and they
burst against cliffs. You can fire while rolling. During a wheelie, fire lobs a
nuke over obstacles that explodes about 120 px ahead; it then needs 2.5 s to
recharge. **M** mutes the sound. In dev builds, **`** (backquote) toggles a
readout of the levers, the current move and the nuke recharge.

## Layout

```
src/input/     lever + maneuver logic (pure) and keyboard adapter
src/sim/       tank movement, weapons, terrain and collision (pure, unit-tested)
src/art/       palette, pixel-art sprites, pixel font, terrain and explosion renderers
src/audio/     synthesised retro sound effects (Web Audio, no sample files)
src/scenes/    Phaser scenes: boot (textures), game (world + rotating camera), HUD
src/stages/    map data
tests/         Vitest unit tests
scripts/       smoke test and art preview tools
reference/     original screenshots/sprites for drawing reference (not shipped)
```

## Status

- **Milestone 1 (done):** the two-lever controls, and the tank driving,
  turning, rolling and wheelieing on a test map while the world rotates around it.
- **Milestone 2 (done):** regular shots (three on screen at most), wheelie
  nukes with arc, blast radius and recharge, explosions, and sound effects.
- **Next:** enemies, damage, lives and score; then a faithful stage 1.
