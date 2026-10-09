/**
 * The soundtrack, written as data: original tunes in the spirit of an 80s arcade
 * board. A driving synth bass and drum machine under alien keyboard leads, in
 * dark harmony: Phrygian seconds, chords a half step or a tritone apart. Each song is sections of four bars, one chord per bar, with a melody of
 * eighth notes; the bass, arpeggio and drum parts follow per-bar templates.
 *
 * Melody tokens (one per eighth note, bars separated by '|' for readability):
 *   'A4' play a note   '-' hold the previous note   '.' rest   'A4/B4' two sixteenths
 * Templates (one character per sixteenth note, cycled bar by bar):
 *   bass  'R' root  'O' root an octave up  'F' fifth  '-' hold  '.' rest
 *   arp   '0' '1' '2' chord tones  '3' root an octave up  '.' rest
 *   drums 'k' kick  's' snare  'h' hat  'x' kick and hat  'c' crash  '.' rest
 */

export type TrackName = 'stage1' | 'land' | 'river' | 'base1' | 'base2' | 'clear' | 'areaClear' | 'gameOver' | 'ending';

/** alien: squelchy wide-detuned saws; synth: brighter saws; pulse: hollow detuned squares; brass: an FM horn. */
export type LeadVoice = 'alien' | 'synth' | 'pulse' | 'brass';

export interface Section {
  chords: string[];
  melody: string;
}

export interface Song {
  bpm: number;
  loop: boolean;
  lead: LeadVoice;
  bass?: string;
  arp?: string;
  /** A low drone on each bar's root and fifth. */
  pad?: boolean;
  drums?: string;
  sections: Record<string, Section>;
  order: string[];
}

export const SONGS: Record<TrackName, Song> = {
  /** Stage 1: E Phrygian, the flattened second giving it a cold, alien edge. */
  stage1: {
    bpm: 150,
    loop: true,
    lead: 'alien',
    pad: true,
    bass: 'RRORRRORRRORRROR',
    arp: '0.1.2.1.0.1.2.1.',
    drums: 'xhhhshhhxhxhshhh',
    sections: {
      A: { chords: ['Em', 'F', 'Em', 'Bb'], melody: 'E4 - B4 - G4 - F4 E4 | F4 - - - A4 - C5 B4 | B4 - - - G4 - E4 F4 | Bb4 - - - D5 - F5 E5' },
      B: { chords: ['Cm', 'B', 'Em', 'Em'], melody: 'C5 - Eb5 - G5 - F#5 G5 | D#5 - - - F#5 - B4 - | E5 - D5 - B4 - G4 F4 | E4 - - - - - . .' },
      C: { chords: ['Am', 'Bb', 'Am', 'B'], melody: 'A4 - - - E5 - - - | F5 - - - D5 - Bb4 - | C5 - B4 - A4 - E4 - | D#4 - - - F#4 - B4 -' },
    },
    order: ['A', 'A', 'B', 'C', 'A', 'B'],
  },
  /** Stages 2 and 6 (the original reuses one theme for both): D minor sliding to E flat and B flat minor. */
  land: {
    bpm: 140,
    loop: true,
    lead: 'pulse',
    pad: true,
    bass: 'R.RRR.RRR.RRR.RO',
    arp: '0.2.1.2.0.2.1.2.',
    drums: 'xhhhshhhxhhxshhh',
    sections: {
      A: { chords: ['Dm', 'Eb', 'Dm', 'Bbm'], melody: 'D5 - - - A4 - D5 Eb5 | Eb5 - - - G5 - Bb4 - | A4 - F4 - D4 - A4 - | Bb4 - - - Db5 - F5 -' },
      B: { chords: ['Gm', 'Ab', 'Dm', 'A'], melody: 'G4 - Bb4 - D5 - G5 - | Ab4 - C5 - Eb5 - Ab5 - | F5 - E5 - D5 - A4 - | C#5 - - - E5 - A4 -' },
      C: { chords: ['Bbm', 'A', 'Dm', 'Dm'], melody: 'Db5 - - - F5 - Bb5 - | A5 - - - E5 - C#5 - | D5 - F5 - A5 - G5 F5 | D5 - - - - - . .' },
    },
    order: ['A', 'B', 'A', 'C'],
  },
  /** Area 3, stages 3-5 and 10: a stalking groove, E minor creeping up to F minor and back. */
  river: {
    bpm: 132,
    loop: true,
    lead: 'alien',
    pad: true,
    bass: 'RR.RRO.RRR.RRO.R',
    arp: '0..1..2.3..2..1.',
    drums: 'xhhhshxhxhhhshxh',
    sections: {
      A: { chords: ['Em', 'Fm', 'Em', 'Fm'], melody: 'E5 - G5 - B5 - Bb5 A5 | Ab5 - - - F5 - C5 - | B4 - E5 - G5 - F#5 E5 | F5 - Ab5 - C6 - - -' },
      B: { chords: ['Cm', 'B', 'Am', 'B'], melody: 'G5 - - - Eb5 - C5 - | D#5 - - - F#5 - B4 - | A4 - C5 - E5 - G5 F5 | F#5 - - - D#5 - B4 -' },
      C: { chords: ['Em', 'Bb', 'Em', 'B'], melody: 'E5 - - - B4 - E5 - | F5 - - - D5 - Bb4 - | G4 - B4 - E5 - G5 - | F#5 - - - - - . .' },
    },
    order: ['A', 'B', 'A', 'C'],
  },
  /** Stage 7, inside the enemy base: C minor against D flat and a tritone away, G flat. */
  base1: {
    bpm: 156,
    loop: true,
    lead: 'pulse',
    pad: true,
    bass: 'RRRRRRRRRRRRRRRR',
    arp: '0123012301230123',
    drums: 'xhxhshxhxhxhshxx',
    sections: {
      A: { chords: ['Cm', 'Db', 'Cm', 'Gb'], melody: 'C5 - Eb5 - G5 - C6 - | Db6 - C6 - Ab5 - F5 - | G5 - Eb5 - C5 - G4 - | Gb4 - Bb4 - Db5 - F5 -' },
      B: { chords: ['Abm', 'G', 'Cm', 'G'], melody: 'Ab4 - B4 - Eb5 - Ab5 - | G5 - - - D5 - B4 - | C5 - Eb5 - G5 - Ab5 G5 | G5 - F5 - Eb5 - D5 -' },
    },
    order: ['A', 'A', 'B', 'B'],
  },
  /** Stages 8, 9 and 11, the base's last theme: urgent, F sharp minor against G and C. */
  base2: {
    bpm: 164,
    loop: true,
    lead: 'alien',
    pad: true,
    bass: 'RORORORORORORORO',
    arp: '0.1.2.3.2.1.0.1.',
    drums: 'xhhxshhxxhhxshsx',
    sections: {
      A: { chords: ['F#m', 'G', 'F#m', 'C'], melody: 'F#5 - - - C#5 - F#5 A5 | G5 - - - D5 - B4 - | A4 - C#5 - F#5 - A5 G5 | G5 - E5 - C5 - - -' },
      B: { chords: ['Dm', 'C#', 'F#m', 'C#'], melody: 'D5 - F5 - A5 - D6 - | C#6 - - - G#5 - F5 - | F#5 - A5 - C#6 - B5 A5 | G#5 - - - F5 - C#5 -' },
    },
    order: ['A', 'A', 'B', 'A', 'B'],
  },
  /** Stage clear: a minor fanfare that lands on a major chord. */
  clear: {
    bpm: 160,
    loop: false,
    lead: 'alien',
    bass: 'R-------O-------',
    drums: 'c...k...k.k.s...',
    sections: { A: { chords: ['Cm', 'C'], melody: 'C5 - Eb5 - G5 - C6 - | B5 - G5 - C6 - - -' } },
    order: ['A'],
  },
  /** Leaving an area by hatch or launch pad: G minor rising to a G major landing. */
  areaClear: {
    bpm: 140,
    loop: false,
    lead: 'alien',
    pad: true,
    bass: 'R...O...R...O...',
    arp: '0.1.2.3.0.1.2.3.',
    drums: 'c.h.s.h.k.h.s.h.',
    sections: { A: { chords: ['Gm', 'Eb', 'F', 'G'], melody: 'G4 - Bb4 - D5 - G5 - | Eb5 - G5 - Bb5 - - - | F5 - A5 - C6 - - - | B5 - - - G5 - - -' } },
    order: ['A'],
  },
  /** Game over: a falling lament that never resolves. */
  gameOver: {
    bpm: 100,
    loop: false,
    lead: 'pulse',
    pad: true,
    bass: 'R-------........',
    sections: { A: { chords: ['Dm', 'A'], melody: 'F5 - E5 - D5 - C#5 - | Bb4 - - - A4 - - -' } },
    order: ['A'],
  },
  /** The ending and the high-score entry: a slow anthem, the war over, still a little strange. */
  ending: {
    bpm: 96,
    loop: true,
    lead: 'alien',
    pad: true,
    bass: 'R-------O-------',
    arp: '0.1.2.1.0.1.2.1.',
    drums: 'k.......s.......',
    sections: {
      A: { chords: ['C', 'G', 'Am', 'F'], melody: 'E5 - - - D5 - C5 - | D5 - - - G4 - - - | C5 - - - E5 - A5 - | A5 - G5 - F5 - - -' },
      B: { chords: ['Ab', 'Bb', 'F', 'C'], melody: 'Eb5 - - - C5 - Ab4 - | D5 - - - Bb4 - F4 - | A4 - C5 - F5 - A5 - | G5 - - - - - . .' },
    },
    order: ['A', 'B'],
  },
};

/** The theme each stage plays (the original shares themes across stages the same way). */
export function stageTrack(stage: number): TrackName {
  if (stage === 2 || stage === 6) return 'land';
  if ([3, 4, 5, 10].includes(stage)) return 'river';
  if (stage === 7) return 'base1';
  if ([8, 9, 11].includes(stage)) return 'base2';
  return 'stage1';
}

export type Part = 'lead' | 'bass' | 'arp' | 'pad';
export type DrumKind = 'kick' | 'snare' | 'hat' | 'crash';

export interface NoteEvent {
  part: Part;
  /** Start and length in sixteenth-note steps. */
  step: number;
  len: number;
  freq: number;
}

export interface DrumEvent {
  kind: DrumKind;
  step: number;
}

export interface Compiled {
  /** Seconds per sixteenth note. */
  stepTime: number;
  /** Length of the whole song, in sixteenths. */
  steps: number;
  notes: NoteEvent[];
  drums: DrumEvent[];
}

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Frequency of a note name such as 'A4', 'C#5' or 'Bb3' (A4 = 440 Hz). */
export function noteFreq(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note '${name}'`);
  const semis = SEMITONES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
}

/** MIDI-style note numbers of a chord's root, third and fifth, rooted in the given octave. */
export function chordTones(name: string, octave: number): number[] {
  const m = /^([A-G])([#b]?)(m?)$/.exec(name);
  if (!m) throw new Error(`bad chord '${name}'`);
  const root = SEMITONES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (octave + 1) * 12;
  return [root, root + (m[3] ? 3 : 4), root + 7];
}

const midiFreq = (n: number) => 440 * 2 ** ((n - 69) / 12);

const DRUMS: Record<string, DrumKind[]> = { k: ['kick'], s: ['snare'], h: ['hat'], x: ['kick', 'hat'], c: ['crash', 'kick'] };

/** Turn a song into timed note and drum events. */
export function compile(song: Song): Compiled {
  const notes: NoteEvent[] = [];
  const drums: DrumEvent[] = [];
  let bar = 0;
  for (const name of song.order) {
    const section = song.sections[name];
    if (!section) throw new Error(`no section '${name}'`);
    const tokens = section.melody.split(/\s+/).filter((t) => t && t !== '|');
    if (tokens.length !== section.chords.length * 8) {
      throw new Error(`section ${name}: ${tokens.length} melody eighths for ${section.chords.length} bars`);
    }
    // Melody: each token is an eighth note (two sixteenths), or a pair of sixteenths.
    const base = bar * 16;
    let last: NoteEvent | null = null;
    tokens.forEach((tok, i) => {
      const step = base + i * 2;
      if (tok === '-') {
        if (last) last.len += 2;
        return;
      }
      if (tok === '.') {
        last = null;
        return;
      }
      const halves = tok.split('/');
      halves.forEach((n, j) => {
        last = { part: 'lead', step: step + (halves.length === 2 ? j : 0), len: halves.length === 2 ? 1 : 2, freq: noteFreq(n) };
        notes.push(last);
      });
    });
    // Accompaniment, bar by bar.
    section.chords.forEach((chord, b) => {
      const start = (bar + b) * 16;
      const low = chordTones(chord, 2);
      const mid = chordTones(chord, 4);
      if (song.bass) layTemplate(song.bass, bar + b, (ch, step, len) => {
        const n = ch === 'R' ? low[0] : ch === 'O' ? low[0] + 12 : ch === 'F' ? low[2] : ch === 'T' ? low[1] : null;
        if (n !== null) notes.push({ part: 'bass', step: start + step, len, freq: midiFreq(n) });
      });
      if (song.arp) layTemplate(song.arp, bar + b, (ch, step, len) => {
        const n = ch === '3' ? mid[0] + 12 : /[012]/.test(ch) ? mid[Number(ch)] : null;
        if (n !== null) notes.push({ part: 'arp', step: start + step, len, freq: midiFreq(n) });
      });
      if (song.pad) for (const n of [low[0] + 12, low[2] + 12]) notes.push({ part: 'pad', step: start, len: 16, freq: midiFreq(n) });
      if (song.drums) layTemplate(song.drums, bar + b, (ch, step) => {
        for (const kind of DRUMS[ch] ?? []) drums.push({ kind, step: start + step });
      });
    });
    bar += section.chords.length;
  }
  return { stepTime: 60 / song.bpm / 4, steps: bar * 16, notes, drums };
}

/** Walk one bar of a template (cycling longer templates bar by bar), reporting each note with its held length. */
function layTemplate(template: string, bar: number, on: (ch: string, step: number, len: number) => void): void {
  if (template.length % 16) throw new Error(`template '${template}' is not whole bars`);
  const bars = template.length / 16;
  const t = template.slice((bar % bars) * 16, (bar % bars) * 16 + 16);
  for (let i = 0; i < 16; i++) {
    const ch = t[i];
    if (ch === '.' || ch === '-') continue;
    let len = 1;
    while (i + len < 16 && t[i + len] === '-') len++;
    on(ch, i, len);
  }
}
