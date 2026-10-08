import Phaser from 'phaser';
import { FONT_CELL_H, FONT_CELL_W, FONT_CHARS, FONT_COLUMNS, rasterizeFont } from './font';
import { rasterize, type PixelArt, type Rgba } from './pixelSprite';

/** Upload an RGBA buffer as a Phaser texture. */
export function addRgbaTexture(scene: Phaser.Scene, key: string, img: Rgba): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, img.width, img.height);
  if (!tex) throw new Error(`could not create texture ${key}`);
  const ctx = tex.getContext();
  const data = ctx.createImageData(img.width, img.height);
  data.data.set(img.data);
  ctx.putImageData(data, 0, 0);
  tex.refresh();
}

export function addPixelArt(scene: Phaser.Scene, key: string, art: PixelArt): void {
  addRgbaTexture(scene, key, rasterize(art));
}

export const FONT_KEY = 'font';

export function addPixelFont(scene: Phaser.Scene): void {
  addRgbaTexture(scene, FONT_KEY, rasterizeFont());
  scene.cache.bitmapFont.add(
    FONT_KEY,
    Phaser.GameObjects.RetroFont.Parse(scene, {
      image: FONT_KEY,
      width: FONT_CELL_W,
      height: FONT_CELL_H,
      chars: FONT_CHARS,
      charsPerRow: FONT_COLUMNS,
      'spacing.x': 0,
      'spacing.y': 0,
      'offset.x': 0,
      'offset.y': 0,
      lineSpacing: 0,
    }),
  );
}
