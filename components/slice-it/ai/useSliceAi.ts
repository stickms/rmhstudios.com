'use client';

/**
 * The one client-side call shape for every Slice It AI surface.
 *
 * Nine panels, one state machine. Written once because the states are the part
 * that is easy to get subtly wrong, and getting them wrong is what makes an AI
 * feature feel broken rather than absent:
 *
 *  - `unavailable` is **not** an error. The routes answer 200 with a null
 *    payload when no key is configured, because a missing coaching panel is not
 *    a failed request. A panel that rendered a red error for the ordinary
 *    unconfigured case would put a fault on screen on every results card of
 *    every deployment without a provider.
 *  - `budget` is its own state, from the 402 the site-wide budget speaks
 *    (`lib/ai/budget.server.ts`). It wants "you have used this month's
 *    allowance", not "something went wrong" — the first is actionable.
 *  - `error` is left for the genuinely unexpected, which is the only case worth
 *    showing a player a failure for.
 *
 * The hook deliberately does NOT auto-run. Every one of these calls costs money
 * against a per-user budget, and a panel that fetched on mount would spend it
 * on every player who scrolled past. They fire on an explicit press.
 */

import * as React from 'react';

export type AiState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'budget' | 'error';

export interface SliceAi<TResult, TBody> {
  state: AiState;
  data: TResult | null;
  /** Fire the call. Safe to call again; a second call while loading is ignored. */
  run: (body: TBody) => void;
  reset: () => void;
}

/**
 * @param endpoint  Route under `/api/slice-it/ai/`.
 * @param select    Pull the payload out of the response envelope. Returning
 *                  `null` from it means "the model had nothing", which lands in
 *                  `unavailable` rather than `ready` — a panel must never render
 *                  its own empty shell.
 */
export function useSliceAi<TResult, TBody extends object>(
  endpoint: string,
  select: (body: unknown) => TResult | null,
): SliceAi<TResult, TBody> {
  const [state, setState] = React.useState<AiState>('idle');
  const [data, setData] = React.useState<TResult | null>(null);

  // `select` is almost always an inline arrow, so it is a new function on every
  // render. Holding it in a ref keeps `run` stable — without this, every panel
  // that lists `run` in an effect's deps would refire on each render.
  const selectRef = React.useRef(select);
  selectRef.current = select;

  const inFlight = React.useRef(false);
  // Guards a setState after the panel unmounts, which a results card does the
  // moment the player hits Retry.
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = React.useCallback(
    (body: TBody) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setState('loading');

      void (async () => {
        try {
          const response = await fetch(`/api/slice-it/ai/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          if (!alive.current) return;

          if (response.status === 402) {
            setState('budget');
            return;
          }
          if (!response.ok) {
            setState('error');
            return;
          }

          const payload: unknown = await response.json();
          if (!alive.current) return;

          const result = selectRef.current(payload);
          if (result === null) {
            setState('unavailable');
            return;
          }
          setData(result);
          setState('ready');
        } catch {
          // A dropped connection on an optional panel. Nothing to report beyond
          // the state — the player did not lose anything they had.
          if (alive.current) setState('error');
        } finally {
          inFlight.current = false;
        }
      })();
    },
    [endpoint],
  );

  const reset = React.useCallback(() => {
    setData(null);
    setState('idle');
  }, []);

  return { state, data, run, reset };
}
