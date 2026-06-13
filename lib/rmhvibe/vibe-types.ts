/**
 * Shared event types for the RMHVibe generation stream (server → client SSE).
 * Client-safe (no server-only imports).
 */

/**
 * Which DeepSeek model to generate with. `flash` is faster; `pro` is higher
 * quality. The server maps these to concrete model IDs (see vibe.server.ts).
 */
export type VibeModel = 'flash' | 'pro';

export const VIBE_MODELS: readonly VibeModel[] = ['flash', 'pro'];

export const DEFAULT_VIBE_MODEL: VibeModel = 'flash';

/** Narrow an untrusted value to a VibeModel, falling back to the default. */
export function asVibeModel(value: unknown): VibeModel {
  return value === 'pro' || value === 'flash' ? value : DEFAULT_VIBE_MODEL;
}

export type VibeStreamEvent =
  | { type: 'thinking'; text: string } // reasoning_content delta from the model
  | { type: 'content'; text: string } // answer (HTML) delta — used for progress
  | { type: 'done'; slug: string; versionId: string; html: string; title: string; description: string } // persisted result
  | { type: 'error'; message: string };
