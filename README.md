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
| ← | → | A + L | Wheelie (stops; fires nukes in a later milestone) |

**Space** fires (coming in milestone 2). In dev builds, **`** (backquote)
toggles a lever/maneuver readout.

## Layout

```
src/input/     lever + maneuver logic (pure) and keyboard adapter
src/sim/       tank movement, terrain and collision (pure, unit-tested)
src/art/       palette, pixel-art sprites, pixel font, procedural terrain renderer
src/scenes/    Phaser scenes: boot (textures), game (world + rotating camera), HUD
src/stages/    map data
tests/         Vitest unit tests
scripts/       smoke test and art preview tools
reference/     original screenshots/sprites for drawing reference (not shipped)
```

## Status

Milestone 1 is done: the two-lever controls, and the tank driving, turning,
rolling and wheelieing on a test map while the world rotates around it.
Next is weapons (regular shots, wheelie nukes), then enemies, then a faithful
stage 1.
