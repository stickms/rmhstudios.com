import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MedSecondaryOverlapGroupDto, MedSecondaryOverlapRes } from '../../medschools.contract';
import type { SecondaryLabels } from './labels';

/**
 * The pre-write overlap: a member's schools' prompts grouped by theme, so one essay can be drafted for several schools.
 * Presentational: the caller owns the query and the open state, and passes how a school is linked. Groups asked by two or
 * more schools lead; those asked by one school sit in a collapsed list. Nothing here takes input: no draft is stored.
 */
export function OverlapView({
  data,
  labels,
  school,
}: {
  data: MedSecondaryOverlapRes;
  labels: SecondaryLabels;
  /** The school's name as a link to its Secondaries tab for this program. */
  school: (slug: string, program: 'REG' | 'PHD', name: string) => ReactNode;
}) {
  const { t } = useTranslation('medschools');
  const shared = data.groups.filter((g) => g.schools >= 2);
  const single = data.groups.filter((g) => g.schools < 2);
  if (data.groups.length === 0 && data.withoutPrompts.length === 0) {
    return (
      <p className="medapp-meta">
        {data.schoolCount === 0
          ? t('overlap-empty', { defaultValue: 'Add schools to see their prompts grouped by theme.' })
          : t('overlap-empty-prompts', { defaultValue: 'None of these schools has prompts on file yet.' })}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {shared.map((g) => (
        <Group key={g.theme} group={g} labels={labels} school={school} />
      ))}
      {single.length > 0 ? (
        <details className="medapp-disclosure">
          <summary>{t('overlap-single', { defaultValue: 'Asked by one school' })}</summary>
          <div className="flex flex-col gap-6 pt-2">
            {single.map((g) => (
              <Group key={g.theme} group={g} labels={labels} school={school} />
            ))}
          </div>
        </details>
      ) : null}
      {data.withoutPrompts.length > 0 ? (
        <p className="medapp-meta">
          {t('overlap-none-found', {
            defaultValue: 'No prompts found yet: {{names}}',
            names: data.withoutPrompts.map((s) => s.name).join(', '),
          })}
        </p>
      ) : null}
    </div>
  );
}

function Group({
  group,
  labels,
  school,
}: {
  group: MedSecondaryOverlapGroupDto;
  labels: SecondaryLabels;
  school: (slug: string, program: 'REG' | 'PHD', name: string) => ReactNode;
}) {
  const { t } = useTranslation('medschools');
  return (
    <section className="medapp-section">
      <h3 className="medapp-h3">
        {t('overlap-group', {
          defaultValue: '{{theme}} · {{schools}}',
          theme: labels.theme(group.theme),
          schools: t('overlap-schools', {
            count: group.schools,
            defaultValue_one: '{{count}} school',
            defaultValue_other: '{{count}} schools',
            defaultValue: '{{count}} schools',
          }),
        })}
      </h3>
      {group.shortestWords !== null && group.schools >= 2 ? (
        <p className="medapp-meta">
          {t('overlap-shortest', {
            defaultValue: 'Shortest limit: {{limit}}. Writing to that limit covers all {{n}}.',
            limit: labels.limit({ kind: 'WORDS', value: group.shortestWords }),
            n: group.schools,
          })}
        </p>
      ) : null}
      <ul className="medapp-list">
        {group.entries.map((e) => (
          <li key={`${e.slug}-${e.promptId}`} className="flex flex-col gap-1">
            <p className="medapp-text font-medium">{school(e.slug, e.program, e.schoolName)}</p>
            <p className="medapp-text break-words">{e.text}</p>
            <p className="medapp-meta flex flex-wrap gap-x-3">
              {e.limit ? <span className="font-mono">{labels.limit(e.limit)}</span> : null}
              {e.optional ? <span>{labels.optional}</span> : null}
              {e.basis === 'last-cycle' ? (
                <span>{t('overlap-last-cycle', { defaultValue: 'From last cycle' })}</span>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
