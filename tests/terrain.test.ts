import { describe, expect, it } from 'vitest';
import { Material, TileTerrain } from '../src/sim/terrain';
import { TEST_MAP } from '../src/stages/testMap';

describe('TileTerrain', () => {
  const t = new TileTerrain(TEST_MAP, 16, 1);

  it('parses the test map and finds the player start', () => {
    expect(t.cols).toBe(40);
    expect(t.rows).toBe(TEST_MAP.length);
    expect(t.start.x).toBe((19 + 0.5) * 16);
    expect(t.start.y).toBe((28 + 0.5) * 16);
    expect(t.decor.length).toBeGreaterThan(10);
  });

  it('starts the player on open ground with room to move', () => {
    expect(t.solidAt(t.start.x, t.start.y)).toBe(false);
    expect(t.materialAt(t.start.x, t.start.y)).toBe(Material.Ground);
  });

  it('treats off-map as void', () => {
    expect(t.materialAt(-100, -100)).toBe(Material.Void);
    expect(t.solidAt(-100, -100)).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const again = new TileTerrain(TEST_MAP, 16, 1);
    for (let i = 0; i < 200; i++) {
      const x = (i * 37) % t.width;
      const y = (i * 53) % t.height;
      expect(again.materialAt(x, y)).toBe(t.materialAt(x, y));
    }
  });

  it('never lets ground touch the void directly (cliffs are always rock)', () => {
    for (let ty = 0; ty < t.rows; ty++) {
      for (let tx = 0; tx < t.cols; tx++) {
        const m = t.tileAt(tx, ty);
        if (m !== Material.Ground && m !== Material.Rough) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            expect(t.tileAt(tx + dx, ty + dy), `tile ${tx},${ty}`).not.toBe(Material.Void);
          }
        }
      }
    }
  });

  it('rejects malformed maps', () => {
    expect(() => new TileTerrain(['..', '...'], 16, 1)).toThrow(/columns/);
    expect(() => new TileTerrain(['.?'], 16, 1)).toThrow(/unknown/);
  });
});
