/**
 * RMHVibe — client-side stream consumer.
 *
 * POSTs to the SSE generation endpoint and invokes `onEvent` for each streamed
 * event (thinking deltas, content deltas, and the final done/error). Client-safe.
 */

import type { VibeStreamEvent, VibeModel } from '@/lib/rmhvibe/vibe-types';

export type { VibeStreamEvent };

/**
 * Error thrown when the stream request itself fails (HTTP error or network).
 * Carries an HTTP `status` (0 for network/parse failures) and a user-readable
 * `message` so callers can show something specific — e.g. the rate-limit text the
 * server returns on 429 — instead of a generic "something went wrong".
 */
export class VibeStreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'VibeStreamError';
    this.status = status;
  }
}

/** Map a failed HTTP response to a friendly message (preferring the server's body). */
async function describeHttpError(res: Response): Promise<string> {
  let body = '';
  try {
    body = (await res.text()).trim();
  } catch {
    /* body unavailable */
  }
  if (res.status === 429) {
    return body || 'You’re generating too fast. Wait a moment and try again.';
  }
  if (res.status === 400) {
    return body || 'That prompt couldn’t be used. Try rephrasing it.';
  }
  if (res.status >= 500) {
    return 'The server hit a problem starting generation. Please try again.';
  }
  return body || `Couldn’t start generation (error ${res.status}).`;
}

export async function streamVibe(
  body: { prompt: string; slug?: string; fromVersionId?: string; model?: VibeModel },
  onEvent: (event: VibeStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/vibe/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    // Network failure before any response (offline, DNS, CORS, aborted).
    if (signal?.aborted) throw err;
    throw new VibeStreamError(
      'Couldn’t reach the server. Check your connection and try again.',
      0,
    );
  }

  if (!res.ok || !res.body) {
    throw new VibeStreamError(await describeHttpError(res), res.status || 0);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Process any complete SSE frames sitting in `buffer`.
  const drain = (flush: boolean) => {
    const frames = buffer.split('\n\n');
    // Keep the trailing partial frame unless we're flushing the final bytes.
    buffer = flush ? '' : (frames.pop() ?? '');
    for (const frame of frames) {
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const json = dataLine.slice(5).trim();
      if (!json) continue;
      try {
        onEvent(JSON.parse(json) as VibeStreamEvent);
      } catch {
        /* ignore malformed frame */
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    drain(false);
  }
  // Flush any final frame that arrived without a trailing blank line before close.
  buffer += decoder.decode();
  if (buffer.trim()) drain(true);
}
