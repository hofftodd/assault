/// <reference lib="webworker" />
import { TileTerrain } from '../sim/terrain';
import { renderTerrain } from './terrainRender';

/** Renders stage terrain off the main thread: receives { id, map, seed }, replies with the pixels. */
self.onmessage = (e: MessageEvent<{ id: string; map: string[]; seed: number }>) => {
  const { id, map, seed } = e.data;
  const img = renderTerrain(new TileTerrain(map, 16, seed));
  (self as unknown as Worker).postMessage({ id, width: img.width, height: img.height, data: img.data }, [img.data.buffer]);
};
