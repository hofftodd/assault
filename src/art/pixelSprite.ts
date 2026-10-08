/**
 * Pixel art written as text: each row is a string, each character a palette key.
 * '.' is transparent.
 */
export interface PixelArt {
  palette: Record<string, number>;
  rows: readonly string[];
}

export interface Rgba {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function rasterize(art: PixelArt): Rgba {
  const height = art.rows.length;
  const width = art.rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  art.rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`sprite row ${y} is ${row.length} wide, expected ${width}`);
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const c = art.palette[ch];
      if (c === undefined) throw new Error(`sprite uses unknown colour '${ch}' at ${x},${y}`);
      const i = (y * width + x) * 4;
      data[i] = (c >> 16) & 0xff;
      data[i + 1] = (c >> 8) & 0xff;
      data[i + 2] = c & 0xff;
      data[i + 3] = 0xff;
    });
  });
  return { width, height, data };
}

/** The same art with some palette entries swapped. */
export function recolor(art: PixelArt, swaps: Record<string, number>): PixelArt {
  return { rows: art.rows, palette: { ...art.palette, ...swaps } };
}
