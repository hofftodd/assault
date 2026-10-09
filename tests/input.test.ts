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

describe('arrow controls', () => {
  function arrows() {
    const target = new EventTarget();
    let now = 1000;
    const kb = new KeyboardLevers(target, DEFAULT_BINDINGS, () => now);
    const down = (code: string) => target.dispatchEvent(new FakeKeyEvent('keydown', code));
    const up = (code: string) => target.dispatchEvent(new FakeKeyEvent('keyup', code));
    const wait = (ms: number) => (now += ms);
    return { kb, down, up, wait };
  }

  it('drives forward and back, and turns', () => {
    const { kb, down, up } = arrows();
    down('ArrowUp');
    expect(kb.maneuver).toBe('forward');
    up('ArrowUp');
    down('ArrowDown');
    expect(kb.maneuver).toBe('back');
    up('ArrowDown');
    down('ArrowLeft');
    expect(kb.maneuver).toBe('turnLeft');
    up('ArrowLeft');
    expect(kb.maneuver).toBe('idle');
  });

  it('steers while driving forward or back', () => {
    const { kb, down, up } = arrows();
    down('ArrowUp');
    down('ArrowRight');
    expect(kb.maneuver).toBe('forwardRight');
    up('ArrowUp');
    down('ArrowDown');
    expect(kb.maneuver).toBe('backRight');
  });

  it('pops a wheelie with left and right together', () => {
    const { kb, down } = arrows();
    down('ArrowLeft');
    down('ArrowRight');
    expect(kb.maneuver).toBe('wheelie');
  });

  it('rolls on a quick double tap, but not on a slow one', () => {
    const { kb, down, up, wait } = arrows();
    down('ArrowRight');
    wait(60);
    up('ArrowRight');
    wait(90);
    down('ArrowRight');
    expect(kb.maneuver).toBe('rollRight');
    up('ArrowRight');
    wait(20);
    expect(kb.maneuver).toBe('rollRight');
    wait(400);
    expect(kb.maneuver).toBe('idle');

    down('ArrowLeft');
    up('ArrowLeft');
    wait(500);
    down('ArrowLeft');
    expect(kb.maneuver).toBe('turnLeft');
  });

  it('leaves the twin-lever keys working when no arrow is held', () => {
    const { kb, down } = arrows();
    down('KeyW');
    down('KeyI');
    expect(kb.maneuver).toBe('forward');
  });
});
