import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { Select } from '@/components/ui/select';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Q_MAX } from '../../engine/search';
import type { MedSchoolListItemDto } from '../../medschools.contract';
import { schoolsQuery } from '../../medschools.queries';
import { useMedLabels } from '../labels';

const MAX_MATCHES = 8;

/**
 * Add a school to the cycle: search the public school list (already cached by the index page), pick one, choose the
 * program by that school's degree (REG reads "MD" or "DO", PHD "MD-PhD" or "DO-PhD"; spec 4a), add. A duplicate or a
 * full cycle is the server's 409, shown as a `t-meta` line.
 */
export function AddSchool({
  onAdd,
  onCancel,
}: {
  /** Rejects with the server's refusal. */
  onAdd: (school: MedSchoolListItemDto, program: 'REG' | 'PHD') => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const refusal = useRefusalText();
  const schools = useQuery(schoolsQuery({ program: 'ALL' }));
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<MedSchoolListItemDto | null>(null);
  const [program, setProgram] = useState<'REG' | 'PHD'>('REG');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needle = q.trim().toLowerCase();
  const matches = needle
    ? (schools.data?.schools ?? [])
        .filter((s) => `${s.name} ${s.shortName} ${s.slug}`.toLowerCase().includes(needle))
        .slice(0, MAX_MATCHES)
    : [];

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(picked, program);
    } catch (e) {
      setError(refusal(e));
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-site-border py-4">
      {picked ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-44 flex-1">
            <p className="t-body m-0">{picked.name}</p>
            <p className="t-meta m-0">
              {t('index-school-meta', {
                defaultValue: '{{degree}} · {{city}}, {{state}}',
                degree: picked.degree,
                city: picked.city,
                state: picked.state,
              })}
            </p>
          </div>
          <Select
            controlSize="sm"
            aria-label={t('program-select-label', { defaultValue: 'Program' })}
            value={program}
            disabled={busy}
            onChange={(e) => setProgram(e.target.value === 'PHD' ? 'PHD' : 'REG')}
          >
            <option value="REG">{programFilterLabel('REG', picked.degree)}</option>
            <option value="PHD">{programFilterLabel('PHD', picked.degree)}</option>
          </Select>
          <Button loading={busy} onClick={() => void submit()}>
            {t('tracker-add-confirm', { defaultValue: 'Add' })}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setPicked(null)}>
            {t('tracker-add-change', { defaultValue: 'Change school' })}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              containerClassName="min-w-48 flex-1"
              aria-label={t('tracker-add-search', { defaultValue: 'Search schools to add' })}
              placeholder={t('tracker-add-search', { defaultValue: 'Search schools to add' })}
              maxLength={Q_MAX}
              value={q}
              onValueChange={setQ}
              autoFocus
            />
            <Button variant="ghost" onClick={onCancel}>
              {t('tracker-cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
          {needle && schools.data && matches.length === 0 ? (
            <p className="t-meta m-0 mt-3">{t('tracker-add-none', { defaultValue: 'No school matches.' })}</p>
          ) : null}
          <ul className="m-0 mt-2 list-none p-0">
            {matches.map((s) => (
              <li key={s.slug} className="border-b border-site-border last:border-b-0">
                <button
                  type="button"
                  className="flex min-h-11 w-full flex-col items-start justify-center py-2 text-start hover:bg-site-bg-subtle"
                  onClick={() => {
                    setPicked(s);
                    setProgram('REG');
                    setError(null);
                  }}
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
        </>
      )}
      {error ? (
        <p className="t-meta m-0 mt-3" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
