'use client';

/** K2 — `/office-hours/$userId`: a host's open slots, and the booking flow. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, X } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { OfficeHoursPublicView, OfficeHoursSlotView } from '@/lib/calendar/types';
import { api, viewerTimeZone } from './api';
import { BookingRow } from './BookingRow';

export default function OfficeHoursBook({ hostId }: { hostId: string }) {
  const { t, i18n } = useTranslation('f-calendar');
  const { data: session } = useSession();
  const confirm = useConfirm();
  const [view, setView] = useState<OfficeHoursPublicView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [picked, setPicked] = useState<OfficeHoursSlotView | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const tz = useMemo(() => viewerTimeZone(), []);
  const signedIn = !!session?.user;

  const load = useCallback(async () => {
    const res = await api<{ view: OfficeHoursPublicView }>(
      `/api/office-hours/host/${encodeURIComponent(hostId)}`,
    );
    if (res.ok && res.data) {
      setView(res.data.view);
      setState('ready');
    } else setState('missing');
  }, [hostId]);

  useEffect(() => {
    void load();
  }, [load, signedIn]);

  const dayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: tz,
      }),
    [i18n.language, tz],
  );
  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit', timeZone: tz }),
    [i18n.language, tz],
  );

  const byDay = useMemo(() => {
    const groups = new Map<string, OfficeHoursSlotView[]>();
    for (const s of view?.slots ?? []) {
      const key = dayFmt.format(new Date(s.startsAt));
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.entries()];
  }, [view, dayFmt]);

  if (state === 'loading') return <Skeleton className="m-4 h-64" />;
  if (state === 'missing' || !view) {
    return (
      <EmptyState
        icon={CalendarClock}
        title={t('oh-missing-title', { defaultValue: 'No office hours here' })}
        description={t('oh-missing-body', {
          defaultValue: 'This member has not published any bookable times.',
        })}
      />
    );
  }

  const book = async () => {
    if (!picked) return;
    setBusy(true);
    const res = await api(`/api/office-hours/host/${encodeURIComponent(hostId)}`, {
      method: 'POST',
      body: { startsAt: picked.startsAt, note },
    });
    setBusy(false);
    if (res.ok) {
      toast.success(
        t('oh-booked', {
          defaultValue: 'Booked. You will get a notification and a calendar file.',
        }),
      );
      setPicked(null);
      setNote('');
    } else {
      toast.error(res.error ?? t('oh-book-failed', { defaultValue: 'Could not book that slot.' }));
    }
    void load();
  };

  const cancel = async (id: string) => {
    const sure = await confirm({
      title: t('oh-cancel-title', { defaultValue: 'Cancel this booking?' }),
      description: t('oh-cancel-body', {
        defaultValue: 'The slot opens up again and the other person is told.',
      }),
      confirmLabel: t('oh-cancel-confirm', { defaultValue: 'Cancel booking' }),
      danger: true,
    });
    if (!sure) return;
    const res = await api(`/api/office-hours/bookings/${id}`, { method: 'DELETE' });
    if (res.ok) void load();
    else toast.error(res.error ?? t('oh-cancel-failed', { defaultValue: 'Could not cancel.' }));
  };

  return (
    <div className="space-y-5 p-4">
      <header className="flex items-start gap-3">
        <UserAvatar src={view.host.image} alt="" size={48} />
        <div className="min-w-0">
          <h2 className="font-display text-xl font-medium text-site-text">
            {view.title || t('oh-default-title', { defaultValue: 'Office hours' })}
          </h2>
          <p className="text-sm text-site-text-muted">
            {t('oh-with', {
              defaultValue: 'with {{name}}',
              name: view.host.name ?? view.host.handle ?? '',
            })}
          </p>
          {view.blurb && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-site-text-muted">{view.blurb}</p>
          )}
          <p className="mt-1 text-xs text-site-text-dim">
            {t('oh-slot-info', {
              defaultValue: '{{count}}-minute sessions. Times are shown in your timezone ({{tz}}).',
              count: view.slotMin,
              tz,
            })}
          </p>
        </div>
      </header>

      {view.isHost && (
        <p className="text-sm">
          <Link to="/office-hours" className="font-medium text-site-accent hover:underline">
            {t('oh-edit-link', { defaultValue: 'Edit your office hours' })}
          </Link>
        </p>
      )}

      {view.bookings.length > 0 && (
        <section className="space-y-2" aria-labelledby="oh-bookings">
          <h3 id="oh-bookings" className="text-sm font-bold text-site-text">
            {view.isHost
              ? t('oh-upcoming-host', { defaultValue: 'Upcoming bookings' })
              : t('oh-upcoming-mine', { defaultValue: 'Your bookings' })}
          </h3>
          <ul className="space-y-2">
            {view.bookings.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                viewerId={session?.user?.id ?? ''}
                onCancel={() => void cancel(b.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {!view.isHost && (
        <section className="space-y-4" aria-labelledby="oh-slots">
          <h3 id="oh-slots" className="text-sm font-bold text-site-text">
            {t('oh-open-slots', { defaultValue: 'Open times' })}
          </h3>
          {byDay.length === 0 ? (
            <p className="text-sm text-site-text-muted">
              {t('oh-no-slots', { defaultValue: 'Nothing is open in the next four weeks.' })}
            </p>
          ) : (
            byDay.map(([day, slots]) => (
              <div key={day} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-site-text-muted">
                  {day}
                </h4>
                <ul className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <li key={s.startsAt}>
                      <Button
                        size="sm"
                        variant={s.mine ? 'accent' : 'outline'}
                        disabled={s.mine}
                        onClick={() => (signedIn ? setPicked(s) : undefined)}
                        aria-label={`${day} ${timeFmt.format(new Date(s.startsAt))}`}
                        asChild={!signedIn}
                      >
                        {signedIn ? (
                          <span>{timeFmt.format(new Date(s.startsAt))}</span>
                        ) : (
                          <Link to="/login" search={{ callbackURL: `/office-hours/${hostId}` }}>
                            {timeFmt.format(new Date(s.startsAt))}
                          </Link>
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          {!signedIn && (
            <p className="text-xs text-site-text-dim">
              {t('oh-sign-in-hint', { defaultValue: 'Sign in to book a time.' })}
            </p>
          )}
        </section>
      )}

      <Dialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('oh-book-title', { defaultValue: 'Book this time' })}</DialogTitle>
            <DialogDescription>
              {picked
                ? `${dayFmt.format(new Date(picked.startsAt))}, ${timeFmt.format(new Date(picked.startsAt))}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm text-site-text">
            {t('oh-note', { defaultValue: 'What would you like to cover? (optional)' })}
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={3}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPicked(null)}>
              <X /> {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button variant="accent" onClick={book} disabled={busy}>
              {t('oh-confirm', { defaultValue: 'Book it' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
