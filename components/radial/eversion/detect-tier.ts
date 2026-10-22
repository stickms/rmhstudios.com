import { pickTier } from '@/lib/eversion/gl/governor-tiers';
import type { Tier } from '@/lib/eversion/types';
import { isPerfLite } from '@/lib/perf-tier';

/**
 * The device's eversion quality tier, read from the live window. Shared by the
 * controller (render tier) and the BEFORE capture scheduler (capture scale cap,
 * spec 6.2: a `low` device must not pay for a `high` device's bitmap).
 */
export function detectTier(): Tier {
  const mobile = window.matchMedia?.('(pointer: coarse) and (max-width: 900px)').matches ?? false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const strong = (nav.hardwareConcurrency ?? 4) >= 8 && (nav.deviceMemory ?? 8) >= 8;
  return pickTier({
    renderTier: strong ? 'high' : 'medium',
    perfLite: isPerfLite(),
    isMobile: mobile,
  });
}
