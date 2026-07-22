'use client';

import { useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { AnimatePresence, m as motion } from 'framer-motion';

import { WidgetFrame } from '@/components/ui/widget-frame';
import { IconButton } from '@/components/ui/icon-button';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useLayoutStore } from '@/stores/layoutStore';
import { WIDGET_CATALOG, type WidgetKind } from '@/lib/home-widgets';
import { iconFor } from './layout-icons';

/**
 * WidgetStack (§15) — renders the user's ordered home widgets from the layout
 * store. Only the widgets in the user's stack are rendered, so hidden widgets
 * never mount (nor load data — an acceptance criterion). Each widget is a G3
 * `WidgetFrame`; on mobile every frame is individually collapsible (48px header
 * when collapsed) with the collapsed state persisted per widget in `homeStack`.
 *
 * This is the shell: each widget links to its full surface. Richer inline
 * bodies (live "continue watching" thumbnails, friends facepile, …) swap into
 * `WIDGET_BODY` per kind as those surfaces are wired — the frame, ordering,
 * collapse, and persistence are all here.
 */

/** Per-widget destination + one-line summary (English fallbacks). */
const WIDGET_LINK: Record<WidgetKind, { href: string; blurb: string }> = {
  arcade: { href: '/arcade', blurb: "Jump into today's featured games." },
  streak: { href: '/progress', blurb: 'Keep your streak alive and spin the daily wheel.' },
  continue: { href: '/history', blurb: 'Pick up where you left off.' },
  friends: { href: '/friends', blurb: 'See who is online right now.' },
  ladder: { href: '/rmhladder', blurb: 'New roles matched to your profile.' },
  livenow: { href: '/spaces', blurb: 'Live spaces and streams happening now.' },
  events: { href: '/events', blurb: 'Upcoming community events.' },
  wallet: { href: '/wallet', blurb: 'Your coin balance and recent activity.' },
};

const PANEL = {
  open: { height: 'auto' as const, opacity: 1 },
  closed: { height: 0, opacity: 0 },
};

export function WidgetStack({ className }: { className?: string }) {
  const { t } = useTranslation('c-layout');
  const reduced = useReducedMotion();
  const homeStack = useLayoutStore((s) => s.homeStack);
  const hydrated = useLayoutStore((s) => s.hydrated);
  const toggleCollapsed = useLayoutStore((s) => s.toggleCollapsed);

  useEffect(() => {
    useLayoutStore.getState().hydrate();
  }, []);

  // Before hydration the store's stack is empty; render nothing rather than a
  // flash of the wrong order (the mirror read on hydrate is synchronous).
  if (!hydrated || homeStack.length === 0) return null;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-site-text-dim">
          {t('for-you', { defaultValue: 'For you' })}
        </span>
        <Link
          to="/settings/layout"
          className="flex items-center gap-1 text-xs text-site-text-muted transition-colors hover:text-site-text"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          {t('edit-layout', { defaultValue: 'Edit layout' })}
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {homeStack.map((item) => {
          const def = WIDGET_CATALOG[item.kind];
          if (!def) return null; // dropped-app safety (parse should have removed it)
          const Icon = iconFor(def.iconName);
          const link = WIDGET_LINK[item.kind];
          const collapsed = item.collapsed === true;
          const label = t(`widget-${item.kind}`, { defaultValue: def.label });

          const body = (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-site-text-muted">
                {t(`widget-${item.kind}-blurb`, { defaultValue: link.blurb })}
              </p>
              <Link
                to={link.href}
                aria-label={t('open-widget', { defaultValue: 'Open {{name}}', name: label })}
                className="glass-interactive flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-site-accent"
              >
                {t('open', { defaultValue: 'Open' })}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          );

          return (
            <WidgetFrame
              key={item.kind}
              title={label}
              icon={Icon}
              action={
                // Collapse toggle — most useful on mobile, available everywhere.
                <IconButton
                  icon={ChevronDown}
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => toggleCollapsed(item.kind)}
                  aria-expanded={!collapsed}
                  className={collapsed ? '' : 'rotate-180'}
                  label={
                    collapsed
                      ? t('expand-widget', { defaultValue: 'Expand {{name}}', name: label })
                      : t('collapse-widget', { defaultValue: 'Collapse {{name}}', name: label })
                  }
                />
              }
              className="[&>div:last-child]:p-0"
            >
              <AnimatePresence initial={false}>
                {collapsed ? null : (
                  <motion.div
                    key="body"
                    variants={PANEL}
                    initial={reduced ? false : 'closed'}
                    animate="open"
                    exit="closed"
                    transition={
                      reduced ? { duration: 0 } : { duration: 0.22, ease: [0.32, 0.72, 0, 1] }
                    }
                    className="overflow-hidden"
                  >
                    <div className="px-4 py-4">{body}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </WidgetFrame>
          );
        })}
      </div>
    </div>
  );
}
