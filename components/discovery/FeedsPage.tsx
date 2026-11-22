import { useRefusalText } from '@/components/errors/useRefusalText';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Bell, Bookmark, List as ListIcon, Plus, Rss } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTabs } from '@/components/feed/PageTabs';
import { type TabItem } from '@/components/ui/tabs';
import { ListsManager } from '@/components/lists/ListsManager';
import { SavedSearches } from '@/components/search/SavedSearches';
import { DiscoverySettings } from './DiscoverySettings';
import { userListsQuery } from '@/lib/lists/list-feed.queries';
import { useArrival } from '@/components/ui/arrive';
import type { FeedSummary } from '@/lib/discovery/feeds.server';
import { feedsQuery } from '@/lib/discovery/feeds.queries';
import { EMPTY_FEED_FORM, FeedForm, feedBody } from './FeedForm';
import { api } from '@/lib/contract/client';
import { cn } from '@/lib/utils';
import type { FeedsTab } from './feeds-tabs';
import { createCustomFeedApi } from '@/lib/discovery/discovery.contract';

function FeedRow({ f }: { f: FeedSummary }) {
  const { t } = useTranslation('f-discovery');
  const bits = [...f.tags.map((x) => `#${x}`), ...f.keywords];
  return (
    <li>
      <Link
        to="/feeds/$id"
        params={{ id: f.id }}
        className="block rounded-site px-4 py-3 hover:bg-site-surface-hover"
      >
        <p className="text-sm font-semibold text-site-text">{f.name}</p>
        <p className="mt-0.5 truncate text-xs text-site-text-muted">
          {bits.slice(0, 6).join(' · ')}
          {f.peopleCount
            ? ` · ${t('feeds-people', { count: f.peopleCount, defaultValue_one: '{{count}} person', defaultValue: '{{count}} people' })}`
            : ''}
        </p>
        {f.isPublic && (
          <p className="mt-0.5 text-xs text-site-text-muted">
            {t('feeds-subscribers', {
              count: f.subscriberCount,
              defaultValue_one: '{{count}} subscriber', defaultValue: '{{count}} subscribers',
            })}
          </p>
        )}
      </Link>
    </li>
  );
}

function Section({ title, items }: { title: string; items: FeedSummary[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="site-section-label mb-3">{title}</h2>
      <ul className="space-y-3">
        {items.map((f) => (
          <FeedRow key={f.id} f={f} />
        ))}
      </ul>
    </section>
  );
}

export { FEEDS_TABS, type FeedsTab } from './feeds-tabs';

/** The Lists tab: the caller's lists of accounts, each a Feed of kind 'list'. */
function ListsTab() {
  const lists = useQuery({ ...userListsQuery(), retry: false });
  const arrival = useArrival(!!lists.data);
  if (!lists.data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className={arrival}>
      <ListsManager initial={lists.data.lists} />
    </div>
  );
}

/**
 * /feeds - the one place for every Feed: custom feeds (define them, find ones
 * other members published, A4), lists of accounts, saved searches and keyword
 * alerts. They are one model (`CustomFeed`, `lib/feeds/kinds.ts`); the tabs are
 * its kinds. Reached from Explore.
 */
export function FeedsPage({
  tab = 'feeds',
  onTabChange,
}: {
  tab?: FeedsTab;
  onTabChange?: (tab: FeedsTab) => void;
}) {
  const { t } = useTranslation('f-discovery');
  const refusalText = useRefusalText();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // Seeded by the /feeds loader; fetched here only when the loader had no session to use.
  const list = useQuery({ ...feedsQuery(), enabled: !!session && tab === 'feeds', retry: false });
  const lists = list.data ?? null;
  const loadFailed = list.isError;
  // Steel M9: the lists replace the skeleton when fetched here; seeded by the loader they are there on first paint.
  const arrival = useArrival(!!lists);
  useEffect(() => {
    if (loadFailed) toast.error(t('feeds-load-failed', { defaultValue: 'Could not load feeds' }));
  }, [loadFailed, t]);

  const create = async (v: Parameters<typeof feedBody>[0]) => {
    setBusy(true);
    try {
      const data = await api(createCustomFeedApi, { body: feedBody(v) });
      void navigate({ to: '/feeds/$id', params: { id: data.feed.id } });
    } catch (e) {
      toast.error(
        refusalText.maybe(e) ?? t('feeds-create-failed', { defaultValue: 'Could not create the feed' }),
      );
    } finally {
      setBusy(false);
    }
  };

  const tabs: TabItem[] = [
    { id: 'feeds', label: t('feeds-tab-feeds', { defaultValue: 'Feeds' }), icon: Rss },
    { id: 'lists', label: t('feeds-tab-lists', { defaultValue: 'Lists' }), icon: ListIcon },
    {
      id: 'searches',
      label: t('feeds-tab-searches', { defaultValue: 'Searches' }),
      icon: Bookmark,
    },
    { id: 'alerts', label: t('feeds-tab-alerts', { defaultValue: 'Alerts' }), icon: Bell },
  ];

  return (
    <PageLayout
      title={t('feeds-hub-title', { defaultValue: 'Feeds' })}
      description={t('feeds-hub-desc', {
        defaultValue:
          'Feeds, lists of accounts, saved searches and keyword alerts: everything you follow by person, tag or term.',
      })}
    >
      {session && (
        <PageTabs
          tabs={tabs}
          value={tab}
          onChange={(next) => onTabChange?.(next as FeedsTab)}
          idBase="feeds"
          aria-label={t('feeds-hub-title', { defaultValue: 'Feeds' })}
        />
      )}
      <div
        // ListsManager carries its own page gutters.
        className={cn(!(session && tab === 'lists') && 'space-y-6 px-4 pt-4 pb-12')}
        {...(session
          ? { role: 'tabpanel', id: `feeds-panel-${tab}`, 'aria-labelledby': `feeds-tab-${tab}` }
          : {})}
      >
        {!session ? (
          <EmptyState
            title={t('feeds-signin', { defaultValue: 'Sign in to build and follow feeds' })}
            action={
              <Link to="/login" search={{ callbackURL: '/feeds' }}>
                <Button variant="default">
                  {t('feeds-signin-cta', { defaultValue: 'Sign in' })}
                </Button>
              </Link>
            }
          />
        ) : tab === 'lists' ? (
          <ListsTab />
        ) : tab === 'searches' ? (
          <SavedSearches currentQuery="" manage />
        ) : tab === 'alerts' ? (
          <DiscoverySettings only="alerts" />
        ) : !lists ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className={cn('space-y-6', arrival)}>
            {creating ? (
              <FeedForm
                initial={EMPTY_FEED_FORM}
                busy={busy}
                submitLabel={t('feeds-create', { defaultValue: 'Create feed' })}
                onSubmit={(v) => void create(v)}
                onCancel={() => setCreating(false)}
              />
            ) : (
              <Button variant="default" size="sm" onClick={() => setCreating(true)}>
                <Plus aria-hidden /> {t('feeds-new', { defaultValue: 'New feed' })}
              </Button>
            )}
            <Section title={t('feeds-mine', { defaultValue: 'Your feeds' })} items={lists.mine} />
            <Section
              title={t('feeds-subscribed', { defaultValue: 'Subscribed' })}
              items={lists.subscribed}
            />
            <Section
              title={t('feeds-popular', { defaultValue: 'Popular feeds' })}
              items={lists.popular}
            />
          </div>
        )}
      </div>
    </PageLayout>
  );
}
