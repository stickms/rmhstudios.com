/**
 * s06-10 — "Change this date…": move one date of a repeating event to another day or time. The date and
 * times are read and written in the EVENT's time zone (`lib/calendar/tz.ts`), not the host's. Save is the
 * dialog's ink primary.
 */
import { useId, useState, type FormEvent } from 'react';
import type { TFunction } from 'i18next';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, errorField } from '@/lib/contract/client';
import { formatDate } from '@/lib/core/format';
import { wallTimeOf, wallToUtcMs } from '@/lib/calendar/tz';
import { setOccurrenceApi, type OccurrencesRes } from '@/lib/events/occurrences.contract';
import { NOTE_MAX, type UpcomingDateDTO } from '@/lib/events/occurrences';

const pad = (n: number) => String(n).padStart(2, '0');

/** What a refused change says. `t` is the `event-occurrences` translator. */
export function refusalText(t: TFunction, code: string | undefined): string {
  switch (code) {
    case 'COLLIDES':
      return t('error-collides', {
        defaultValue: 'That time is on or past another date of this event.',
      });
    case 'MOVE_PAST':
      return t('error-move-past', {
        defaultValue: 'Pick a time in the future.',
      });
    case 'PAST':
      return t('error-past', {
        defaultValue: 'That date has already passed.',
      });
    case 'BAD_END':
      return t('error-bad-end', {
        defaultValue: 'The end has to be after the start.',
      });
    case 'TOO_MANY':
      return t('error-too-many', {
        defaultValue: 'An event can have at most 52 changed dates.',
      });
    case 'CANCELED':
      return t('error-canceled', {
        defaultValue: 'This event was canceled.',
      });
    case 'FORBIDDEN':
      return t('error-forbidden', {
        defaultValue: 'Only the host or a co-host can change dates.',
      });
    default:
      return t('error-generic', {
        defaultValue: 'Something went wrong. Try again.',
      });
  }
}

interface OccurrenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  /** The event's time zone. */
  tz: string;
  date: UpcomingDateDTO;
  onSaved: (res: OccurrencesRes) => void;
}

export function OccurrenceDialog({ open, onOpenChange, eventId, tz, date, onSaved }: OccurrenceDialogProps) {
  const { t, i18n } = useTranslation('event-occurrences');
  const ids = {
    day: useId(),
    start: useId(),
    end: useId(),
    note: useId(),
  };
  const start = wallTimeOf(new Date(date.startsAt).getTime(), tz);
  const end = date.endsAt ? wallTimeOf(new Date(date.endsAt).getTime(), tz) : null;
  const [day, setDay] = useState(`${start.y}-${pad(start.mo)}-${pad(start.d)}`);
  const [from, setFrom] = useState(`${pad(start.h)}:${pad(start.mi)}`);
  const [to, setTo] = useState(end ? `${pad(end.h)}:${pad(end.mi)}` : '');
  const [note, setNote] = useState(date.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const original = formatDate(date.occurrenceAt, i18n.language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    const f = /^(\d{2}):(\d{2})$/.exec(from);
    const g = to ? /^(\d{2}):(\d{2})$/.exec(to) : null;
    if (!d || !f || (to && !g)) {
      setError(
        t('error-incomplete', {
          defaultValue: 'Choose a date and a start time.',
        }),
      );
      return;
    }
    const wall = (h: string, mi: string) => ({
      y: Number(d[1]),
      mo: Number(d[2]),
      d: Number(d[3]),
      h: Number(h),
      mi: Number(mi),
    });
    const startsAt = wallToUtcMs(wall(f[1] ?? '0', f[2] ?? '0'), tz);
    const endsAt = g ? wallToUtcMs(wall(g[1] ?? '0', g[2] ?? '0'), tz) : null;
    if (endsAt != null && endsAt <= startsAt) {
      setError(refusalText(t, 'BAD_END'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api(setOccurrenceApi, {
        params: {
          id: eventId,
        },
        body: {
          occurrenceAt: date.occurrenceAt,
          kind: 'move',
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt != null ? new Date(endsAt).toISOString() : null,
          note: note.trim() || null,
        },
      });
      toast.success(
        t('saved', {
          defaultValue: 'Date changed. Everyone who answered was told.',
        }),
      );
      onSaved(res);
      onOpenChange(false);
    } catch (err) {
      setError(refusalText(t, errorField<string>(err, 'code')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {t('dialog-title', {
                date: original,
                defaultValue: 'Change {{date}}',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('dialog-body', {
                tz,
                defaultValue: 'Only this date changes. Answers stay as they are. Times are in {{tz}}.',
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.day}>
              {t('field-date', {
                defaultValue: 'Date',
              })}
            </Label>
            <Input id={ids.day} type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.start}>
                {t('field-start', {
                  defaultValue: 'Start time',
                })}
              </Label>
              <Input id={ids.start} type="time" required value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.end}>
                {t('field-end', {
                  defaultValue: 'End time',
                })}
              </Label>
              <Input id={ids.end} type="time" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.note}>
              {t('field-note', {
                defaultValue: 'Note (optional)',
              })}
            </Label>
            <Input
              id={ids.note}
              maxLength={NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('note-placeholder', {
                defaultValue: 'Why it moved',
              })}
            />
          </div>
          {error && (
            <p role="alert" className="t-meta text-site-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel', {
                defaultValue: 'Cancel',
              })}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {t('save', {
                defaultValue: 'Save',
              })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
