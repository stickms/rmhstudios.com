/**
 * Shared event types for the RMHVibe generation stream (server → client SSE).
 * Client-safe (no server-only imports).
 */

export type VibeStreamEvent =
  | { type: 'thinking'; text: string } // reasoning_content delta from the model
  | { type: 'content'; text: string } // answer (HTML) delta — used for progress
  | { type: 'done'; slug: string; html: string; title: string; description: string } // persisted result
  | { type: 'error'; message: string };
