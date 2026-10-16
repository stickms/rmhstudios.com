'use client';

/** K2 — `/office-hours`: publish weekly windows and manage bookings. */

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { CopyButton } from '@/components/ui/copy-button';
import { OFFICE_HOURS_SLOT_LENGTHS } from '@/lib/calendar/schema';
import { SITE_URL } from '@/lib/seo';
import type { OfficeHoursBookingView, OfficeHoursConfigView } from '@/lib/calendar/types';
import { api, viewerTimeZone } from './api';
import { BookingRow } from './BookingRow';

interface Draft extends OfficeHoursConfigView {
  /** Window times as HH:MM strings for the inputs. */
  rows: { weekday: number; start: string; end: string }[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const toHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fromHHMM = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export default function OfficeHoursManage() {
  const { t, i18n } = useTranslation('f-calendar');
  const { data: session, isPending } = useSession();
  const confirm = useConfirm();
  const tz = useMemo(() => viewerTimeZone(), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [asHost, setAsHost] = useState<OfficeHoursBookingView[]>([]);
  const [asGuest, setAsGuest] = useState<OfficeHoursBookingView[]>([]);
  const [saving, setSaving] = useState(false);
  const userId = session?.user?.id;

  const load = async () => {
    const res = await api<{
      config: OfficeHoursConfigView | null;
      asHost: OfficeHoursBookingView[];
      asGuest: OfficeHoursBookingView[];
    }>('/api/office-hours');
    const cfg = res.data?.config;
    setDraft({
      title: cfg?.title ?? '',
      blurb: cfg?.blurb ?? '',
      tz: cfg?.tz ?? tz,
      slotMin: cfg?.slotMin ?? 30,
      maxPerWeek: cfg?.maxPerWeek ?? null,
      enabled: cfg?.enabled ?? true,
      windows: cfg?.windows ?? [],
      rows: (cfg?.windows ?? []).map((w) => ({
        weekday: w.weekday,
        start: toHHMM(w.startMinute),
        end: toHHMM(w.endMinute),
      })),
    });
    setAsHost(res.data?.asHost ?? []);
    setAsGuest(res.data?.asGuest ?? []);
  };

  useEffect(() => {
    if (!isPending && userId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, userId]);

  const weekdayName = (d: number) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 9, 11 + d)),
    );

  if (isPending || (userId && !draft)) return <Skeleton className="m-4 h-64" />;
  if (!userId || !draft) {
    return (
      <SignedOutPrompt
        icon={CalendarClock}
        title={t('oh-manage-signed-out', { defaultValue: 'Sign in to offer office hours' })}
        callbackURL="/office-hours"
      />
    );
  }

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await api('/api/office-hours', {
      method: 'PUT',
      body: {
        title: draft.title,
        blurb: draft.blurb,
        tz: draft.tz,
        slotMin: draft.slotMin,
        maxPerWeek: draft.maxPerWeek,
        enabled: draft.enabled,
        windows: draft.rows.map((r) => ({
          weekday: r.weekday,
          startMinute: fromHHMM(r.start),
          endMinute: fromHHMM(r.end) || 1440,
        })),
      },
    });
    setSaving(false);
    if (res.ok) toast.success(t('oh-saved', { defaultValue: 'Office hours saved.' }));
    else toast.error(res.error ?? t('oh-save-failed', { defaultValue: 'Could not save.' }));
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

  const publicUrl = `${SITE_URL}/office-hours/${userId}`;

  return (
    <div className="space-y-6 p-4">
      <form onSubmit={save} className="glass-pane space-y-4 rounded-site p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-medium text-site-text">
            {t('oh-manage-title', { defaultValue: 'Your office hours' })}
          </h2>
          <label className="flex items-center gap-2 text-sm text-site-text-muted">
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => set({ enabled: v })}
              aria-label={t('oh-enabled', { defaultValue: 'Accepting bookings' })}
            />
            {t('oh-enabled', { defaultValue: 'Accepting bookings' })}
          </label>
        </div>
        <label className="block space-y-1 text-sm text-site-text">
          {t('oh-title-label', { defaultValue: 'Title' })}
          <Input
            value={draft.title}
            maxLength={80}
            onChange={(e) => set({ title: e.target.value })}
            placeholder={t('oh-title-ph', { defaultValue: 'Feedback on your build' })}
          />
        </label>
        <label className="block space-y-1 text-sm text-site-text">
          {t('oh-blurb-label', { defaultValue: 'What can people book you for?' })}
          <Textarea
            value={draft.blurb}
            maxLength={300}
            rows={2}
            onChange={(e) => set({ blurb: e.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm text-site-text">
            {t('oh-slot-label', { defaultValue: 'Session length' })}
            <Select
              value={String(draft.slotMin)}
              onChange={(e) => set({ slotMin: Number(e.target.value) })}
            >
              {OFFICE_HOURS_SLOT_LENGTHS.map((n) => (
                <option key={n} value={n}>
                  {t('oh-minutes', { defaultValue: '{{count}} minutes', count: n })}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1 text-sm text-site-text">
            {t('oh-max-label', { defaultValue: 'Max bookings per week' })}
            <Input
              type="number"
              min={1}
              max={100}
              value={draft.maxPerWeek ?? ''}
              placeholder={t('oh-max-ph', { defaultValue: 'No limit' })}
              onChange={(e) => set({ maxPerWeek: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-site-text">
            {t('oh-windows', { defaultValue: 'Weekly windows' })}
          </legend>
          <p className="text-xs text-site-text-dim">
            {t('oh-windows-help', {
              defaultValue: 'Times are in your timezone ({{tz}}) and repeat every week.',
              tz: draft.tz,
            })}
          </p>
          {draft.rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs text-site-text-muted">
                {t('oh-day', { defaultValue: 'Day' })}
                <Select
                  value={String(r.weekday)}
                  onChange={(e) =>
                    set({
                      rows: draft.rows.map((x, j) =>
                        j === i ? { ...x, weekday: Number(e.target.value) } : x,
                      ),
                    })
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <option key={d} value={d}>
                      {weekdayName(d)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs text-site-text-muted">
                {t('oh-from', { defaultValue: 'From' })}
                <Input
                  type="time"
                  step={900}
                  value={r.start}
                  onChange={(e) =>
                    set({
                      rows: draft.rows.map((x, j) =>
                        j === i ? { ...x, start: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label className="space-y-1 text-xs text-site-text-muted">
                {t('oh-to', { defaultValue: 'To' })}
                <Input
                  type="time"
                  step={900}
                  value={r.end}
                  onChange={(e) =>
                    set({
                      rows: draft.rows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                    })
                  }
                />
              </label>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t('oh-remove-window', { defaultValue: 'Remove window' })}
                onClick={() => set({ rows: draft.rows.filter((_, j) => j !== i) })}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          {draft.rows.length < 14 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                set({ rows: [...draft.rows, { weekday: 2, start: '18:00', end: '20:00' }] })
              }
            >
              <Plus /> {t('oh-add-window', { defaultValue: 'Add a window' })}
            </Button>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <CopyButton
            value={publicUrl}
            variant="outline"
            size="sm"
            label={t('oh-copy-link', { defaultValue: 'Copy booking link' })}
          >
            {t('oh-copy-link', { defaultValue: 'Copy booking link' })}
          </CopyButton>
          <div className="flex gap-2">
            <Link to="/office-hours/$userId" params={{ userId }}>
              <Button type="button" variant="outline">
                {t('oh-preview', { defaultValue: 'View page' })}
              </Button>
            </Link>
            <Button type="submit" variant="accent" disabled={saving}>
              {t('oh-save', { defaultValue: 'Save' })}
            </Button>
          </div>
        </div>
      </form>

      <section className="space-y-2" aria-labelledby="oh-host-list">
        <h2 id="oh-host-list" className="text-sm font-bold text-site-text">
          {t('oh-upcoming-host', { defaultValue: 'Upcoming bookings' })}
        </h2>
        {asHost.length === 0 ? (
          <p className="text-sm text-site-text-muted">
            {t('oh-none-host', { defaultValue: 'No one has booked you yet.' })}
          </p>
        ) : (
          <ul className="space-y-2">
            {asHost.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                viewerId={userId}
                onCancel={() => void cancel(b.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="oh-guest-list">
        <h2 id="oh-guest-list" className="text-sm font-bold text-site-text">
          {t('oh-upcoming-mine', { defaultValue: 'Your bookings' })}
        </h2>
        {asGuest.length === 0 ? (
          <p className="text-sm text-site-text-muted">
            {t('oh-none-guest', { defaultValue: 'You have not booked anyone.' })}
          </p>
        ) : (
          <ul className="space-y-2">
            {asGuest.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                viewerId={userId}
                onCancel={() => void cancel(b.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
