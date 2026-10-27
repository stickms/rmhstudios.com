/**
 * The browser side of the war paint compositor: one shared worker, latest request wins. Resolves with
 * null when the kit has not been synced, the composite failed or the request was superseded.
 */
'use client';

import type { PaintRequest, PaintResponse } from './warpaint.worker';

export interface PaintedTexture {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
}

let worker: Worker | null = null;
let nextId = 1;
let busy = false;
let queued: { req: PaintRequest; resolve: (r: PaintedTexture | null) => void } | null = null;
const waiting = new Map<number, (r: PaintedTexture | null) => void>();

function pump(): void {
  if (busy || !queued || !worker) return;
  const { req, resolve } = queued;
  queued = null;
  busy = true;
  waiting.set(req.id, resolve);
  worker.postMessage(req);
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./warpaint.worker.ts', import.meta.url), {
      type: 'module',
      name: 'tf2-warpaint',
    });
  } catch {
    return null;
  }
  worker.onmessage = (e: MessageEvent<PaintResponse>) => {
    busy = false;
    const resolve = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    resolve?.(e.data.ok ? { w: e.data.w, h: e.data.h, rgba: e.data.rgba } : null);
    pump();
  };
  worker.onerror = () => {
    busy = false;
    for (const resolve of waiting.values()) resolve(null);
    waiting.clear();
    pump();
  };
  return worker;
}

export function renderWarPaint(
  script: string,
  wear: number,
  seed: number,
  size = 512,
): Promise<PaintedTexture | null> {
  if (!ensureWorker()) return Promise.resolve(null);
  return new Promise((resolve) => {
    // A newer request replaces one that has not started yet.
    queued?.resolve(null);
    queued = { req: { id: nextId++, script, wear, seed, size }, resolve };
    pump();
  });
}
