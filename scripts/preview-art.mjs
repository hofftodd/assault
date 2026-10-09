// Renders the procedural art to PNG files for quick inspection without a browser:
//   npm run art -- [outDir]      (default: smoke-output/art)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createServer } from 'vite';

const outDir = process.argv[2] ?? 'smoke-output/art';
mkdirSync(outDir, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** Encode RGBA as PNG, upscaled by an integer factor with nearest-neighbour. */
function png({ width, height, data }, scale = 1) {
  const W = width * scale;
  const H = height * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = ((Math.floor(y / scale) * width + Math.floor(x / scale)) * 4);
      const di = y * (W * 4 + 1) + 1 + x * 4;
      raw[di] = data[si];
      raw[di + 1] = data[si + 1];
      raw[di + 2] = data[si + 2];
      raw[di + 3] = data[si + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const load = (p) => server.ssrLoadModule(p);
  const { rasterize } = await load('/src/art/pixelSprite.ts');
  const sprites = await load('/src/art/sprites.ts');
  const { rasterizeFont } = await load('/src/art/font.ts');
  const { renderTerrain } = await load('/src/art/terrainRender.ts');
  const { renderExplosion } = await load('/src/art/explosions.ts');
  const enemy = await load('/src/art/enemySprites.ts');
  const stageArt = await load('/src/art/stageArt.ts');
  const { TileTerrain } = await load('/src/sim/terrain.ts');
  const { TEST_MAP } = await load('/src/stages/testMap.ts');
  const { STAGES } = await load('/src/stages/stages.ts');

  const write = (name, img, scale) => {
    writeFileSync(join(outDir, name), png(img, scale));
    console.log(`${name} ${img.width}x${img.height} @${scale}x`);
  };
  write('player_tank.png', rasterize(sprites.PLAYER_TANK), 8);
  write('player_tank_belly.png', rasterize(sprites.PLAYER_TANK_BELLY), 8);
  write('life_icon.png', rasterize(sprites.LIFE_ICON), 8);
  write('font.png', rasterizeFont(), 4);
  write('shot.png', rasterize(sprites.SHOT), 8);
  write('nuke_shell.png', rasterize(sprites.NUKE_SHELL), 8);
  write('explosion_small.png', renderExplosion(12, 5, 3), 6);
  write('explosion_big.png', renderExplosion(56, 10, 5), 3);
  write('enemy_type1.png', enemy.TYPE1_TANK(), 8);
  write('enemy_type2.png', enemy.TYPE2_TANK(), 8);
  write('enemy_type5.png', enemy.TYPE5_TANK(), 4);
  write('enemy_torchika1.png', enemy.torchikaArt(4), 8);
  write('enemy_torchika2.png', enemy.torchikaArt(8), 8);
  write('enemy_cannon1.png', enemy.cannonArt(), 4);
  write('bullet_orange.png', enemy.bulletArt('orange'), 8);
  write('bullet_pink.png', enemy.bulletArt('pink'), 8);
  write('missile.png', enemy.missileArt(), 8);
  write('crater.png', enemy.craterArt(), 8);
  write('jump_zone.png', stageArt.jumpZoneArt(false), 4);
  write('jump_zone_spent.png', stageArt.jumpZoneArt(true), 4);
  write('hatch.png', stageArt.hatchArt(), 4);
  write('guide_arrow.png', stageArt.guideArrowArt(), 8);
  const t0 = performance.now();
  write('terrain_test_map.png', renderTerrain(new TileTerrain(TEST_MAP, 16, 1)), 2);
  console.log(`terrain rendered in ${Math.round(performance.now() - t0)} ms`);
  for (const st of STAGES) {
    const name = `stage${String(st.number).padStart(2, '0')}`;
    const t1 = performance.now();
    write(`${name}.png`, renderTerrain(new TileTerrain(st.map, 16, st.seed)), 1);
    console.log(`${name} rendered in ${Math.round(performance.now() - t1)} ms`);
    writeFileSync(join(outDir, `${name}.txt`), st.map.map((r, i) => String(i).padStart(2) + ' ' + r).join('\n'));
    const terrainSpawns = new TileTerrain(st.map, 16, st.seed).spawns;
    writeFileSync(join(outDir, `${name}-spawns.json`), JSON.stringify({ spawns: [...terrainSpawns, ...(st.spawns ?? [])], guide: st.guide }));
  }
} finally {
  await server.close();
}
