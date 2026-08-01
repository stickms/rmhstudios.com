'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION, EASE } from '@/lib/motion';

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

export function Tooltip({ content, children, className, delay = 0.2 }: TooltipProps) {
 const [isVisible, setIsVisible] = useState(false);
 const [coords, setCoords] = useState({ top: 0, left: 0 });
 // Horizontal centre after clamping into the viewport; null until measured.
 const [centre, setCentre] = useState<number | null>(null);
 // How far the arrow moves to keep pointing at the trigger after that clamp.
 const [arrowDx, setArrowDx] = useState(0);
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
 }, [isVisible, coords.left, content]);

 const tooltipContent = (
 <AnimatePresence>
 {isVisible && (
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
 <motion.div
 ref={bubbleRef}
 initial={{ opacity: 0, scale: 0.9, y: 0, x: "-50%" }}
 animate={{ opacity: 1, scale: 1, y: -8, x: "-50%" }}
 exit={{ opacity: 0, scale: 0.9, y: 0, x: "-50%" }}
 transition={{ duration: DURATION.fast, ease: EASE.standard }}
 style={{
 position: "absolute",
 bottom: 0,
 left: 0,
 maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
 }}
 className={cn(
 "px-2.5 py-1 text-[11px] font-medium tracking-[-0.01em] text-site-text",
 // Floating UI → L4 surface on the themed radius. This used to force
 // Tailwind's own 2xl radius, a fixed 18px that ignored every theme's
 // radius scale (high-contrast squares its corners to 8px; the tooltip
 // stayed round).
 "glass-fill shadow-site rounded-site-sm",
 className
 )}
 >
 {content}
 {/* Arrow: a border triangle in the BORDER colour with a second, 1px-higher
 triangle in the surface colour over it, so it reads as the bubble's own
 hairline-outlined tail. A single border-coloured triangle (what this
 was) is a translucent grey notch that does not match the bubble it
 hangs off. */}
 <span
 aria-hidden
 className="absolute top-full -translate-x-1/2 border-4 border-transparent border-t-site-border"
 style={{ left: `calc(50% + ${arrowDx}px)` }}
 />
 <span
 aria-hidden
 className="absolute top-full -mt-px -translate-x-1/2 border-4 border-transparent border-t-site-surface"
 style={{ left: `calc(50% + ${arrowDx}px)` }}
 />
 </motion.div>
 </div>
 )}
 </AnimatePresence>
 );

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
