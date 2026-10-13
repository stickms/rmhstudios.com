'use client';

/**
 * Everything below a community's header: the composer (flair picker, posting
 * rules), the Related rail, and the tabs — Posts (with flair filter), Hall of
 * fame, Challenge, Census, Top contributors, and Mod tools for mods. Only the
 * Posts tab is eager; the others are lazy chunks fetched when opened. One small
 * request (`/extras`) after first paint supplies flairs, posting status, the
 * rail and any pending onboarding questions.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, BarChart3, MessageSquare, ShieldCheck, Star, Trophy } from 'lucide-react';
import { VirtualPostList } from '@/components/feed/VirtualPostList';
import { EmptyState } from '@/components/ui/empty-state';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { CommunityComposer } from '@/components/communities/CommunityComposer';
import { FlairChip } from '@/components/communities/FlairChip';
import { RelatedRail } from '@/components/communities/RelatedRail';
import { OnboardingSheet } from '@/components/communities/OnboardingSheet';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import type { CommunityExtrasDTO } from '@/lib/communities/plus-schema';
import type { FeedItem } from '@/lib/feed-types';

const HallOfFamePanel = lazy(() => import('@/components/communities/HallOfFamePanel'));
const ChallengePanel = lazy(() => import('@/components/communities/ChallengePanel'));
const CensusPanel = lazy(() => import('@/components/communities/CensusPanel'));
const TopContributorsPanel = lazy(() => import('@/components/communities/TopContributorsPanel'));
const ModPanel = lazy(() => import('@/components/communities/ModPanel'));

const dismissKey = (slug: string) => `community-onboarding-dismissed:${slug}`;

function wasDismissed(slug: string): boolean {
  try {
    return window.localStorage.getItem(dismissKey(slug)) === '1';
  } catch {
    return false;
  }
}

export function CommunityPlusBody({
  community,
  items,
  setItems,
}: {
  community: { id: string; slug: string; name: string; joined: boolean; role: string | null };
  items: FeedItem[];
  setItems: Dispatch<SetStateAction<FeedItem[]>>;
}) {
  const { t } = useTranslation('f-communities-plus');
  const { slug } = community;
  const isMod = community.role === 'ADMIN' || community.role === 'MOD';
  const [tab, setTab] = useState('posts');
  const [extras, setExtras] = useState<CommunityExtrasDTO | null>(null);
  const [flairFilter, setFlairFilter] = useState<string | null>(null);
  const [filtered, setFiltered] = useState<FeedItem[] | null>(null);
  const [onboardingClosed, setOnboardingClosed] = useState(false);

  const loadExtras = useCallback(async () => {
    const res = await plusFetch<CommunityExtrasDTO>(communityApi(slug, '/extras'));
    if (res.data) setExtras(res.data);
  }, [slug]);

  // Re-read when membership changes (joining unlocks the onboarding questions).
  useEffect(() => {
    void loadExtras();
  }, [loadExtras, community.joined]);

  useEffect(() => {
    if (!flairFilter) {
      setFiltered(null);
      return;
    }
    let cancelled = false;
    setFiltered(null);
    void plusFetch<{ items: FeedItem[] }>(
      communityApi(slug, `/feed?flair=${encodeURIComponent(flairFilter)}`),
    ).then((r) => {
      if (!cancelled) setFiltered(r.data?.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, flairFilter]);

  const tabs = useMemo<LiquidTab[]>(
    () => [
      { id: 'posts', label: t('tab-posts', { defaultValue: 'Posts' }), icon: MessageSquare },
      { id: 'fame', label: t('tab-fame', { defaultValue: 'Hall of fame' }), icon: Star },
      { id: 'challenge', label: t('tab-challenge', { defaultValue: 'Challenge' }), icon: Trophy },
      { id: 'census', label: t('tab-census', { defaultValue: 'Census' }), icon: BarChart3 },
      { id: 'top', label: t('tab-top', { defaultValue: 'Top contributors' }), icon: Award },
      ...(isMod
        ? [{ id: 'mod', label: t('tab-mod', { defaultValue: 'Mod tools' }), icon: ShieldCheck }]
        : []),
    ],
    [t, isMod],
  );

  const followed = new Set(extras?.member?.followedFlairIds ?? []);
  const toggleFollow = async (flairId: string) => {
    const next = followed.has(flairId)
      ? [...followed].filter((f) => f !== flairId)
      : [...followed, flairId];
    const res = await plusFetch(communityApi(slug, '/flair-follows'), 'PUT', { flairIds: next });
    if (res.ok) void loadExtras();
  };

  const pendingOnboarding = extras?.member?.onboarding ?? [];
  const showOnboarding =
    community.joined &&
    pendingOnboarding.length > 0 &&
    !onboardingClosed &&
    typeof window !== 'undefined' &&
    !wasDismissed(slug);

  const posts = flairFilter ? filtered : items;
  const panelFallback = (
    <div className="flex justify-center py-12">
      <Spinner />
    </div>
  );

  return (
    <div>
      {extras && <RelatedRail sisters={extras.sisters} />}

      {community.joined && (
        <CommunityComposer
          communityId={community.id}
          extras={extras}
          onPosted={(item) => setItems((prev) => [item, ...prev])}
        />
      )}

      {extras?.member && extras.member.roleTags.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 px-4 pt-2 text-xs text-site-text-muted">
          {t('your-roles', { defaultValue: 'Your roles:' })}
          {extras.member.roleTags.map((r) => (
            <span key={r} className="rounded-full border border-site-border px-2 py-px">
              {r}
            </span>
          ))}
        </p>
      )}

      <div className="px-3 py-3">
        <LiquidTabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          aria-label={t('tabs-label', { defaultValue: 'Community sections' })}
        />
      </div>

      {tab === 'posts' && (
        <>
          {extras && extras.flairs.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-1.5 px-4 pb-3"
              role="group"
              aria-label={t('flair-filter', { defaultValue: 'Filter by flair' })}
            >
              <Button
                size="xs"
                variant={flairFilter ? 'outline' : 'accent'}
                onClick={() => setFlairFilter(null)}
              >
                {t('flair-all', { defaultValue: 'All posts' })}
              </Button>
              {extras.flairs.map((f) => (
                <FlairChip
                  key={f.id}
                  as="button"
                  flair={f}
                  aria-pressed={flairFilter === f.id}
                  onClick={() => setFlairFilter((cur) => (cur === f.id ? null : f.id))}
                  className={`cursor-pointer focus-visible:ring-2 focus-visible:ring-site-accent ${
                    flairFilter === f.id
                      ? 'ring-2 ring-site-accent'
                      : 'opacity-80 hover:opacity-100'
                  }`}
                />
              ))}
              {flairFilter && extras.member && (
                <Button size="xs" variant="ghost" onClick={() => void toggleFollow(flairFilter)}>
                  {followed.has(flairFilter)
                    ? t('flair-unfollow', { defaultValue: 'Following (tap to unfollow)' })
                    : t('flair-follow', { defaultValue: 'Follow this flair' })}
                </Button>
              )}
            </div>
          )}
          {posts === null ? (
            panelFallback
          ) : posts.length === 0 ? (
            <EmptyState
              description={
                flairFilter
                  ? t('no-flair-posts', { defaultValue: 'No posts with this flair yet.' })
                  : t('no-posts-yet', { defaultValue: 'No posts yet. Be the first!' })
              }
            />
          ) : (
            <VirtualPostList items={posts} />
          )}
        </>
      )}

      <Suspense fallback={panelFallback}>
        {tab === 'fame' && <HallOfFamePanel slug={slug} />}
        {tab === 'challenge' && (
          <ChallengePanel
            slug={slug}
            communityId={community.id}
            joined={community.joined}
            isMod={isMod}
            extras={extras}
          />
        )}
        {tab === 'census' && <CensusPanel slug={slug} joined={community.joined} isMod={isMod} />}
        {tab === 'top' && <TopContributorsPanel slug={slug} />}
        {tab === 'mod' && isMod && (
          <ModPanel slug={slug} extras={extras} onExtrasChange={() => void loadExtras()} />
        )}
      </Suspense>

      {showOnboarding && (
        <OnboardingSheet
          slug={slug}
          communityName={community.name}
          questions={pendingOnboarding}
          onDone={() => {
            setOnboardingClosed(true);
            void loadExtras();
            // The feed now leads with the flairs they follow.
            void plusFetch<{ items: FeedItem[] }>(communityApi(slug, '/feed')).then((r) => {
              if (r.data) setItems(r.data.items);
            });
          }}
          onSkip={() => {
            setOnboardingClosed(true);
            try {
              window.localStorage.setItem(dismissKey(slug), '1');
            } catch {
              /* private mode: the sheet simply won't be remembered as dismissed */
            }
          }}
        />
      )}
    </div>
  );
}
