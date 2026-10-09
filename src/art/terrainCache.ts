import { TileTerrain } from '../sim/terrain';
import type { Rgba } from './pixelSprite';
import { renderTerrain } from './terrainRender';

/**
 * Stage terrain is slow to paint at full detail, so it's rendered in a Web Worker
 * and kept by id: request the next stage early and it's usually ready on arrival.
 */
const pending = new Map<string, Promise<Rgba>>();
const waiting = new Map<string, { resolve: (img: Rgba) => void; map: readonly string[]; seed: number }>();
let worker: Worker | null | undefined;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: string; width: number; height: number; data: Uint8ClampedArray }>) => {
      const { id, width, height, data } = e.data;
      waiting.get(id)?.resolve({ width, height, data });
      waiting.delete(id);
    };
    // If the worker can't run here after all, paint on the main thread instead.
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      for (const w of waiting.values()) w.resolve(renderTerrain(new TileTerrain(w.map, 16, w.seed)));
      waiting.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function requestTerrain(id: string, map: readonly string[], seed: number): Promise<Rgba> {
  let p = pending.get(id);
  if (p) return p;
  const w = getWorker();
  p = w
    ? new Promise<Rgba>((resolve) => {
        waiting.set(id, { resolve, map, seed });
        w.postMessage({ id, map: [...map], seed });
      })
    : Promise.resolve().then(() => renderTerrain(new TileTerrain(map, 16, seed)));
  pending.set(id, p);
  return p;
}

/** Forget a stage's pixels once they're uploaded to the GPU. */
export function releaseTerrain(id: string): void {
  pending.delete(id);
}
