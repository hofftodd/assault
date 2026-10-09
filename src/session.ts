import { loadScores, type ScoreEntry } from './highScores';
import type { Dir, Maneuver } from './input/maneuver';
import type { TankMode } from './sim/tank';

/** State shared between scenes for the current play session. */
export interface Session {
  score: number;
  topScore: number;
  lives: number;
  /** Index into STAGES of the stage being played. */
  stageIndex: number;
  /** Stage label for the high-score table: "01".."11", or "EE" after the ending. */
  stageReached: string;
  highScores: ScoreEntry[];
  showDebug: boolean;
  /** Centre-screen banner (may span several lines), or null. */
  message: string | null;
  /** Seconds shown on the HUD clock, or null when hidden. */
  clock: number | null;
  clockRed: boolean;
  /** Screen-space angle of the guide arrow (0 = up, clockwise), or null when hidden. */
  guideAngle: number | null;
  debug: { left: Dir; right: Dir; maneuver: Maneuver; mode: TankMode; nukeCooldown: number };
}

export const SESSION_KEY = 'session';
/** Registry key of the shared Sfx instance. */
export const SFX_KEY = 'sfx';

export const STARTING_LIVES = 3;

export function createSession(): Session {
  const highScores = loadScores();
  return {
    score: 0,
    topScore: highScores[0]?.score ?? 30000,
    lives: STARTING_LIVES,
    stageIndex: 0,
    stageReached: '01',
    highScores,
    showDebug: import.meta.env.DEV,
    message: null,
    clock: null,
    clockRed: false,
    guideAngle: null,
    debug: { left: 'none', right: 'none', maneuver: 'idle', mode: 'drive', nukeCooldown: 0 },
  };
}

/** Reset the per-game fields for a fresh credit. */
export function newGame(s: Session, stageIndex = 0): void {
  s.score = 0;
  s.lives = STARTING_LIVES;
  s.stageIndex = stageIndex;
  s.stageReached = '01';
  s.message = null;
  s.clock = null;
  s.guideAngle = null;
}
