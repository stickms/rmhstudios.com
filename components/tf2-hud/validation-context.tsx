/**
 * One validation run shared by the file tree and the problems panel.
 */
'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useEditor } from '@/lib/tf2-hud/store';
import { isTextPath } from '@/lib/tf2-hud/project/paths';
import { useValidation, type ValidationResult } from '@/lib/tf2-hud/use-validation';

interface Value extends ValidationResult {
  scopeAll: boolean;
  setScopeAll(v: boolean): void;
}

const Ctx = createContext<Value | null>(null);

export function ValidationProvider({ children }: { children: ReactNode }) {
  const [scopeAll, setScopeAll] = useState(false);
  const overlay = useEditor((s) => s.overlay);
  const baseIndex = useEditor((s) => s.baseIndex);
  const scope = useMemo(() => {
    if (!scopeAll) return undefined;
    const set = new Set<string>(baseIndex ? baseIndex.files.keys() : []);
    for (const [p, c] of overlay) {
      if (c === null) set.delete(p);
      else set.add(p);
    }
    return [...set].filter(isTextPath);
  }, [scopeAll, overlay, baseIndex]);
  const result = useValidation(scope);
  const value = useMemo(() => ({ ...result, scopeAll, setScopeAll }), [result, scopeAll]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useValidationContext(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('useValidationContext outside ValidationProvider');
  return v;
}
