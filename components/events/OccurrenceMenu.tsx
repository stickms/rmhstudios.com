/**
 * s06-10 — the "Upcoming dates" list of a repeating event's card. Everyone sees skipped dates struck
 * through with the word "Skipped" and moved dates at their new time with "Moved from …" and the note; the
 * host and co-hosts also get a menu per date: Skip this date, Change this date…, and Restore.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CalendarX, MoreHorizontal, Undo2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { MenuItem } from '@/components/ui/menu';
import { api, errorField } from '@/lib/contract/client';
import { formatDate, formatTime } from '@/lib/core/format';
import { restoreOccurrenceApi, setOccurrenceApi, type OccurrencesRes } from '@/lib/events/occurrences.contract';
import type { UpcomingDateDTO } from '@/lib/events/occurrences';
import { OccurrenceDialog, refusalText } from './OccurrenceDialog';

const dayOptions = (tz: string): Intl.DateTimeFormatOptions => ({
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: tz,
});
const timeOptions = (tz: string): Intl.DateTimeFormatOptions => ({
  hour: 'numeric',
  minute: '2-digit',
  timeZone: tz,
});

function OccurrenceMenu({
  eventId,
  tz,
  date,
  onChanged,
}: {
  eventId: string;
  tz: string;
  date: UpcomingDateDTO;
  onChanged: (res: OccurrencesRes) => void;
}) {
  const { t, i18n } = useTranslation('event-occurrences');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = formatDate(date.occurrenceAt, i18n.language, dayOptions(tz));

  const run = async (call: () => Promise<OccurrencesRes>, done: string) => {
    setBusy(true);
    try {
      onChanged(await call());
      toast.success(done);
    } catch (e) {
      toast.error(refusalText(t, errorField<string>(e, 'code')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon-xs"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('menu-label', {
          date: label,
          defaultValue: 'Change {{date}}',
        })}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal aria-hidden />
      </Button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        label={t('menu-name', {
          date: label,
          defaultValue: 'Options for {{date}}',
        })}
        className="w-56"
      >
        {date.state !== 'skipped' && (
          <MenuItem
            icon={CalendarX}
            onSelect={() => {
              setOpen(false);
              void run(
                () =>
                  api(setOccurrenceApi, {
                    params: {
                      id: eventId,
                    },
                    body: {
                      occurrenceAt: date.occurrenceAt,
                      kind: 'skip',
                    },
                  }),
                t('skipped-toast', {
                  defaultValue: 'Date skipped. Everyone who answered was told.',
                }),
              );
            }}
          >
            {t('skip', {
              defaultValue: 'Skip this date',
            })}
          </MenuItem>
        )}
        {date.state !== 'skipped' && (
          <MenuItem
            icon={CalendarClock}
            onSelect={() => {
              setOpen(false);
              setChanging(true);
            }}
          >
            {t('change', {
              defaultValue: 'Change this date…',
            })}
          </MenuItem>
        )}
        {date.state !== 'normal' && (
          <MenuItem
            icon={Undo2}
            onSelect={() => {
              setOpen(false);
              void run(
                () =>
                  api(restoreOccurrenceApi, {
                    params: {
                      id: eventId,
                    },
                    query: {
                      occurrenceAt: date.occurrenceAt,
                    },
                  }),
                t('restored-toast', {
                  defaultValue: 'Date restored.',
                }),
              );
            }}
          >
            {t('restore', {
              defaultValue: 'Restore',
            })}
          </MenuItem>
        )}
      </AnchoredMenu>
      {changing && (
        <OccurrenceDialog open onOpenChange={setChanging} eventId={eventId} tz={tz} date={date} onSaved={onChanged} />
      )}
    </>
  );
}

export function UpcomingDates({
  eventId,
  tz,
  dates,
  canManage,
  onChanged,
}: {
  eventId: string;
  tz: string;
  dates: UpcomingDateDTO[];
  canManage: boolean;
  onChanged: (res: OccurrencesRes) => void;
}) {
  const { t, i18n } = useTranslation('event-occurrences');
  const locale = i18n.language;
  if (dates.length === 0) return null;
  return (
    <section aria-labelledby={`upcoming-${eventId}`}>
      <h4 id={`upcoming-${eventId}`} className="t-label">
        {t('upcoming-title', {
          defaultValue: 'Upcoming dates',
        })}
      </h4>
      <ul>
        {dates.map((d) => {
          const skipped = d.state === 'skipped';
          const when = `${formatDate(d.startsAt, locale, dayOptions(tz))}, ${formatTime(d.startsAt, locale, timeOptions(tz))}`;
          return (
            <li
              key={d.occurrenceAt}
              className="flex items-start justify-between gap-3 border-b border-site-border py-2"
            >
              <div className="min-w-0">
                <p className="t-body flex flex-wrap items-baseline gap-x-2">
                  <span className={skipped ? 'text-site-text-muted line-through' : undefined}>{when}</span>
                  {skipped && (
                    <span className="t-meta">
                      {t('skipped', {
                        defaultValue: 'Skipped',
                      })}
                    </span>
                  )}
                </p>
                {d.state === 'moved' && (
                  <p className="t-meta">
                    {t('moved-from', {
                      date: formatDate(d.occurrenceAt, locale, dayOptions(tz)),
                      defaultValue: 'Moved from {{date}}',
                    })}
                  </p>
                )}
                {d.note && <p className="t-meta">{d.note}</p>}
              </div>
              {canManage && <OccurrenceMenu eventId={eventId} tz={tz} date={d} onChanged={onChanged} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
