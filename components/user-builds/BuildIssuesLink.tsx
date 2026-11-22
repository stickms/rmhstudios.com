import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { apiQuery } from '@/lib/contract/client';
import { listBuildIssuesApi } from '@/lib/builds/issues.contract';

/**
 * "Issues (N open)" beside the comments on a build page. One list request with a page of one carries the counts, so
 * the page costs a single count query; until it answers (or if it fails) the link reads "Issues".
 */
export function BuildIssuesLink({ buildId, slug }: { buildId: string; slug: string }) {
  const { t } = useTranslation('build-issues');
  const counts = useQuery({
    ...apiQuery(listBuildIssuesApi, { params: { id: buildId }, query: { status: 'open', limit: 1 } }),
    retry: false,
    staleTime: 60_000,
  });
  const open = counts.data?.counts.open;
  return (
    <div className="border-b border-site-border pb-3">
      <Link to="/builds/$slug/issues" params={{ slug }} className="t-heading underline">
        {open === undefined
          ? t('link-plain', { defaultValue: 'Issues' })
          : t('link-open', { open, defaultValue: 'Issues ({{open}} open)' })}
      </Link>
    </div>
  );
}
