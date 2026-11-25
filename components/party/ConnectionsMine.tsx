/**
 * /connections/mine: the member's own grids. Drafts first, then published grids with their plays, solve rate and
 * average rating (shown from three ratings), whether one was a daily, and "Hidden by a moderator" where it was.
 * Rows on rules, figures in `t-meta`; one primary action (Make a grid).
 */
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { useSession } from '@/components/Providers';
import { api } from '@/lib/contract/client';
import { myConnectionGridsApi } from '@/lib/party/connections.contract';
import type { MyGridSummary } from '@/lib/party/connections';

function Row({ g }: { g: MyGridSummary }) {
  const { t } = useTranslation('connections-maker');
  const figures = g.draft
    ? [t('row-draft', { defaultValue: 'Draft' })]
    : [
        t('row-plays', { defaultValue_one: '{{count}} play', defaultValue: '{{count}} plays', count: g.playCount }),
        g.playCount
          ? t('row-solved', {
              defaultValue: '{{percent}}% solved',
              percent: Math.round((g.solveCount / g.playCount) * 100),
            })
          : t('row-not-played', { defaultValue: 'Not played yet' }),
        g.ratingAverage != null
          ? t('row-rating', {
              defaultValue: 'Rated {{average}} from {{count}}',
              average: g.ratingAverage,
              count: g.ratingCount,
            })
          : t('row-no-rating', { defaultValue: 'Not rated yet' }),
        ...(g.dailyDate ? [t('row-daily', { defaultValue: 'Daily on {{date}}', date: g.dailyDate })] : []),
        ...(g.hidden ? [t('row-hidden', { defaultValue: 'Hidden by a moderator' })] : []),
      ];
  const body = (
    <>
      <span className="t-body font-medium" dir="auto">
        {g.title}
      </span>
      <span className="t-meta">{figures.join(' · ')}</span>
    </>
  );
  return (
    <li className="border-b border-site-border">
      {/* A moderator-hidden grid is 404 at its link, so its row is not one. */}
      {g.hidden ? (
        <div className="flex flex-col gap-1 py-3">{body}</div>
      ) : (
        <Link to="/connections/u/$id" params={{ id: g.id }} className="flex flex-col gap-1 py-3">
          {body}
        </Link>
      )}
    </li>
  );
}

export function ConnectionsMine() {
  const { t } = useTranslation('connections-maker');
  const session = useSession();
  const signedIn = !!session.data?.user;
  const query = useQuery({
    queryKey: [myConnectionGridsApi.path],
    queryFn: ({ signal }) => api(myConnectionGridsApi, { signal }),
    enabled: signedIn,
  });
  const arrival = useArrival(!query.isPending);
  const title = t('mine-title', { defaultValue: 'Your grids' });

  if (!signedIn) {
    return (
      <PageLayout title={title}>
        <SignedOutPrompt
          callbackURL="/connections/mine"
          title={t('mine-sign-in', { defaultValue: 'Sign in to see your grids.' })}
        />
      </PageLayout>
    );
  }

  const grids = query.data?.grids ?? [];
  return (
    <PageLayout
      title={title}
      backTo="/daily?tab=connections"
      description={t('mine-description', {
        defaultValue: 'Your drafts and published grids, with how many members played them.',
      })}
      headerRight={
        <Button asChild variant="primary">
          <Link to="/connections/new">{t('make-grid', { defaultValue: 'Make a grid' })}</Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-6">
        {query.isPending ? (
          <div
            role="status"
            aria-label={t('mine-loading', { defaultValue: 'Loading your grids' })}
            className="flex flex-col gap-3"
          >
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : query.isError ? (
          <p role="alert" className="t-body text-site-text-muted">
            {t('mine-error', { defaultValue: 'Could not load your grids.' })}
          </p>
        ) : grids.length === 0 ? (
          <EmptyState
            className={arrival}
            title={t('mine-empty-title', { defaultValue: 'You have not made a grid yet' })}
            description={t('mine-empty-description', { defaultValue: 'Save a draft, try it, then publish it.' })}
          />
        ) : (
          <ul className={arrival}>
            {grids.map((g) => (
              <Row key={g.id} g={g} />
            ))}
          </ul>
        )}
      </div>
    </PageLayout>
  );
}

/** A quiet link to the member's own grids, for the Connections section and the maker page. */
export function YourGridsLink() {
  const { t } = useTranslation('connections-maker');
  const session = useSession();
  if (!session.data?.user) return null;
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to="/connections/mine">{t('your-grids-link', { defaultValue: 'Your grids' })}</Link>
    </Button>
  );
}
