/**
 * Tournament check-in (s04-03): what an entrant and the host see on the
 * tournament page while registration is open. The entrant sees when check-in
 * opens, then "Check in" (the view's one ink primary) and afterwards "Checked
 * in"; everyone sees the count; the host can set the window, and check
 * entrants in by hand (`EntrantCheckIn`, on each row).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { serverError } from '@/lib/http';
import { checkInSelf as checkInSelfApi, setCheckInWindow, setEntrantCheckIn } from '@/lib/tournaments/checkin.queries';
import { CHECK_IN_MINUTES, checkInPhase, isCheckInMinutes } from '@/lib/tournaments/checkin';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

/** The browser caps a timer at 2^31 - 1 ms (about 24 days); a later opening is not worth waiting for. */
const MAX_TIMER_MS = 2_147_483_647;

/** The tournament's check-in phase now; re-renders once when the window opens. */
export function useCheckInPhase(tourney: SerializedTournament) {
  const [, tick] = useState(0);
  const config = {
    startsAt: tourney.startsAt ? new Date(tourney.startsAt) : null,
    checkInMinutes: tourney.checkInMinutes,
  };
  const phase = checkInPhase(config, new Date());
  const opensAt = tourney.checkInOpensAt;
  useEffect(() => {
    if (phase !== 'before' || !opensAt) return;
    const wait = new Date(opensAt).getTime() - Date.now();
    if (wait <= 0 || wait > MAX_TIMER_MS) return;
    const id = setTimeout(() => tick((n) => n + 1), wait);
    return () => clearTimeout(id);
  }, [phase, opensAt]);
  return phase;
}

interface PanelProps {
  tourney: SerializedTournament;
  viewerId: string | null;
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}

export function CheckInPanel({ tourney, viewerId, canManage, onChanged }: PanelProps) {
  const { t, i18n } = useTranslation('tournament-checkin');
  const phase = useCheckInPhase(tourney);
  const [busy, setBusy] = useState(false);
  if (tourney.status !== 'REGISTRATION') return null;
  const enabled = tourney.checkInMinutes != null;
  if (!enabled && !canManage) return null;

  const locale = i18n.language || 'en';
  const entrants = tourney.entrants ?? [];
  const checkedIn = entrants.filter((e) => e.checkedIn).length;
  const opensAt = tourney.checkInOpensAt ? new Date(tourney.checkInOpensAt) : null;
  const entered = !!viewerId && !!tourney.viewerEntered;

  const run = async (work: () => Promise<unknown>, okMsg: string | null) => {
    setBusy(true);
    try {
      await work();
      if (okMsg) toast.success(okMsg);
      await onChanged();
    } catch (e) {
      toast.error(
        serverError(e) ?? t('failed', { defaultValue: 'Check-in could not be saved' }),
      );
    } finally {
      setBusy(false);
    }
  };

  const checkInSelf = () =>
    run(
      () => checkInSelfApi(tourney.id),
      t('checked-in-toast', { defaultValue: 'You are checked in' }),
    );

  const setWindow = (value: string) => {
    const minutes = value === '' ? null : Number(value);
    return run(
      () =>
        setCheckInWindow(tourney.id, minutes === null || !isCheckInMinutes(minutes) ? null : minutes),
      t('settings-saved', { defaultValue: 'Check-in setting saved' }),
    );
  };

  return (
    <section
      aria-labelledby="checkin-heading"
      className="space-y-3 border-b border-site-border pb-4"
    >
      <h2 id="checkin-heading" className="t-heading">
        {t('heading', { defaultValue: 'Check-in' })}
      </h2>

      {enabled && (
        <div className="space-y-2">
          <p className="t-body">
            {phase === 'open'
              ? t('is-open', { defaultValue: 'Check-in is open. Players who have not checked in are removed and refunded when the host starts.' })
              : t('opens-at', {
                  defaultValue: 'Check-in opens {{when}} ({{relative}}).',
                  when: opensAt ? formatWhen(opensAt, locale) : '',
                  relative: opensAt ? formatRelative(opensAt, locale) : '',
                })}
          </p>
          <p className="t-meta" aria-live="polite">
            {t('count', {
              defaultValue: '{{checkedIn}} of {{total}} checked in',
              checkedIn,
              total: entrants.length,
            })}
          </p>
          {entered && phase === 'open' && (
            <div>
              {tourney.viewerCheckedIn ? (
                <p className="t-label">{t('you-checked-in', { defaultValue: 'Checked in' })}</p>
              ) : (
                <Button variant="primary" onClick={checkInSelf} loading={busy}>
                  {t('check-in', { defaultValue: 'Check in' })}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {canManage && (
        <CheckInWindowField
          id="checkin-window"
          value={tourney.checkInMinutes == null ? '' : String(tourney.checkInMinutes)}
          hasStart={!!tourney.startsAt}
          disabled={busy}
          onChange={(value) => void setWindow(value)}
          className="max-w-xs"
        />
      )}
    </section>
  );
}

interface WindowFieldProps {
  id: string;
  /** '' (off) or the minutes as a string. */
  value: string;
  /** Whether the tournament has a start time; without one the window cannot be set. */
  hasStart: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
}

/** The "Check-in: Off / 10 / 15 / 30 / 60 minutes before the start" setting, shared by the create dialog and the host's settings. */
export function CheckInWindowField({
  id,
  value,
  hasStart,
  disabled,
  onChange,
  className,
}: WindowFieldProps) {
  const { t } = useTranslation('tournament-checkin');
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{t('window-label', { defaultValue: 'Check-in window' })}</Label>
      <Select
        id={id}
        value={hasStart ? value : ''}
        disabled={disabled || (!hasStart && value === '')}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t('window-off', { defaultValue: 'Off' })}</option>
        {CHECK_IN_MINUTES.map((m) => (
          <option key={m} value={m}>
            {t('window-minutes', {
              defaultValue: '{{count}} minutes before the start',
              count: m,
            })}
          </option>
        ))}
      </Select>
      {!hasStart && (
        <p className="t-meta">
          {t('needs-start', { defaultValue: 'Set a start time to use check-in.' })}
        </p>
      )}
    </div>
  );
}

interface CreateFieldsProps {
  /** The `datetime-local` value ('' = no start time). */
  startsAtLocal: string;
  onStartsAtChange: (value: string) => void;
  checkInValue: string;
  onCheckInChange: (value: string) => void;
  /** Whether `startsAtLocal` is a usable time. */
  hasStart: boolean;
}

/** The create dialog's start time and check-in window, side by side. */
export function CheckInCreateFields({
  startsAtLocal,
  onStartsAtChange,
  checkInValue,
  onCheckInChange,
  hasStart,
}: CreateFieldsProps) {
  const { t } = useTranslation('tournament-checkin');
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="t-starts">{t('starts-at', { defaultValue: 'Start time (optional)' })}</Label>
        <Input
          id="t-starts"
          type="datetime-local"
          value={startsAtLocal}
          onChange={(e) => onStartsAtChange(e.target.value)}
        />
      </div>
      <CheckInWindowField
        id="t-checkin"
        value={checkInValue}
        hasStart={hasStart}
        onChange={onCheckInChange}
      />
    </div>
  );
}

/**
 * Words the server's refusal to start for too few check-ins ("Only 3 of the 4
 * players needed have checked in") in the viewer's language; null for any other
 * refusal, which keeps its own message.
 */
export function useStartRefusal(): (code: unknown, details: unknown) => string | null {
  const { t } = useTranslation('tournament-checkin');
  return (code, details) => {
    if (code !== 'TOO_FEW_CHECKED_IN' || typeof details !== 'object' || details === null) {
      return null;
    }
    const { checkedIn, needed } = details as { checkedIn?: number; needed?: number };
    if (typeof checkedIn !== 'number' || typeof needed !== 'number') return null;
    return t('too-few-checked-in', {
      defaultValue: 'Only {{checkedIn}} of the {{needed}} players needed have checked in',
      checkedIn,
      needed,
    });
  };
}

interface EntrantProps {
  tourney: SerializedTournament;
  entrant: NonNullable<SerializedTournament['entrants']>[number];
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}

/** One entrant row's check-in mark (text, not only an icon) and the host's by-hand toggle. */
export function EntrantCheckIn({ tourney, entrant, canManage, onChanged }: EntrantProps) {
  const { t } = useTranslation('tournament-checkin');
  const phase = useCheckInPhase(tourney);
  const [busy, setBusy] = useState(false);
  if (tourney.status !== 'REGISTRATION' || tourney.checkInMinutes == null) return null;
  const userId = entrant.user?.id;
  const name = entrant.user?.name ?? '';
  if (phase !== 'open' && !entrant.checkedIn && !canManage) return null;

  const toggle = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await setEntrantCheckIn(tourney.id, userId, !entrant.checkedIn);
      await onChanged();
    } catch (e) {
      toast.error(serverError(e) ?? t('failed', { defaultValue: 'Check-in could not be saved' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="ml-auto flex items-center gap-2">
      {(phase === 'open' || entrant.checkedIn) && (
        <span className="t-meta">
          {entrant.checkedIn
            ? t('row-checked-in', { defaultValue: 'Checked in' })
            : t('row-not-checked-in', { defaultValue: 'Not checked in' })}
        </span>
      )}
      {canManage && userId && (
        <Button
          variant="ghost"
          size="xs"
          onClick={toggle}
          loading={busy}
          aria-label={
            entrant.checkedIn
              ? t('undo-for', { defaultValue: 'Undo check-in for {{name}}', name })
              : t('check-in-for', { defaultValue: 'Check in {{name}}', name })
          }
        >
          {entrant.checkedIn
            ? t('undo', { defaultValue: 'Undo' })
            : t('check-in', { defaultValue: 'Check in' })}
        </Button>
      )}
    </span>
  );
}

function formatWhen(d: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** "in 12 minutes", "in 3 hours", "in 2 days" (`Intl.RelativeTimeFormat`). */
function formatRelative(d: Date, locale: string): string {
  const minutes = Math.round((d.getTime() - Date.now()) / 60_000);
  const abs = Math.abs(minutes);
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    abs < 60 ? [minutes, 'minute'] : abs < 60 * 24 ? [Math.round(minutes / 60), 'hour'] : [Math.round(minutes / 1440), 'day'];
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit);
  } catch {
    return '';
  }
}
