import type { Maneuver } from './maneuver';

export const ARROW_TUNING = {
  /** Two presses of the same arrow within this many ms make a roll. */
  doubleTapMs: 260,
  /** How long (ms) a roll request stays pending, so the tank picks it up even mid-turn. */
  rollWindowMs: 160,
};

type Arrow = 'up' | 'down' | 'left' | 'right';

/**
 * Simplified one-handed controls on the arrow keys: up/down drive, left/right
 * turn (and steer while driving), left+right together pops a wheelie, and a
 * quick double tap of left or right rolls that way.
 */
export class ArrowControls {
  private held = new Set<Arrow>();
  private lastTap: Partial<Record<Arrow, number>> = {};
  private roll: { maneuver: Maneuver; until: number } | null = null;

  press(key: Arrow, now: number): void {
    if (this.held.has(key)) return;
    this.held.add(key);
    if (key === 'left' || key === 'right') {
      const last = this.lastTap[key];
      if (last !== undefined && now - last <= ARROW_TUNING.doubleTapMs && !this.held.has(key === 'left' ? 'right' : 'left')) {
        this.roll = { maneuver: key === 'left' ? 'rollLeft' : 'rollRight', until: now + ARROW_TUNING.rollWindowMs };
        this.lastTap[key] = undefined;
        return;
      }
      this.lastTap[key] = now;
    }
  }

  release(key: Arrow): void {
    this.held.delete(key);
  }

  clear(): void {
    this.held.clear();
    this.roll = null;
  }

  /** True while any arrow is held (or a roll is pending), so the arrows take priority. */
  active(now: number): boolean {
    return this.held.size > 0 || (this.roll !== null && now <= this.roll.until);
  }

  maneuver(now: number): Maneuver {
    if (this.roll && now <= this.roll.until) return this.roll.maneuver;
    this.roll = null;
    const h = this.held;
    if (h.has('left') && h.has('right')) return 'wheelie';
    const go = h.has('up') && !h.has('down') ? 'forward' : h.has('down') && !h.has('up') ? 'back' : null;
    const turn = h.has('left') ? 'Left' : h.has('right') ? 'Right' : null;
    if (go && turn) return `${go}${turn}`;
    if (go) return go;
    if (turn) return `turn${turn}`;
    return 'idle';
  }
}
