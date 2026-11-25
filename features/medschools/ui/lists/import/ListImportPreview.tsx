import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MedSelect } from '../../controls/MedSelect';
import { SchoolCrest } from '../../SchoolCrest';
import { useMedLabels } from '../../labels';
import { SchoolPicker } from '../../tracker/import/SchoolPicker';
import { asListProgram, pickSchool, rowStatuses, type ListEditRow, type ListRowStatus } from './model';

const CHECKBOX = 'medapp-check';
/** Under the row's words: the checkbox (20px, 24px on touch) and its 12px gap. */
const INDENT = 'ps-8 pointer-coarse:ps-9';

/**
 * The list import's preview (owner 2026-11-24): one row on a rule per school, in the file's order: the tick, the crest,
 * the school's name and `degree · state`, its program (either, MD or MD-PhD, DO or DO-PhD) and what will happen to it.
 * A name the server could not resolve to exactly one school shows the name as written, "Unrecognised school", and the
 * picker; it is unticked until a school is picked.
 */
export function ListImportPreview({
  rows,
  existing,
  onRows,
}: {
  rows: readonly ListEditRow[];
  /** `slug|program` of what the target list already holds (empty for a new list). */
  existing: ReadonlySet<string>;
  onRows: (next: ListEditRow[]) => void;
}) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const statuses = rowStatuses(rows, existing);
  const patch = (key: string, p: Partial<ListEditRow>) => onRows(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const unrecognised = t('lists-import-unrecognised', { defaultValue: 'Unrecognised school' });

  const note = (s: ListRowStatus): string | null => {
    switch (s) {
      case 'there':
        return t('lists-import-there-program', {
          defaultValue: 'Already on this list. Choose another program to add it again.',
        });
      case 'duplicate':
        return t('lists-import-duplicate', { defaultValue: 'Named twice in your file; added once.' });
      case 'unmatched':
        return t('lists-import-unmatched', { defaultValue: 'Could not match this name to one school. Pick it below.' });
      default:
        return null;
    }
  };

  return (
    <ul className="medapp-list">
      {rows.map((r, i) => {
        const status = statuses[i] ?? 'skip';
        const shown = r.school?.name ?? (r.schoolName || unrecognised);
        const line = note(status);
        return (
          <li key={r.key}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="flex min-h-11 min-w-0 flex-1 basis-56 items-center gap-3">
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  checked={r.include && status !== 'there' && r.school !== null}
                  disabled={!r.school || status === 'there'}
                  aria-label={t('lists-import-row-label', { school: shown, defaultValue: 'Add {{school}}' })}
                  onChange={(e) => patch(r.key, { include: e.target.checked })}
                />
                {r.school ? <SchoolCrest slug={r.school.slug} name={r.school.name} size={40} /> : null}
                <span className="min-w-0">
                  <span className="medapp-text block break-words">{r.school ? r.school.name : unrecognised}</span>
                  <span className="medapp-meta block break-words">
                    {r.school
                      ? t('lists-import-row-meta', {
                          degree: r.school.degree,
                          state: r.school.state,
                          defaultValue: '{{degree}} · {{state}}',
                        })
                      : t('lists-import-written', { name: r.schoolName, defaultValue: 'Your file says "{{name}}"' })}
                  </span>
                </span>
              </label>
              {r.school ? (
                <div className={cn('w-full sm:w-auto', INDENT, 'sm:ps-0')}>
                  <MedSelect
                    className="w-full max-w-56 sm:w-44"
                    aria-label={t('lists-import-program-label', {
                      school: r.school.name,
                      defaultValue: 'Program for {{school}}',
                    })}
                    value={r.program}
                    onChange={(e) => patch(r.key, { program: asListProgram(e.target.value) })}
                  >
                    <option value="ANY">{t('program-either', { defaultValue: 'Either program' })}</option>
                    <option value="REG">{programFilterLabel('REG', r.school.degree)}</option>
                    <option value="PHD">{programFilterLabel('PHD', r.school.degree)}</option>
                  </MedSelect>
                </div>
              ) : null}
            </div>
            {line ? <p className={cn('medapp-meta mt-1', INDENT)}>{line}</p> : null}
            {!r.school ? (
              <div className={INDENT}>
                <SchoolPicker name={r.schoolName} onPick={(school) => onRows(pickSchool(rows, r.key, school))} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
