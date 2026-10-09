import { describe, expect, it } from 'vitest';
import { Material, TileTerrain } from '../src/sim/terrain';
import { STAGES } from '../src/stages/stages';

const OPEN: Material[] = [Material.Ground, Material.Rough, Material.Concrete];

describe.each(STAGES.map((s) => [s.number, s] as const))('stage %i', (_n, stage) => {
  const t = new TileTerrain(stage.map, 16, stage.seed);
  const spawns = [...t.spawns, ...(stage.spawns ?? [])];

  it('has a start, an exit hatch, and cannons guarding it', () => {
    expect(t.solidAt(t.start.x, t.start.y)).toBe(false);
    expect(t.hatch).not.toBeNull();
    expect(spawns.filter((s) => s.kind === 'cannon1').length).toBeGreaterThanOrEqual(2);
  });

  it('places every enemy and jump zone on open ground', () => {
    for (const s of spawns) expect(OPEN, `${s.kind} at ${s.tx},${s.ty}`).toContain(t.tileAt(s.tx, s.ty));
    for (const z of t.jumpZones) expect(t.solidAt(z.x, z.y)).toBe(false);
  });

  it('routes the guide arrow over open ground', () => {
    for (const [x, y] of stage.guide) expect(OPEN, `waypoint ${x},${y}`).toContain(t.tileAt(x, y));
  });

  it('only triggers UFO launchers from waves that exist', () => {
    const groups = new Set(spawns.map((s) => s.group).filter((g) => g !== undefined));
    for (const s of spawns) if (s.after !== undefined) expect(groups.has(s.after)).toBe(true);
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
