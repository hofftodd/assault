import { describe, expect, it } from 'vitest';
import { chordTones, compile, noteFreq, SONGS, stageTrack, type TrackName } from '../src/audio/songs';
import { WORLD_TUNING } from '../src/sim/world';
import { STAGES } from '../src/stages/stages';

const seconds = (name: TrackName) => {
  const c = compile(SONGS[name]);
  return c.steps * c.stepTime;
};

describe('the soundtrack', () => {
  it('reads note and chord names', () => {
    expect(noteFreq('A4')).toBeCloseTo(440);
    expect(noteFreq('A5')).toBeCloseTo(880);
    expect(noteFreq('C#5')).toBeCloseTo(noteFreq('Db5'));
    expect(chordTones('Am', 4)).toEqual([69, 72, 76]);
    expect(chordTones('C', 4)).toEqual([60, 64, 67]);
    expect(() => noteFreq('H2')).toThrow();
  });

  it.each(Object.keys(SONGS) as TrackName[])('%s compiles into notes in a sensible range', (name) => {
    const c = compile(SONGS[name]);
    expect(c.notes.length).toBeGreaterThanOrEqual(8);
    for (const n of c.notes) {
      const [lo, hi] = n.part === 'bass' ? [40, 260] : n.part === 'pad' ? [90, 400] : [180, 1400];
      expect(n.freq, `${n.part} note at step ${n.step}`).toBeGreaterThan(lo);
      expect(n.freq, `${n.part} note at step ${n.step}`).toBeLessThan(hi);
      expect(n.step + n.len).toBeLessThanOrEqual(c.steps);
    }
  });

  it('themes loop for a good while; jingles are short and play once', () => {
    for (const name of ['stage1', 'land', 'river', 'base1', 'base2', 'ending'] as const) {
      expect(SONGS[name].loop).toBe(true);
      expect(seconds(name), name).toBeGreaterThanOrEqual(20);
    }
    for (const name of ['clear', 'areaClear', 'gameOver'] as const) expect(SONGS[name].loop).toBe(false);
    // The clear fanfare finishes within STAGE CLEAR and the time bonus.
    expect(seconds('clear')).toBeLessThan(WORLD_TUNING.clearMessageTime + WORLD_TUNING.bonusMessageTime);
  });

  it('gives every stage a theme, shared as in the original', () => {
    expect(STAGES.map((s) => stageTrack(s.number))).toEqual(['stage1', 'land', 'river', 'river', 'river', 'land', 'base1', 'base2', 'base2', 'river', 'base2']);
  });
});
