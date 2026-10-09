/** Position of one 4-way lever. */
export type Dir = 'none' | 'up' | 'down' | 'left' | 'right';

export type Maneuver =
  | 'idle'
  | 'forward'
  | 'back'
  | 'turnLeft'
  | 'turnRight'
  /** Driving while steering (arrow keys). */
  | 'forwardLeft'
  | 'forwardRight'
  | 'backLeft'
  | 'backRight'
  | 'rollLeft'
  | 'rollRight'
  | 'wheelie';

/**
 * The seven lever pairs printed on the original cabinet's instruction plate.
 * Any other combination, including a single lever on its own, does nothing.
 */
const TABLE: Record<string, Maneuver> = {
  'up,up': 'forward',
  'down,down': 'back',
  'down,up': 'turnLeft',
  'up,down': 'turnRight',
  'left,left': 'rollLeft',
  'right,right': 'rollRight',
  'left,right': 'wheelie',
};

export function resolveManeuver(left: Dir, right: Dir): Maneuver {
  return TABLE[`${left},${right}`] ?? 'idle';
}

/** Which way a maneuver turns the hull: -1 left, 1 right, 0 not at all. */
export function steering(m: Maneuver): -1 | 0 | 1 {
  if (m === 'turnLeft' || m === 'forwardLeft' || m === 'backLeft') return -1;
  if (m === 'turnRight' || m === 'forwardRight' || m === 'backRight') return 1;
  return 0;
}

/** Whether a maneuver drives the tank: 1 forward, -1 back, 0 not at all. */
export function drive(m: Maneuver): -1 | 0 | 1 {
  if (m === 'forward' || m === 'forwardLeft' || m === 'forwardRight') return 1;
  if (m === 'back' || m === 'backLeft' || m === 'backRight') return -1;
  return 0;
}
