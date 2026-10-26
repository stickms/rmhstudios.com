/**
 * Validation of the files the author has touched (plus any they ask for),
 * recomputed off the render path so typing never waits on it.
 */
'use client';

import { useDeferredValue, useMemo } from 'react';
import { COND_ENVS } from './scheme/cond';
import { EMPTY_SCHEME, parseScheme } from './scheme/scheme';
import { contentBytes } from './project/model';
import { useEditor } from './store';
import { countBySeverity, validateFiles, type Issue, type Severity } from './validate';

export interface ValidationResult {
  issues: Issue[];
  counts: Record<Severity, number>;
  byPath: Map<string, Severity>;
}

export function useValidation(scopeOverride?: readonly string[]): ValidationResult {
  const overlay = useEditor((s) => s.overlay);
  const baseVersion = useEditor((s) => s.baseVersion);
  const env = useEditor((s) => s.view.env);
  const readText = useEditor((s) => s.readText);
  const hasFile = useEditor((s) => s.hasFile);
  const deferredOverlay = useDeferredValue(overlay);

  return useMemo(() => {
    const schemeText = readText('resource/clientscheme.res');
    const scheme = schemeText ? parseScheme(schemeText, COND_ENVS[env]) : EMPTY_SCHEME;
    const scope =
      scopeOverride ?? [...deferredOverlay.entries()].filter(([, c]) => c !== null).map(([p]) => p);
    const issues = validateFiles({
      scope,
      readText,
      size: (p) => {
        const c = deferredOverlay.get(p);
        return c ? contentBytes(c).length : undefined;
      },
      exists: hasFile,
      scheme,
      env: COND_ENVS[env],
    });
    const byPath = new Map<string, Severity>();
    const rank = { error: 0, warning: 1, info: 2 } as const;
    for (const i of issues) {
      // Texture notes are informational; they should not flag a file in the tree.
      if (i.severity === 'info') continue;
      const cur = byPath.get(i.path);
      if (!cur || rank[i.severity] < rank[cur]) byPath.set(i.path, i.severity);
    }
    return { issues, counts: countBySeverity(issues), byPath };
    // `baseVersion` re-runs this when base bytes needed for scheme/panels arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredOverlay, baseVersion, env, readText, hasFile, scopeOverride]);
}
