'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';

/**
 * Global top navigation progress bar.
 *
 * The router preloads on intent, but route loaders (see `__root.tsx`'s blocking
 * `Promise.all`, and the many `createServerFn` loaders) can still run for a beat
 * after a click — during which the old page just sits there with no sign the
 * click registered. This thin accent bar trickles across the top the instant a
 * navigation goes `pending` and snaps to 100% when it resolves, so every click
 * gets immediate acknowledgement.
 *
 * Purely decorative + `aria-hidden`; it never traps focus or blocks input.
 */
export function NavigationProgress() {
 const isNavigating = useRouterState({ select: (s) => s.status === 'pending' });
 const [progress, setProgress] = useState(0);
 const [visible, setVisible] = useState(false);
 const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
 const showDelay = useRef<ReturnType<typeof setTimeout> | null>(null);
 const shown = useRef(false);
 // Tracks whether a bar is currently shown so the initial (idle) mount doesn't
 // run the "finish" animation for a navigation that never started.
 const active = useRef(false);

 useEffect(() => {
 const clearTrickle = () => {
 if (trickle.current) {
 clearInterval(trickle.current);
 trickle.current = null;
 }
 if (showDelay.current) {
 clearTimeout(showDelay.current);
 showDelay.current = null;
 }
 };

 if (isNavigating) {
 active.current = true;
 setProgress(8);
 // Keep instant/cache-hit navigations visually quiet. Press feedback
 // acknowledges them; the persistent bar only appears when useful.
 showDelay.current = setTimeout(() => {
 shown.current = true;
 setVisible(true);
 showDelay.current = null;
 // Ease toward 90% and hold — the real completion snaps it to 100%.
 trickle.current = setInterval(() => {
 setProgress((p) => (p < 90 ? p + (90 - p) * 0.18 : p));
 }, 160);
 }, 90);
 return clearTrickle;
 }

 clearTrickle();
 if (!active.current) return; // nothing was in flight — stay hidden
 active.current = false;
 if (!shown.current) {
 setProgress(0);
 return;
 }
 shown.current = false;
 setProgress(100);
 const hide = setTimeout(() => {
 setVisible(false);
 setProgress(0);
 }, 140);
 return () => clearTimeout(hide);
 }, [isNavigating]);

 return (
 <div
 aria-hidden
 className={`pointer-events-none fixed inset-x-0 top-0 z-[300] h-0.5 transition-opacity duration-200 ${
 visible ? 'opacity-100' : 'opacity-0'
 }`}
 >
 <div
 className="h-full origin-left bg-site-accent shadow-[0_0_6px_var(--site-accent)] transition-transform duration-150 ease-out"
 style={{ transform: `scaleX(${progress / 100})` }}
 />
 </div>
 );
}
