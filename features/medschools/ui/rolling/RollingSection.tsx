import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SCHOOL_SEARCH_DEFAULTS } from '../../engine/search';
import { rollingQuery } from '../../medschools.queries';
import { SkeletonSwap } from '../skeletons';
import { RollingView } from './RollingView';

/**
 * "Where applying early matters" as a native disclosure under a list or the tracker, opened like "Essay overlap": the
 * query is enabled only when the member opens it, so a closed disclosure costs no request. The answer is personal and
 * never cached by the server.
 */
export function RollingSection({
  source,
  defaultOpen = false,
}: {
  source: { source: 'list'; list: string } | { source: 'tracker' };
  /** For tests: render the opened disclosure. A page never sets it. */
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation('medschools');
  const [open, setOpen] = useState(defaultOpen);
  const query = useQuery({ ...rollingQuery(source), enabled: open });
  const data = query.data;
  return (
    <details className="border-b border-site-border" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="t-body flex min-h-11 cursor-pointer items-center font-medium">
        {t('rolling-title', { defaultValue: 'Where applying early matters' })}
      </summary>
      {open ? (
        <div className="flex flex-col gap-3 pb-4 pt-1">
          <p className="t-meta m-0">
            {t('rolling-intro', {
              defaultValue:
                'What each school’s own admissions page says about rolling decisions. At a school with rolling admissions, seats can fill as the cycle goes on.',
            })}
          </p>
          {query.isError ? (
            <p className="t-meta m-0">
              {t('rolling-load-failed', { defaultValue: 'Could not load this.' })}{' '}
              <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
                {t('retry', { defaultValue: 'Try again' })}
              </Button>
            </p>
          ) : (
            <SkeletonSwap ready={!!data}>
              {data ? (
                <RollingView
                  data={data}
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
