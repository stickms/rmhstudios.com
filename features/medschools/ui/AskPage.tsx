import { Link, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { parseAskSearch } from '../engine/search';
import { AskPanel } from './ask/AskPanel';
import { PageHead } from './shell/PageHead';

/** /rmh-medschool/ask. The panel owns the signed-out prompt, so a signed-out visitor sends nothing. */
export function AskPage() {
  const { t } = useTranslation('medschools');
  const search = parseAskSearch(useSearch({ strict: false }) as Record<string, unknown>);
  return (
    <>
      <PageHead title={t('ask-title', { defaultValue: 'Ask the data' })} />
      <p className="medapp-text mb-4 max-w-prose">
        {t('ask-intro', {
          defaultValue:
            'Ask about schools, cycles, interviews or timing. Answers use only RMH’s public data and cite the rows they use.',
        })}{' '}
        <Link to="/rmh-medschool" className="medapp-link">
          {t('ask-browse', { defaultValue: 'Browse schools' })}
        </Link>
      </p>
      <div className="medapp-panel medapp-panel--padded">
        <AskPanel heading="page" initialQuestion={search.q ?? ''} />
      </div>
    </>
  );
}
