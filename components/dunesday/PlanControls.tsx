'use client';

/**
 * Everything that shapes the plan: fit-to-deadline vs. set-your-pace, the
 * dates, the average, the weekly rhythm, days off, and the packing options.
 */

import { CalendarX2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AeroWindow } from './AeroWindow';
import { addDays, formatMinutes, type PlanSettings } from '@/lib/dunesday/schedule';
import { WEIGHT_PRESETS, type DunesdayState } from '@/lib/dunesday/state';
import { DUNESDAY } from '@/lib/dunesday/titles';
import { fmtDay, SHORT } from './format';
import { Segmented } from './Segmented';
import type { DunesdayActions, Preset } from './useDunesdayState';

type Rhythm = keyof typeof WEIGHT_PRESETS | 'custom';

function rhythmOf(weights: PlanSettings['weekdayWeights']): Rhythm {
  for (const [key, preset] of Object.entries(WEIGHT_PRESETS)) {
    if (preset.every((w, i) => w === weights[i])) return key as Rhythm;
  }
  return 'custom';
}

/** A two-press button for the destructive resets — no modal needed. */
function ConfirmButton({
  label,
  confirm,
  onConfirm,
}: {
  label: string;
  confirm: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      className={armed ? 'ds-btn ds-btn--sand ds-btn--sm' : 'ds-btn ds-btn--ghost ds-btn--sm'}
      onClick={() => {
        if (armed) {
          onConfirm();
          setArmed(false);
        } else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
    >
      <RotateCcw size={14} aria-hidden="true" />
      {armed ? confirm : label}
    </button>
  );
}

export function PlanControls({
  state,
  actions,
  effectiveAvg,
  effectiveStart,
}: {
  state: DunesdayState;
  actions: DunesdayActions;
  /** The average the current plan actually uses (computed in fit mode). */
  effectiveAvg: number;
  effectiveStart: string;
}) {
  const { t, i18n } = useTranslation('c-dunesday');
  const s = state.settings;
  const [skipDraft, setSkipDraft] = useState('');
  const rhythm = rhythmOf(s.weekdayWeights);
  const weightSum = s.weekdayWeights.reduce((a, b) => a + b, 0) || 1;
  const hours = Math.floor(s.minutesPerDay / 60);
  const mins = s.minutesPerDay % 60;
  const setPace = (h: number, m: number) =>
    actions.setSettings({ minutesPerDay: Math.max(5, Math.min(1440, h * 60 + m)), mode: 'pace' });

  const dayNames = [
    t('dow-sun', { defaultValue: 'Sun' }),
    t('dow-mon', { defaultValue: 'Mon' }),
    t('dow-tue', { defaultValue: 'Tue' }),
    t('dow-wed', { defaultValue: 'Wed' }),
    t('dow-thu', { defaultValue: 'Thu' }),
    t('dow-fri', { defaultValue: 'Fri' }),
    t('dow-sat', { defaultValue: 'Sat' }),
  ];

  const setWeight = (i: number, delta: number) => {
    const next = [...s.weekdayWeights] as PlanSettings['weekdayWeights'];
    next[i] = Math.max(0, Math.min(4, next[i] + delta));
    if (next.every((w) => w === 0)) return;
    actions.setSettings({ weekdayWeights: next });
  };

  return (
    <AeroWindow title={t('plan-title', { defaultValue: 'Plan settings' })} bodyClassName="ds-stack">
      <div className="ds-field">
        <span className="ds-label" id="ds-mode-label">
          {t('mode-label', { defaultValue: 'How should we plan it?' })}
        </span>
        <Segmented
          label={t('mode-label', { defaultValue: 'How should we plan it?' })}
          value={s.mode}
          onChange={(mode) => actions.setSettings({ mode })}
          options={[
            {
              value: 'fit',
              label: t('mode-fit', { defaultValue: 'Fit it before the deadline' }),
            },
            { value: 'pace', label: t('mode-pace', { defaultValue: 'I’ll set my pace' }) },
          ]}
        />
        <span className="ds-hint">
          {s.mode === 'fit'
            ? t('mode-fit-hint', {
                defaultValue: 'We find the smallest daily average that still finishes on time.',
              })
            : t('mode-pace-hint', {
                defaultValue: 'You pick the average; we tell you when you finish.',
              })}
        </span>
      </div>

      <div className="ds-row" style={{ alignItems: 'flex-end' }}>
        <label className="ds-field">
          <span className="ds-label">{t('start-date', { defaultValue: 'Start date' })}</span>
          <input
            type="date"
            className="ds-input"
            value={s.startDate}
            max={s.deadline}
            onChange={(e) => e.target.value && actions.setSettings({ startDate: e.target.value })}
          />
        </label>
        <label className="ds-field">
          <span className="ds-label">{t('deadline', { defaultValue: 'Finish by' })}</span>
          <input
            type="date"
            className="ds-input"
            value={s.deadline}
            min={s.startDate}
            onChange={(e) => e.target.value && actions.setSettings({ deadline: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="ds-btn ds-btn--ghost ds-btn--sm"
          onClick={() => actions.setSettings({ deadline: addDays(DUNESDAY, -1) })}
        >
          {t('deadline-eve', { defaultValue: 'Night before' })}
        </button>
        <button
          type="button"
          className="ds-btn ds-btn--ghost ds-btn--sm"
          onClick={() => actions.setSettings({ deadline: addDays(DUNESDAY, -7) })}
        >
          {t('deadline-week', { defaultValue: 'A week early' })}
        </button>
      </div>
      {effectiveStart !== s.startDate && (
        <span className="ds-hint">
          {t('replanning-from', {
            defaultValue: 'Re-planning from today ({{date}}) because your start date has passed.',
            date: fmtDay(effectiveStart, i18n.language, SHORT),
          })}
        </span>
      )}

      <div className="ds-field">
        <span className="ds-label">
          {t('avg-label', { defaultValue: 'Average watched per day' })}
        </span>
        {s.mode === 'fit' ? (
          <div className="ds-card ds-stat">
            <div className="ds-stat-value">{formatMinutes(effectiveAvg)}</div>
            <div className="ds-hint">
              {t('avg-auto', {
                defaultValue: 'Calculated for you. Switch to “set my pace” to choose your own.',
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="ds-row">
              <label className="ds-row">
                <input
                  type="number"
                  className="ds-input ds-input--num"
                  min={0}
                  max={24}
                  value={hours}
                  onChange={(e) => setPace(Number(e.target.value) || 0, mins)}
                />
                <span>{t('unit-hours', { defaultValue: 'hours' })}</span>
              </label>
              <label className="ds-row">
                <input
                  type="number"
                  className="ds-input ds-input--num"
                  min={0}
                  max={59}
                  step={5}
                  value={mins}
                  onChange={(e) => setPace(hours, Number(e.target.value) || 0)}
                />
                <span>{t('unit-minutes', { defaultValue: 'minutes' })}</span>
              </label>
            </div>
            <input
              type="range"
              className="ds-range"
              min={15}
              max={480}
              step={5}
              value={Math.min(480, s.minutesPerDay)}
              aria-label={t('avg-label', { defaultValue: 'Average watched per day' })}
              aria-valuetext={formatMinutes(s.minutesPerDay)}
              onChange={(e) => actions.setSettings({ minutesPerDay: Number(e.target.value) })}
            />
          </>
        )}
      </div>

      <div className="ds-field">
        <span className="ds-label">{t('rhythm-label', { defaultValue: 'Weekly rhythm' })}</span>
        <Segmented
          wrap
          label={t('rhythm-label', { defaultValue: 'Weekly rhythm' })}
          value={rhythm}
          onChange={(r) => {
            if (r !== 'custom') actions.setSettings({ weekdayWeights: [...WEIGHT_PRESETS[r]] });
          }}
          options={[
            { value: 'even', label: t('rhythm-even', { defaultValue: 'Every day' }) },
            { value: 'weekends', label: t('rhythm-weekends', { defaultValue: 'Big weekends' }) },
            {
              value: 'weeknights',
              label: t('rhythm-weeknights', { defaultValue: 'Weeknights' }),
            },
            {
              value: 'weekendsOnly',
              label: t('rhythm-weekends-only', { defaultValue: 'Weekends only' }),
            },
            ...(rhythm === 'custom'
              ? [
                  {
                    value: 'custom' as const,
                    label: t('rhythm-custom', { defaultValue: 'Custom' }),
                  },
                ]
              : []),
          ]}
        />
        <div className="ds-weekdays">
          {s.weekdayWeights.map((w, i) => {
            const minutes = (effectiveAvg * 7 * w) / weightSum;
            return (
              <div key={dayNames[i]} className="ds-card ds-weekday">
                <strong>{dayNames[i]}</strong>
                <div className="ds-weekday-bar" aria-hidden="true">
                  <div className="ds-weekday-fill" style={{ height: `${(w / 4) * 100}%` }} />
                </div>
                <span className="ds-hint">
                  {w === 0 ? t('off', { defaultValue: 'off' }) : formatMinutes(minutes)}
                </span>
                <div className="ds-weekday-btns">
                  <button
                    type="button"
                    className="ds-mini-btn"
                    disabled={w <= 0}
                    onClick={() => setWeight(i, -0.5)}
                    aria-label={t('less-on', {
                      defaultValue: 'Less on {{day}}',
                      day: dayNames[i],
                    })}
                  >
                    <Minus size={12} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="ds-mini-btn"
                    disabled={w >= 4}
                    onClick={() => setWeight(i, 0.5)}
                    aria-label={t('more-on', {
                      defaultValue: 'More on {{day}}',
                      day: dayNames[i],
                    })}
                  >
                    <Plus size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <span className="ds-hint">
          {t('rhythm-hint', {
            defaultValue:
              'The average stays the same; the rhythm decides which days carry more of it.',
          })}
        </span>
      </div>

      <div className="ds-field">
        <span className="ds-label">{t('skip-label', { defaultValue: 'Days off' })}</span>
        <div className="ds-row">
          <input
            type="date"
            className="ds-input"
            value={skipDraft}
            min={effectiveStart}
            max={s.deadline}
            aria-label={t('skip-label', { defaultValue: 'Days off' })}
            onChange={(e) => setSkipDraft(e.target.value)}
          />
          <button
            type="button"
            className="ds-btn ds-btn--ghost ds-btn--sm"
            disabled={!skipDraft || s.skipDates.includes(skipDraft)}
            onClick={() => {
              actions.toggleSkip(skipDraft);
              setSkipDraft('');
            }}
          >
            <CalendarX2 size={14} aria-hidden="true" />
            {t('skip-add', { defaultValue: 'Add day off' })}
          </button>
        </div>
        {s.skipDates.length > 0 ? (
          <div className="ds-chips">
            {s.skipDates.map((d) => (
              <span key={d} className="ds-chip">
                {fmtDay(d, i18n.language, SHORT)}
                <button
                  type="button"
                  className="ds-mini-btn"
                  onClick={() => actions.toggleSkip(d)}
                  aria-label={t('skip-remove', {
                    defaultValue: 'Remove {{date}}',
                    date: fmtDay(d, i18n.language, SHORT),
                  })}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className="ds-hint">
            {t('skip-hint', {
              defaultValue: 'Travel, exams, a party? Days off get nothing scheduled.',
            })}
          </span>
        )}
      </div>

      <div className="ds-field">
        <label className="ds-label" htmlFor="ds-overrun">
          {t('overrun-label', {
            defaultValue: 'Let a night run long by up to {{pct}}%',
            pct: s.overrunPct,
          })}
        </label>
        <input
          id="ds-overrun"
          type="range"
          className="ds-range"
          min={0}
          max={100}
          step={5}
          value={s.overrunPct}
          onChange={(e) => actions.setSettings({ overrunPct: Number(e.target.value) })}
        />
        <span className="ds-hint">
          {t('overrun-hint', {
            defaultValue:
              'Higher means fewer cliffhangers split across nights, but some longer evenings.',
          })}
        </span>
      </div>

      <label className="ds-check">
        <input
          type="checkbox"
          checked={s.splitFilms}
          onChange={(e) => actions.setSettings({ splitFilms: e.target.checked })}
        />
        <span>
          {t('split-films', { defaultValue: 'Split long films across nights' })}
          <span className="ds-hint" style={{ display: 'block' }}>
            {t('split-films-hint', {
              defaultValue: 'Endgame in two sittings instead of one 3-hour night.',
            })}
          </span>
        </span>
      </label>

      <label className="ds-check">
        <input
          type="checkbox"
          checked={state.autoReplan}
          onChange={(e) => actions.set('autoReplan', e.target.checked)}
        />
        <span>
          {t('auto-replan', { defaultValue: 'Re-plan from today automatically' })}
          <span className="ds-hint" style={{ display: 'block' }}>
            {t('auto-replan-hint', {
              defaultValue:
                'Missed a night? The plan reshuffles what’s left across the days you have.',
            })}
          </span>
        </span>
      </label>

      <label className="ds-field">
        <span className="ds-label">
          {t('start-time', { defaultValue: 'Nightly start time (for calendar export)' })}
        </span>
        <input
          type="time"
          className="ds-input"
          style={{ maxWidth: 160 }}
          value={state.watchTime}
          onChange={(e) => e.target.value && actions.set('watchTime', e.target.value)}
        />
      </label>

      <div className="ds-field">
        <span className="ds-label">
          {t('presets-label', { defaultValue: 'Quick picks for the list' })}
        </span>
        <div className="ds-row">
          {(
            [
              ['default', t('preset-default', { defaultValue: 'Recommended' })],
              ['essentials', t('preset-essentials', { defaultValue: 'Essentials only' })],
              ['films', t('preset-films', { defaultValue: 'Films only' })],
              ['everything', t('preset-everything', { defaultValue: 'Absolutely everything' })],
            ] as [Preset, string][]
          ).map(([p, label]) => (
            <button
              key={p}
              type="button"
              className="ds-btn ds-btn--ghost ds-btn--sm"
              onClick={() => actions.preset(p)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="ds-row ds-no-print">
        <ConfirmButton
          label={t('reset-progress', { defaultValue: 'Clear watched' })}
          confirm={t('reset-progress-confirm', { defaultValue: 'Click again to clear' })}
          onConfirm={actions.resetProgress}
        />
        <ConfirmButton
          label={t('reset-all', { defaultValue: 'Start over' })}
          confirm={t('reset-all-confirm', { defaultValue: 'Click again to reset everything' })}
          onConfirm={actions.resetAll}
        />
      </div>
    </AeroWindow>
  );
}
