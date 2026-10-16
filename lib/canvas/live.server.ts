import { createBus } from '@/lib/realtime-bus.server';
import type { CanvasBatch } from './shared';

export const canvasBus = createBus<CanvasBatch>('canvas');

/** Broadcasts are coalesced to at most 4 per second per event (250 ms window). */
const FLUSH_MS = 250;
const pending = new Map<string, { pixels: [number, number, number][]; timer: NodeJS.Timeout }>();

export function queuePixel(eventId: string, x: number, y: number, color: number): void {
  let entry = pending.get(eventId);
  if (!entry) {
    const pixels: [number, number, number][] = [];
    const timer = setTimeout(() => {
      pending.delete(eventId);
      canvasBus.publish(eventId, { pixels });
    }, FLUSH_MS);
    timer.unref?.();
    entry = { pixels, timer };
    pending.set(eventId, entry);
  }
  entry.pixels.push([x, y, color]);
}
