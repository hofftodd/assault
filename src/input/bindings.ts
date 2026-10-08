/**
 * Keyboard layout for the two levers. Values are KeyboardEvent.code strings,
 * i.e. physical key positions, so WASD/IJKL stay put on AZERTY and other layouts.
 */
export interface LeverKeys {
  up: string;
  down: string;
  left: string;
  right: string;
}

export interface Bindings {
  left: LeverKeys;
  right: LeverKeys;
  fire: string[];
  start: string[];
}

export const DEFAULT_BINDINGS: Bindings = {
  left: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
  right: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL' },
  fire: ['Space'],
  start: ['Enter', 'Digit1'],
};
