import type { Dir } from './maneuver';

type Held = Exclude<Dir, 'none'>;

/**
 * One 4-way lever driven by four keys. A real 4-way gate can only sit in one
 * direction, so when several keys are held the most recently pressed one wins;
 * releasing it falls back to the next most recent key still held.
 */
export class Lever {
  private held: Held[] = [];

  press(dir: Held): void {
    this.release(dir);
    this.held.push(dir);
  }

  release(dir: Held): void {
    const i = this.held.indexOf(dir);
    if (i >= 0) this.held.splice(i, 1);
  }

  clear(): void {
    this.held = [];
  }

  get dir(): Dir {
    return this.held.length ? this.held[this.held.length - 1] : 'none';
  }
}
