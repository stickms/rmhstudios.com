import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { SearchField } from '@/components/ui/search-field';
import { Select } from '@/components/ui/select';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { Q_MAX } from '../../../engine/search';
import { formatUtcDay } from '../../../engine/public-read';
import { milestoneDateWindow, type MilestoneType } from '../../../engine/tracker';
import { schoolsQuery } from '../../../medschools.queries';
import { useMedLabels } from '../../labels';
import { editDate, statusOf, writes, type EditMilestone, type EditRow, type Existing, type PickedSchool } from './model';

const MAX_MATCHES = 6;
const CHECKBOX = 'size-4 shrink-0 accent-site-text pointer-coarse:size-5';

/** A school the file named that the directory did not match: search the list and pick one. */
function SchoolPicker({ name, onPick }: { name: string; onPick: (school: PickedSchool) => void }) {
  const { t } = useTranslation('medschools');
  const schools = useQuery(schoolsQuery({ program: 'ALL' }));
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? (schools.data?.schools ?? [])
        .filter((s) => `${s.name} ${s.shortName} ${s.slug}`.toLowerCase().includes(needle))
        .slice(0, MAX_MATCHES)
    : [];
  return (
    <div className="mt-2">
      <SearchField
        containerClassName="max-w-96"
        aria-label={t('import-pick-search', { name, defaultValue: 'Pick the school for "{{name}}"' })}
        placeholder={t('import-pick-placeholder', { defaultValue: 'Search schools' })}
        maxLength={Q_MAX}
        value={q}
        onValueChange={setQ}
      />
      {needle && schools.data && matches.length === 0 ? (
        <p className="t-meta m-0 mt-2">{t('tracker-add-none', { defaultValue: 'No school matches.' })}</p>
      ) : null}
      <ul className="m-0 mt-1 list-none p-0">
        {matches.map((s) => (
          <li key={s.slug} className="border-b border-site-border last:border-b-0">
            <button
              type="button"
              className="flex min-h-11 w-full flex-col items-start justify-center py-2 text-start hover:bg-site-bg-subtle"
              onClick={() =>
                onPick({ slug: s.slug, name: s.name, shortName: s.shortName, degree: s.degree, state: s.state })
              }
            >
              <span className="t-body">{s.name}</span>
              <span className="t-meta">
                {t('index-school-meta', {
                  defaultValue: '{{degree}} · {{city}}, {{state}}',
                  degree: s.degree,
                  city: s.city,
                  state: s.state,
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MilestoneLine({
  row,
  m,
  existing,
  cycleYear,
  now,
  onChange,
}: {
  row: EditRow;
  m: EditMilestone;
  existing: Existing | undefined;
  cycleYear: number;
  now: Date;
  onChange: (next: Partial<EditMilestone>) => void;
}) {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  const { milestoneLabel } = useMedLabels();
  const status = statusOf(m, existing, cycleYear, now);
  const { min, max } = milestoneDateWindow(cycleYear, now);
  const label = milestoneLabel(m.type);
  const was = existing?.get(m.type);
  const school = row.school?.shortName ?? (row.schoolName || t('import-unrecognised-school', { defaultValue: 'Unrecognised school' }));
  const day = (d: string) => formatUtcDay(d, locale, { month: 'short', day: 'numeric', year: 'numeric' });

  // The line's tick: add a date that is new, replace one that differs. Same and invalid dates are not writable.
  let tick: { checked: boolean; text: string; set: (v: boolean) => void } | null = null;
  if (status === 'new') {
    tick = {
      checked: !m.skip,
      text: t('import-tick-add', { label, defaultValue: 'Add {{label}}' }),
      set: (v) => onChange({ skip: !v }),
    };
  } else if (status === 'conflict' && was !== undefined) {
    tick = {
      checked: m.replace,
      text: t('import-tick-replace', { label, defaultValue: 'Replace {{label}}' }),
      set: (v) => onChange({ replace: v }),
    };
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
      <label className="flex min-h-11 min-w-44 flex-1 items-center gap-2 sm:min-h-9 pointer-coarse:min-h-11">
        {tick ? (
          <input
            type="checkbox"
            className={CHECKBOX}
            checked={tick.checked && row.include}
            disabled={!row.include}
            aria-label={t('import-tick-label', {
              school,
              action: tick.text,
              defaultValue: '{{action}} for {{school}}',
            })}
            onChange={(e) => tick?.set(e.target.checked)}
          />
        ) : (
          <span className="size-4 shrink-0 pointer-coarse:size-5" aria-hidden="true" />
        )}
        <span className="t-body">{label}</span>
      </label>
      <Input
        type="date"
        min={min}
        max={max}
        value={m.date}
        disabled={!row.include}
        aria-label={t('import-date-label', { label, school, defaultValue: '{{label}} date for {{school}}' })}
        onChange={(e) => e.target.value && onChange({ date: e.target.value })}
        className="h-9 w-44 pointer-coarse:h-11"
      />
      <p className="t-meta m-0 basis-full ps-6 pointer-coarse:ps-7">
        {status === 'same'
          ? t('import-same', { defaultValue: 'Already on your tracker with this date.' })
          : status === 'conflict' && was !== undefined
            ? t('import-conflict', {
                date: day(was),
                defaultValue: 'Your tracker has {{date}}. Tick to replace it; unticked, it stays.',
              })
            : status === 'invalid'
              ? t('import-invalid', { defaultValue: 'This date is outside the cycle, so it will not be added.' })
              : null}
        {m.yearInferred && status !== 'invalid'
          ? ` ${t('import-year-inferred', {
              year: m.date.slice(0, 4),
              defaultValue: 'The file had no year; {{year}} was chosen. Check it.',
            })}`
          : ''}
        {m.ambiguous && status !== 'invalid'
          ? ` ${t('import-ambiguous', { defaultValue: 'Day and month could be the other way round. Check it.' })}`
          : ''}
      </p>
    </li>
  );
}

/**
 * The preview: one row on a rule per school, its program and each date, with what would happen to it. A date is new
 * (added unless unticked), the same (nothing to do), a conflict (kept unless ticked) or outside the cycle (never written).
 * A school the file named that did not match shows the name as written and a picker.
 */
export function ImportPreview({
  rows,
  existingOf,
  cycleYear,
  now,
  onRows,
}: {
  rows: readonly EditRow[];
  existingOf: (slug: string, program: 'REG' | 'PHD') => Existing | undefined;
  cycleYear: number;
  now: Date;
  onRows: (next: EditRow[]) => void;
}) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const patchRow = (key: string, patch: Partial<EditRow>) =>
    onRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const patchMilestone = (key: string, type: MilestoneType, patch: Partial<EditMilestone>) =>
    onRows(
      rows.map((r) =>
        r.key === key ? { ...r, milestones: r.milestones.map((m) => (m.type === type ? { ...m, ...patch } : m)) } : r,
      ),
    );

  return (
    <ul className="m-0 list-none border-t border-site-border p-0">
      {rows.map((r) => {
        const existing = r.school ? existingOf(r.school.slug, r.program) : undefined;
        const willWrite = r.milestones.filter((m) => writes(r, m, statusOf(m, existing, cycleYear, now))).length;
        return (
          <li key={r.key} className="border-b border-site-border py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <label className="flex min-h-11 min-w-48 flex-1 items-center gap-2 pointer-coarse:min-h-11">
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  checked={r.include}
                  disabled={!r.school}
                  aria-label={t('import-row-label', {
                    school: r.school?.name ?? (r.schoolName || t('import-unrecognised-school', { defaultValue: 'Unrecognised school' })),
                    defaultValue: 'Include {{school}}',
                  })}
                  onChange={(e) => patchRow(r.key, { include: e.target.checked })}
                />
                <span className="min-w-0">
                  <span className="t-body block">{r.school
                      ? r.school.name
                      : r.schoolName || t('import-unrecognised-school', { defaultValue: 'Unrecognised school' })}
                  </span>
                  <span className="t-meta block">
                    {r.school
                      ? t('import-row-meta', {
                          degree: r.school.degree,
                          state: r.school.state,
                          defaultValue: '{{degree}} · {{state}}',
                        })
                      : t('import-unmatched', { defaultValue: 'Could not match this school. Pick it below.' })}
                  </span>
                </span>
              </label>
              {r.school ? (
                <Select
                  controlSize="sm"
                  aria-label={t('program-select-label', { defaultValue: 'Program' })}
                  value={r.program}
                  disabled={!r.include}
                  onChange={(e) => patchRow(r.key, { program: e.target.value === 'PHD' ? 'PHD' : 'REG' })}
                >
                  <option value="REG">{programFilterLabel('REG', r.school.degree)}</option>
                  <option value="PHD">{programFilterLabel('PHD', r.school.degree)}</option>
                </Select>
              ) : null}
            </div>
            {!r.school ? (
              <SchoolPicker name={r.schoolName} onPick={(school) => patchRow(r.key, { school, include: true })} />
            ) : (
              <>
                <ul className="m-0 mt-1 list-none p-0 ps-6 pointer-coarse:ps-7">
                  {r.milestones.map((m) => (
                    <MilestoneLine
                      key={m.type}
                      row={r}
                      m={m}
                      existing={existing}
                      cycleYear={cycleYear}
                      now={now}
                      onChange={(next) =>
                        next.date !== undefined
                          ? onRows(editDate(rows, r.key, m.type, next.date))
                          : patchMilestone(r.key, m.type, next)
                      }
                    />
                  ))}
                </ul>
                {r.include && willWrite === 0 ? (
                  <p className="t-meta m-0 mt-1 ps-6 pointer-coarse:ps-7">
                    {t('import-row-nothing', { defaultValue: 'Nothing here will be added.' })}
                  </p>
                ) : null}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
