'use client';

import { useEffect } from 'react';
import { installViewportFollow } from '@/lib/viewport-shift';

/**
 * Mount once per page: every `[data-floating]` / `[data-vv-follow]` element gets `--vv-shift` (px, positive = move down)
 * while iOS Safari's toolbar is changing size, for its `bottom` to subtract (`lib/viewport-shift.ts`). A no-op on a
 * browser without a visual viewport, or where it agrees with the layout viewport (desktop): nothing is written.
 */
export function useViewportFollow(): void {
  useEffect(() => installViewportFollow(document), []);
}
