/**
 * s06-11 — "Post an update": a short note to the people coming. The ink primary says how many people it will
 * tell ("Post and notify 12 people"), read from the recipients endpoint for the chosen date.
 */
import { useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, apiQuery, errorField } from '@/lib/contract/client';
import { formatDate, formatTime } from '@/lib/core/format';
import { postUpdateApi, updateRecipientsApi } from '@/lib/events/updates.contract';
import { UPDATE_MAX, type EventUpdateDTO } from '@/lib/events/updates';
import type { UpcomingDateDTO } from '@/lib/events/occurrences';

interface PostUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  /** A repeating event's time zone and live dates; absent for a one-off event. */
  repeating?: { tz: string; dates: UpcomingDateDTO[] } | undefined;
  onPosted: (update: EventUpdateDTO) => void;
}

const SERIES = 'series';

export function PostUpdateDialog({ open, onOpenChange, eventId, repeating, onPosted }: PostUpdateDialogProps) {
  const { t, i18n } = useTranslation('event-updates');
  const ids = { text: useId(), when: useId(), count: useId() };
  const isSeries = !!repeating;
  const live = (repeating?.dates ?? []).filter((d) => d.state !== 'skipped');
  const [text, setText] = useState('');
  const [when, setWhen] = useState<string>(live[0]?.occurrenceAt ?? SERIES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Who it will tell, for the chosen date; a failed read just leaves the count out.
  const recipients = useQuery({
    ...apiQuery(updateRecipientsApi, {
      params: { id: eventId },
      query: isSeries ? { occurrenceAt: when } : {},
    }),
    enabled: open,
    retry: false,
    gcTime: 0,
  });
  const count: number | null = recipients.isSuccess && !recipients.isFetching ? recipients.data.count : null;

  const fail = (code: string | undefined, nextAt: string | undefined): string => {
    switch (code) {
      case 'RATE_LIMITED':
        return nextAt
          ? t('error-rate-limited', {
              when: `${formatDate(nextAt, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatTime(nextAt, i18n.language, { hour: 'numeric', minute: '2-digit' })}`,
              defaultValue: 'An event can have 3 updates a day. The next one can be posted {{when}}.',
            })
          : t('error-rate-limited-soon', { defaultValue: 'An event can have 3 updates a day. Try again later.' });
      case 'CANCELED':
        return t('error-canceled', { defaultValue: 'This event was canceled, so it cannot get updates.' });
      case 'FORBIDDEN':
        return t('error-forbidden', { defaultValue: 'Only the host or a co-host can post updates.' });
      case 'BAD_OCCURRENCE':
        return t('error-bad-date', { defaultValue: 'That date is no longer on the calendar. Pick another.' });
      default:
        return t('error-generic', { defaultValue: 'Something went wrong. Try again.' });
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api(postUpdateApi, {
        params: { id: eventId },
        body: repeating ? { body: text.trim(), occurrenceAt: when === SERIES ? null : when } : { body: text.trim() },
      });
      toast.success(t('posted', { defaultValue: 'Update posted.' }));
      onPosted(res.update);
      setText('');
      onOpenChange(false);
    } catch (err) {
      setError(fail(errorField<string>(err, 'code'), errorField<string>(err, 'nextAt')));
    } finally {
      setBusy(false);
    }
  };

  const remaining = UPDATE_MAX - text.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t('dialog-title', { defaultValue: 'Post an update' })}</DialogTitle>
            <DialogDescription>
              {t('dialog-body', {
                defaultValue: 'Everyone going, maybe or on the waitlist is told. It stays on the event.',
              })}
            </DialogDescription>
          </DialogHeader>
          {repeating && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.when}>{t('field-when', { defaultValue: 'About' })}</Label>
              <Select id={ids.when} value={when} onChange={(e) => setWhen(e.target.value)}>
                {live.map((d) => (
                  <option key={d.occurrenceAt} value={d.occurrenceAt}>
                    {`${formatDate(d.startsAt, i18n.language, { weekday: 'short', day: 'numeric', month: 'short', timeZone: repeating.tz })}, ${formatTime(d.startsAt, i18n.language, { hour: 'numeric', minute: '2-digit', timeZone: repeating.tz })}`}
                  </option>
                ))}
                <option value={SERIES}>{t('option-series', { defaultValue: 'Every date' })}</option>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.text}>{t('field-text', { defaultValue: 'Update' })}</Label>
            <Textarea
              id={ids.text}
              required
              rows={4}
              maxLength={UPDATE_MAX}
              value={text}
              aria-describedby={ids.count}
              placeholder={t('placeholder', { defaultValue: 'We moved to room 4' })}
              onChange={(e) => setText(e.target.value)}
            />
            <p id={ids.count} className="t-meta">
              {t('remaining', {
                count: remaining,
                defaultValue_one: '{{count}} character left',
                defaultValue_other: '{{count}} characters left',
              })}
            </p>
          </div>
          {error && (
            <p role="alert" className="t-body text-site-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
              {count == null
                ? t('post-plain', { defaultValue: 'Post update' })
                : t('post-notify', {
                    count,
                    defaultValue_one: 'Post and notify {{count}} person',
                    defaultValue_other: 'Post and notify {{count}} people',
                  })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
