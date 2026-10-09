import type { Bindings, LeverKeys } from './bindings';
import { ArrowControls } from './arrowControls';
import { Lever } from './lever';
import { resolveManeuver, type Dir, type Maneuver } from './maneuver';

type Held = Exclude<Dir, 'none'>;

/**
 * Maps raw keyboard events onto the controls: the two levers (WASD + IJKL), the
 * one-handed arrow scheme, and the fire/start buttons. Whichever scheme is in use
 * drives the tank; the arrows win while any arrow is held.
 */
export class KeyboardLevers {
  readonly left = new Lever();
  readonly right = new Lever();
  readonly arrows = new ArrowControls();

  private fireHeld = new Set<string>();
  private firePresses = 0;
  private startPresses = 0;
  private readonly keyMap = new Map<string, (down: boolean) => void>();

  constructor(
    private readonly target: EventTarget,
    bindings: Bindings,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.bindLever(this.left, bindings.left);
    this.bindLever(this.right, bindings.right);
    for (const dir of ['up', 'down', 'left', 'right'] as Held[]) {
      this.keyMap.set(bindings.arrows[dir], (down) => (down ? this.arrows.press(dir, this.now()) : this.arrows.release(dir)));
    }
    for (const code of bindings.fire) {
      this.keyMap.set(code, (down) => {
        if (down && !this.fireHeld.has(code)) this.firePresses++;
        if (down) this.fireHeld.add(code);
        else this.fireHeld.delete(code);
      });
    }
    for (const code of bindings.start) {
      this.keyMap.set(code, (down) => {
        if (down) this.startPresses++;
      });
    }
    target.addEventListener('keydown', this.onKey);
    target.addEventListener('keyup', this.onKey);
    target.addEventListener('blur', this.onBlur);
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.onKey);
    this.target.removeEventListener('keyup', this.onKey);
    this.target.removeEventListener('blur', this.onBlur);
  }

  get maneuver(): Maneuver {
    const t = this.now();
    if (this.arrows.active(t)) return this.arrows.maneuver(t);
    return resolveManeuver(this.left.dir, this.right.dir);
  }

  get fire(): boolean {
    return this.fireHeld.size > 0;
  }

  /** Number of fire presses since the last call. */
  consumeFirePresses(): number {
    const n = this.firePresses;
    this.firePresses = 0;
    return n;
  }

  /** Number of start presses since the last call. */
  consumeStartPresses(): number {
    const n = this.startPresses;
    this.startPresses = 0;
    return n;
  }

  private bindLever(lever: Lever, keys: LeverKeys): void {
    for (const dir of ['up', 'down', 'left', 'right'] as Held[]) {
      this.keyMap.set(keys[dir], (down) => (down ? lever.press(dir) : lever.release(dir)));
    }
  }

  private onKey = (e: Event): void => {
    const ke = e as KeyboardEvent;
    const handler = this.keyMap.get(ke.code);
    if (!handler) return;
    ke.preventDefault();
    if (ke.type === 'keydown' && ke.repeat) return;
    handler(ke.type === 'keydown');
  };

  // Keys released while the window is unfocused never send keyup.
  private onBlur = (): void => {
    this.left.clear();
    this.right.clear();
    this.arrows.clear();
    this.fireHeld.clear();
  };
}
