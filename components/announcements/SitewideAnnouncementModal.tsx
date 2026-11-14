import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { markdownComponents } from '@/components/blog/markdown-components';
import { useSession } from '@/components/Providers';
import { useCookieConsentAnswered } from '@/components/site/CookieConsent';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import {
  markSitewideAnnouncementSeen,
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
import '@/components/ui/spine.css';

// Mirrors the first-run gates in WhatsNewModal / LanguageFirstRunModal / WelcomeModal (same keys, same event) so the
// popup never stacks on top of them. Mirrored rather than imported: those modules are lazy chunks of their own.
const LANG_KEY = 'rmh-lang-picked-v1';
const LANG_PICKED_EVENT = 'rmh:lang-picked';
const WELCOME_KEY = 'rmh-welcome-seen-v1';
let presentedInThisRuntime = false;

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The newest live sitewide announcement (a blog post with `announcement: true`) as a standard Steel dialog: rows on
 * rules, one primary. Opens itself once per runtime when unseen; the feed row reopens it any time through
 * `useSitewideAnnouncementStore`. It yields to the "What's new" release dialog and the first-run dialogs.
 */
export function SitewideAnnouncementModal() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const consentAnswered = useCookieConsentAnswered();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const open = useSitewideAnnouncementStore((s) => s.open);
  const setOpen = useSitewideAnnouncementStore((s) => s.setOpen);
  const whatsNewOpen = useSitewideAnnouncementStore((s) => s.whatsNewOpen);

  const { data } = useSitewideAnnouncement();
  const summary = data?.announcement ?? null;

  // The welcome modal exposes no dismissal signal, only localStorage, so the gate is re-read on the language event and
  // on navigation.
  const [langTick, setLangTick] = useState(0);
  useEffect(() => {
    const bump = () => setLangTick((n) => n + 1);
    window.addEventListener(LANG_PICKED_EVENT, bump);
    return () => window.removeEventListener(LANG_PICKED_EVENT, bump);
  }, []);

  const eligible =
    !!summary &&
    !isPending &&
    consentAnswered &&
    isAnnouncementLive(summary) &&
    !data?.seen &&
    !hasSeenLocally(summary) &&
    !whatsNewOpen &&
    !presentedInThisRuntime;

  useEffect(() => {
    if (!eligible) return;
    if (!readStorage(LANG_KEY)) return;
    if (session && !readStorage(WELCOME_KEY)) return;
    const timer = window.setTimeout(() => {
      // Re-check at fire time: What's new may have taken the screen during the delay.
      if (presentedInThisRuntime || useSitewideAnnouncementStore.getState().whatsNewOpen) return;
      presentedInThisRuntime = true;
      setOpen(true);
    }, 700);
    return () => window.clearTimeout(timer);
    // langTick and pathname are re-run triggers for the localStorage gates above.
  }, [eligible, session, setOpen, langTick, pathname]);

  const { data: full, isLoading, isError } = useSitewideAnnouncementContent(open || eligible);
  const announcement = full?.announcement ?? summary;

  const dismiss = useCallback(() => {
    if (summary) {
      markSeenLocally(summary);
      if (session) {
        markSitewideAnnouncementSeen(summary.id);
      }
      queryClient.setQueryData<SitewideAnnouncementResponse>(SITEWIDE_ANNOUNCEMENT_QUERY_KEY, (prev) =>
        prev ? { ...prev, seen: true } : prev,
      );
    }
    setOpen(false);
  }, [summary, session, queryClient, setOpen]);

  // Stay mounted while closing so the primitive's 160 ms fade-out runs; Radix unmounts the content itself.
  if (!announcement) return null;

  const business = getBusiness(announcement.business);
  const content = full?.announcement?.content;

  // Rows on rules (R3). No `overflow-hidden` on the content: the primitive's `overflow-y-auto` is what scrolls a
  // long post.
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent className="max-w-2xl gap-0 p-0">
        <div className="px-5 pt-6 sm:px-6">
          <p className="t-meta pe-10">
            {business.name} · {t('sitewide-announcement-label', { defaultValue: 'Announcement' })}
          </p>
          <DialogTitle className="t-title mt-2">{announcement.title}</DialogTitle>
          {announcement.description ? (
            <DialogDescription className="t-body mt-2 text-site-text-muted">
              {announcement.description}
            </DialogDescription>
          ) : null}
        </div>

        <div className="mt-5 border-t border-site-border px-5 py-5 sm:px-6">
          {announcement.image ? (
            <div className="mb-5 overflow-hidden rounded-site border border-site-border bg-site-bg-subtle">
              <img src={announcement.image} alt="" loading="lazy" className="h-auto w-full" />
            </div>
          ) : null}
          {isError ? (
            <p className="t-body text-site-text-muted">
              {t('sitewide-announcement-error', {
                defaultValue: 'The full announcement could not be loaded.',
              })}
            </p>
          ) : isLoading || content === undefined ? (
            <div className="flex justify-center py-6">
              <Spinner
                size={20}
                label={t('sitewide-announcement-loading', { defaultValue: 'Loading announcement' })}
              />
            </div>
          ) : (
            <div className="spine break-words">
              <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-site-border px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <Link
            to="/blog/$slug"
            params={{ slug: announcement.slug }}
            onClick={dismiss}
            className="t-body font-medium text-site-text underline underline-offset-4"
          >
            {t('sitewide-announcement-read-full', { defaultValue: 'Read full post' })}
          </Link>
          {announcement.discussionPostId ? (
            <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row sm:items-center">
              <Button variant="default" className="w-full sm:w-auto" onClick={dismiss}>
                {t('sitewide-announcement-dismiss', { defaultValue: 'Got it' })}
              </Button>
              <Button variant="primary" className="w-full sm:w-auto" asChild>
                <Link
                  to="/u/$userid/post/$postid"
                  params={{ userid: 'me', postid: announcement.discussionPostId }}
                  onClick={dismiss}
                >
                  {t('sitewide-join-discussion', { defaultValue: 'Join the discussion' })}
                </Link>
              </Button>
            </div>
          ) : (
            <Button variant="primary" className="w-full sm:ml-auto sm:w-auto" onClick={dismiss}>
              {t('sitewide-announcement-dismiss', { defaultValue: 'Got it' })}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
