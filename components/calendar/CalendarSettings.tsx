'use client';

/** K3 — `/settings/calendar`: the private calendar feed, plus shortcuts to polls and office hours. */

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarCheck, CalendarClock, RefreshCw } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { CalendarFeedView } from '@/lib/calendar/types';
import { api } from './api';

export default function CalendarSettings() {
  const { t, i18n } = useTranslation('f-calendar');
  const { data: session, isPending } = useSession();
  const confirm = useConfirm();
  const [feed, setFeed] = useState<CalendarFeedView | null>(null);
  const [busy, setBusy] = useState(false);
  const signedIn = !!session?.user;

  useEffect(() => {
    if (isPending || !signedIn) return;
    void api<{ feed: CalendarFeedView }>('/api/calendar-feed').then((r) =>
      setFeed(r.data?.feed ?? null),
    );
  }, [isPending, signedIn]);

  if (isPending) return <Skeleton className="m-4 h-48" />;
  if (!signedIn) {
    return (
      <SignedOutPrompt
        icon={CalendarCheck}
        title={t('feed-signed-out', { defaultValue: 'Sign in to get your calendar feed' })}
        callbackURL="/settings/calendar"
      />
    );
  }

  const patch = async (body: object, okMessage?: string) => {
    setBusy(true);
    const res = await api<{ feed: CalendarFeedView }>('/api/calendar-feed', {
      method: 'PATCH',
      body,
    });
    setBusy(false);
    if (res.ok && res.data) {
      setFeed(res.data.feed);
      if (okMessage) toast.success(okMessage);
    } else
      toast.error(
        res.error ?? t('feed-error', { defaultValue: 'Could not update your calendar feed.' }),
      );
  };

  const rotate = async () => {
    const sure = await confirm({
      title: t('feed-rotate-title', { defaultValue: 'Make a new link?' }),
      description: t('feed-rotate-body', {
        defaultValue:
          'The old link stops working. Calendar apps subscribed to it will need the new one.',
      }),
      confirmLabel: t('feed-rotate-confirm', { defaultValue: 'Make a new link' }),
      danger: true,
    });
    if (sure)
      await patch({ rotate: true }, t('feed-rotated', { defaultValue: 'New link created.' }));
  };

  const toggleSlot = (id: string, on: boolean) => {
    if (!feed) return;
    const chosen = new Set(feed.slots.filter((s) => s.optedIn).map((s) => s.id));
    if (on) chosen.add(id);
    else chosen.delete(id);
    void patch({ slotIds: [...chosen] });
  };

  return (
    <div className="space-y-6 p-4">
      <section className="glass-pane space-y-4 rounded-site p-4" aria-labelledby="feed-heading">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="feed-heading" className="font-display text-lg font-medium text-site-text">
              {t('feed-title', { defaultValue: 'Calendar feed' })}
            </h2>
            <p className="mt-1 text-sm text-site-text-muted">
              {t('feed-intro', {
                defaultValue:
                  'One private link for Google Calendar, Apple Calendar or Outlook: events you RSVP to, tournaments you entered, office hours, locked-in polls and the game nights you pick below.',
              })}
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-site-text-muted">
            <Switch
              checked={feed?.enabled ?? false}
              disabled={busy || !feed}
              onCheckedChange={(v) => void patch({ enabled: v })}
              aria-label={t('feed-enabled', { defaultValue: 'Feed on' })}
            />
            {t('feed-enabled', { defaultValue: 'Feed on' })}
          </label>
        </div>

        {feed === null ? (
          <Skeleton className="h-11" />
        ) : feed.url ? (
          <div className="space-y-2">
            <label className="block space-y-1 text-sm text-site-text">
              {t('feed-url', { defaultValue: 'Subscribe link' })}
              <div className="flex gap-2">
                <Input readOnly value={feed.url} onFocus={(e) => e.currentTarget.select()} />
                <CopyButton
                  value={feed.url}
                  variant="outline"
                  label={t('feed-copy', { defaultValue: 'Copy link' })}
                />
              </div>
            </label>
            <p className="text-xs text-site-text-dim">
              {t('feed-private', {
                defaultValue:
                  'Anyone with this link can see your schedule. Keep it private, and make a new one if it leaks.',
              })}
            </p>
            <Button variant="outline" size="sm" onClick={rotate} disabled={busy}>
              <RefreshCw /> {t('feed-rotate', { defaultValue: 'Make a new link' })}
            </Button>
          </div>
        ) : (
          <Button variant="accent" onClick={() => void patch({ enabled: true })} disabled={busy}>
            {t('feed-create', { defaultValue: 'Create my calendar link' })}
          </Button>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="feed-slots">
        <h2 id="feed-slots" className="text-sm font-bold text-site-text">
          {t('feed-slots-title', { defaultValue: 'Game nights and scheduled drops' })}
        </h2>
        <p className="text-sm text-site-text-muted">
          {t('feed-slots-body', {
            defaultValue: 'Pick the programming-grid entries you want in your calendar.',
          })}
        </p>
        {feed && feed.slots.length === 0 ? (
          <p className="text-sm text-site-text-muted">
            {t('feed-slots-none', { defaultValue: 'Nothing is scheduled right now.' })}
          </p>
        ) : (
          <ul className="space-y-2">
            {feed?.slots.map((s) => (
              <li
                key={s.id}
                className="glass-fill flex items-center justify-between gap-3 rounded-site p-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-site-text">
                    {s.title}
                  </span>
                  <span className="block text-xs text-site-text-muted">
                    {new Intl.DateTimeFormat(i18n.language, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(new Date(s.startsAt))}
                  </span>
                </span>
                <Switch
                  checked={s.optedIn}
                  disabled={busy}
                  onCheckedChange={(v) => toggleSlot(s.id, v)}
                  aria-label={t('feed-slot-toggle', {
                    defaultValue: 'Add {{title}} to my calendar',
                    title: s.title,
                  })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="grid gap-3 sm:grid-cols-2"
        aria-label={t('feed-more', { defaultValue: 'More scheduling tools' })}
      >
        <Link
          to="/when"
          className="glass-fill flex items-center gap-3 rounded-site p-3 hover:bg-site-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
        >
          <CalendarCheck className="size-5 text-site-accent" aria-hidden />
          <span className="text-sm font-semibold text-site-text">
            {t('feed-link-polls', { defaultValue: 'Find a time (availability polls)' })}
          </span>
        </Link>
        <Link
          to="/office-hours"
          className="glass-fill flex items-center gap-3 rounded-site p-3 hover:bg-site-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
        >
          <CalendarClock className="size-5 text-site-accent" aria-hidden />
          <span className="text-sm font-semibold text-site-text">
            {t('feed-link-oh', { defaultValue: 'Your office hours' })}
          </span>
        </Link>
      </section>
    </div>
  );
}
