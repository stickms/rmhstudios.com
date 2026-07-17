'use client';

/**
 * Site-wide keyboard shortcuts for the sidebar shell (mounted in _site.tsx so
 * full-screen games keep their own key handling):
 *
 *   ?          toggle this help overlay
 *   /          open the command palette
 *   c          compose a post (signed in)
 *   g then <x> go somewhere (h home, e explore, n notifications, …)
 *
 * Shortcuts are suppressed while typing in inputs/textareas/contenteditables.
 */

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { openCommandPalette } from '@/components/site/command-palette-bus';
import { useSession } from '@/components/Providers';

const ComposeModal = lazy(() =>
  import('@/components/feed/ComposeModal').then((m) => ({ default: m.ComposeModal }))
);

/** Open the help overlay from anywhere (e.g. the command palette). */
export const SHORTCUTS_HELP_EVENT = 'rmh:shortcuts-help';

const SEQUENCE_TIMEOUT_MS = 1500;

// "g then <key>" navigation targets.
const GO_TARGETS: Array<{ key: string; href: string; tKey: string; label: string }> = [
  { key: 'h', href: '/', tKey: 'kbd-go-home', label: 'Home' },
  { key: 'e', href: '/search', tKey: 'kbd-go-explore', label: 'Explore & search' },
  { key: 'n', href: '/notifications', tKey: 'kbd-go-notifications', label: 'Notifications' },
  { key: 'm', href: '/messages', tKey: 'kbd-go-messages', label: 'Messages' },
  { key: 'b', href: '/bookmarks', tKey: 'kbd-go-bookmarks', label: 'Bookmarks' },
  { key: 'l', href: '/library', tKey: 'kbd-go-library', label: 'Library' },
  { key: 'c', href: '/communities', tKey: 'kbd-go-communities', label: 'Communities' },
  { key: 'w', href: '/wallet', tKey: 'kbd-go-wallet', label: 'Wallet' },
  { key: 'p', href: '/progress', tKey: 'kbd-go-progress', label: 'Progress' },
  { key: 'd', href: '/daily', tKey: 'kbd-go-daily', label: 'Daily puzzles' },
  { key: 's', href: '/settings', tKey: 'kbd-go-settings', label: 'Settings' },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-site-border bg-site-glass-tint px-1.5 py-0.5 text-[11px] font-medium text-site-text-muted shadow-[inset_0_1px_0_var(--site-glass-rim-soft)]">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-site-text-muted">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k, i) => (
          <Kbd key={i}>{k}</Kbd>
        ))}
      </span>
    </li>
  );
}

export function KeyboardShortcuts() {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const { data: session } = useSession();
  const signedIn = !!session?.user;

  const [helpOpen, setHelpOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const pendingGo = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        pendingGo.current = null;
        setHelpOpen((v) => !v);
        return;
      }

      // Second key of a "g then <x>" sequence.
      if (pendingGo.current !== null && Date.now() - pendingGo.current < SEQUENCE_TIMEOUT_MS) {
        const target = GO_TARGETS.find((g) => g.key === e.key.toLowerCase());
        pendingGo.current = null;
        if (target) {
          e.preventDefault();
          setHelpOpen(false);
          navigate({ to: target.href });
        }
        return;
      }
      pendingGo.current = null;

      switch (e.key.toLowerCase()) {
        case 'g':
          pendingGo.current = Date.now();
          return;
        case '/':
          e.preventDefault();
          setHelpOpen(false);
          openCommandPalette();
          return;
        case 'c':
          if (signedIn) {
            e.preventDefault();
            setHelpOpen(false);
            setComposeOpen(true);
          }
          return;
      }
    };

    const onHelpEvent = () => setHelpOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(SHORTCUTS_HELP_EVENT, onHelpEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SHORTCUTS_HELP_EVENT, onHelpEvent);
    };
  }, [navigate, signedIn]);

  return (
    <>
      {composeOpen && (
        <Suspense fallback={null}>
          <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
        </Suspense>
      )}
      <DialogPrimitive.Root open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[90] glass-scrim data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="glass-overlay fixed left-1/2 top-1/2 z-[91] max-h-[80dvh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-4 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          >
            <DialogPrimitive.Title className="text-base font-bold text-site-text">
              {t('kbd-title', { defaultValue: 'Keyboard shortcuts' })}
            </DialogPrimitive.Title>

            <h3 className="mt-3 text-xs font-bold uppercase tracking-wider text-site-text-dim">
              {t('kbd-section-general', { defaultValue: 'General' })}
            </h3>
            <ul className="mt-1 divide-y divide-site-border/50">
              <ShortcutRow
                keys={['⌘', 'K']}
                label={t('kbd-palette', { defaultValue: 'Command palette' })}
              />
              <ShortcutRow keys={['/']} label={t('kbd-search', { defaultValue: 'Search' })} />
              {signedIn && (
                <ShortcutRow keys={['C']} label={t('kbd-compose', { defaultValue: 'New post' })} />
              )}
              <ShortcutRow
                keys={['?']}
                label={t('kbd-help', { defaultValue: 'Show this overlay' })}
              />
            </ul>

            <h3 className="mt-4 text-xs font-bold uppercase tracking-wider text-site-text-dim">
              {t('kbd-section-goto', { defaultValue: 'Go to' })}
            </h3>
            <ul className="mt-1 divide-y divide-site-border/50">
              {GO_TARGETS.map((g) => (
                <ShortcutRow
                  key={g.key}
                  keys={['G', g.key.toUpperCase()]}
                  label={t(g.tKey, { defaultValue: g.label })}
                />
              ))}
            </ul>

            <DialogPrimitive.Close className="mt-4 w-full rounded-site border border-site-border px-3 py-2 text-sm font-medium text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text">
              {t('kbd-close', { defaultValue: 'Close' })}
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
