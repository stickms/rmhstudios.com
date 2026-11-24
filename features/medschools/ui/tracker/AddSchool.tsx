import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MedButton } from '../controls/MedButton';
import { MedIconButton } from '../controls/MedIconButton';
import { X } from 'lucide-react';
import { MedSearch } from '../controls/MedSearch';
import { MedSelect } from '../controls/MedSelect';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Q_MAX } from '../../engine/search';
import type { MedSchoolListItemDto } from '../../medschools.contract';
import { schoolsQuery } from '../../medschools.queries';
import { useMedLabels } from '../labels';

const MAX_MATCHES = 8;

/**
 * Add a school to the cycle: search the public school list (already cached by the index page), pick one, choose the
 * program by that school's degree (REG reads "MD" or "DO", PHD "MD-PhD" or "DO-PhD"; spec 4a), add. A duplicate or a
 * full cycle is the server's 409, shown as a `medapp-meta` line.
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
    <div className="medapp-panel medapp-panel--padded">
      {picked ? (
        <div className="medapp-stack">
          <div>
            <p className="medapp-name">{picked.name}</p>
            <p className="medapp-meta">
              {t('index-school-meta', {
                defaultValue: '{{degree}} · {{city}}, {{state}}',
                degree: picked.degree,
                city: picked.city,
                state: picked.state,
              })}
            </p>
          </div>
          <div className="medapp-form mt-2">
            <label className="medapp-fieldset">
              <span className="medapp-label">{t('program-select-label', { defaultValue: 'Program' })}</span>
              <MedSelect
                aria-label={t('program-select-label', { defaultValue: 'Program' })}
                value={program}
                disabled={busy}
                onChange={(e) => setProgram(e.target.value === 'PHD' ? 'PHD' : 'REG')}
              >
                <option value="REG">{programFilterLabel('REG', picked.degree)}</option>
                <option value="PHD">{programFilterLabel('PHD', picked.degree)}</option>
              </MedSelect>
            </label>
            <div className="medapp-actions">
              <MedButton variant="primary" loading={busy} onClick={() => void submit()}>
                {t('tracker-add-confirm', { defaultValue: 'Add' })}
              </MedButton>
              <MedButton variant="tertiary" disabled={busy} onClick={() => setPicked(null)}>
                {t('tracker-add-change', { defaultValue: 'Change school' })}
              </MedButton>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="medapp-head">
            <MedSearch
              containerClassName="min-w-0 flex-1"
              aria-label={t('tracker-add-search', { defaultValue: 'Search schools to add' })}
              placeholder={t('tracker-add-search', { defaultValue: 'Search schools to add' })}
              maxLength={Q_MAX}
              value={q}
              onValueChange={setQ}
              autoFocus
            />
            <MedIconButton icon={X} label={t('tracker-cancel', { defaultValue: 'Cancel' })} onClick={onCancel} />
          </div>
          {needle && schools.data && matches.length === 0 ? (
            <p className="medapp-meta mt-3">{t('tracker-add-none', { defaultValue: 'No school matches.' })}</p>
          ) : null}
          <ul className="medapp-list mt-2">
            {matches.map((s) => (
              <li key={s.slug} className="medapp-list__pick">
                <button
                  type="button"
                  className="medapp-pick"
                  onClick={() => {
                    setPicked(s);
                    setProgram('REG');
                    setError(null);
                  }}
                >
                  <span className="medapp-text">{s.name}</span>
                  <span className="medapp-meta">
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
        <p className="medapp-meta mt-3" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
