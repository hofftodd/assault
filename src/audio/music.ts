import { compile, SONGS, type Compiled, type DrumKind, type LeadVoice, type NoteEvent, type TrackName } from './songs';

/** Seconds of music scheduled ahead of the audio clock, and how often the scheduler wakes. */
const LOOKAHEAD = 0.25;
const TICK_MS = 30;

interface Envelope {
  attack: number;
  decay: number;
  /** Level held after the decay, as a share of `vol`. */
  sustain: number;
  release: number;
  vol: number;
}

/** Two-operator FM: punchy basses and bells, in the spirit of the arcade's FM chip. */
interface FmPatch extends Envelope {
  kind: 'fm';
  /** Modulator frequency as a multiple of the note's. */
  ratio: number;
  /** Modulation depth (as a multiple of the note's frequency) at the attack, and after `decay`. */
  index: number;
  indexEnd: number;
}

/**
 * Analog-style synth: two detuned oscillators through a resonant low-pass filter
 * that sweeps down from `cutoff`, with vibrato fading in on held notes. The
 * futuristic 80s keyboard sound.
 */
interface SynthPatch extends Envelope {
  kind: 'synth';
  wave: OscillatorType;
  /** Detune between the two oscillators, in cents. */
  detune: number;
  cutoff: number;
  cutoffEnd: number;
  resonance: number;
  vibrato: number;
}

type Patch = FmPatch | SynthPatch;

const PATCHES: Record<LeadVoice | 'bass' | 'arp' | 'pad', Patch> = {
  // The alien lead: wide-detuned saws through a squelchy resonant filter, deep slow vibrato.
  alien: { kind: 'synth', wave: 'sawtooth', detune: 30, cutoff: 2000, cutoffEnd: 620, resonance: 11, vibrato: 0.014, attack: 0.015, decay: 0.35, sustain: 0.8, release: 0.18, vol: 0.085 },
  synth: { kind: 'synth', wave: 'sawtooth', detune: 14, cutoff: 5200, cutoffEnd: 2200, resonance: 5, vibrato: 0.007, attack: 0.012, decay: 0.3, sustain: 0.75, release: 0.12, vol: 0.075 },
  pulse: { kind: 'synth', wave: 'square', detune: 18, cutoff: 2200, cutoffEnd: 620, resonance: 9, vibrato: 0.012, attack: 0.01, decay: 0.3, sustain: 0.75, release: 0.15, vol: 0.07 },
  brass: { kind: 'fm', ratio: 1, index: 2.6, indexEnd: 0.9, attack: 0.03, decay: 0.25, sustain: 0.75, release: 0.08, vol: 0.13 },
  // The driving bass: a growling FM pulse with a sub-octave modulator, every sixteenth.
  bass: { kind: 'fm', ratio: 0.5, index: 3.6, indexEnd: 0.5, attack: 0.003, decay: 0.1, sustain: 0.55, release: 0.03, vol: 0.26 },
  // Alien chimes: inharmonic FM bells, metallic and cold.
  arp: { kind: 'fm', ratio: 3.73, index: 1.6, indexEnd: 0.1, attack: 0.002, decay: 0.14, sustain: 0.12, release: 0.08, vol: 0.03 },
  // A dark drone under each bar: detuned saws, filtered right down, swelling in slowly.
  pad: { kind: 'synth', wave: 'sawtooth', detune: 22, cutoff: 900, cutoffEnd: 480, resonance: 3, vibrato: 0.004, attack: 0.45, decay: 1.2, sustain: 0.85, release: 0.5, vol: 0.035 },
};

/**
 * Plays the soundtrack (songs.ts) through Web Audio: a look-ahead scheduler
 * queues notes a quarter second ahead of the audio clock, looping themes and
 * playing jingles once.
 */
export class MusicPlayer {
  private readonly bus: GainNode;
  private readonly compiled = new Map<TrackName, Compiled>();
  private track: {
    name: TrackName;
    song: Compiled;
    loop: boolean;
    /** Dry output, and the send into the echo, both faded when the track stops. */
    out: GainNode;
    send: GainNode;
    start: number;
    next: number;
    drum: number;
    /** The last lead note, for gliding into the next. */
    lastLead: { freq: number; end: number } | null;
  } | null = null;
  /** A dark, filtered echo the lead and chimes ring out into. */
  private readonly echoIn: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    out: AudioNode,
    private readonly noise: AudioBuffer,
    /** Seconds to schedule ahead (an offline render schedules the whole piece at once). */
    private readonly lookahead = LOOKAHEAD,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.75;
    this.bus.connect(out);
    this.echoIn = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.33;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2000;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.42;
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    this.echoIn.connect(delay).connect(tone).connect(feedback).connect(delay);
    tone.connect(wet).connect(this.bus);
  }

  /** The track playing (or the jingle that last played), if any. */
  get current(): TrackName | null {
    return this.track?.name ?? null;
  }

  /** Start a track from the top, fading out whatever was playing; null fades to silence. */
  play(name: TrackName | null, fade = 0.25): void {
    this.fadeOut(fade);
    if (!name) return;
    let song = this.compiled.get(name);
    if (!song) {
      song = compile(SONGS[name]);
      this.compiled.set(name, song);
    }
    const out = this.ctx.createGain();
    out.connect(this.bus);
    const send = this.ctx.createGain();
    send.connect(this.echoIn);
    this.track = { name, song, loop: SONGS[name].loop, out, send, start: this.ctx.currentTime + 0.05, next: 0, drum: 0, lastLead: null };
    this.timer ??= setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  private fadeOut(fade: number): void {
    const t = this.track;
    this.track = null;
    if (!t) return;
    const now = this.ctx.currentTime;
    for (const g of [t.out, t.send]) {
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + fade);
    }
    setTimeout(() => {
      t.out.disconnect();
      t.send.disconnect();
    }, (fade + 1) * 1000);
  }

  private schedule(): void {
    const t = this.track;
    if (!t) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    const horizon = this.ctx.currentTime + this.lookahead;
    const { song } = t;
    for (;;) {
      const note = song.notes[t.next];
      const drum = song.drums[t.drum];
      const noteAt = note ? t.start + note.step * song.stepTime : Infinity;
      const drumAt = drum ? t.start + drum.step * song.stepTime : Infinity;
      if (Math.min(noteAt, drumAt) >= horizon) {
        if (note || drum) return;
        // The end of the song: loop it, or let a jingle finish.
        const end = t.start + song.steps * song.stepTime;
        if (!t.loop) {
          if (this.ctx.currentTime > end + 1) this.track = null;
          return;
        }
        if (end >= horizon) return;
        t.start = end;
        t.next = 0;
        t.drum = 0;
        continue;
      }
      if (noteAt <= drumAt) {
        this.voice(note, noteAt, song.stepTime, t);
        t.next++;
      } else {
        this.hit(drum.kind, drumAt, t.out);
        t.drum++;
      }
    }
  }

  private voice(n: NoteEvent, at: number, stepTime: number, t: NonNullable<MusicPlayer['track']>): void {
    const p = PATCHES[n.part === 'lead' ? SONGS[t.name].lead : n.part];
    const out = t.out;
    const ctx = this.ctx;
    const dur = Math.max(0.04, n.len * stepTime * 0.92);
    const end = at + dur + p.release * 2;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(p.vol, at + p.attack);
    amp.gain.setTargetAtTime(p.vol * p.sustain, at + p.attack, p.decay / 3);
    amp.gain.setTargetAtTime(0, at + dur, p.release / 3);
    amp.connect(out);
    if (n.part !== 'bass') amp.connect(t.send);
    // The lead slides into each note from the one before, if it follows straight on.
    const from = n.part === 'lead' && t.lastLead && t.lastLead.end >= at - stepTime * 1.5 ? t.lastLead.freq : null;
    if (n.part === 'lead') t.lastLead = { freq: n.freq, end: at + dur };
    const pitch = (f: AudioParam) => {
      f.setValueAtTime(from ?? n.freq, at);
      if (from) f.exponentialRampToValueAtTime(n.freq, at + 0.05);
    };
    const oscs: OscillatorNode[] = [];

    if (p.kind === 'fm') {
      const car = ctx.createOscillator();
      pitch(car.frequency);
      const mod = ctx.createOscillator();
      mod.frequency.value = n.freq * p.ratio;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(n.freq * p.index, at);
      depth.gain.exponentialRampToValueAtTime(Math.max(1, n.freq * p.indexEnd), at + p.decay);
      mod.connect(depth).connect(car.frequency);
      car.connect(amp);
      oscs.push(car, mod);
    } else {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = p.resonance;
      filter.frequency.setValueAtTime(p.cutoff, at);
      filter.frequency.exponentialRampToValueAtTime(p.cutoffEnd, at + p.decay * 1.5);
      filter.connect(amp);
      // Vibrato creeps in on held notes, as a keyboard player would add it.
      let lfoDepth: GainNode | null = null;
      if (p.vibrato > 0 && dur > 0.25) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.5;
        lfoDepth = ctx.createGain();
        lfoDepth.gain.setValueAtTime(0, at);
        lfoDepth.gain.linearRampToValueAtTime(n.freq * p.vibrato, at + Math.min(dur, 0.6));
        lfo.connect(lfoDepth);
        oscs.push(lfo);
      }
      for (const d of [-p.detune / 2, p.detune / 2]) {
        const o = ctx.createOscillator();
        o.type = p.wave;
        pitch(o.frequency);
        o.detune.value = d;
        if (lfoDepth) lfoDepth.connect(o.frequency);
        o.connect(filter);
        oscs.push(o);
      }
    }
    for (const o of oscs) {
      o.start(at);
      o.stop(end);
    }
  }

  /** The kit: a punchy kick with a click, a big gated 80s snare, tight hats and a crash. */
  private hit(kind: DrumKind, at: number, out: AudioNode): void {
    const ctx = this.ctx;
    const amp = ctx.createGain();
    amp.connect(out);
    const noise = (type: BiquadFilterType, freq: number, vol: number, len: number, gate = false) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, at);
      if (gate) {
        // Gated reverb: the tail holds, then is cut off sharply.
        g.gain.setTargetAtTime(vol * 0.45, at + 0.02, 0.06);
        g.gain.setValueAtTime(vol * 0.3, at + len * 0.85);
        g.gain.linearRampToValueAtTime(0, at + len);
      } else {
        g.gain.exponentialRampToValueAtTime(0.001, at + len);
      }
      src.connect(filter).connect(g).connect(amp);
      // Start each hit at a different spot in the noise so repeats don't sound identical.
      src.start(at, Math.random() * 0.5, len + 0.02);
    };
    const tone = (from: number, to: number, vol: number, len: number) => {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(from, at);
      o.frequency.exponentialRampToValueAtTime(to, at + len * 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + len);
      o.connect(g).connect(amp);
      o.start(at);
      o.stop(at + len + 0.02);
    };
    switch (kind) {
      case 'kick':
        tone(170, 45, 0.75, 0.22);
        noise('highpass', 3000, 0.08, 0.012);
        break;
      case 'snare':
        tone(240, 160, 0.22, 0.09);
        noise('bandpass', 1900, 0.42, 0.2, true);
        noise('highpass', 5000, 0.12, 0.12);
        break;
      case 'hat':
        noise('highpass', 8000, 0.07, 0.035);
        break;
      case 'crash':
        noise('highpass', 3500, 0.16, 1.0);
        break;
    }
  }
}
