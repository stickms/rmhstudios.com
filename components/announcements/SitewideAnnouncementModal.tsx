'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { Megaphone, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { BlogMarkdown } from '@/components/blog/BlogMarkdown';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  SITEWIDE_ANNOUNCEMENT_QUERY_KEY,
  useSitewideAnnouncement,
  useSitewideAnnouncementContent,
} from '@/hooks/useSitewideAnnouncement';
import { getBusiness } from '@/lib/businesses';
import {
  hasSeenLocally,
  isAnnouncementLive,
  markSeenLocally,
  type SitewideAnnouncementResponse,
} from '@/lib/sitewide-announcement';
import { useSitewideAnnouncementStore } from '@/stores/sitewideAnnouncementStore';

import './SitewideAnnouncementModal.css';

// Mirrors the first-run gates in LanguageFirstRunModal / WelcomeModal so the
// popup never stacks on top of them.
const LANG_PICKED_KEY = 'rmh-lang-picked-v1';
const LANG_PICKED_EVENT = 'rmh:lang-picked';
const WELCOME_KEY = 'rmh-welcome-seen-v1';

/**
 * Full-screen takeover for the newest live sitewide announcement (a blog post
 * with `announcement: true`). Opens itself once per page load when unseen;
 * the feed card reopens it any time through `useSitewideAnnouncementStore`.
 */
export function SitewideAnnouncementModal() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const open = useSitewideAnnouncementStore((s) => s.open);
  const setOpen = useSitewideAnnouncementStore((s) => s.setOpen);

  const { data } = useSitewideAnnouncement();
  const summary = data?.announcement ?? null;

  // First-run dialogs finished? Re-evaluated on the lang-picked event and on
  // navigation (WelcomeModal exposes no dismissal signal, only localStorage).
  const [firstRunDone, setFirstRunDone] = useState(false);
  useEffect(() => {
    if (isPending) return;
    const check = () => {
      try {
        const langDone = !!localStorage.getItem(LANG_PICKED_KEY);
        const welcomeDone = !session || !!localStorage.getItem(WELCOME_KEY);
        setFirstRunDone(langDone && welcomeDone);
      } catch {
        setFirstRunDone(false);
      }
    };
    check();
    window.addEventListener(LANG_PICKED_EVENT, check);
    return () => window.removeEventListener(LANG_PICKED_EVENT, check);
  }, [session, isPending, pathname]);

  const shouldAutoOpen =
    !!summary &&
    !isPending &&
    firstRunDone &&
    isAnnouncementLive(summary) &&
    !data?.seen &&
    !hasSeenLocally(summary);

  const autoOpened = useRef(false);
  useEffect(() => {
    if (shouldAutoOpen && !autoOpened.current) {
      autoOpened.current = true;
      setOpen(true);
    }
  }, [shouldAutoOpen, setOpen]);

  const { data: full, isLoading, isError } = useSitewideAnnouncementContent(open || shouldAutoOpen);
  const announcement = full?.announcement ?? summary;

  const dismiss = useCallback(() => {
    if (summary) {
      markSeenLocally(summary);
      if (session) {
        fetch('/api/sitewide-announcement/seen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: summary.id }),
        }).catch(() => {});
      }
      queryClient.setQueryData<SitewideAnnouncementResponse>(SITEWIDE_ANNOUNCEMENT_QUERY_KEY, (prev) =>
        prev ? { ...prev, seen: true } : prev,
      );
    }
    setOpen(false);
  }, [summary, session, queryClient, setOpen]);

  if (!summary || !announcement) return null;

  const business = getBusiness(announcement.business);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) dismiss();
        else setOpen(true);
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="sitewide-announcement"
          data-mobile-fullscreen="true"
          data-reduced={reduced || undefined}
          className="sitewide-announcement glass-overlay fixed inset-0 z-50 flex h-dvh max-h-none w-dvw max-w-none flex-col overflow-hidden rounded-none text-site-text outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[88dvh] sm:w-[calc(100dvw-2rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-site"
        >
          {/* Header — fixed */}
          <header className="shrink-0 border-b border-site-border px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className="flex h-8 min-w-8 items-center justify-center rounded-site-sm border border-site-accent/30 bg-site-accent-dim px-1.5 text-xs font-bold tracking-tight text-site-accent"
                >
                  {business.mark}
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm font-semibold text-site-text">{business.name}</p>
                  <p className="inline-flex items-center gap-1 text-xs text-site-text-muted">
                    <Megaphone className="h-3 w-3" aria-hidden />
                    {t('sitewide-announcement-label', { defaultValue: 'Announcement' })}
                  </p>
                </div>
              </div>
              <DialogClose
                className="-mr-1.5 -mt-1 shrink-0 rounded-full p-2 text-site-text-muted outline-none transition-colors hover:bg-site-surface-hover hover:text-site-text focus-visible:ring-2 focus-visible:ring-site-accent/50"
              >
                <X className="h-4 w-4" aria-hidden />
                <span className="sr-only">{t('sitewide-close', { defaultValue: 'Close' })}</span>
              </DialogClose>
            </div>
            <DialogTitle className="mt-4 text-2xl font-bold leading-tight text-site-text sm:text-3xl">
              {announcement.title}
            </DialogTitle>
            {announcement.description && (
              <DialogDescription className="mt-2 text-sm sm:text-base">{announcement.description}</DialogDescription>
            )}
          </header>

          {/* Body — the only scroll container */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
            {announcement.image && (
              <img
                src={announcement.image}
                alt=""
                className="mb-6 block h-auto max-h-80 w-full max-w-full rounded-site border border-site-border object-cover"
              />
            )}
            {full?.announcement?.content ? (
              <BlogMarkdown content={full.announcement.content} className="prose-base" />
            ) : isError ? (
              <p className="text-sm text-site-text-muted">
                {t('sitewide-load-failed', { defaultValue: 'Could not load the full announcement.' })}
              </p>
            ) : (
              <div className="flex justify-center py-8">
                {isLoading && <Spinner label={t('sitewide-loading', { defaultValue: 'Loading announcement' })} />}
              </div>
            )}
          </div>

          {/* Footer — fixed */}
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-site-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:pb-4">
            <Button variant="ghost" asChild>
              <Link to="/blog/$slug" params={{ slug: announcement.slug }} onClick={dismiss}>
                {t('sitewide-read-full', { defaultValue: 'Read full post' })}
              </Link>
            </Button>
            <Button variant="accent" onClick={dismiss}>
              {t('sitewide-got-it', { defaultValue: 'Got it' })}
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
