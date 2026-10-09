export interface ScoreEntry {
  score: number;
  /** Stage reached ("EE" in the original means the game was completed). */
  stage: string;
  name: string;
}

export const TABLE_SIZE = 5;
export const NAME_LENGTH = 7;

/** The original's default table. */
export const DEFAULT_SCORES: ScoreEntry[] = [
  { score: 30000, stage: '02', name: 'BLAZER' },
  { score: 25000, stage: '02', name: 'GROBDA' },
  { score: 22000, stage: '02', name: 'LEOPARD' },
  { score: 18000, stage: '01', name: 'PANTHER' },
  { score: 15000, stage: '01', name: 'LYNX' },
];

export const RANK_LABELS = ['TOP', '2ND', '3RD', '4TH', '5TH'];

/** Rank (0-based) a score would take in the table, or -1 if it doesn't make it. */
export function rankFor(table: readonly ScoreEntry[], score: number): number {
  if (score <= 0) return -1;
  const i = table.findIndex((e) => score > e.score);
  if (i >= 0) return i;
  return table.length < TABLE_SIZE ? table.length : -1;
}

/** A new table with the entry inserted at its rank (unchanged if it doesn't qualify). */
export function insertScore(table: readonly ScoreEntry[], entry: ScoreEntry): ScoreEntry[] {
  const rank = rankFor(table, entry.score);
  if (rank < 0) return [...table];
  const next = [...table];
  next.splice(rank, 0, { ...entry, name: entry.name.slice(0, NAME_LENGTH) });
  return next.slice(0, TABLE_SIZE);
}

const STORAGE_KEY = 'assault.highScores.v1';

/** The saved table, or the defaults when storage is empty, unavailable or corrupt. */
export function loadScores(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): ScoreEntry[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_SCORES];
    const parsed = JSON.parse(raw) as ScoreEntry[];
    const valid =
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((e) => typeof e.score === 'number' && typeof e.name === 'string' && typeof e.stage === 'string');
    return valid ? parsed.slice(0, TABLE_SIZE) : [...DEFAULT_SCORES];
  } catch {
    return [...DEFAULT_SCORES];
  }
}

export function saveScores(table: readonly ScoreEntry[], storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(table));
  } catch {
    // Private mode or storage disabled: scores just won't persist.
  }
}
