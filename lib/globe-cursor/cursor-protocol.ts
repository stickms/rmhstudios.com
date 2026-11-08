/**
 * The globe cursor's worker messages (`./remote-gl.ts` on the page, `./cursor.worker.ts` in the worker). A module of
 * its own so the worker can import the version without pulling in the page side (which constructs the worker).
 */
import type { GlFrame } from './gl';

/** Bumped whenever a message changes shape; the worker refuses an `init` from another version (`ready ok:false`). */
export const CURSOR_PROTOCOL_VERSION = 1;

export type CursorWorkerIn =
  | { type: 'init'; version: number; canvas: OffscreenCanvas; software: boolean }
  | { type: 'frame'; seq: number; f: GlFrame };

export type CursorWorkerOut =
  { type: 'ready'; ok: boolean } | { type: 'ack'; seq: number } | { type: 'lost' };
