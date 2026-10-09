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
  | 'extend';

export class Sfx {
  private ctx: AudioContext | null = null;
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
        this.burst(t, 1.1, 1800, 60, 0.9);
        this.tone('sine', 90, 28, t, 0.8, 0.8);
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
