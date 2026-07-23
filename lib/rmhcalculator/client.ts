/**
 * RMHCalculator — browser-side SSE client.
 *
 * Posts a compute/graph request and reads the Server-Sent-Events stream the API
 * routes emit (`thinking` deltas, then a terminal `result`/`graph`, then `done`
 * — or `error`). Kept dependency-free and client-safe. Cancellation is via the
 * returned `AbortController` (or an externally supplied signal).
 */

import type {
  CalcStreamEvent,
  ComputeRequest,
  ComputeResult,
  GraphRequest,
  GraphResult,
} from '@/lib/rmhcalculator/types';

export interface CalcStreamHandlers {
  /** A chunk of the model's reasoning (only Reasoner emits these). */
  onThinking?: (delta: string) => void;
  /** Fired once with the parsed scientific result. */
  onResult?: (result: ComputeResult) => void;
  /** Fired once with the parsed graph payload. */
  onGraph?: (graph: GraphResult) => void;
}

export class CalcStreamError extends Error {}

async function streamSSE(
  url: string,
  body: unknown,
  handlers: CalcStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    // The route sends JSON errors for non-stream failures (401/429/400/503).
    let message = 'Something went wrong. Please try again.';
    try {
      const data = await res.json();
      if (data?.error) message = String(data.error);
    } catch {
      /* keep default */
    }
    throw new CalcStreamError(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleEvent = (raw: string) => {
    // Each SSE frame is one or more `data: ...` lines; we send one JSON per frame.
    const line = raw.split('\n').find((l) => l.startsWith('data:'));
    if (!line) return;
    const json = line.slice(5).trim();
    if (!json) return;
    let event: CalcStreamEvent;
    try {
      event = JSON.parse(json) as CalcStreamEvent;
    } catch {
      return;
    }
    switch (event.type) {
      case 'thinking':
        handlers.onThinking?.(event.text);
        break;
      case 'result':
        handlers.onResult?.(event.data);
        break;
      case 'graph':
        handlers.onGraph?.(event.data);
        break;
      case 'error':
        throw new CalcStreamError(event.message);
      case 'done':
        break;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    // Frames are separated by a blank line.
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      handleEvent(frame);
    }
  }
  if (buffer.trim()) handleEvent(buffer);
}

/** Stream a scientific evaluation. Returns a controller so the caller can abort. */
export function computeStream(
  req: ComputeRequest,
  handlers: CalcStreamHandlers,
  signal?: AbortSignal,
): { promise: Promise<void>; controller: AbortController } {
  const controller = new AbortController();
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
  const promise = streamSSE('/api/rmhcalculator/compute', req, handlers, controller.signal);
  return { promise, controller };
}

/** Stream a graph computation. Returns a controller so the caller can abort. */
export function graphStream(
  req: GraphRequest,
  handlers: CalcStreamHandlers,
  signal?: AbortSignal,
): { promise: Promise<void>; controller: AbortController } {
  const controller = new AbortController();
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
  const promise = streamSSE('/api/rmhcalculator/graph', req, handlers, controller.signal);
  return { promise, controller };
}
