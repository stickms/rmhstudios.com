'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePopPresence } from '@/hooks/usePopPresence';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface TooltipProps {
 content: React.ReactNode;
 children: React.ReactNode;
 className?: string;
 delay?: number;
}

/**
 * Lightweight portal tooltip.
 *
 * Shows on hover **and** keyboard focus, dismisses on Escape, and wires
 * `aria-describedby` so assistive tech announces the hint — the previous
 * version was mouse-only and invisible to keyboard users. `onFocus`/`onBlur`
 * on the wrapper catch focus bubbling up from a focusable child (React routes
 * these through focusin/focusout, which bubble), so it works whether the
 * child is a button, link, or focusable element.
 */
/** Keep-on-screen inset, and how close the arrow may get to the bubble's corner. */
const VIEWPORT_MARGIN = 8;
const ARROW_INSET = 12;
/** Gap between the trigger and the bubble — the 8px the transform already used. */
const ARROW_GAP = 8;

export function Tooltip({ content, children, className, delay = 0.2 }: TooltipProps) {
 const [isVisible, setIsVisible] = useState(false);
 const [coords, setCoords] = useState({ top: 0, left: 0 });
 // Horizontal centre after clamping into the viewport; null until measured.
 const [centre, setCentre] = useState<number | null>(null);
 // How far the arrow moves to keep pointing at the trigger after that clamp.
 const [arrowDx, setArrowDx] = useState(0);
 /** Flipped below the trigger because there was no room above it. */
 const [below, setBelow] = useState(false);
 // Holds the bubble mounted for the length of its close (globals.css §7.1).
 const { present, state } = usePopPresence(isVisible);
 const triggerRef = useRef<HTMLSpanElement>(null);
 const bubbleRef = useRef<HTMLDivElement>(null);
 const [mounted, setMounted] = useState(false);
 const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);
 const tooltipId = useId();

 useEffect(() => {
 setMounted(true);
 return () => {
 if (timeoutId.current) clearTimeout(timeoutId.current);
 };
 }, []);

 const updateCoords = useCallback(() => {
 if (triggerRef.current) {
 const rect = triggerRef.current.getBoundingClientRect();
 setCoords({ top: rect.top, left: rect.left + rect.width / 2 });
 }
 }, []);

 const show = useCallback(
 (withDelay: boolean) => {
 updateCoords();
 if (timeoutId.current) clearTimeout(timeoutId.current);
 if (withDelay) {
 timeoutId.current = setTimeout(() => {
 updateCoords();
 setIsVisible(true);
 }, delay * 1000);
 } else {
 setIsVisible(true);
 }
 },
 [delay, updateCoords],
 );

 const hide = useCallback(() => {
 if (timeoutId.current) clearTimeout(timeoutId.current);
 setIsVisible(false);
 setCentre(null);
 setArrowDx(0);
 setBelow(false);
 }, []);

 useEffect(() => {
 if (!isVisible) return;

 const handleUpdate = () => updateCoords();
 const handleKey = (e: KeyboardEvent) => {
 if (e.key === 'Escape') hide();
 };
 // Capture-phase so scrolling in ANY container re-anchors the tooltip, and
 // `passive` so that listener can never delay a scroll — this fires on every
 // frame of every scroll while a tooltip is open, which is exactly the shape
 // that makes a page feel heavy if the browser has to wait on it.
 window.addEventListener('scroll', handleUpdate, { capture: true, passive: true });
 window.addEventListener('resize', handleUpdate);
 window.addEventListener('keydown', handleKey);

 return () => {
 window.removeEventListener('scroll', handleUpdate, true);
 window.removeEventListener('resize', handleUpdate);
 window.removeEventListener('keydown', handleKey);
 };
 }, [isVisible, updateCoords, hide]);

 // Keep the bubble on screen. A tooltip on a trigger near either edge would
 // otherwise be centred on the trigger and hang off the viewport with its text
 // clipped — worst on phones, where the bubble is often wider than the gap.
 // Measured from `offsetWidth` (layout width) rather than a bounding rect,
 // because the entrance animation scales the bubble and would under-report it.
 useEffect(() => {
 if (!isVisible) return;
 const el = bubbleRef.current;
 if (!el) return;
 // WHICH SIDE. The bubble was pinned above the trigger unconditionally, so a
 // tooltip on anything in the top row of the viewport — the shell's own top
 // bar, the first row of a table, a sticky header — rendered off the top of
 // the screen with its text clipped. The horizontal clamp below has always
 // existed; this is its missing vertical half.
 const height = el.offsetHeight;
 setBelow(coords.top - height - ARROW_GAP < VIEWPORT_MARGIN);

 const half = el.offsetWidth / 2;
 const min = VIEWPORT_MARGIN + half;
 const max = window.innerWidth - VIEWPORT_MARGIN - half;
 // Bubble wider than the viewport: no clamp can satisfy both edges, so centre.
 const next = min > max ? window.innerWidth / 2 : Math.min(Math.max(coords.left, min), max);
 setCentre(next);
 // The arrow tracks the trigger across whatever shift that applied, but stops
 // short of the corners so it never grows out of the bubble's rounded end.
 const limit = Math.max(0, half - ARROW_INSET);
 setArrowDx(Math.min(Math.max(coords.left - next, -limit), limit));
 }, [isVisible, coords.left, coords.top, content]);

 const tooltipContent = present ? (
 <div
 role="tooltip"
 id={tooltipId}
 style={{
 position: 'fixed',
 top: coords.top,
 left: centre ?? coords.left,
 zIndex: 'var(--z-tooltip)',
 pointerEvents: 'none',
 }}
 >
 {/* `data-motion="pop"` — the site's one enter/exit vocabulary for floating
 surfaces (globals.css §7.1), which every other popover, menu and select
 already speaks. This was the last floating surface still animating from
 its own framer transition, at its own timing, which is exactly the
 "three different answers" §7.1 was opened to end. `usePopPresence`
 supplies the close, since React unmounts this the instant it hides. */}
 <div
 ref={bubbleRef}
 data-motion="pop"
 data-state={state}
 style={{
 position: "absolute",
 bottom: below ? "auto" : 0,
 top: below ? 0 : "auto",
 left: 0,
 transform: `translate(-50%, ${below ? ARROW_GAP : -ARROW_GAP}px)`,
 // The bloom scales from the edge nearest the trigger, so a flipped
 // tooltip grows downward out of it rather than upward into it.
 ["--motion-origin" as string]: below ? "top center" : "bottom center",
 maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
 }}
 className={cn(
 "px-2.5 py-1 text-[11px] font-medium tracking-[-0.01em] text-site-text",
 // Floating UI → L4 surface on the themed radius. This used to force
 // Tailwind's own 2xl radius, a fixed 18px that ignored every theme's
 // radius scale (high-contrast squares its corners to 8px; the tooltip
 // stayed round).
 "glass-overlay shadow-site rounded-site-sm",
 className
 )}
 >
 {content}
 {/* Arrow: a border triangle in the BORDER colour with a second, 1px-inset
 triangle in the bubble's own fill over it, so it reads as the bubble's
 hairline-outlined tail. The fill is `--site-glass-overlay-fill`, the
 same expression `.glass-overlay` paints with — it used to be the OPAQUE
 `--site-bg`, which showed as a solid notch hanging off a translucent
 bubble, and which ignored the Glass clarity slider the bubble follows.
 A border colour cannot be a background, which is why the tier's fill
 had to be given a name to be reachable here at all. */}
 <span
 aria-hidden
 className={cn(
 "absolute -translate-x-1/2 border-4 border-transparent",
 below ? "bottom-full border-b-site-border" : "top-full border-t-site-border",
 )}
 style={{ left: `calc(50% + ${arrowDx}px)` }}
 />
 <span
 aria-hidden
 className={cn(
 "absolute -translate-x-1/2 border-4 border-transparent",
 below ? "bottom-full -mb-px" : "top-full -mt-px",
 )}
 style={{
 left: `calc(50% + ${arrowDx}px)`,
 [below ? "borderBottomColor" : "borderTopColor"]:
 "var(--site-glass-overlay-fill)",
 }}
 />
 </div>
 </div>
 ) : null;

 return (
 <>
 <span
 ref={triggerRef}
 className="inline-flex"
 aria-describedby={isVisible ? tooltipId : undefined}
 onMouseEnter={() => show(true)}
 onMouseLeave={hide}
 onFocus={() => show(false)}
 onBlur={hide}
 >
 {children}
 </span>
 {mounted && createPortal(tooltipContent, document.body)}
 </>
 );
}
