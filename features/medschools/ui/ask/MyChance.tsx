import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ChanceDto } from '../../medschools.contract';
import { ChanceLine } from '../tracker/ChanceLine';

/**
 * The member's own invite-timing estimate, beside the answer and never part of it: the model did not see it. It is
 * rendered even when the answer is thin. `[]` is "no application at this school", which links to the tracker.
 */
export function MyChance({ mine }: { mine: readonly ChanceDto[] }) {
  const { t } = useTranslation('medschools');
  const shown = mine.filter((c) => c.status !== 'closed');
  // The program only tells two applications at one school apart.
  const programLabel = (program: ChanceDto['program']): string =>
    program === 'PHD'
      ? t('ask-mine-phd', { defaultValue: 'Combined degree' })
      : t('ask-mine-reg', { defaultValue: 'Regular' });
  const rowLabel = (c: ChanceDto): string =>
    shown.filter((o) => o.school.slug === c.school.slug).length > 1
      ? t('ask-mine-school-program', {
          defaultValue: '{{school}} · {{program}}',
          school: c.school.shortName,
          program: programLabel(c.program),
        })
      : c.school.shortName;
  return (
    <section className="mt-6" aria-labelledby="ask-mine-heading">
      <h3 id="ask-mine-heading" className="medapp-h3">
        {t('ask-mine-heading', { defaultValue: 'Your estimate' })}
      </h3>
      {shown.length === 0 ? (
        <p className="medapp-text mt-2">
          {t('ask-mine-none', { defaultValue: 'You have no open application at this school.' })}{' '}
          <Link to="/med/tracker" className="medapp-link">
            {t('ask-mine-add', { defaultValue: 'Add this school to your tracker' })}
          </Link>
        </p>
      ) : (
        shown.map((c) => (
          <div key={c.applicationId} className="mt-2">
            <p className="medapp-label">{rowLabel(c)}</p>
            <ChanceLine chance={c} />
          </div>
        ))
      )}
    </section>
  );
}
