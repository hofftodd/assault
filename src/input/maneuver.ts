/** Position of one 4-way lever. */
export type Dir = 'none' | 'up' | 'down' | 'left' | 'right';

export type Maneuver =
  | 'idle'
  | 'forward'
  | 'back'
  | 'turnLeft'
  | 'turnRight'
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
