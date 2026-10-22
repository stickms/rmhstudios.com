'use client';

import { useEffect } from 'react';
import { installLiquidInteractions } from '@/lib/liquid/runtime';
import { installLiquidRefraction } from '@/lib/liquid/refraction-runtime';

/** Mount once at the provider boundary, including full-screen app routes. */
export function useLiquidInteractions(): void {
  useEffect(() => {
    const stopInteractions = installLiquidInteractions();
    const stopRefraction = installLiquidRefraction();
    return () => {
      stopInteractions();
      stopRefraction();
    };
  }, []);
}
