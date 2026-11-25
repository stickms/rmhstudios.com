import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import { QA_THINK_CLIENT_TIMEOUT_MS } from '../../ai-budget';
import { buildMedListApi, type MedBuildRes } from '../../medschools.contract';
import { askStatusQuery } from '../../medschools.queries';

export type BuildState =
  | { state: 'idle' }
  | { state: 'pending'; think: boolean }
  | { state: 'done'; res: MedBuildRes }
  | { state: 'error'; error: unknown };

/**
 * One build at a time, started only by the member's press (never on load): a model call is slower than the client's
 * default timeout, so it takes the AI ceiling (the longer one when thinking). A new build or leaving the page cancels
 * the one in flight. The questions-left status is refetched after every build, built or refused.
 */
export function useBuild(): {
  run: BuildState;
  build(body: { request: string; useStats: boolean; think: boolean }): Promise<MedBuildRes | null>;
  cancel(): void;
} {
  const qc = useQueryClient();
  const [run, setRun] = useState<BuildState>({ state: 'idle' });
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const build = useCallback(
    async (b: { request: string; useStats: boolean; think: boolean }): Promise<MedBuildRes | null> => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setRun({ state: 'pending', think: b.think });
      try {
        const res = await api(buildMedListApi, {
          body: { request: b.request, useStats: b.useStats, ...(b.think ? { think: true } : {}) },
          signal: ctrl.signal,
          timeoutMs: b.think ? QA_THINK_CLIENT_TIMEOUT_MS : AI_TIMEOUT_MS,
        });
        if (ctrl.signal.aborted) return null;
        setRun({ state: 'done', res });
        return res;
      } catch (error) {
        if (!ctrl.signal.aborted) setRun({ state: 'error', error });
        return null;
      } finally {
        void qc.invalidateQueries({ queryKey: askStatusQuery().queryKey });
      }
    },
    [qc],
  );
  const cancel = useCallback(() => {
    abort.current?.abort();
    setRun({ state: 'idle' });
  }, []);
  return { run, build, cancel };
}
