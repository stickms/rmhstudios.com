'use client';

/**
 * Slice It chart editor — scheduling for the linter.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §9.
 *
 * Three things stand between "lint the chart" and "lint the chart without the
 * editor stuttering", and each one is a decision:
 *
 * 1. **A worker, not the main thread.** Eight rules over four difficulties of a
 *    dense chart is a few milliseconds — which is fine until it lands in the
 *    same frame as a drag, where a few milliseconds is a third of the budget.
 * 2. **A debounce, not per edit.** A drag emits a command per pointer move.
 *    Linting each one would be forty runs for one gesture whose first
 *    thirty-nine results are stale before they arrive.
 * 3. **Coalescing, not a queue.** While a run is in flight, further edits
 *    replace the pending request rather than stacking behind it. Lint results
 *    are not events; only the newest one is true, and a queue would make the
 *    panel walk through the history of a drag after the drag ended.
 *
 * A result is tagged with the store revision it was computed from, and the
 * caller drops anything older than what it already has — so an out-of-order
 * delivery cannot resurrect stale findings.
 *
 * The fallback path matters as much as the worker: no `Worker` constructor
 * (SSR, an old embedded webview, a CSP that forbids worker scripts) must
 * degrade to a linted chart on the main thread, never to an unlinted one. An
 * editor that silently stops gating publish is worse than one that stutters.
 */

import { runLint, type LintRequest, type LintResult } from './lint';

/** §9's debounce. Long enough to swallow a drag, short enough to feel live. */
export const LINT_DEBOUNCE_MS = 300;

export interface LintRunner {
  /** Schedule a run. Later calls before the debounce elapses replace earlier ones. */
  schedule: (request: LintRequest) => void;
  /** Run now, skipping the debounce — what the publish button calls. */
  flush: () => void;
  dispose: () => void;
  /** Which path this runner took, for the panel's own diagnostics and tests. */
  readonly mode: 'worker' | 'inline';
}

type Listener = (result: LintResult) => void;

function createWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    // The `new Worker(new URL(...), { type: 'module' })` form is the one the
    // bundler statically recognises; it must stay written out literally here or
    // the worker chunk is never emitted and this silently falls back to inline.
    return new Worker(new URL('./lint.worker.ts', import.meta.url), {
      type: 'module',
      name: 'slice-it-lint',
    });
  } catch {
    return null;
  }
}

export function createLintRunner(
  onResult: Listener,
  options: { debounceMs?: number; forceInline?: boolean } = {},
): LintRunner {
  const debounceMs = options.debounceMs ?? LINT_DEBOUNCE_MS;
  const worker = options.forceInline ? null : createWorker();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: LintRequest | null = null;
  let inFlight = false;
  let disposed = false;
  /** Highest revision already delivered — the out-of-order guard. */
  let delivered = -1;

  const deliver = (result: LintResult) => {
    if (disposed) return;
    if (result.revision < delivered) return;
    delivered = result.revision;
    onResult(result);
  };

  if (worker) {
    worker.addEventListener('message', (event: MessageEvent<LintResult>) => {
      inFlight = false;
      deliver(event.data);
      // An edit that arrived while the worker was busy is waiting; send it now
      // rather than waiting out another debounce, or a continuous edit stream
      // could starve the panel indefinitely.
      if (pending) dispatch();
    });
    worker.addEventListener('error', () => {
      // A worker that failed to load leaves publish ungated, which is the one
      // outcome that is not allowed. Drop to inline for the rest of the session.
      inFlight = false;
      if (pending) {
        const request = pending;
        pending = null;
        deliver(runLint(request));
      }
    });
  }

  function dispatch() {
    if (disposed || !pending) return;
    const request = pending;
    if (worker) {
      if (inFlight) return; // the message handler will pick it back up
      pending = null;
      inFlight = true;
      worker.postMessage(request);
      return;
    }
    pending = null;
    deliver(runLint(request));
  }

  return {
    mode: worker ? 'worker' : 'inline',
    schedule(request) {
      if (disposed) return;
      pending = request;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        dispatch();
      }, debounceMs);
    },
    flush() {
      if (disposed) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // Flush is synchronous by contract — the publish button needs an answer
      // before it decides, and "ask the worker and hope" is how a blocked chart
      // gets published. Running the same pure function inline is exact, not an
      // approximation of what the worker would have said.
      if (pending) {
        const request = pending;
        pending = null;
        deliver(runLint(request));
      }
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      worker?.terminate();
    },
  };
}
