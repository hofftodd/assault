import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../src/input/bindings';
import { KeyboardLevers } from '../src/input/keyboardLevers';
import { Lever } from '../src/input/lever';

class FakeKeyEvent extends Event {
  defaultPrevented_ = false;
  constructor(
    type: string,
    readonly code: string,
    readonly repeat = false,
  ) {
    super(type, { cancelable: true });
  }
}

function setup() {
  const target = new EventTarget();
  const kb = new KeyboardLevers(target, DEFAULT_BINDINGS);
  const down = (code: string, repeat = false) => target.dispatchEvent(new FakeKeyEvent('keydown', code, repeat));
  const up = (code: string) => target.dispatchEvent(new FakeKeyEvent('keyup', code));
  return { target, kb, down, up };
}

describe('Lever', () => {
  it('is neutral with nothing held', () => {
    expect(new Lever().dir).toBe('none');
  });

  it('follows the most recently pressed direction, like a 4-way gate', () => {
    const lever = new Lever();
    lever.press('up');
    lever.press('left');
    expect(lever.dir).toBe('left');
    lever.release('left');
    expect(lever.dir).toBe('up');
    lever.release('up');
    expect(lever.dir).toBe('none');
  });
});

describe('KeyboardLevers', () => {
  it('maps WASD and IJKL onto the two levers', () => {
    const { kb, down, up } = setup();
    down('KeyW');
    down('KeyI');
    expect(kb.maneuver).toBe('forward');
    up('KeyI');
    down('KeyK');
    expect(kb.maneuver).toBe('turnRight');
    up('KeyW');
    up('KeyK');
    down('KeyA');
    down('KeyL');
    expect(kb.maneuver).toBe('wheelie');
  });

  it('does nothing with a single lever', () => {
    const { kb, down } = setup();
    down('KeyW');
    expect(kb.maneuver).toBe('idle');
  });

  it('counts fire presses once per press, ignoring key repeat', () => {
    const { kb, down, up } = setup();
    down('Space');
    down('Space', true);
    down('Space', true);
    expect(kb.fire).toBe(true);
    expect(kb.consumeFirePresses()).toBe(1);
    expect(kb.consumeFirePresses()).toBe(0);
    up('Space');
    expect(kb.fire).toBe(false);
  });

  it('prevents the browser default only for bound keys', () => {
    const { target } = setup();
    const bound = new FakeKeyEvent('keydown', 'Space');
    const unbound = new FakeKeyEvent('keydown', 'KeyQ');
    target.dispatchEvent(bound);
    target.dispatchEvent(unbound);
    expect(bound.defaultPrevented).toBe(true);
    expect(unbound.defaultPrevented).toBe(false);
  });

  it('releases everything when the window loses focus', () => {
    const { target, kb, down } = setup();
    down('KeyW');
    down('KeyI');
    down('Space');
    target.dispatchEvent(new Event('blur'));
    expect(kb.maneuver).toBe('idle');
    expect(kb.fire).toBe(false);
  });
});
