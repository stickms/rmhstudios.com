'use client';

/**
 * The plan itself: tonight's card, the day-by-day list (or a month heat-map),
 * and the ways to take it elsewhere — calendar file, plain text, share link,
 * print.
 */

import { AnimatePresence, m as motion } from 'framer-motion';
import {
  CalendarDays,
  CalendarPlus,
  Check,
  ClipboardCopy,
  Coffee,
  Link2,
  Popcorn,
  Printer,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  addDays,
  daysBetween,
  formatMinutes,
  parseDay,
  weekday,
  type Plan,
  type PlanEntry,
} from '@/lib/dunesday/schedule';
import { buildIcs, encodeShare, titleById, type DunesdayState } from '@/lib/dunesday/state';
import { DURATION, EASE } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { fmtDay, LONG, SHORT } from './format';
import { Segmented } from './Segmented';
import type { DunesdayActions } from './useDunesdayState';

const PREVIEW_DAYS = 14;

export function useEntryLabel(state: DunesdayState) {
  const { t } = useTranslation('c-dunesday');
  return (entry: PlanEntry) => {
    const title = titleById(state, entry.titleId)?.title ?? entry.titleId;
    if (entry.episodes) {
      const [a, b] = entry.episodes;
      return a === b
        ? t('entry-ep', { defaultValue: '{{title}} · Ep {{a}}', title, a })
        : t('entry-eps', { defaultValue: '{{title}} · Ep {{a}}–{{b}}', title, a, b });
    }
    if (entry.part) {
      return t('entry-part', {
        defaultValue: '{{title}} · Part {{a}} of {{b}}',
        title,
        a: entry.part[0],
        b: entry.part[1],
      });
    }
    return title;
  };
}

function FranchiseTag({ franchise }: { franchise: string }) {
  const { t } = useTranslation('c-dunesday');
  if (franchise === 'dune')
    return <span className="ds-tag ds-tag--dune">{t('tag-dune', { defaultValue: 'Dune' })}</span>;
  if (franchise === 'extra')
    return (
      <span className="ds-tag ds-tag--extra">{t('tag-extra', { defaultValue: 'Extra' })}</span>
    );
  return <span className="ds-tag ds-tag--mcu">{t('tag-mcu', { defaultValue: 'MCU' })}</span>;
}

export function Schedule({
  plan,
  state,
  actions,
  today,
}: {
  plan: Plan;
  state: DunesdayState;
  actions: DunesdayActions;
  today: string;
}) {
  const { t, i18n } = useTranslation('c-dunesday');
  const [view, setView] = useState<'list' | 'month'>('list');
  const [showAll, setShowAll] = useState(false);
  const label = useEntryLabel(state);
  const lang = i18n.language;

  const tonight = plan.days.find((d) => d.date >= today && d.entries.length > 0) ?? null;
  const isTonightToday = tonight?.date === today;

  const markDone = (entry: PlanEntry) => {
    const title = titleById(state, entry.titleId);
    if (!title) return;
    if (entry.episodes && title.episodes)
      actions.setEpisodes(title.id, entry.episodes[1], title.episodes);
    else actions.toggleWatched(title.id);
  };

  const days = showAll ? plan.days : plan.days.slice(0, PREVIEW_DAYS);

  // Group the list by week (weeks start on Monday) for scannability.
  const weeks = useMemo(() => {
    const out: { start: string; days: typeof days }[] = [];
    for (const day of days) {
      const offset = (weekday(day.date) + 6) % 7;
      const start = addDays(day.date, -offset);
      const last = out[out.length - 1];
      if (last && last.start === start) last.days.push(day);
      else out.push({ start, days: [day] });
    }
    return out;
  }, [days]);

  const summaryFor = (entries: PlanEntry[]) => entries.map(label).join(' + ');

  const exportIcs = () => {
    const ics = buildIcs(
      plan.days
        .filter((d) => d.entries.length)
        .map((d) => ({
          date: d.date,
          minutes: d.minutes,
          summary: `Dunesday: ${summaryFor(d.entries)}`,
          lines: d.entries.map((e) => `${label(e)} (${formatMinutes(e.minutes)})`),
        })),
      state.watchTime,
    );
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dunesday-marathon.ics';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      t('ics-done', { defaultValue: 'Calendar file downloaded — open it to add every night.' }),
    );
  };

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
    } catch {
      toast.error(
        t('copy-failed', { defaultValue: 'Couldn’t copy — your browser blocked the clipboard.' }),
      );
    }
  };

  const copyText = () =>
    copy(
      [
        t('text-header', { defaultValue: 'My Dunesday marathon plan' }),
        ...plan.days
          .filter((d) => d.entries.length)
          .map(
            (d) =>
              `${fmtDay(d.date, lang, SHORT)} — ${summaryFor(d.entries)} (${formatMinutes(d.minutes)})`,
          ),
      ].join('\n'),
      t('text-copied', { defaultValue: 'Plan copied as text.' }),
    );

  const copyLink = () =>
    copy(
      `${window.location.origin}${window.location.pathname}#plan=${encodeShare(state)}`,
      t('link-copied', {
        defaultValue: 'Share link copied. Friends get your list and pace, not your progress.',
      }),
    );

  return (
    <section className="ds-window" aria-labelledby="ds-schedule-title">
      <div className="ds-titlebar">
        <CalendarDays size={16} aria-hidden="true" />
        <h2 id="ds-schedule-title">{t('schedule-title', { defaultValue: 'Your schedule' })}</h2>
        <span className="ds-caption-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
      <div className="ds-window-body">
        <div className="ds-toolbar ds-no-print" style={{ marginBottom: 14 }}>
          <Segmented
            label={t('view-label', { defaultValue: 'Schedule view' })}
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: t('view-list', { defaultValue: 'Day by day' }) },
              { value: 'month', label: t('view-month', { defaultValue: 'Calendar' }) },
            ]}
          />
          <div className="ds-row" style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              className="ds-btn ds-btn--sm"
              onClick={exportIcs}
              disabled={!plan.days.length}
            >
              <CalendarPlus size={14} aria-hidden="true" />
              {t('export-ics', { defaultValue: 'Add to calendar' })}
            </button>
            <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={copyLink}>
              <Link2 size={14} aria-hidden="true" />
              {t('share', { defaultValue: 'Share' })}
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--ghost ds-btn--sm"
              onClick={copyText}
              disabled={!plan.days.length}
            >
              <ClipboardCopy size={14} aria-hidden="true" />
              {t('copy-text', { defaultValue: 'Copy' })}
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon"
              onClick={() => window.print()}
              aria-label={t('print', { defaultValue: 'Print' })}
            >
              <Printer size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        {tonight && (
          <motion.div
            className="ds-tonight"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: DURATION.slow, ease: EASE.standard }}
          >
            <div className="ds-row">
              <Popcorn size={22} aria-hidden="true" />
              <h3>
                {isTonightToday
                  ? t('tonight', { defaultValue: 'Tonight' })
                  : t('next-up', {
                      defaultValue: 'Next up · {{date}}',
                      date: fmtDay(tonight.date, lang, LONG),
                    })}
              </h3>
              <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
                {formatMinutes(tonight.minutes)}
              </span>
            </div>
            {tonight.entries.map((entry) => {
              const title = titleById(state, entry.titleId);
              const finalPart = !entry.part || entry.part[0] === entry.part[1];
              return (
                <div
                  key={`${entry.titleId}-${entry.episodes?.[0] ?? entry.part?.[0] ?? 0}`}
                  className="ds-tonight-item"
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{label(entry)}</strong>
                    {title?.hook && <div style={{ fontSize: 13, opacity: 0.9 }}>{title.hook}</div>}
                  </div>
                  <span>{formatMinutes(entry.minutes)}</span>
                  {finalPart && (
                    <button
                      type="button"
                      className="ds-btn ds-btn--green ds-btn--sm"
                      onClick={() => markDone(entry)}
                    >
                      <Check size={14} aria-hidden="true" />
                      {t('mark-done', { defaultValue: 'Watched' })}
                    </button>
                  )}
                </div>
              );
            })}
            {isTonightToday && (
              <div>
                <button
                  type="button"
                  className="ds-btn ds-btn--ghost ds-btn--sm"
                  onClick={() => actions.toggleSkip(today)}
                >
                  <Coffee size={14} aria-hidden="true" />
                  {t('skip-tonight', { defaultValue: 'Not tonight — reshuffle' })}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {!plan.days.length ? (
          <p className="ds-muted">
            {t('empty-plan', {
              defaultValue:
                'Nothing to schedule. Tick some titles in the watch list below to build a plan.',
            })}
          </p>
        ) : view === 'list' ? (
          <>
            {weeks.map((week) => (
              <div key={week.start}>
                <div className="ds-week-head">
                  {t('week-of', {
                    defaultValue: 'Week of {{date}}',
                    date: fmtDay(week.start, lang, { month: 'short', day: 'numeric' }),
                  })}
                </div>
                <div className="ds-stack" style={{ gap: 8 }}>
                  <AnimatePresence initial={false}>
                    {week.days.map((day) => {
                      const skipped =
                        state.settings.skipDates.includes(day.date) || day.budget === 0;
                      const over = day.budget > 0 && day.minutes > day.budget;
                      return (
                        <motion.div
                          key={day.date}
                          layout="position"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: DURATION.base }}
                          className={cn(
                            'ds-card ds-day',
                            day.date === today && 'ds-day--today',
                            skipped && 'ds-day--skip',
                          )}
                        >
                          <div className="ds-date-tile">
                            <span className="ds-dow">
                              {fmtDay(day.date, lang, { weekday: 'short' })}
                            </span>
                            <span className="ds-dom">{parseDay(day.date).getUTCDate()}</span>
                            <span className="ds-mon">
                              {fmtDay(day.date, lang, { month: 'short' })}
                            </span>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            {skipped && !day.entries.length ? (
                              <div className="ds-row">
                                <span className="ds-muted">
                                  {t('day-off', { defaultValue: 'Day off' })}
                                </span>
                                {state.settings.skipDates.includes(day.date) && (
                                  <button
                                    type="button"
                                    className="ds-btn ds-btn--ghost ds-btn--sm ds-no-print"
                                    onClick={() => actions.toggleSkip(day.date)}
                                  >
                                    {t('day-on', { defaultValue: 'Watch this day after all' })}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <>
                                {day.entries.map((entry) => {
                                  const title = titleById(state, entry.titleId);
                                  return (
                                    <div
                                      key={`${entry.titleId}-${entry.episodes?.[0] ?? entry.part?.[0] ?? 0}`}
                                      className="ds-entry"
                                    >
                                      {title && <FranchiseTag franchise={title.franchise} />}
                                      <span>{label(entry)}</span>
                                      <span className="ds-entry-meta">
                                        {formatMinutes(entry.minutes)}
                                      </span>
                                    </div>
                                  );
                                })}
                                <div className="ds-row" style={{ marginTop: 6 }}>
                                  <span className="ds-entry-meta">
                                    {t('day-total', {
                                      defaultValue: '{{total}} of a {{budget}} night',
                                      total: formatMinutes(day.minutes),
                                      budget: formatMinutes(day.budget),
                                    })}
                                  </span>
                                  <button
                                    type="button"
                                    className="ds-btn ds-btn--ghost ds-btn--sm ds-no-print"
                                    style={{ marginLeft: 'auto' }}
                                    onClick={() => actions.toggleSkip(day.date)}
                                  >
                                    {t('take-off', { defaultValue: 'Take this day off' })}
                                  </button>
                                </div>
                                <div
                                  className={cn('ds-meter', over && 'ds-meter--over')}
                                  aria-hidden="true"
                                >
                                  <span
                                    style={{
                                      width: `${Math.min(100, (day.minutes / Math.max(1, day.budget)) * 100)}%`,
                                    }}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            ))}
            {plan.days.length > PREVIEW_DAYS && (
              <div style={{ marginTop: 14, textAlign: 'center' }} className="ds-no-print">
                <button
                  type="button"
                  className="ds-btn ds-btn--ghost"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll
                    ? t('show-less', { defaultValue: 'Show the next two weeks' })
                    : t('show-all', {
                        defaultValue: 'Show all {{count}} days',
                        count: plan.days.length,
                      })}
                </button>
              </div>
            )}
          </>
        ) : (
          <MonthView plan={plan} state={state} today={today} actions={actions} />
        )}
      </div>
    </section>
  );
}

function MonthView({
  plan,
  state,
  today,
  actions,
}: {
  plan: Plan;
  state: DunesdayState;
  today: string;
  actions: DunesdayActions;
}) {
  const { t, i18n } = useTranslation('c-dunesday');
  const label = useEntryLabel(state);
  const byDate = new Map(plan.days.map((d) => [d.date, d]));
  const watchedDays = new Set(Object.values(state.watched));
  const first = plan.days[0]?.date ?? today;
  const last =
    state.settings.deadline > (plan.finishDate ?? first)
      ? state.settings.deadline
      : (plan.finishDate ?? first);
  const peak = Math.max(1, ...plan.days.map((d) => d.minutes));

  // Month starts from the first plan day through the later of finish/deadline.
  const months: string[] = [];
  let cursor = `${first.slice(0, 7)}-01`;
  while (cursor <= last && months.length < 18) {
    months.push(cursor);
    const d = parseDay(cursor);
    d.setUTCMonth(d.getUTCMonth() + 1);
    cursor = d.toISOString().slice(0, 10);
  }

  const dow = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    fmtDay(addDays('2026-10-04', i), i18n.language, { weekday: 'narrow' }),
  );

  return (
    <div className="ds-months">
      {months.map((month) => {
        const start = weekday(month);
        const d = parseDay(month);
        d.setUTCMonth(d.getUTCMonth() + 1);
        const length = daysBetween(month, d.toISOString().slice(0, 10));
        return (
          <div key={month} className="ds-card ds-month">
            <h4>{fmtDay(month, i18n.language, { month: 'long', year: 'numeric' })}</h4>
            <div className="ds-month-grid">
              {dow.map((n, i) => (
                <span key={i} className="ds-month-dow" aria-hidden="true">
                  {n}
                </span>
              ))}
              {Array.from({ length: start }, (_, i) => (
                <span key={`pad-${i}`} className="ds-cell ds-cell--empty" aria-hidden="true" />
              ))}
              {Array.from({ length }, (_, i) => {
                const date = addDays(month, i);
                const day = byDate.get(date);
                const level =
                  day && day.minutes ? Math.min(3, Math.ceil((day.minutes / peak) * 3)) : 0;
                const skip = state.settings.skipDates.includes(date);
                const title = day?.entries.length
                  ? `${fmtDay(date, i18n.language, SHORT)}: ${day.entries.map(label).join(' + ')} (${formatMinutes(day.minutes)})`
                  : fmtDay(date, i18n.language, SHORT);
                return (
                  <button
                    key={date}
                    type="button"
                    title={title}
                    aria-label={`${title}${skip ? ` — ${t('day-off', { defaultValue: 'Day off' })}` : ''}`}
                    onClick={() =>
                      date >= today && date <= state.settings.deadline && actions.toggleSkip(date)
                    }
                    className={cn(
                      'ds-cell',
                      level === 1 && 'ds-cell--l1',
                      level === 2 && 'ds-cell--l2',
                      level === 3 && 'ds-cell--l3',
                      skip && 'ds-cell--skip',
                      date === today && 'ds-cell--today',
                      date === state.settings.deadline && 'ds-cell--deadline',
                      watchedDays.has(date) && 'ds-cell--watched',
                    )}
                    style={{ cursor: date >= today ? 'pointer' : 'default' }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="ds-hint" style={{ gridColumn: '1 / -1' }}>
        {t('month-hint', {
          defaultValue:
            'Darker days are longer nights. Tap a future day to take it off (or put it back). Green ring: today · gold ring: your deadline.',
        })}
      </p>
    </div>
  );
}
