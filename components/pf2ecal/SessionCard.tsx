'use client';

/**
 * One session in the agenda.
 *
 * The card is the page's primary read AND its primary write: the availability
 * pills are on the card itself, so answering never costs a tap to open
 * something. Opening the sheet is for the parts that need room — the roster,
 * the notes, editing.
 *
 * The whole card is not a button. A card-sized click target that also contains
 * three buttons is ambiguous to a pointer and hostile to a screen reader (every
 * interactive descendant becomes unreachable inside a `<button>`), so the title
 * is the link into detail and the pills stay independent.
 */

import { motion } from 'framer-motion';
import { ExternalLink, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Availability, Session } from '@/lib/pf2ecal/types';
import { AvailabilityPicker, useSummary } from './Availability';
import { asExternalUrl, describeSessionTime, formatDayLabel, formatRelativeDay } from './format';

interface SessionCardProps {
  session: Session;
  timeZone: string;
  now: Date;
  viewerId: string | null;
  /** True while this card's own write is in flight. */
  pending?: boolean;
  onOpen: (session: Session) => void;
  onRespond: (session: Session, status: Availability | null) => void;
}

export function SessionCard({
  session,
  timeZone,
  now,
  viewerId,
  pending,
  onOpen,
  onRespond,
}: SessionCardProps) {
  const { t } = useTranslation('r-pf2ecal');
  const summarise = useSummary();
  const time = describeSessionTime(session.startsAt, session.endsAt, timeZone);
  const mine = viewerId ? session.responses.find((r) => r.userId === viewerId) : undefined;
  const canceled = Boolean(session.canceledAt);
  const locationUrl = asExternalUrl(session.location);
  const isPast = session.endsAt.getTime() < now.getTime();

  return (
    <motion.article
      layout="position"
      // `layout="position"` and not `layout`: only the card's OFFSET animates
      // when the list reorders. Full layout animation would also interpolate
      // width/height, which re-rasterises the text inside every frame.
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className={[
        'pf2e-card p-4 sm:p-5',
        canceled ? 'pf2e-canceled' : '',
        pending ? 'pf2e-pending' : '',
        isPast && !canceled ? 'opacity-70' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="pf2e-mono-label mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{formatDayLabel(session.startsAt, timeZone)}</span>
            <span aria-hidden>·</span>
            <span>{formatRelativeDay(session.startsAt, now, timeZone)}</span>
            {canceled && (
              <>
                <span aria-hidden>·</span>
                <span>{t('cancelled', { defaultValue: 'Cancelled' })}</span>
              </>
            )}
          </div>

          <h3 className="pf2e-title">
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => onOpen(session)}
            >
              {session.title}
            </button>
          </h3>

          {/* The time line: local clock first, Central in parentheses beside
              it. `describeSessionTime` drops the parenthetical when the viewer
              is already on Central so it never reads "7:00 PM (7:00 PM CDT)". */}
          <p className="pf2e-body mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{time.local}</span>
            {time.reference && <span className="pf2e-muted">{time.reference}</span>}
          </p>

          {session.location && (
            <p className="pf2e-caption mt-1.5 flex items-center gap-1.5">
              <MapPin size={13} aria-hidden className="shrink-0" />
              {locationUrl ? (
                <a
                  href={locationUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 truncate hover:underline"
                >
                  <span className="truncate">{session.location}</span>
                  <ExternalLink size={11} aria-hidden className="shrink-0" />
                </a>
              ) : (
                <span className="truncate">{session.location}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {session.notes && (
        <p className="pf2e-body pf2e-muted mt-3 line-clamp-3 whitespace-pre-wrap">
          {session.notes}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {viewerId && !canceled ? (
          <AvailabilityPicker
            dense
            value={(mine?.status as Availability | undefined) ?? null}
            onChange={(next) => onRespond(session, next)}
          />
        ) : (
          <span className="pf2e-caption">
            {canceled
              ? t('session-is-off', { defaultValue: 'This session is off.' })
              : t('sign-in-to-reply', { defaultValue: 'Sign in to reply.' })}
          </span>
        )}

        <button
          type="button"
          className="pf2e-btn pf2e-btn-ghost pf2e-btn-sm"
          onClick={() => onOpen(session)}
        >
          {summarise(session.responses)}
        </button>
      </div>
    </motion.article>
  );
}
