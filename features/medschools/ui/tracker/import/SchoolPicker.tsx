import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MedSearch } from '../../controls/MedSearch';
import { Q_MAX } from '../../../engine/search';
import { schoolsQuery } from '../../../medschools.queries';
import type { PickedSchool } from './model';

const MAX_MATCHES = 6;

/**
 * A school a file named that the directory did not match: search the list and pick one. Shared by the tracker import's
 * preview and the list import's (owner 2026-11-24).
 */
export function SchoolPicker({ name, onPick }: { name: string; onPick: (school: PickedSchool) => void }) {
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
      <MedSearch
        containerClassName="max-w-96"
        aria-label={t('import-pick-search', { name, defaultValue: 'Pick the school for "{{name}}"' })}
        placeholder={t('import-pick-placeholder', { defaultValue: 'Search schools' })}
        maxLength={Q_MAX}
        value={q}
        onValueChange={setQ}
      />
      {needle && schools.data && matches.length === 0 ? (
        <p className="medapp-meta mt-2">{t('tracker-add-none', { defaultValue: 'No school matches.' })}</p>
      ) : null}
      <ul className="medapp-list mt-1">
        {matches.map((s) => (
          <li key={s.slug} className="medapp-list__pick">
            <button
              type="button"
              className="medapp-pick"
              onClick={() =>
                onPick({ slug: s.slug, name: s.name, shortName: s.shortName, degree: s.degree, state: s.state })
              }
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
    </div>
  );
}
