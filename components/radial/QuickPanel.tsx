'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { DialogPortal } from '@/components/ui/dialog';
import { ArrowRight, Pause, Play, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useThemeStore } from '@/stores/themeStore';
import { DEFAULT_JELLY_MOTION, type JellyMotion } from '@/lib/appearance/prefs';
import { useMenuViewportFit } from '@/hooks/useMenuViewportFit';
import { usePopPresence } from '@/hooks/usePopPresence';

// useLayoutEffect warns during SSR; panels only ever open from a client
// interaction, so the visual result is identical either way.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface QuickPanelProps {
  open: boolean;
  onClose: () => void;
  /**
   * The panel's heading. Rendered — every panel wears the same header row, so
   * the four of them read as one control family rather than four one-offs; it
   * doubles as the dialog's accessible name via `aria-labelledby`.
   */
  title: string;
  /** Glyph beside the heading. Matches the top-bar control the panel hangs off. */
  icon?: LucideIcon;
  /** The top-bar control the panel hangs from — it aligns to its trailing edge. */
  anchorRef: RefObject<HTMLElement | null>;
  /**
   * The "and now the real thing" footer — every panel is a *preview*, so each one
   * renders a `<Link className="rad-panel__more">` through to its full page.
   * Passed in rather than derived from an href so each caller keeps its own
   * typed route + search params.
   */
  more?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * The shared shell for the top bar's quick panels.
 *
 * Every top-bar control opens a small, cheap preview first — search results,
 * the latest notifications, recent conversations, the profile menu — with a
 * footer link through to the full page. That keeps the common case (a glance)
 * off the router entirely, and the uncommon case one click away.
 *
 * Every panel is built from the same three parts — header, body, footer link —
 * so the family shares one silhouette, one inset and one type scale no matter
 * what each one is previewing. The body also carries a floor height, because a
 * panel that collapses to the height of its "Nothing new right now." line reads
 * as a rendering glitch rather than an empty inbox.
 *
 * Bounds are not left to chance: the panel is anchored to its trigger, capped to
 * a fraction of the viewport, and then run through `useMenuViewportFit`, which
 * measures the rendered box and clamps/translates it back inside the visual
 * viewport (safe-area aware) and re-runs on every resize/rotation — the same
 * guard the composer and sidebar menus use. On narrow screens the CSS drops the
 * anchor entirely and it spans the gutters as a drawer.
 *
 * It **portals to `<body>`**. Rendering it where the trigger lives would put it
 * inside `.radial-topbar`, and the top bar carries a `backdrop-filter` at ≥768px
 * — which makes it a containing block for `position: fixed` descendants, so the
 * panel would be positioned against the bar rather than the viewport. At body
 * level `--z-quickpanel` also lands cleanly above the shell and below dialogs.
 * Leaving the trigger's DOM subtree costs the natural tab order, so focus is
 * moved in on open and handed back to the trigger on close.
 */
export function QuickPanel({
  open,
  onClose,
  title,
  icon: Icon,
  anchorRef,
  more,
  children,
  className,
}: QuickPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Held mounted through the close so the reabsorb is visible. Only the RENDER
  // reads this — every listener below stays on `open`, so a panel on its way out
  // has already stopped taking Escape, outside presses and focus.
  const { present, state } = usePopPresence(open);
  const [anchor, setAnchor] = useState({ top: 56, right: 12 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Position under the trigger. The top bar is sticky at the top of the page, so
  // its rect is scroll-invariant — only a resize can move it.
  useIsoLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({
        top: Math.round(rect.bottom + 8),
        right: Math.max(8, Math.round(window.innerWidth - rect.right)),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, anchorRef]);

  // `present`, not `open`: this hook strips the clamp it applied in its cleanup,
  // and a panel that snapped back to its unclamped position for the length of
  // its own exit would be worse than having no exit.
  useMenuViewportFit(present, panelRef, [anchor.top, anchor.right]);

  // Escape and the outside press are Radix's (a non-modal Dialog, below). The one thing it
  // cannot know is that the trigger is not "outside": a press on it toggles, so it is excused.

  // Move focus into the panel on open and hand it back to the trigger on close —
  // the panel lives at the end of <body>, so without this a keyboard user would
  // be dropped at the bottom of the document when it dismisses.
  useEffect(() => {
    if (!open) return;
    const trigger = anchorRef.current;
    // The panel this effect opened, taken in the frame below rather than now:
    // Radix's portal mounts it a render after `open` flips, so at this point the
    // ref is still null, and a cleanup checking against that let Escape strand
    // focus on <body>.
    let panel: HTMLElement | null = panelRef.current;
    const raf = requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      panel = el;
      // `preventScroll` because the panel is position:fixed — it is already in
      // view by construction, so the browser's focus scroll can only drag the
      // page underneath it. On a phone that scroll lands at the same moment the
      // keyboard opens for the search field, and the two together read as the
      // viewport jumping the instant you tap the top bar.
      (el.querySelector<HTMLElement>('input, a[href], button') ?? el).focus({
        preventScroll: true,
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      // Only reclaim focus if the panel held it: still inside it, or orphaned on
      // <body> by its removal. Focus that landed somewhere real (a page a click
      // navigated to) is not yanked back to the top bar.
      const active = document.activeElement;
      const orphaned = !active || active === document.body;
      if (orphaned || panel?.contains(active)) trigger?.focus?.();
    };
  }, [open, anchorRef]);

  if (!present || !mounted) return null;

  return (
    <DialogPrimitive.Root modal={false} open onOpenChange={(o) => !o && onClose()}>
    <DialogPortal>
    <DialogPrimitive.Content
      ref={panelRef}
      className={['rad-panel', 'glass-overlay', className].filter(Boolean).join(' ')}
      // Themes restyle through `[data-slot]` (see components/CLAUDE.md), and the
      // panel portals out of the shell — the attribute is how a theme reaches it.
      data-slot="quick-panel"
      // The shared bloom (globals.css §7.1). Every one of these is pinned by its
      // own top-right corner, right under the top-bar control it belongs to, so
      // that corner is what it unfurls from — the panel grows out of the button
      // you pressed instead of appearing beside it. Below 560px the CSS drops
      // the anchor and the panel spans the gutters, but it is still pinned by
      // its top edge, so the same origin reads correctly there.
      data-motion="pop"
      data-state={state}
      // Focus in on open and back to the trigger on close are the effect above's.
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      // Not dismissing on focus-outside was the old behaviour: only Escape and a press do.
      onFocusOutside={(e) => e.preventDefault()}
      onInteractOutside={(e) => {
        if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
      }}
      aria-describedby={undefined}
      tabIndex={-1}
      style={
        {
          '--panel-top': `${anchor.top}px`,
          '--panel-right': `${anchor.right}px`,
          '--motion-origin': 'top right',
        } as CSSProperties
      }
    >
      <header className="rad-panel__head" data-slot="quick-panel-head">
        {Icon && <Icon aria-hidden />}
        <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
      </header>
      <div className="rad-panel__body" data-slot="quick-panel-body">
        {children}
      </div>
      {more}
    </DialogPrimitive.Content>
    </DialogPortal>
    </DialogPrimitive.Root>
  );
}

/** The footer arrow every panel puts before its "see the full page" label. */
export function QuickPanelMoreIcon() {
  return <ArrowRight aria-hidden />;
}

/** Uniform empty/loading line inside a quick panel. */
export function QuickPanelNote({ children }: { children: ReactNode }) {
  return <p className="rad-panel__note">{children}</p>;
}

/**
 * The loading state for a panel that fetches on open — and, more to the point,
 * the SIZE of the one that is coming.
 *
 * A one-line "Loading…" note is 88px; six notification rows are 330. A panel
 * that opened at the first and then jumped to the second animated perfectly and
 * still looked broken, because the box moved after the animation had committed
 * to it. Reserving the real shape up front is the fix, and it needs no delay:
 * the row count comes from `useReservedRows` (what this panel showed last time,
 * falling back to the cap it already declares in its own query).
 *
 * Each row is the REAL `.rad-panel__row` with `.skeleton-line`
 * standing in for its two lines of text, so it is exactly as tall as the thing
 * it is holding space for rather than approximately as tall. `rows={0}` — a
 * remembered empty inbox — reserves the note instead, so that case is stable too.
 *
 * The bars are decorative; the state is announced once through `role="status"`,
 * because a screen reader needs "Loading…" and not eighteen empty boxes.
 */
export function QuickPanelSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <div role="status" aria-live="polite" data-slot="quick-panel-skeleton">
      <span className="sr-only">{label}</span>
      {rows <= 0 ? (
        <p className="rad-panel__note" aria-hidden />
      ) : (
        Array.from({ length: rows }, (_, i) => (
          <div key={i} className="rad-panel__row" aria-hidden>
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <span className="rad-panel__row-main">
              <strong>
                <Skeleton className="skeleton-line w-1/2" />
              </strong>
              <small>
                <Skeleton className="skeleton-line w-4/5" />
              </small>
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * The level "Pause ambient motion" returns to. Module scope, not component
 * state: the panel unmounts on close, and the toggle must still restore `calm`
 * (not `lively`) for someone who paused from Calm and reopened the panel.
 */
let resumeJellyMotion: JellyMotion = DEFAULT_JELLY_MOTION;

/**
 * One-tap "Pause ambient motion" (Plasmatic Jelly R8, WCAG 2.2.2): cycles
 * `jellyMotion` to `still` and back to whatever it was before. Settings →
 * Appearance holds the full three-way control; this is the easy-to-find
 * mechanism 2.2.2 asks for. The store applies `html[data-jelly-motion]` and the
 * localStorage cache (via Providers); the PUT syncs a signed-in account and is a
 * harmless 401 for a signed-out visitor, whose choice lives on the device.
 */
export function QuickPanelMotionToggle({ className }: { className?: string }) {
  const { t } = useTranslation('settings-appearance');
  const jellyMotion = useThemeStore((s) => s.jellyMotion);
  const setJellyMotion = useThemeStore((s) => s.setJellyMotion);
  const paused = jellyMotion === 'still';

  const toggle = () => {
    let next: JellyMotion;
    if (paused) {
      next = resumeJellyMotion === 'still' ? DEFAULT_JELLY_MOTION : resumeJellyMotion;
    } else {
      resumeJellyMotion = jellyMotion;
      next = 'still';
    }
    setJellyMotion(next);
    void fetch('/api/preferences/appearance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ jellyMotion: next }),
    }).catch(() => {});
  };

  const Icon = paused ? Play : Pause;
  const labelId = useId();
  return (
    <div
      className={['rad-panel__row', className].filter(Boolean).join(' ')}
      data-slot="quick-panel-motion-toggle"
    >
      <Icon aria-hidden />
      <span className="rad-panel__row-main">
        <strong id={labelId}>
          {t('pause-ambient-motion', { defaultValue: 'Pause ambient motion' })}
        </strong>
        <small>
          {paused
            ? t('pause-ambient-motion-on', { defaultValue: 'Paused. Tap to resume.' })
            : t('pause-ambient-motion-off', {
                defaultValue: 'Stops the jelly surfaces moving on their own.',
              })}
        </small>
      </span>
      <Switch checked={paused} onCheckedChange={toggle} aria-labelledby={labelId} />
    </div>
  );
}
