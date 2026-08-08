'use client';

/**
 * Small hooks the Bum's Rush DOM layer needs, and nothing else does.
 *
 * All of them are `matchMedia`-backed rather than resize-backed: a phone
 * rotating fires one media change, not four hundred resize events, and the
 * layout questions this file answers ("is this a touch-only device?", "is the
 * phone sideways?") are breakpoint questions, not pixel questions.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { getBumsRushStatus, onBumsRushStatus } from '@/lib/bums-rush/net';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';

/**
 * Portrait, as the ORIENTATION media feature rather than a width comparison.
 *
 * A 1024×768 tablet in landscape and a 390×844 phone in portrait are both
 * "narrow-ish" by width; only one of them wants the "turn your phone sideways"
 * card. `(orientation: portrait)` is the question actually being asked.
 */
export function usePortrait(): boolean {
  return useMediaQuery('(orientation: portrait)');
}

/**
 * A device whose only pointer is a finger.
 *
 * This gates the couch-co-op affordances (design doc §12.1): two people cannot
 * share one phone's touchscreen, and offering them a "Player 2, press Grab to
 * join" card is a promise the hardware cannot keep. A pad paired to the same
 * phone is a different matter — that IS a second device — which is why callers
 * combine this with "has a pad actually been seen" rather than using it alone.
 */
export function useCoarsePointerOnly(): boolean {
  const coarse = useMediaQuery('(pointer: coarse)');
  const anyFine = useMediaQuery('(any-pointer: fine)');
  return coarse && !anyFine;
}

/** True where hover is a real thing — decides whether hover-only affordances may carry meaning. */
export function useHoverCapable(): boolean {
  return useMediaQuery('(hover: hover)');
}

/**
 * A number formatter for the active locale (§15).
 *
 * Memoised on the language because constructing an `Intl.NumberFormat` is not
 * free and the HUD asks for one on every frame it repaints the clock.
 */
export function useNumberFormat(): Intl.NumberFormat {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  return useMemo(() => new Intl.NumberFormat(language), [language]);
}

/**
 * The realtime connection, for `<ConnectionBanner>`.
 *
 * `useSyncExternalStore` rather than `useState` + effect so the first client
 * render already has the real status instead of flashing "connecting" for a
 * frame on a socket that was already up.
 */
export function useBumsRushConnection(): RealtimeStatus {
  return useSyncExternalStore(
    (onChange) => onBumsRushStatus(() => onChange()),
    () => getBumsRushStatus(),
    () => 'idle' as RealtimeStatus,
  );
}

/**
 * True once the component has mounted on the client.
 *
 * Several screens read device capabilities that do not exist during SSR
 * (gamepads, `matchMedia`); rendering the server's answer and then swapping is
 * a hydration mismatch, so those parts wait for this.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
