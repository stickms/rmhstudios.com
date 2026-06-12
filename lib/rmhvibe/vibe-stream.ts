/**
 * RMHVibe — client-side stream consumer.
 *
 * POSTs to the SSE generation endpoint and invokes `onEvent` for each streamed
 * event (thinking deltas, content deltas, and the final done/error). Client-safe.
 */

import type { VibeStreamEvent } from '@/lib/rmhvibe/vibe-types';

export type { VibeStreamEvent };

export async function streamVibe(
  body: { prompt: string; slug?: string },
  onEvent: (event: VibeStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/vibe/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Stream request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

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
  }
}
