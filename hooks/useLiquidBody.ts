'use client';

/**
 * useLiquidBody (§16.1.3) — register a UI shape as a shader liquid body while the
 * GL layer is live, and hand back a `set()` the caller pushes fresh geometry into
 * from its OWN motion-value sampler / subscription (no new layout reads, none in
 * the render loop).
 *
 * The hook imports only the tiny `active` signal + the `registry` — NOT the
 * orchestrator (index.ts) — so pulling it into a widely-used component
 * (liquid-morph) doesn't drag the detect/scene/shader graph into the main bundle;
 * that stays the lazily-loaded chunk Providers dynamic-imports.
 *
 * `active` reflects whether a GL tier is rendering — the caller uses it to skip
 * its SVG-goo underlay (the shader draws the metaball merge instead) and fall
 * straight back to the CSS/SVG path when GL is off.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isLiquidActive, subscribeLiquidActive } from '@/lib/liquid-gl/active';
import { registerBody } from '@/lib/liquid-gl/registry';
import type { LiquidBodyHandle, LiquidBodyKind, LiquidBodyPatch } from '@/lib/liquid-gl/types';

let groupSeq = 1;
/** Allocate a process-unique merge-group id (bodies sharing it fuse via smin). */
export function allocLiquidGroup(): number {
  return groupSeq++;
}

/** Reactive "is the GL liquid layer live" flag. */
export function useLiquidActive(): boolean {
  const [active, setActive] = useState<boolean>(() => isLiquidActive());
  useEffect(() => subscribeLiquidActive(setActive), []);
  return active;
}

/** A stable merge-group id for this component instance (capsule+droplet, bud+disc). */
export function useLiquidGroup(): number {
  const ref = useRef<number>(0);
  if (ref.current === 0) ref.current = allocLiquidGroup();
  return ref.current;
}

export interface UseLiquidBodyResult {
  /** True while a GL tier is live — skip the SVG goo and drive `set` when true. */
  active: boolean;
  /** Push fresh geometry/press/active into the registered body (no-op when off). */
  set: (patch: LiquidBodyPatch) => void;
}

/**
 * Register one liquid body while GL is active AND `enabled`. The body is removed
 * automatically on unmount / when GL tears down / when disabled.
 */
export function useLiquidBody(opts: {
  kind: LiquidBodyKind;
  group?: number;
  enabled?: boolean;
}): UseLiquidBodyResult {
  const { kind, group = 0, enabled = true } = opts;
  const glActive = useLiquidActive();
  const handleRef = useRef<LiquidBodyHandle | null>(null);

  const shouldRegister = glActive && enabled;
  useEffect(() => {
    if (!shouldRegister) return;
    const handle = registerBody(kind, group);
    handleRef.current = handle;
    return () => {
      handle?.remove();
      handleRef.current = null;
    };
  }, [shouldRegister, kind, group]);

  const set = useCallback((patch: LiquidBodyPatch) => {
    handleRef.current?.set(patch);
  }, []);

  return { active: glActive, set };
}
