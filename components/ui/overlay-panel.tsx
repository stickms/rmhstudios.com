'use client';

/**
 * OverlayPanel — a centred modal panel that actually covers the viewport.
 *
 * ## Why this exists rather than each caller writing the four lines
 *
 * The four lines look trivial:
 *
 * ```tsx
 * <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
 *   <div className="absolute inset-0 bg-site-media-scrim-strong" onClick={close} />
 *   <motion.div variants={modalContent} className="relative … glass-overlay">…</motion.div>
 * </div>
 * ```
 *
 * — and they were, in six places. They are also wrong in three ways at once,
 * and every copy was wrong in all three.
 *
 * **1. `fixed` did not mean the viewport.** `ComposeBox`'s single root is
 * `.glass-pane`, which carries a live `backdrop-filter`. A non-`none`
 * `backdrop-filter` makes the element a **containing block for `position: fixed`
 * descendants** — so `inset: 0` resolved to the composer's own border box,
 * about 600×160px. The "full-screen" scrim dimmed only the composer slab, the
 * panel was centred and squeezed inside it (on a phone the panel is wider than
 * its containing block, so `.glass-overlay`'s `max-inline-size` clamp crushed
 * it), the page behind stayed bright and clickable, and scrolling the feed
 * carried the "fixed" dialog off-screen with the composer.
 *
 * **2. `z-[100]` did not mean 100.** The same `backdrop-filter` also opens a
 * stacking context, and `.glass-pane` is `relative` with no `z-index` — so the
 * whole subtree painted as one unit at the composer's place in DOM order and no
 * number inside it could escape. The composer's own sibling `ComposeModal`
 * already portals for exactly this reason, with a comment saying so.
 *
 * **3. The scrim was not operable.** Three of the six used a bare `<div>` with
 * an `onClick`: no role, no keyboard, invisible to a screen reader.
 *
 * The reason none of this was caught by eye: `html.reduce-transparency`,
 * `html.style-high-contrast` and `html.perf-lite` all force
 * `backdrop-filter: none`, which removes both the containing block *and* the
 * stacking context. **The same markup renders correctly for those visitors.**
 * Check this component's callers in the DEFAULT theme with transparency on.
 *
 * ## What this is not
 *
 * Not a replacement for `Dialog`. `Dialog` (Radix) additionally traps focus,
 * locks background scroll and owns Escape, and the panels that use this should
 * migrate to it. This is the smaller, behaviour-preserving fix for the layering
 * bug: it keeps each caller's markup and motion exactly as they were. Escape is
 * handled here because it costs nothing and four of the callers had no keyboard
 * dismissal at all; focus trap and scroll lock deliberately are not, because
 * faking them badly is worse than `Dialog` doing them properly.
 */

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface OverlayPanelProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the scrim's dismiss control. Defaults to "Close". */
  closeLabel?: string;
  /** Extra classes for the centring layer — padding, alignment. */
  className?: string;
  children: ReactNode;
}

export function OverlayPanel({
  open,
  onClose,
  closeLabel,
  className,
  children,
}: OverlayPanelProps) {
  const { t } = useTranslation('c-ui');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    // z-50 is the body-level dialog band (globals.css §5.6). The callers'
    // `z-[100]` was not "higher" — it was a number measured inside a stacking
    // context it could never leave. At body level 50 is above the shell, which
    // `.radial-shell`'s `isolation: isolate` caps, and level with Dialog/Sheet.
    <div className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', className)}>
      <button
        type="button"
        tabIndex={-1}
        aria-label={closeLabel ?? t('close', { defaultValue: 'Close' })}
        className="absolute inset-0 bg-site-media-scrim-strong"
        onClick={onClose}
      />
      {children}
    </div>,
    document.body,
  );
}
