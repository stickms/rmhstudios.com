'use client';

import { useEffect } from 'react';
import { installLiquidInteractions } from '@/lib/liquid/runtime';

/** Mount once at the provider boundary, including full-screen app routes. */
export function useLiquidInteractions(): void {
  useEffect(() => installLiquidInteractions(), []);
}
