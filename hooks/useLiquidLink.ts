'use client';

import { useNavigate } from '@tanstack/react-router';
import type { MouseEvent } from 'react';
import { runLiquidOpen } from '@/lib/view-transition';

/**
 * onClick helper for a plain TanStack `<Link>` that runs a §5.48 liquid
 * card→detail open morph: it tags the clicked element with `name` for exactly
 * the transition's lifetime (never at rest on a list item) and drives the
 * navigation itself. Only plain left-clicks are intercepted — modified /
 * new-tab / middle clicks fall through to the Link's normal behaviour — mirroring
 * `ViewTransitionLink`'s guards. The destination names its hero with the same
 * `name` statically.
 */
export function useLiquidLink() {
  const navigate = useNavigate();
  return function liquidOpen(
    e: MouseEvent<HTMLElement>,
    name: string,
    to: { to: string; params?: Record<string, unknown>; search?: Record<string, unknown> },
  ) {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    // navigate's options are a superset of Link's to/params/search; cast through
    // `never` exactly like ViewTransitionLink does to keep the call route-agnostic.
    runLiquidOpen(e.currentTarget, name, () => navigate(to as never));
  };
}
