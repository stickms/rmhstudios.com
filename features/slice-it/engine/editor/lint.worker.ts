/**
 * Slice It chart editor — the lint worker.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §9: "It runs in a worker on a
 * debounce, not synchronously on every edit."
 *
 * The whole worker is this file: receive a plain {@link LintRequest}, call the
 * shared {@link runLint}, post the result back. No rules live here. A worker
 * that reimplemented even one rule would be a second linter, and the editor
 * exists to stop exactly that class of divergence.
 *
 * Typed through a hand-written view of the worker global — the two globals it
 * needs — rather than `/// <reference lib="webworker" />`. The directive does
 * work in this project (the globe's and the glass engine's workers use it,
 * reaching the scope as `self as unknown as DedicatedWorkerGlobalScope`); this
 * file simply has no use for the rest of the worker lib.
 */

import {
  runLint,
  type LintRequest,
  type LintResult,
} from './lint';

interface WorkerScope {
  postMessage: (
    message: LintResult,
  ) => void;
  addEventListener: (
    type: 'message',
    listener: (event: {
      data: LintRequest;
    }) => void,
  ) => void;
}

const scope =
  globalThis as unknown as WorkerScope;

scope.addEventListener(
  'message',
  (
    event,
  ) => {
    scope.postMessage(
      runLint(
        event.data,
      ),
    );
  },
);
