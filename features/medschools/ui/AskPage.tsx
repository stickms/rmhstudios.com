import { Link, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { parseAskSearch } from '../engine/search';
import { AskPanel } from './ask/AskPanel';

/** /rmh-medschool/ask. The panel owns the signed-out prompt, so a signed-out visitor sends nothing. */
export function AskPage() {
  const { t } = useTranslation('medschools');
  const search = parseAskSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const title = t('ask-title', { defaultValue: 'Ask the data' });
  return (
    <PageLayout
      title={title}
      breadcrumbs={[
        { label: t('index-title', { defaultValue: 'RMH Med Schools' }), to: '/rmh-medschool' },
        { label: title },
      ]}
    >
      <p className="t-body m-0 mb-4 max-w-prose">
        {t('ask-intro', {
          defaultValue:
            'Ask about schools, cycles, interviews or timing. Answers use only RMH’s public data and cite the rows they use.',
        })}{' '}
        <Link to="/rmh-medschool" className="underline">
          {t('ask-browse', { defaultValue: 'Browse schools' })}
        </Link>
      </p>
      <AskPanel heading="page" initialQuestion={search.q ?? ''} />
    </PageLayout>
  );
}
