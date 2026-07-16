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
export function Tooltip({ content, children, className, delay = 0.2 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
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
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const handleUpdate = () => updateCoords();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isVisible, updateCoords, hide]);

  const tooltipContent = (
    <AnimatePresence>
      {isVisible && (
        <div
          role="tooltip"
          id={tooltipId}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 0, x: "-50%" }}
                animate={{ opacity: 1, scale: 1, y: -8, x: "-50%" }}
                exit={{ opacity: 0, scale: 0.9, y: 0, x: "-50%" }}
                transition={{ duration: DURATION.fast, ease: EASE.standard }}
                style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                }}
                className={cn(
                    "px-2.5 py-1 text-[11px] font-medium tracking-[-0.01em] text-site-text whitespace-nowrap",
                    // Floating UI → L4 glass-overlay, with the small radius.
                    "glass-overlay !rounded-site-sm",
                    className
                )}
            >
                {content}
                {/* Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-0.5 border-4 border-transparent border-t-site-border" />
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
