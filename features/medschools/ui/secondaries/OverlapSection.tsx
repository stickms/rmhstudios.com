import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SCHOOL_SEARCH_DEFAULTS } from '../../engine/search';
import { overlapQuery } from '../../medschools.queries';
import { SkeletonSwap } from '../skeletons';
import { useSecondaryLabels } from './labels';
import { OverlapView } from './OverlapView';

/**
 * "Essay overlap" as a native disclosure under a list or the tracker. The member opens it; the query is enabled only then,
 * so a closed disclosure costs no request. The answer is personal and never cached by the server.
 */
export function OverlapSection({
  source,
  defaultOpen = false,
}: {
  source: { source: 'list'; list: string } | { source: 'tracker' };
  /** For tests: render the opened disclosure. A page never sets it. */
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation('medschools');
  const labels = useSecondaryLabels();
  const [open, setOpen] = useState(defaultOpen);
  const query = useQuery({ ...overlapQuery(source), enabled: open });
  const data = query.data;
  return (
    <details className="border-b border-site-border" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="t-body flex min-h-11 cursor-pointer items-center font-medium">
        {t('overlap-title', { defaultValue: 'Essay overlap' })}
      </summary>
      {open ? (
        <div className="flex flex-col gap-3 pb-4 pt-1">
          <p className="t-meta m-0">
            {t('overlap-intro', {
              defaultValue: 'The secondary prompts of these schools, grouped by theme, so one essay can serve several.',
            })}
          </p>
          {query.isError ? (
            <p className="t-meta m-0">
              {t('overlap-load-failed', { defaultValue: 'Could not load the overlap.' })}{' '}
              <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
                {t('retry', { defaultValue: 'Try again' })}
              </Button>
            </p>
          ) : (
            <SkeletonSwap ready={!!data}>
              {data ? (
                <OverlapView
                  data={data}
                  labels={labels}
                  school={(slug, program, name) => (
                    <Link
                      to="/rmh-medschool/$slug"
                      params={{ slug }}
                      search={{
                        ...SCHOOL_SEARCH_DEFAULTS,
                        tab: 'secondaries' as const,
                        ...(program === 'PHD' ? { program: 'PHD' as const } : {}),
                      }}
                      className="underline"
                    >
                      {name}
                    </Link>
                  )}
                />
              ) : null}
            </SkeletonSwap>
          )}
        </div>
      ) : null}
    </details>
  );
}
