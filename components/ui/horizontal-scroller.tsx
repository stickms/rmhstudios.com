'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface HorizontalScrollerProps {
 children: React.ReactNode;
 /** Accessible name for the scrollable region. */
 'aria-label': string;
 className?: string;
 contentClassName?: string;
 /** A visible parent prevents cards and chips from appearing cut off in space. */
 surface?: 'fill' | 'pill' | 'none';
}

/**
 * Shared horizontal overflow surface for rails, filter chips, and compact cards.
 * It keeps the scrollport inside a visible glass parent, exposes keyboard
 * scrolling, and adds desktop controls only when more content exists.
 */
export function HorizontalScroller({
 children,
 className,
 contentClassName,
 surface = 'fill',
 'aria-label': ariaLabel,
}: HorizontalScrollerProps) {
 const { t } = useTranslation('c-ui');
 const viewportRef = useRef<HTMLDivElement>(null);
 const [overflowing, setOverflowing] = useState(false);
 const [canScrollBack, setCanScrollBack] = useState(false);
 const [canScrollForward, setCanScrollForward] = useState(false);

 const measure = useCallback(() => {
 const viewport = viewportRef.current;
 if (!viewport) return;
 const hasOverflow = viewport.scrollWidth > viewport.clientWidth + 2;
 const first = viewport.firstElementChild?.getBoundingClientRect();
 const last = viewport.lastElementChild?.getBoundingClientRect();
 const bounds = viewport.getBoundingClientRect();
 setOverflowing(hasOverflow);
 setCanScrollBack(hasOverflow && Boolean(first && first.left < bounds.left - 1));
 setCanScrollForward(hasOverflow && Boolean(last && last.right > bounds.right + 1));
 }, []);

 useEffect(() => {
 const viewport = viewportRef.current;
 if (!viewport) return;
 measure();
 const observer = new ResizeObserver(measure);
 observer.observe(viewport);
 for (const child of Array.from(viewport.children)) observer.observe(child);
 viewport.addEventListener('scroll', measure, { passive: true });
 return () => {
 observer.disconnect();
 viewport.removeEventListener('scroll', measure);
 };
 }, [children, measure]);

 const scrollByPage = (direction: -1 | 1) => {
 const viewport = viewportRef.current;
 if (!viewport) return;
 viewport.scrollBy({
 left: direction * Math.max(160, viewport.clientWidth * 0.72),
 behavior: 'smooth',
 });
 };

 return (
 <div
 data-slot="horizontal-scroller"
 className={cn(
 'group/scroll relative min-w-0 max-w-full',
 surface === 'fill' && 'bg-site-surface border border-site-border rounded-2xl p-1.5',
 surface === 'pill' && 'bg-site-surface border border-site-border rounded-full p-1',
 className,
 )}
 >
 <div
 ref={viewportRef}
 role="region"
 aria-label={ariaLabel}
 tabIndex={overflowing ? 0 : undefined}
 data-overflow={overflowing ? 'true' : 'false'}
 onKeyDown={(event) => {
 if (event.target !== event.currentTarget) return;
 if (event.key === 'ArrowLeft') {
 event.preventDefault();
 scrollByPage(-1);
 } else if (event.key === 'ArrowRight') {
 event.preventDefault();
 scrollByPage(1);
 }
 }}
 className={cn(
 'horizontal-scroller__viewport flex min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain rounded-[inherit] scroll-smooth focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent',
 contentClassName,
 )}
 >
 {children}
 </div>

 {canScrollBack && (
 <button
 type="button"
 onClick={() => scrollByPage(-1)}
 aria-label={t('scroll-back', { defaultValue: 'Scroll left' })}
 className="bg-site-surface border border-site-border shadow-lg absolute left-2 top-1/2 z-2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full text-site-text opacity-0 transition-opacity hover:text-site-accent focus-visible:opacity-100 group-hover/scroll:opacity-100 sm:flex"
 >
 <ChevronLeft className="size-4" aria-hidden />
 </button>
 )}
 {canScrollForward && (
 <button
 type="button"
 onClick={() => scrollByPage(1)}
 aria-label={t('scroll-forward', { defaultValue: 'Scroll right' })}
 className="bg-site-surface border border-site-border shadow-lg absolute right-2 top-1/2 z-2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full text-site-text opacity-0 transition-opacity hover:text-site-accent focus-visible:opacity-100 group-hover/scroll:opacity-100 sm:flex"
 >
 <ChevronRight className="size-4" aria-hidden />
 </button>
 )}
 </div>
 );
}
