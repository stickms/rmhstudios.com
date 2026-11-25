import { useId, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  GRADUATE_TYPES,
  HOURS_CATEGORIES,
  MISSIONS,
  POSTBACC_TYPES,
  STATS_LIMITS,
  type HoursCategory,
  type Mission,
} from '../../engine/applicant';
import { HOME_STATE_CODES } from '../../engine/tracker';
import { stateNameOf } from '../../engine/state-names';
import { MedButton } from '../controls/MedButton';
import { MedIconButton } from '../controls/MedIconButton';
import { MedInput, MedTextarea } from '../controls/MedField';
import { MedSelect } from '../controls/MedSelect';
import { EMPTY_ACTIVITY, EMPTY_ATTEMPT, type DraftProblem, type StatsDraft } from './draft';

export type StatsStep = 'mcat' | 'gpa' | 'hours' | 'about';
export const STATS_STEPS: readonly StatsStep[] = ['mcat', 'gpa', 'hours', 'about'];

export interface SectionProps {
  draft: StatsDraft;
  problems: Record<string, DraftProblem>;
  disabled: boolean;
  onChange: (next: StatsDraft) => void;
}

export function useStatsText() {
  const { t } = useTranslation('medschools');
  const stepTitle = (s: StatsStep): string => {
    switch (s) {
      case 'mcat':
        return t('stats-mcat-heading', { defaultValue: 'MCAT' });
      case 'gpa':
        return t('stats-gpa-heading', { defaultValue: 'GPA' });
      case 'hours':
        return t('stats-hours-heading', { defaultValue: 'Hours' });
      default:
        return t('stats-about-heading', { defaultValue: 'About you' });
    }
  };
  const problem = (p: DraftProblem | undefined): string | null => {
    switch (p) {
      case undefined:
        return null;
      case 'date':
        return t('stats-problem-date', { defaultValue: 'Give the month of the test.' });
      case 'section':
        return t('stats-problem-section', { defaultValue: 'Each section score is 118 to 132.' });
      case 'total':
        return t('stats-problem-total', { defaultValue: 'A total is 472 to 528.' });
      case 'sum':
        return t('stats-problem-sum', { defaultValue: 'The total is not the sum of the four sections.' });
      case 'empty':
        return t('stats-problem-empty', { defaultValue: 'Give the total, or all four section scores.' });
      case 'gpa':
        return t('stats-problem-gpa', { defaultValue: 'A GPA is 0.00 to 4.00.' });
      case 'title':
        return t('stats-problem-title', { defaultValue: 'Give each activity a name.' });
      default:
        return t('stats-problem-number', { defaultValue: 'Use a whole number.' });
    }
  };
  const hoursLabel = (c: HoursCategory): string => {
    switch (c) {
      case 'CLINICAL':
        return t('stats-hours-clinical', { defaultValue: 'Clinical' });
      case 'RESEARCH':
        return t('stats-hours-research', { defaultValue: 'Research' });
      case 'VOLUNTEER_CLINICAL':
        return t('stats-hours-volunteer-clinical', { defaultValue: 'Volunteering, clinical' });
      case 'VOLUNTEER_NONCLINICAL':
        return t('stats-hours-volunteer-nonclinical', { defaultValue: 'Volunteering, non-clinical' });
      case 'SHADOWING':
        return t('stats-hours-shadowing', { defaultValue: 'Shadowing' });
      case 'LEADERSHIP':
        return t('stats-hours-leadership', { defaultValue: 'Leadership' });
      default:
        return t('stats-hours-teaching', { defaultValue: 'Teaching' });
    }
  };
  const missionLabel = (m: Mission): string => {
    switch (m) {
      case 'research':
        return t('stats-mission-research', { defaultValue: 'Research' });
      case 'primary-care':
        return t('stats-mission-primary-care', { defaultValue: 'Primary care' });
      case 'rural':
        return t('stats-mission-rural', { defaultValue: 'Rural' });
      case 'underserved':
        return t('stats-mission-underserved', { defaultValue: 'Underserved' });
      case 'urban':
        return t('stats-mission-urban', { defaultValue: 'Urban' });
      case 'global-health':
        return t('stats-mission-global-health', { defaultValue: 'Global health' });
      case 'public-health':
        return t('stats-mission-public-health', { defaultValue: 'Public health' });
      default:
        return t('stats-mission-academic', { defaultValue: 'Academic medicine' });
    }
  };
  return { stepTitle, problem, hoursLabel, missionLabel };
}

function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="medapp-fieldset">
      <label className="medapp-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <span className="medapp-meta">{hint}</span> : null}
    </div>
  );
}

const numeric = { inputMode: 'numeric' as const, autoComplete: 'off' };
const decimal = { inputMode: 'decimal' as const, autoComplete: 'off' };

export function McatSection({ draft, problems, disabled, onChange }: SectionProps) {
  const { t } = useTranslation('medschools');
  const { problem } = useStatsText();
  const id = useId();
  const set = (i: number, key: keyof (typeof draft.mcat)[number], v: string) =>
    onChange({ ...draft, mcat: draft.mcat.map((a, k) => (k === i ? { ...a, [key]: v } : a)) });
  const sections = [
    ['cpbs', t('stats-mcat-cpbs', { defaultValue: 'Chem/Phys' })],
    ['cars', t('stats-mcat-cars', { defaultValue: 'CARS' })],
    ['bbls', t('stats-mcat-bbls', { defaultValue: 'Bio/Biochem' })],
    ['psbb', t('stats-mcat-psbb', { defaultValue: 'Psych/Soc' })],
  ] as const;
  return (
    <div className="medapp-stats__body">
      <p className="medapp-meta">
        {t('stats-mcat-help', {
          defaultValue: 'One row per attempt. A total alone is fine; with all four sections the total is their sum.',
        })}
      </p>
      {draft.mcat.map((a, i) => {
        const err = problem(problems[`mcat.${i}`]);
        return (
          <fieldset key={i} className="medapp-stats__attempt" aria-describedby={err ? `${id}-${i}-err` : undefined}>
            <legend className="medapp-label">
              {t('stats-mcat-attempt', { defaultValue: 'Attempt {{n}}', n: String(i + 1) })}
            </legend>
            <div className="medapp-stats__grid">
              <Field label={t('stats-mcat-month', { defaultValue: 'Month' })} htmlFor={`${id}-${i}-month`}>
                <MedInput
                  id={`${id}-${i}-month`}
                  type="month"
                  min="2010-01"
                  value={a.month}
                  disabled={disabled}
                  onChange={(e) => set(i, 'month', e.target.value)}
                />
              </Field>
              <Field label={t('stats-mcat-day', { defaultValue: 'Day (optional)' })} htmlFor={`${id}-${i}-day`}>
                <MedInput
                  id={`${id}-${i}-day`}
                  {...numeric}
                  maxLength={2}
                  value={a.day}
                  disabled={disabled}
                  onChange={(e) => set(i, 'day', e.target.value)}
                />
              </Field>
              <Field label={t('stats-mcat-total', { defaultValue: 'Total' })} htmlFor={`${id}-${i}-total`}>
                <MedInput
                  id={`${id}-${i}-total`}
                  {...numeric}
                  maxLength={3}
                  placeholder="472–528"
                  value={a.total}
                  disabled={disabled}
                  onChange={(e) => set(i, 'total', e.target.value)}
                />
              </Field>
              {sections.map(([key, label]) => (
                <Field key={key} label={label} htmlFor={`${id}-${i}-${key}`}>
                  <MedInput
                    id={`${id}-${i}-${key}`}
                    {...numeric}
                    maxLength={3}
                    placeholder="118–132"
                    value={a[key]}
                    disabled={disabled}
                    onChange={(e) => set(i, key, e.target.value)}
                  />
                </Field>
              ))}
            </div>
            <div className="medapp-stats__rowend">
              {err ? (
                <p id={`${id}-${i}-err`} className="medapp-meta medapp-stats__err" role="alert">
                  {err}
                </p>
              ) : null}
              <MedButton
                variant="tertiary"
                disabled={disabled}
                onClick={() => onChange({ ...draft, mcat: draft.mcat.filter((_, k) => k !== i) })}
              >
                <Trash2 aria-hidden="true" className="size-4" />
                {t('stats-mcat-remove', { defaultValue: 'Remove attempt' })}
              </MedButton>
            </div>
          </fieldset>
        );
      })}
      <div>
        <MedButton
          disabled={disabled || draft.mcat.length >= STATS_LIMITS.attempts}
          onClick={() => onChange({ ...draft, mcat: [...draft.mcat, { ...EMPTY_ATTEMPT }] })}
        >
          <Plus aria-hidden="true" className="size-4" />
          {draft.mcat.length === 0
            ? t('stats-mcat-add-first', { defaultValue: 'Add an MCAT score' })
            : t('stats-mcat-add', { defaultValue: 'Add another attempt' })}
        </MedButton>
      </div>
    </div>
  );
}

export function GpaSection({ draft, problems, disabled, onChange }: SectionProps) {
  const { t } = useTranslation('medschools');
  const { problem } = useStatsText();
  const id = useId();
  const set = (key: keyof StatsDraft['gpa'], v: string) => onChange({ ...draft, gpa: { ...draft.gpa, [key]: v } });
  const gpaField = (key: 'cumulative' | 'science' | 'postbacc' | 'graduate', label: string) => {
    const err = problem(problems[`gpa.${key}`]);
    return (
      <Field label={label} htmlFor={`${id}-${key}`} {...(err ? { hint: err } : {})}>
        <MedInput
          id={`${id}-${key}`}
          {...decimal}
          maxLength={4}
          placeholder="0.00–4.00"
          value={draft.gpa[key]}
          disabled={disabled}
          aria-invalid={err ? true : undefined}
          onChange={(e) => set(key, e.target.value)}
        />
      </Field>
    );
  };
  return (
    <div className="medapp-stats__body">
      <div className="medapp-fields">
        {gpaField('cumulative', t('stats-gpa-cumulative', { defaultValue: 'Cumulative GPA' }))}
        {gpaField('science', t('stats-gpa-science', { defaultValue: 'Science GPA (BCPM)' }))}
      </div>
      <div className="medapp-fields">
        {gpaField('postbacc', t('stats-gpa-postbacc', { defaultValue: 'Post-bacc GPA' }))}
        <Field label={t('stats-gpa-postbacc-type', { defaultValue: 'Post-bacc type' })} htmlFor={`${id}-pbtype`}>
          <MedSelect
            id={`${id}-pbtype`}
            value={draft.gpa.postbaccType}
            disabled={disabled}
            onChange={(e) => set('postbaccType', e.target.value)}
          >
            <option value="">{t('stats-not-set', { defaultValue: 'Not set' })}</option>
            {POSTBACC_TYPES.map((p) => (
              <option key={p} value={p}>
                {p === 'FORMAL'
                  ? t('stats-postbacc-formal', { defaultValue: 'Formal program' })
                  : t('stats-postbacc-informal', { defaultValue: 'Informal (DIY)' })}
              </option>
            ))}
          </MedSelect>
        </Field>
      </div>
      <div className="medapp-fields">
        {gpaField('graduate', t('stats-gpa-graduate', { defaultValue: 'SMP or graduate GPA' }))}
        <Field label={t('stats-gpa-graduate-type', { defaultValue: 'Program type' })} htmlFor={`${id}-gtype`}>
          <MedSelect
            id={`${id}-gtype`}
            value={draft.gpa.graduateType}
            disabled={disabled}
            onChange={(e) => set('graduateType', e.target.value)}
          >
            <option value="">{t('stats-not-set', { defaultValue: 'Not set' })}</option>
            {GRADUATE_TYPES.map((p) => (
              <option key={p} value={p}>
                {p === 'SMP'
                  ? t('stats-graduate-smp', { defaultValue: 'Special master’s (SMP)' })
                  : p === 'MASTERS'
                    ? t('stats-graduate-masters', { defaultValue: 'Other master’s' })
                    : t('stats-graduate-other', { defaultValue: 'Other' })}
              </option>
            ))}
          </MedSelect>
        </Field>
      </div>
    </div>
  );
}

export function HoursSection({ draft, problems, disabled, onChange }: SectionProps) {
  const { t } = useTranslation('medschools');
  const { problem, hoursLabel } = useStatsText();
  const id = useId();
  const setRow = (c: HoursCategory, next: Partial<StatsDraft['hours'][HoursCategory]>) =>
    onChange({ ...draft, hours: { ...draft.hours, [c]: { ...draft.hours[c], ...next } } });
  return (
    <div className="medapp-stats__body">
      <p className="medapp-meta">
        {t('stats-hours-help', { defaultValue: 'A number for each is enough. Details are optional.' })}
      </p>
      <div className="medapp-rows">
        {HOURS_CATEGORIES.map((c) => {
          const row = draft.hours[c];
          const err = problem(problems[`hours.${c}`]);
          const detailed = row.note.trim() !== '' || row.activities.length > 0;
          return (
            <div key={c} className="medapp-item">
              <div className="medapp-stats__hours">
                <label className="medapp-label" htmlFor={`${id}-${c}`}>
                  {hoursLabel(c)}
                </label>
                <MedInput
                  id={`${id}-${c}`}
                  {...numeric}
                  maxLength={5}
                  className="medapp-stats__num"
                  value={row.hours}
                  disabled={disabled}
                  aria-invalid={err ? true : undefined}
                  onChange={(e) => setRow(c, { hours: e.target.value })}
                />
              </div>
              {err ? (
                <p className="medapp-meta medapp-stats__err" role="alert">
                  {err}
                </p>
              ) : null}
              <details className="medapp-more" open={detailed || undefined}>
                <summary>{t('stats-hours-details', { defaultValue: 'Add details' })}</summary>
                <div className="medapp-stats__details">
                  <Field label={t('stats-hours-note', { defaultValue: 'Note' })} htmlFor={`${id}-${c}-note`}>
                    <MedTextarea
                      id={`${id}-${c}-note`}
                      rows={2}
                      maxLength={STATS_LIMITS.note}
                      value={row.note}
                      disabled={disabled}
                      onChange={(e) => setRow(c, { note: e.target.value })}
                    />
                  </Field>
                  {row.activities.map((a, k) => (
                    <div key={k} className="medapp-stats__activity">
                      <Field
                        label={t('stats-activity-title', { defaultValue: 'Activity' })}
                        htmlFor={`${id}-${c}-${k}-title`}
                      >
                        <MedInput
                          id={`${id}-${c}-${k}-title`}
                          maxLength={STATS_LIMITS.title}
                          value={a.title}
                          disabled={disabled}
                          onChange={(e) =>
                            setRow(c, {
                              activities: row.activities.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)),
                            })
                          }
                        />
                      </Field>
                      <Field
                        label={t('stats-activity-hours', { defaultValue: 'Hours' })}
                        htmlFor={`${id}-${c}-${k}-hours`}
                      >
                        <MedInput
                          id={`${id}-${c}-${k}-hours`}
                          {...numeric}
                          maxLength={5}
                          value={a.hours}
                          disabled={disabled}
                          onChange={(e) =>
                            setRow(c, {
                              activities: row.activities.map((x, j) => (j === k ? { ...x, hours: e.target.value } : x)),
                            })
                          }
                        />
                      </Field>
                      <MedIconButton
                        icon={Trash2}
                        label={t('stats-activity-remove', { defaultValue: 'Remove activity' })}
                        disabled={disabled}
                        onClick={() => setRow(c, { activities: row.activities.filter((_, j) => j !== k) })}
                      />
                    </div>
                  ))}
                  <div>
                    <MedButton
                      variant="tertiary"
                      disabled={disabled || row.activities.length >= STATS_LIMITS.activitiesPerCategory}
                      onClick={() => setRow(c, { activities: [...row.activities, { ...EMPTY_ACTIVITY }] })}
                    >
                      <Plus aria-hidden="true" className="size-4" />
                      {t('stats-activity-add', { defaultValue: 'Add an activity' })}
                    </MedButton>
                  </div>
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AboutSection({ draft, problems, disabled, onChange }: SectionProps) {
  const { t } = useTranslation('medschools');
  const { problem, missionLabel } = useStatsText();
  const id = useId();
  const toggle = (m: Mission) =>
    onChange({
      ...draft,
      missions: draft.missions.includes(m) ? draft.missions.filter((x) => x !== m) : [...draft.missions, m],
    });
  return (
    <div className="medapp-stats__body">
      <div className="medapp-fields">
        <Field
          label={t('stats-home-state', { defaultValue: 'State of residence' })}
          hint={t('stats-home-state-hint', { defaultValue: 'The same as your home-state preference.' })}
          htmlFor={`${id}-home`}
        >
          <MedSelect
            id={`${id}-home`}
            value={draft.homeState}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, homeState: e.target.value })}
          >
            <option value="">{t('stats-not-set', { defaultValue: 'Not set' })}</option>
            {HOME_STATE_CODES.map((c) => (
              <option key={c} value={c}>
                {`${stateNameOf(c)} (${c})`}
              </option>
            ))}
          </MedSelect>
        </Field>
      </div>
      <div className="medapp-fieldset">
        <span className="medapp-label" id={`${id}-missions`}>
          {t('stats-missions', { defaultValue: 'Mission interests (optional)' })}
        </span>
        <div className="medapp-stats__chips" role="group" aria-labelledby={`${id}-missions`}>
          {MISSIONS.map((m) => (
            <button
              key={m}
              type="button"
              className="medapp-chip"
              aria-pressed={draft.missions.includes(m)}
              disabled={disabled}
              onClick={() => toggle(m)}
            >
              {missionLabel(m)}
            </button>
          ))}
        </div>
      </div>
      <div className="medapp-fields">
        {(['publications', 'presentations'] as const).map((key) => {
          const err = problem(problems[`count.${key}`]);
          return (
            <Field
              key={key}
              label={
                key === 'publications'
                  ? t('stats-publications', { defaultValue: 'Publications' })
                  : t('stats-presentations', { defaultValue: 'Posters and presentations' })
              }
              htmlFor={`${id}-${key}`}
              {...(err ? { hint: err } : {})}
            >
              <MedInput
                id={`${id}-${key}`}
                {...numeric}
                maxLength={3}
                value={draft[key]}
                disabled={disabled}
                aria-invalid={err ? true : undefined}
                onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
              />
            </Field>
          );
        })}
      </div>
    </div>
  );
}
