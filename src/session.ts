import type { Dir, Maneuver } from './input/maneuver';
import type { TankMode } from './sim/tank';

/** State shared between scenes for the current play session. */
export interface Session {
  score: number;
  topScore: number;
  lives: number;
  showDebug: boolean;
  debug: { left: Dir; right: Dir; maneuver: Maneuver; mode: TankMode; nukeCooldown: number };
}

export const SESSION_KEY = 'session';

export function createSession(): Session {
  return {
    score: 0,
    topScore: 30000,
    lives: 3,
    showDebug: import.meta.env.DEV,
    debug: { left: 'none', right: 'none', maneuver: 'idle', mode: 'drive', nukeCooldown: 0 },
  };
}
