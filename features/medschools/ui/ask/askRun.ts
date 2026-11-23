import type { MedAskRes } from '../../medschools.contract';

/**
 * One question at a time, with a way to take it back. Pure (no React, no network of its own): `call` is the contract
 * client in production and a fake in the test. A cancelled or superseded run never reports: the answer to a question
 * the member walked away from must not appear under the next one.
 */
export type AskState = 'idle' | 'pending' | 'done' | 'error';

export interface AskSnapshot {
  state: AskState;
  res: MedAskRes | null;
  error: unknown;
  /** Whole seconds the question took, set when it ends (the "Thought for N s" line); null before then. */
  seconds: number | null;
}

export const IDLE: AskSnapshot = { state: 'idle', res: null, error: null, seconds: null };

export interface AskQuestion {
  question: string;
  slug?: string;
  /** Think it through (plan R20). */
  think?: boolean;
}
export type AskCall = (body: AskQuestion, signal: AbortSignal) => Promise<MedAskRes>;

export function createAskRun(call: AskCall, onChange: (s: AskSnapshot) => void, now: () => number = Date.now) {
  let controller: AbortController | null = null;
  return {
    /** Starts a question. Ignored while one is in flight (a second submit is impossible). */
    ask(body: AskQuestion): void {
      if (controller) return;
      const mine = new AbortController();
      controller = mine;
      const started = now();
      const took = () => Math.max(0, Math.round((now() - started) / 1000));
      onChange({ state: 'pending', res: null, error: null, seconds: null });
      call(body, mine.signal).then(
        (res) => {
          if (controller !== mine || mine.signal.aborted) return;
          controller = null;
          onChange({ state: 'done', res, error: null, seconds: took() });
        },
        (error: unknown) => {
          if (controller !== mine || mine.signal.aborted) return;
          controller = null;
          onChange({ state: 'error', res: null, error, seconds: took() });
        },
      );
    },
    /** Aborts the request and drops whatever it would have said. */
    cancel(): void {
      if (!controller) return;
      controller.abort();
      controller = null;
      onChange(IDLE);
    },
  };
}
