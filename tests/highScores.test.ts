import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORES, insertScore, loadScores, rankFor, saveScores } from '../src/highScores';

describe('high scores', () => {
  it('ranks scores against the table', () => {
    expect(rankFor(DEFAULT_SCORES, 40000)).toBe(0);
    expect(rankFor(DEFAULT_SCORES, 23000)).toBe(2);
    expect(rankFor(DEFAULT_SCORES, 15000)).toBe(-1);
    expect(rankFor(DEFAULT_SCORES, 0)).toBe(-1);
  });

  it('inserts at the rank and drops the last entry', () => {
    const t = insertScore(DEFAULT_SCORES, { score: 26000, stage: '01', name: 'TODDHOFFMAN' });
    expect(t.map((e) => e.name)).toEqual(['BLAZER', 'TODDHOF', 'GROBDA', 'LEOPARD', 'PANTHER']);
  });

  it('round-trips through storage and falls back to defaults when storage is bad', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const t = insertScore(DEFAULT_SCORES, { score: 99999, stage: '01', name: 'ACE' });
    saveScores(t, storage);
    expect(loadScores(storage)).toEqual(t);
    mem.set([...mem.keys()][0], '{nonsense');
    expect(loadScores(storage)).toEqual(DEFAULT_SCORES);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadScores(throwing)).toEqual(DEFAULT_SCORES);
  });
});
