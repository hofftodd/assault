import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/sim/enemies';
import { Material, TileTerrain } from '../src/sim/terrain';
import { STAGES } from '../src/stages/stages';

const OPEN: Material[] = [Material.Ground, Material.Rough, Material.Concrete];
/** Tiles a tank can drive over (crops slow it down). */
const DRIVABLE: Material[] = [...OPEN, Material.Crop];

/** Tiles reachable by driving from the start (with the exit gates open). */
function reachable(t: TileTerrain): Set<string> {
  const seen = new Set<string>();
  const queue: [number, number][] = [[Math.floor(t.start.x / 16), Math.floor(t.start.y / 16)]];
  while (queue.length) {
    const [x, y] = queue.pop()!;
    const key = `${x},${y}`;
    if (seen.has(key) || !DRIVABLE.includes(t.tileAt(x, y))) continue;
    seen.add(key);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

describe.each(STAGES.map((s) => [s.number, s] as const))('stage %i', (_n, stage) => {
  const t = new TileTerrain(stage.map, 16, stage.seed);
  const spawns = [...t.spawns, ...(stage.spawns ?? [])];

  it('has a start, an exit hatch, and cannons guarding it', () => {
    expect(t.solidAt(t.start.x, t.start.y)).toBe(false);
    expect(t.hatch).not.toBeNull();
    expect(spawns.filter((s) => ENEMIES[s.kind].cannon).length).toBeGreaterThanOrEqual(2);
  });

  it('places every enemy and jump zone on open ground', () => {
    for (const s of spawns) expect(OPEN, `${s.kind} at ${s.tx},${s.ty}`).toContain(t.tileAt(s.tx, s.ty));
    for (const z of t.jumpZones) expect(t.solidAt(z.x, z.y)).toBe(false);
  });

  it('routes the guide arrow over open ground', () => {
    for (const [x, y] of stage.guide) expect(DRIVABLE, `waypoint ${x},${y}`).toContain(t.tileAt(x, y));
  });

  it('can drive from the start along the route to the cannons and the exit', () => {
    const open = reachable(t);
    for (const [x, y] of stage.guide) expect(open.has(`${x},${y}`), `waypoint ${x},${y}`).toBe(true);
    for (const s of spawns.filter((s) => ENEMIES[s.kind].cannon)) expect(open.has(`${s.tx},${s.ty}`), `cannon at ${s.tx},${s.ty}`).toBe(true);
    const h = t.hatch!;
    expect(open.has(`${Math.floor(h.x / 16)},${Math.floor(h.y / 16)}`)).toBe(true);
  });

  it('only triggers UFO launchers from waves that exist', () => {
    const groups = new Set(spawns.map((s) => s.group).filter((g) => g !== undefined));
    for (const s of spawns) if (s.after !== undefined) expect(groups.has(s.after)).toBe(true);
  });
});

describe('stage 1 follows the walkthrough', () => {
  const s1 = STAGES[0];
  const count = (kind: string) => (s1.spawns ?? []).filter((s) => s.kind === kind).length;
  it('has 43 Type 1s, 12 Type 2s, a Type 5 and 2+3 pillboxes over 2:15', () => {
    expect(s1.timeLimit).toBe(135);
    expect(count('type1')).toBe(43);
    expect(count('type2')).toBe(12);
    expect(count('type5')).toBe(1);
    expect(count('torchika1')).toBe(2);
    expect(count('torchika2')).toBe(3);
  });
});

describe('stage 2 follows the walkthrough', () => {
  const s2 = STAGES[1];
  const count = (kind: string) => (s2.spawns ?? []).filter((s) => s.kind === kind).length;
  it('has 14+2 UFO launchers, 13 Type 3s, 30 Type 2s, 26 Type 1s and 2 Type 5s over 2:40', () => {
    expect(s2.timeLimit).toBe(160);
    expect(count('ufo')).toBe(16);
    expect(count('type3')).toBe(13);
    expect(count('type2')).toBe(24);
    expect(count('type1')).toBe(26);
    expect(count('type5')).toBe(2);
    expect(count('parking')).toBe(1);
  });
});
