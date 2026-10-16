'use client';

/**
 * K4 — what a repeating event adds to its card: the rule, who hosts THIS
 * occurrence, and the "every time" RSVP that carries over to the next one.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Repeat } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { EventDTO, RsvpResult } from '@/lib/events.server';
import { api } from './api';

export function EventRecurrenceInfo({
  event,
  onChange,
}: {
  event: EventDTO;
  onChange: (result: RsvpResult) => void;
}) {
  const { t } = useTranslation('f-calendar');
  const rec = event.recurrence;
  const [everyTime, setEveryTime] = useState(rec?.viewerEveryTime ?? false);
  const [busy, setBusy] = useState(false);
  if (!rec) return null;

  const base = `/api/events/${event.id}/rsvp`;
  const status = event.viewerRsvp;

  const toggleEveryTime = async (on: boolean) => {
    if (!status) {
      toast.error(
        t('rec-pick-first', {
          defaultValue: 'Choose Going or Maybe first, then turn on every time.',
        }),
      );
      return;
    }
    setBusy(true);
    let res;
    if (on) {
      res = await api<RsvpResult>(base, {
        method: 'POST',
        body: { status, everyTime: true, occurrenceAt: event.startsAt },
      });
    } else {
      // Drop the standing RSVP, but keep this date.
      await api(`${base}?scope=all&occurrenceAt=${encodeURIComponent(event.startsAt)}`, {
        method: 'DELETE',
      });
      res = await api<RsvpResult>(base, {
        method: 'POST',
        body: { status, everyTime: false, occurrenceAt: event.startsAt },
      });
    }
    setBusy(false);
    if (res.ok && res.data) {
      setEveryTime(on);
      onChange(res.data);
    } else
      toast.error(res.error ?? t('rec-error', { defaultValue: 'Could not update your RSVP.' }));
  };

  const sitOut = async () => {
    setBusy(true);
    const res = await api<RsvpResult>(
      `${base}?scope=occurrence&occurrenceAt=${encodeURIComponent(event.startsAt)}`,
      { method: 'DELETE' },
    );
    setBusy(false);
    if (res.ok && res.data) onChange(res.data);
    else toast.error(res.error ?? t('rec-error', { defaultValue: 'Could not update your RSVP.' }));
  };

  const hostName = rec.occurrenceHost.name ?? rec.occurrenceHost.handle;

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-site-sm bg-site-accent-dim/40 p-2.5 text-xs text-site-text-muted">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Repeat className="size-3.5 text-site-accent" aria-hidden />
        <span className="font-medium text-site-text">
          {rec.rule === 'W'
            ? t('rec-badge-weekly', { defaultValue: 'Repeats every week' })
            : t('rec-badge-monthly', { defaultValue: 'Repeats monthly' })}
        </span>
        {rec.rotation.length > 0 && hostName && (
          <span>
            {t('rec-host-now', { defaultValue: 'Hosted this time by {{name}}', name: hostName })}
          </span>
        )}
      </p>
      {event.viewerRsvp !== undefined && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <Switch
              checked={everyTime}
              disabled={busy}
              onCheckedChange={(v) => void toggleEveryTime(v)}
              aria-label={t('rec-every-time', { defaultValue: 'RSVP every time' })}
            />
            {t('rec-every-time', { defaultValue: 'RSVP every time' })}
          </label>
          {everyTime && status && (
            <Button size="xs" variant="outline" disabled={busy} onClick={() => void sitOut()}>
              {t('rec-not-this-time', { defaultValue: 'Not this time' })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
