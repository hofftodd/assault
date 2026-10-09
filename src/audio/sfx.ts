import { MusicPlayer } from './music';
import { SONGS, type TrackName } from './songs';

/**
 * Retro sound effects synthesised with Web Audio, so there are no sample files.
 * Browsers only allow audio after user input, so the context is created on the
 * first key press.
 */
export type SfxName =
  | 'shot'
  | 'shotHit'
  | 'nukeLaunch'
  | 'nukeBlast'
  | 'roll'
  | 'empty'
  | 'armorHit'
  | 'enemyShot'
  | 'enemyDie'
  | 'playerDie'
  | 'extend'
  | 'raise'
  | 'clear'
  | 'hatch'
  | 'coin'
  | 'tick';

export class Sfx {
  private ctx: AudioContext | null = null;
  private player: MusicPlayer | null = null;
  /** The track the game wants playing, kept until the audio is unlocked by a key or click. */
  private wanted: TrackName | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  constructor(target: EventTarget = window) {
    const unlock = () => {
      this.ensureContext();
      void this.ctx?.resume();
    };
    target.addEventListener('keydown', unlock);
    target.addEventListener('pointerdown', unlock);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  }

  /** Play a soundtrack track from the top (null fades out). A looping theme already playing carries on. */
  music(name: TrackName | null): void {
    if (name && name === this.wanted && SONGS[name].loop && this.player?.current === name) return;
    this.wanted = name;
    this.player?.play(name);
  }

  /** The track last asked for (for tests and the debug readout). */
  get track(): TrackName | null {
    return this.wanted;
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    switch (name) {
      case 'shot':
        this.tone('square', 1100, 260, t, 0.09, 0.18);
        break;
      case 'shotHit':
        this.burst(t, 0.12, 2400, 400, 0.25);
        break;
      case 'nukeLaunch':
        this.tone('sawtooth', 220, 55, t, 0.3, 0.3);
        this.burst(t, 0.2, 900, 200, 0.3);
        break;
      case 'nukeBlast':
        // A deep, heavy boom: a falling sub-bass thump, a dark roar, and a long rumbling tail.
        this.tone('square', 110, 38, t, 0.22, 0.22);
        this.tone('sine', 72, 26, t, 1.8, 1.0);
        this.tone('triangle', 48, 20, t + 0.03, 2.2, 0.7);
        this.burst(t, 1.6, 900, 40, 0.95);
        this.burst(t + 0.15, 2.6, 260, 30, 0.6);
        break;
      case 'roll':
        this.burst(t, 0.25, 600, 2200, 0.12);
        break;
      case 'empty':
        this.tone('square', 180, 160, t, 0.05, 0.08);
        break;
      case 'armorHit':
        this.tone('triangle', 1800, 900, t, 0.05, 0.15);
        break;
      case 'enemyShot':
        this.tone('square', 520, 300, t, 0.07, 0.06);
        break;
      case 'enemyDie':
        this.burst(t, 0.45, 2000, 120, 0.5);
        this.tone('square', 300, 60, t, 0.3, 0.12);
        break;
      case 'playerDie':
        this.burst(t, 1.4, 2500, 50, 0.9);
        this.tone('sawtooth', 400, 30, t, 1.2, 0.3);
        break;
      case 'raise':
        this.tone('sawtooth', 120, 900, t, 0.7, 0.18);
        this.burst(t, 0.6, 400, 3000, 0.15);
        break;
      case 'clear':
        [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, t + i * 0.11, 0.14, 0.14));
        break;
      case 'hatch':
        this.tone('triangle', 300, 70, t, 1.2, 0.3);
        this.burst(t + 0.6, 0.9, 1200, 100, 0.25);
        break;
      case 'coin':
        this.tone('square', 988, 988, t, 0.06, 0.15);
        this.tone('square', 1319, 1319, t + 0.06, 0.25, 0.15);
        break;
      case 'tick':
        this.tone('square', 1500, 1500, t, 0.03, 0.08);
        break;
      case 'extend':
        [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, t + i * 0.09, 0.12, 0.15));
        break;
    }
  }

  private ensureContext(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.player = new MusicPlayer(this.ctx, this.master, this.noise);
    // Music asked for before the first key press starts now (a stale jingle doesn't).
    if (this.wanted && SONGS[this.wanted].loop) this.player.play(this.wanted);
  }

  /** A pitch sweep with a fast attack and exponential decay. */
  private tone(type: OscillatorType, from: number, to: number, t: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur);
  }

  /** Filtered noise with a sweeping low-pass: hits, explosions, whooshes. */
  private burst(t: number, dur: number, fromHz: number, toHz: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(fromHz, t);
    filter.frequency.exponentialRampToValueAtTime(toHz, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + dur);
  }
}
