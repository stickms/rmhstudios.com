'use client';

/**
 * "When is the next one" — answered before anything else on a phone.
 *
 * On a wide screen the agenda sits beside the month grid and the first card in
 * it IS the next session, so this would be the same fact printed twice. On a
 * phone the panels stack, and the answer people actually opened the page for
 * ends up below the announcements and the calendar. So this card is
 * phone-only (`lg:hidden`) and leads the stack.
 *
 * It is a summary, not a second session card: the date, both clocks, where, and
 * how many have replied. Everything you can DO to a session — answering,
 * editing, the roster — stays on the agenda card and in the sheet, so there is
 * exactly one place to change a thing and this never drifts out of step with
 * it. The one control is the way through to that sheet.
 */

// `m as motion`, not `motion`: `Providers` wraps the app in `LazyMotion`, and `m`
// is the component that honours it — `motion` bundles its own full feature
// implementation, which lands in the SHARED ENTRY CHUNK when the module is
// reachable from a route's top level. Nine modules did this, together putting
// ~36 KB of framer-motion on the critical path of every page.
import { m as motion } from 'framer-motion';
import { CalendarClock, ChevronRight, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Session } from '@/lib/pf2ecal/types';
import { useSummary } from './Availability';
import { describeSessionTime, formatDayLabel, formatRelativeDay } from './format';
import { FADE_RISE, SPRING_LIST, TRANSITION } from './motion';

interface NextUpProps {
  /** The next session that has not finished, or null when nothing is booked. */
  session: Session | null;
  timeZone: string;
  now: Date;
  onOpen: (session: Session) => void;
}

export function NextUp({ session, timeZone, now, onOpen }: NextUpProps) {
  const { t } = useTranslation('r-pf2ecal');
  const summarise = useSummary();

  if (!session) {
    return (
      <section
        className="pf2e-card p-4"
        aria-label={t('next-session', { defaultValue: 'Next session' })}
      >
        <h2 className="pf2e-mono-label mb-2">
          {t('next-session', { defaultValue: 'Next session' })}
        </h2>
        <p className="pf2e-body pf2e-muted">
          {t('nothing-booked', { defaultValue: 'Nothing on the books.' })}
        </p>
      </section>
    );
  }

  const time = describeSessionTime(session.startsAt, session.endsAt, timeZone);
  const canceled = Boolean(session.canceledAt);

  return (
    <motion.section
      className="pf2e-card p-4"
      aria-label={t('next-session', { defaultValue: 'Next session' })}
      // `layout` as well as the entrance: the card swaps to the following
      // session the moment one finishes, and the height changes with it (a
      // location line appears, a longer relative phrase wraps). Springing that
      // is the difference between the panel below it sliding and it jumping.
      layout
      initial={FADE_RISE.initial}
      animate={FADE_RISE.animate}
      transition={{ ...TRANSITION, layout: SPRING_LIST }}
    >
      <h2 className="pf2e-mono-label mb-2 flex items-center gap-1.5">
        <CalendarClock size={13} aria-hidden />
        {t('next-session', { defaultValue: 'Next session' })}
      </h2>

      {/* The relative phrase is the headline, not the date: "Tomorrow" is what
          someone glancing at this needs, and the exact date is right under it
          for when it is not. */}
      <p className="pf2e-nextup-lead">{formatRelativeDay(session.startsAt, now, timeZone)}</p>
      <p className="pf2e-body mt-0.5 font-medium">
        {formatDayLabel(session.startsAt, timeZone)}
        {canceled && <> · {t('cancelled', { defaultValue: 'Cancelled' })}</>}
      </p>

      <p className="pf2e-body mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{time.local}</span>
        {time.reference && <span className="pf2e-muted">{time.reference}</span>}
      </p>

      {session.location && (
        <p className="pf2e-caption mt-1.5 flex items-center gap-1.5">
          <MapPin size={13} aria-hidden className="shrink-0" />
          <span className="truncate">{session.location}</span>
        </p>
      )}

      <button
        type="button"
        className="pf2e-btn pf2e-btn-secondary pf2e-btn-sm mt-3 w-full justify-between"
        onClick={() => onOpen(session)}
      >
        <span className="truncate">{summarise(session.responses)}</span>
        <ChevronRight size={15} aria-hidden className="shrink-0" />
      </button>
    </motion.section>
  );
}
