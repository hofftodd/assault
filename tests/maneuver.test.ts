import { describe, expect, it } from 'vitest';
import { resolveManeuver, type Dir, type Maneuver } from '../src/input/maneuver';

const DIRS: Dir[] = ['none', 'up', 'down', 'left', 'right'];

// The original cabinet's instruction plate, lever by lever.
const PLATE: [Dir, Dir, Maneuver][] = [
  ['up', 'up', 'forward'],
  ['down', 'down', 'back'],
  ['down', 'up', 'turnLeft'],
  ['up', 'down', 'turnRight'],
  ['left', 'left', 'rollLeft'],
  ['right', 'right', 'rollRight'],
  ['left', 'right', 'wheelie'],
];

describe('resolveManeuver', () => {
  it.each(PLATE)('L=%s R=%s -> %s', (l, r, expected) => {
    expect(resolveManeuver(l, r)).toBe(expected);
  });

  it('treats every other combination as idle, including single levers', () => {
    const acting = new Set(PLATE.map(([l, r]) => `${l},${r}`));
    let idle = 0;
    for (const l of DIRS) {
      for (const r of DIRS) {
        if (acting.has(`${l},${r}`)) continue;
        expect(resolveManeuver(l, r), `L=${l} R=${r}`).toBe('idle');
        idle++;
      }
    }
    expect(idle).toBe(25 - PLATE.length);
  });

  it('ignores levers pushed together (right, left)', () => {
    expect(resolveManeuver('right', 'left')).toBe('idle');
  });
});
