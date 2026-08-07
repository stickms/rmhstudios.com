'use client';

/**
 * Slice It chart editor — the hook that keeps the lint result fresh.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §9.
 *
 * Mounted once, by the editor shell. It watches the store's `revision` — the
 * counter every command bumps — rather than the note arrays, so it costs one
 * number comparison per render instead of a deep compare of four difficulties.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useEditorStore } from './store';
import { buildLintRequest, issuesByNote, type LintResult } from './lint';
import { createLintRunner, type LintRunner } from './lint-runner';
import type { Difficulty, LintIssue } from './types';

export function useLintRunner(): { flush: () => void } {
  const setLint = useEditorStore((state) => state.setLint);
  const revision = useEditorStore((state) => state.revision);
  const loadState = useEditorStore((state) => state.loadState);
  const nestingMode = useEditorStore((state) => state.nestingMode);
  const runnerRef = useRef<LintRunner | null>(null);

  useEffect(() => {
    const runner = createLintRunner((result: LintResult) => setLint(result));
    runnerRef.current = runner;
    return () => {
      runner.dispose();
      runnerRef.current = null;
    };
  }, [setLint]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    // Read the document non-reactively: this effect is already keyed on the
    // revision, and subscribing to `charts` as well would re-run it for a
    // selection change, which cannot alter a single finding.
    const state = useEditorStore.getState();
    if (!state.song) return;
    runnerRef.current?.schedule(
      buildLintRequest({
        charts: state.charts,
        timingPoints: state.timingPoints,
        duration: state.song.duration,
        revision,
        checkNesting: nestingMode !== 'off',
      }),
    );
  }, [revision, loadState, nestingMode]);

  return {
    flush: () => runnerRef.current?.flush(),
  };
}

/**
 * Findings for the open difficulty, keyed by note id.
 *
 * Memoised on the lint result's identity, not its revision: `setLint` only
 * replaces the object when it accepted a newer result, so an unchanged
 * reference means there is genuinely nothing to rebuild.
 */
export function useLintIssues(difficulty: Difficulty): Map<string, LintIssue[]> {
  const lint = useEditorStore((state) => state.lint);
  return useMemo(() => issuesByNote(lint, difficulty), [lint, difficulty]);
}
