import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ChanceDto } from '../../medschools.contract';
import { useMedLabels } from '../labels';
import { ChanceLine } from '../tracker/ChanceLine';

/**
 * The member's own invite-timing estimate, beside the answer and never part of it: the model did not see it. It is
 * rendered even when the answer is thin. `[]` is "no application at this school", which links to the tracker.
 */
export function MyChance({ mine }: { mine: readonly ChanceDto[] }) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const shown = mine.filter((c) => c.status !== 'closed');
  return (
    <section className="mt-6" aria-labelledby="ask-mine-heading">
      <h3 id="ask-mine-heading" className="t-heading m-0">
        {t('ask-mine-heading', { defaultValue: 'Your estimate' })}
      </h3>
      {shown.length === 0 ? (
        <p className="t-body m-0 mt-2">
          {t('ask-mine-none', { defaultValue: 'You have no open application at this school.' })}{' '}
          <Link to="/rmh-medschool/tracker" className="underline">
            {t('ask-mine-add', { defaultValue: 'Add this school to your tracker' })}
          </Link>
        </p>
      ) : (
        shown.map((c) => (
          <div key={c.applicationId} className="mt-2">
            <p className="t-label m-0">
              {t('ask-mine-school', {
                defaultValue: '{{school}} · {{program}}',
                school: c.school.shortName,
                program: programFilterLabel(c.program),
              })}
            </p>
            <ChanceLine chance={c} />
          </div>
        ))
      )}
    </section>
  );
}
