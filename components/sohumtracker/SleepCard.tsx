'use client';

/**
 * When he sleeps — inferred, and labelled as inferred.
 *
 * The tracker sees Discord, not a bedroom. What it knows is which hours he did
 * something in — sent a message, sat in voice, had a game open — and a night is
 * the longest run of hours across one midnight in which he did none of them.
 * That is his sleep only insofar as he is on Discord right up to it and back on
 * it soon after, which given everything else on this page is not a heroic
 * assumption — but it IS an assumption, so the card says so in its own footer
 * rather than presenting a guess in the same voice as the measured figures.
 *
 * It reads ACTIVITY rather than presence on purpose. "Last seen" is written by
 * status sessions, which stay open through idle and close only on a real
 * sign-off, so for someone who leaves the desktop client running every day comes
 * back as seen from 00:00 to 23:59 and no night is ever found. That is the bug
 * this card shipped with; `inferSleep` carries the full account.
 *
 * The strip is one row per night on an 18:00-anchored axis, which is the only
 * axis on which "he went to bed at 4am" reads as late rather than as early.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatHourOfDay, inferSleep } from '@/lib/sohumtracker/analytics';
import { formatDayShort } from '@/lib/sohumtracker/dates';
import type { WatchDayDTO } from '@/lib/sohumtracker/types';

/** How many recent nights the strip draws. More than this and the labels touch. */
const STRIP_NIGHTS = 14;

/** The axis runs 18:00 → 18:00, so a bedtime never wraps off the left edge. */
const AXIS_ANCHOR = 18;
/** …and it only needs to cover evening through afternoon, not a full 24. */
const AXIS_HOURS = 20;

const PLOT_W = 720;
const ROW_H = 15;
const PAD_L = 46;
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 18;

/** Hours after 18:00 local, which is where the axis starts. */
function axisOffset(hour: number): number {
  return (hour - AXIS_ANCHOR + 24) % 24;
}

export function SleepCard({ days }: { days: WatchDayDTO[] }) {
  const { t } = useTranslation('r-sohumtracker');
  const sleep = useMemo(() => inferSleep(days), [days]);

  const strip = sleep.nights.slice(-STRIP_NIGHTS);
  const plotH = PAD_T + PAD_B + strip.length * ROW_H;
  const innerW = PLOT_W - PAD_L - PAD_R;
  const scale = innerW / AXIS_HOURS;

  if (sleep.nights.length === 0) {
    return (
      <div className="stk-chart">
        <div className="stk-chart__head">
          <h3 className="stk-chart__title">
            {t('sleep-title', { defaultValue: 'When he sleeps' })}
          </h3>
        </div>
        <p className="stk-empty">
          <span className="stk-empty__title">
            {t('sleep-empty-title', { defaultValue: 'No nights inferred yet' })}
          </span>
          <span className="stk-empty__body">
            {t('sleep-empty-body-quiet', {
              defaultValue:
                'A night is the longest stretch of hours across one midnight in which he sent nothing, joined no voice channel and had no game open. That needs two consecutive tracked days, and there have not been two in a row yet.',
            })}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="stk-chart">
      <div className="stk-chart__head">
        <h3 className="stk-chart__title">
          {t('sleep-title', { defaultValue: 'When he sleeps' })}
        </h3>
        <p className="stk-chart__note">
          {t('sleep-sample', {
            count: sleep.nights.length,
            defaultValue: 'from {{count}} nights',
          })}
        </p>
      </div>

      <div className="stk-sleep-figures">
        <SleepFigure
          label={t('sleep-bed', { defaultValue: 'Typically asleep' })}
          value={formatHourOfDay(sleep.medianSleptHour)}
        />
        <SleepFigure
          label={t('sleep-wake', { defaultValue: 'Typically up' })}
          value={formatHourOfDay(sleep.medianWokeHour)}
        />
        <SleepFigure
          label={t('sleep-length', { defaultValue: 'Typical night' })}
          value={t('sleep-hours', {
            value: sleep.medianHours.toFixed(1),
            defaultValue: '{{value}}h',
          })}
        />
        <SleepFigure
          label={t('sleep-latest', { defaultValue: 'Latest he has gone down' })}
          value={sleep.latest ? formatHourOfDay(sleep.latest.sleptHour) : '—'}
          note={sleep.latest ? formatDayShort(sleep.latest.nightOf) : undefined}
        />
      </div>

      <div className="stk-chart__plot">
        <svg
          viewBox={`0 0 ${PLOT_W} ${plotH}`}
          role="img"
          aria-label={t('sleep-alt-quiet', {
            defaultValue:
              'One bar per night, spanning the hours in which he did nothing on Discord at all',
          })}
        >
          {/* Hour rules every three hours from 18:00. */}
          {Array.from({ length: Math.floor(AXIS_HOURS / 3) + 1 }, (_, index) => index * 3).map(
            (offset) => (
              <g key={offset}>
                <line
                  className="stk-chart__grid-line"
                  x1={PAD_L + offset * scale}
                  x2={PAD_L + offset * scale}
                  y1={PAD_T}
                  y2={plotH - PAD_B}
                />
                <text
                  className="stk-chart__axis"
                  x={PAD_L + offset * scale}
                  y={plotH - 5}
                  textAnchor="middle"
                >
                  {String((AXIS_ANCHOR + offset) % 24).padStart(2, '0')}
                </text>
              </g>
            ),
          )}
          {/* Midnight, which is the line most of these bars start after. */}
          <line
            className="stk-chart__cursor"
            x1={PAD_L + axisOffset(0) * scale}
            x2={PAD_L + axisOffset(0) * scale}
            y1={PAD_T}
            y2={plotH - PAD_B}
          />

          {strip.map((night, index) => {
            const start = axisOffset(night.sleptHour);
            const end = start + night.hours;
            const y = PAD_T + index * ROW_H;
            return (
              <g key={night.nightOf}>
                <text className="stk-chart__axis" x={0} y={y + ROW_H - 3}>
                  {formatDayShort(night.nightOf)}
                </text>
                <rect
                  className="stk-sleep-bar"
                  x={PAD_L + start * scale}
                  y={y + 2}
                  width={Math.max(2, (end - start) * scale)}
                  height={ROW_H - 4}
                  rx={3}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <p className="stk-chart__readout">
        {t('sleep-caveat-quiet', {
          defaultValue:
            'Inferred, not measured: the longest run of hours with no messages, no voice and no game open. Read to the hour, and gaps under 3h or over 15h are not counted as a night. Being signed in does not count as being awake — he leaves Discord running.',
        })}
      </p>

      <div className="stk-sr">
        <table>
          <caption>{t('sleep-table', { defaultValue: 'Inferred nights' })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('sleep-col-night', { defaultValue: 'Night of' })}</th>
              <th scope="col">{t('sleep-col-quiet-from', { defaultValue: 'Quiet from' })}</th>
              <th scope="col">{t('sleep-col-quiet-to', { defaultValue: 'Active again' })}</th>
              <th scope="col">{t('sleep-col-hours', { defaultValue: 'Hours' })}</th>
            </tr>
          </thead>
          <tbody>
            {sleep.nights.map((night) => (
              <tr key={night.nightOf}>
                <th scope="row">{night.nightOf}</th>
                <td>{formatHourOfDay(night.sleptHour)}</td>
                <td>{formatHourOfDay(night.wokeHour)}</td>
                <td>{night.hours.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SleepFigure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stk-sleep-figure">
      <span className="stk-sleep-figure__label">{label}</span>
      <span className="stk-sleep-figure__value">{value}</span>
      {note ? <span className="stk-sleep-figure__note">{note}</span> : null}
    </div>
  );
}
