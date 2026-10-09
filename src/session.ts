import type { Dir, Maneuver } from './input/maneuver';
import type { TankMode } from './sim/tank';

/** State shared between scenes for the current play session. */
export interface Session {
  score: number;
  topScore: number;
  lives: number;
  showDebug: boolean;
  /** Centre-screen banner such as "YOU WERE HIT", or null. */
  message: string | null;
  debug: { left: Dir; right: Dir; maneuver: Maneuver; mode: TankMode; nukeCooldown: number };
}

export const SESSION_KEY = 'session';
/** Registry key of the shared Sfx instance. */
export const SFX_KEY = 'sfx';

export const STARTING_LIVES = 3;

export function createSession(): Session {
  return {
    score: 0,
    topScore: 30000,
    lives: STARTING_LIVES,
    showDebug: import.meta.env.DEV,
    message: null,
    debug: { left: 'none', right: 'none', maneuver: 'idle', mode: 'drive', nukeCooldown: 0 },
  };
}
