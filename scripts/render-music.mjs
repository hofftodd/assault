// Renders every soundtrack track offline (in headless Chromium's Web Audio) to WAV
// files, and prints each one's length and levels, to preview or check the music:
//   npm run music -- [outDir]      (default: smoke-output/music)
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const out = process.argv[2] ?? 'smoke-output/music';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5199/index.html');
const tracks = ['stage1', 'land', 'river', 'base1', 'base2', 'clear', 'areaClear', 'gameOver', 'ending'];
for (const name of tracks) {
  const r = await page.evaluate(async (name) => {
    const { MusicPlayer } = await import('/src/audio/music.ts');
    const { SONGS, compile } = await import('/src/audio/songs.ts');
    const c = compile(SONGS[name]);
    const secs = Math.min(40, c.steps * c.stepTime + 1.5);
    const rate = 44100;
    const ctx = new OfflineAudioContext(1, Math.ceil(secs * rate), rate);
    const noise = ctx.createBuffer(1, rate, rate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < rate; i++) ch[i] = Math.random() * 2 - 1;
    // The game's master gain is 0.5.
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const p = new MusicPlayer(ctx, master, noise, secs + 1);
    p.play(name, 0);
    const buf = await ctx.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0, sum = 0;
    for (const v of d) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    const pcm = new Int16Array(d.length);
    for (let i = 0; i < d.length; i++) pcm[i] = Math.max(-1, Math.min(1, d[i])) * 32767;
    return { secs, peak, rms: Math.sqrt(sum / d.length), pcm: Array.from(pcm) };
  }, name);
  const data = Buffer.from(Int16Array.from(r.pcm).buffer);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(44100, 24);
  h.writeUInt32LE(88200, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(`${out}/${name}.wav`, Buffer.concat([h, data]));
  console.log(name.padEnd(10), `${r.secs.toFixed(1)} s  peak ${r.peak.toFixed(2)}  rms ${r.rms.toFixed(3)}`);
}
await browser.close();
await server.close();
