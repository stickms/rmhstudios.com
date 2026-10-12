'use client';

import { lazy, Suspense, useCallback, useState } from 'react';

/**
 * The always-imported half of the PB moment (plan U4): a type, a response
 * reader and a slot that renders nothing until there is a moment. The card
 * itself (`ResultMoment.tsx`, plus framer-motion, confetti and the share
 * sheet) is a separate chunk that only loads on a personal best.
 */

/** Mirrors `ScoreMoment` in `lib/game/submit.server.ts` (a server module). */
export interface ScoreMomentView {
  kind: 'first-score' | 'pb';
  score: number;
  previous: number | null;
  rank: number | null;
}

function isMoment(v: unknown): v is ScoreMomentView {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (m.kind === 'pb' || m.kind === 'first-score') && typeof m.score === 'number';
}

/** The moment (if any) in a score endpoint's parsed JSON body. */
export function parseScoreMoment(body: unknown): ScoreMomentView | null {
  if (!body || typeof body !== 'object') return null;
  const m = (body as { moment?: unknown }).moment;
  if (!isMoment(m)) return null;
  return {
    kind: m.kind,
    score: m.score,
    previous: typeof m.previous === 'number' ? m.previous : null,
    rank: typeof m.rank === 'number' ? m.rank : null,
  };
}

/** Pull the moment (if any) out of a score endpoint's response. Never throws. */
export async function readScoreMoment(res: Response): Promise<ScoreMomentView | null> {
  if (!res.ok) return null;
  try {
    return parseScoreMoment(await res.json());
  } catch {
    return null;
  }
}

/**
 * `[moment, take, clear]`. `take` accepts the raw `Response` or an already
 * parsed JSON body (for games whose persistence helper parses it first).
 */
export function useScoreMoment() {
  const [moment, setMoment] = useState<ScoreMomentView | null>(null);
  const take = useCallback(async (resOrBody: unknown) => {
    const next =
      resOrBody instanceof Response
        ? await readScoreMoment(resOrBody)
        : parseScoreMoment(resOrBody);
    if (next) setMoment(next);
  }, []);
  const clear = useCallback(() => setMoment(null), []);
  return [moment, take, clear] as const;
}

const ResultMoment = lazy(() => import('./ResultMoment'));

export function ResultMomentSlot({
  moment,
  gameName,
  onDismiss,
}: {
  moment: ScoreMomentView | null;
  gameName: string;
  onDismiss: () => void;
}) {
  if (!moment) return null;
  return (
    <Suspense fallback={null}>
      <ResultMoment moment={moment} gameName={gameName} onDismiss={onDismiss} />
    </Suspense>
  );
}
