'use client';

/** K1 — `/when`: your polls, plus the form to start one. */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarCheck, Lock, Plus } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { POLL_MAX_DAYS, POLL_MAX_INVITEES } from '@/lib/calendar/poll-slots';
import type { CalPerson, PollListItem } from '@/lib/calendar/types';
import type { WhenSearch } from '@/lib/calendar/search';
import { api, viewerTimeZone } from './api';
import { PersonPicker } from './PersonPicker';

function todayString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function PollsHome({ attach }: { attach: WhenSearch }) {
  const { t, i18n } = useTranslation('f-calendar');
  const { data: session, isPending } = useSession();
  const [polls, setPolls] = useState<PollListItem[] | null>(null);
  const [creating, setCreating] = useState(!!(attach.communityId || attach.groupChatId));
  const signedIn = !!session?.user;

  useEffect(() => {
    if (isPending || !signedIn) return;
    void api<{ polls: PollListItem[] }>('/api/when').then((r) => setPolls(r.data?.polls ?? []));
  }, [isPending, signedIn]);

  if (isPending) return <Skeleton className="m-4 h-40" />;
  if (!signedIn) {
    return (
      <SignedOutPrompt
        icon={CalendarCheck}
        title={t('home-signed-out', { defaultValue: 'Sign in to find a time that works' })}
        description={t('home-signed-out-body', {
          defaultValue: 'Create a poll, share the link, and see when everyone is free.',
        })}
        callbackURL="/when"
      />
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-site-text-muted">
          {t('home-intro', {
            defaultValue:
              'Ask a group when they can meet. Everyone paints the times they are free, in their own timezone.',
          })}
        </p>
        {!creating && (
          <Button variant="accent" size="sm" onClick={() => setCreating(true)}>
            <Plus /> {t('home-new', { defaultValue: 'New poll' })}
          </Button>
        )}
      </div>

      {creating && <CreatePollForm attach={attach} onCancel={() => setCreating(false)} />}

      <section aria-labelledby="polls-list" className="space-y-2">
        <h2 id="polls-list" className="text-sm font-bold text-site-text">
          {t('home-list', { defaultValue: 'Your polls' })}
        </h2>
        {polls === null ? (
          <Skeleton className="h-20" />
        ) : polls.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            description={t('home-empty', {
              defaultValue: 'No polls yet. Start one and share the link.',
            })}
          />
        ) : (
          <ul className="space-y-2">
            {polls.map((p) => (
              <li key={p.id}>
                <Link
                  to="/when/$id"
                  params={{ id: p.id }}
                  className="glass-fill flex items-center justify-between gap-3 rounded-site p-3 hover:bg-site-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-site-text">
                      {p.title}
                    </span>
                    <span className="block text-xs text-site-text-muted">
                      {p.role === 'organiser'
                        ? t('role-organiser', { defaultValue: 'You organise' })
                        : p.role === 'invitee'
                          ? t('role-invitee', { defaultValue: 'You were asked' })
                          : t('role-respondent', { defaultValue: 'You answered' })}
                      {' · '}
                      {t('home-responses', {
                        defaultValue: '{{count}} responses',
                        count: p.respondentCount,
                      })}
                    </span>
                  </span>
                  {p.lockedStartMin != null && (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-site-success">
                      <Lock className="size-3.5" aria-hidden />
                      {new Intl.DateTimeFormat(i18n.language, {
                        month: 'short',
                        day: 'numeric',
                      }).format(new Date(p.lockedStartMin * 60_000))}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CreatePollForm({ attach, onCancel }: { attach: WhenSearch; onCancel: () => void }) {
  const { t, i18n } = useTranslation('f-calendar');
  const navigate = useNavigate();
  const tz = useMemo(() => viewerTimeZone(), []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [firstDay, setFirstDay] = useState(todayString);
  const [days, setDays] = useState(7);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(22);
  const [slotMin, setSlotMin] = useState(60);
  const [required, setRequired] = useState<CalPerson[]>([]);
  const [busy, setBusy] = useState(false);

  const hourLabel = (h: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2000, 0, 1, h % 24, 0)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (endHour <= startHour) {
      toast.error(t('form-hours-error', { defaultValue: 'The day must end after it starts.' }));
      return;
    }
    setBusy(true);
    const res = await api<{ id: string }>('/api/when', {
      method: 'POST',
      body: {
        title,
        description,
        tz,
        firstDay,
        days,
        dayStartHour: startHour,
        dayEndHour: endHour,
        slotMin,
        requiredUserIds: required.map((r) => r.id),
        communityId: attach.communityId,
        groupChatId: attach.groupChatId,
      },
    });
    setBusy(false);
    if (res.ok && res.data) {
      void navigate({ to: '/when/$id', params: { id: res.data.id } });
    } else {
      toast.error(res.error ?? t('form-error', { defaultValue: 'Could not create the poll.' }));
    }
  };

  return (
    <form onSubmit={submit} className="glass-pane space-y-4 rounded-site p-4">
      <h2 className="font-display text-lg font-medium text-site-text">
        {t('form-title', { defaultValue: 'New availability poll' })}
      </h2>
      {(attach.communityId || attach.groupChatId) && (
        <p className="text-sm text-site-text-muted">
          {attach.groupChatId
            ? t('form-attached-group', {
                defaultValue:
                  'The group chat will get the link, and will be told when a time is locked in.',
              })
            : t('form-attached-community', {
                defaultValue:
                  'Locking in a time will create an event in the community, if you moderate it.',
              })}
        </p>
      )}
      <label className="block space-y-1 text-sm text-site-text">
        {t('form-name', { defaultValue: 'What is it for?' })}
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={3}
          maxLength={120}
          required
          placeholder={t('form-name-ph', { defaultValue: 'Friday game night' })}
        />
      </label>
      <label className="block space-y-1 text-sm text-site-text">
        {t('form-description', { defaultValue: 'Details (optional)' })}
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={2}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm text-site-text">
          {t('form-first-day', { defaultValue: 'First day' })}
          <Input
            type="date"
            value={firstDay}
            min={todayString()}
            onChange={(e) => setFirstDay(e.target.value)}
            required
          />
        </label>
        <label className="block space-y-1 text-sm text-site-text">
          {t('form-days', { defaultValue: 'Number of days (up to {{max}})', max: POLL_MAX_DAYS })}
          <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
            {Array.from({ length: POLL_MAX_DAYS }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1 text-sm text-site-text">
          {t('form-from', { defaultValue: 'Each day from' })}
          <Select value={String(startHour)} onChange={(e) => setStartHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1 text-sm text-site-text">
          {t('form-to', { defaultValue: 'Until' })}
          <Select value={String(endHour)} onChange={(e) => setEndHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>
                {h === 24 ? t('form-midnight', { defaultValue: 'Midnight' }) : hourLabel(h)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1 text-sm text-site-text">
          {t('form-slot', { defaultValue: 'Slot length' })}
          <Select value={String(slotMin)} onChange={(e) => setSlotMin(Number(e.target.value))}>
            <option value="30">{t('form-slot-30', { defaultValue: '30 minutes' })}</option>
            <option value="60">{t('form-slot-60', { defaultValue: '1 hour' })}</option>
          </Select>
        </label>
      </div>
      <p className="text-xs text-site-text-dim">
        {t('form-tz', {
          defaultValue: 'Hours are in your timezone ({{tz}}). Everyone else sees them converted.',
          tz,
        })}
      </p>
      <PersonPicker
        value={required}
        onChange={setRequired}
        max={POLL_MAX_INVITEES}
        label={t('form-required', {
          defaultValue: 'People who must be able to make it (optional)',
        })}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button type="submit" variant="accent" disabled={busy}>
          {t('form-create', { defaultValue: 'Create poll' })}
        </Button>
      </div>
    </form>
  );
}
