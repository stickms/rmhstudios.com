import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import { QA_THINK_CLIENT_TIMEOUT_MS } from '../../ai-budget';
import { askMedQuestionApi, type MedAskRes } from '../../medschools.contract';
import { askStatusQuery } from '../../medschools.queries';
import { IDLE, createAskRun, type AskQuestion, type AskSnapshot, type AskState } from './askRun';

/**
 * The Ask panel's one question at a time. A model call is slower than the client's default timeout, so it takes the
 * AI ceiling; a thinking question (plan R20) runs up to 90 s on the server, so its call alone takes a longer
 * timeout, above the server's deadline (`QA_THINK_CLIENT_TIMEOUT_MS`), and the global ceiling stays as it was. The status query (the questions left today) is refetched after every question, answered or refused,
 * because the day's count moves on the server whichever way it ended.
 */
export function useAsk(): {
  ask(q: AskQuestion): void;
  cancel(): void;
  state: AskState;
  res: MedAskRes | null;
  error: unknown;
  seconds: number | null;
} {
  const qc = useQueryClient();
  const [snap, setSnap] = useState<AskSnapshot>(IDLE);
  const run = useRef<ReturnType<typeof createAskRun> | null>(null);
  if (!run.current) {
    run.current = createAskRun(
      (body, signal) =>
        api(askMedQuestionApi, {
          body,
          signal,
          timeoutMs: body.think ? QA_THINK_CLIENT_TIMEOUT_MS : AI_TIMEOUT_MS,
        }),
      (s) => {
        setSnap(s);
        if (s.state === 'done' || s.state === 'error')
          void qc.invalidateQueries({ queryKey: askStatusQuery().queryKey });
      },
    );
  }
  useEffect(() => () => run.current?.cancel(), []);
  const ask = useCallback((q: AskQuestion) => run.current?.ask(q), []);
  const cancel = useCallback(() => run.current?.cancel(), []);
  return { ask, cancel, state: snap.state, res: snap.res, error: snap.error, seconds: snap.seconds };
}
