/**
 * Everything below a community's header: the composer (flair picker, posting
 * rules), the Related rail, and the tabs — Posts (with flair filter), Hall of
 * fame, Challenge, Census, Top contributors, and Mod tools for mods. Only the
 * Posts tab is eager; the others are lazy chunks fetched when opened. One small
 * request (`/extras`) after first paint supplies flairs, posting status, the
 * rail and any pending onboarding questions.
 */
import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, BarChart3, MessageSquare, ShieldCheck, Star, Trophy } from 'lucide-react';
import { VirtualPostList } from '@/components/feed/VirtualPostList';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { ArrivalSuspense, useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { CommunityComposer } from '@/components/communities/CommunityComposer';
import { FlairChip } from '@/components/communities/FlairChip';
import { RelatedRail } from '@/components/communities/RelatedRail';
import { OnboardingSheet } from '@/components/communities/OnboardingSheet';
import { CommunityRulesRail } from '@/components/communities/CommunityRules';
import { ImageAltRule } from '@/components/communities/ImageAltRule';
import { PublicModLog } from '@/components/communities/PublicModLog';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import type { CommunityExtrasDTO } from '@/lib/communities/plus';
import { HandoverBanner } from '@/components/communities/HandoverBanner';
import { PinnedPosts, useCommunityPins } from '@/components/communities/PinnedPosts';
import type { FeedItem } from '@/lib/feed-types';

const HallOfFamePanel = lazy(() => import('@/components/communities/HallOfFamePanel'));
const ChallengePanel = lazy(() => import('@/components/communities/ChallengePanel'));
const CensusPanel = lazy(() => import('@/components/communities/CensusPanel'));
const TopContributorsPanel = lazy(() => import('@/components/communities/TopContributorsPanel'));
const ModPanel = lazy(() => import('@/components/communities/ModPanel'));

/** A rules-only sheet is offered to members who joined within this long. */
const RULES_SHEET_WINDOW_MS = 60 * 60_000;

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
  initialPinned = null,
  composerLocked = false,
}: {
  /** s09-06: the pinned posts the loader read with the first page. */
  initialPinned?: FeedItem[] | null;
  /** s06-01: a timed-out member reads but does not post; the page shows the notice instead of the composer. */
  composerLocked?: boolean;
  community: {
    id: string;
    slug: string;
    name: string;
    joined: boolean;
    role: string | null;
    isPrivate?: boolean;
  };
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
    void plusFetch<{
      items: FeedItem[];
    }>(communityApi(slug, `/feed?flair=${encodeURIComponent(flairFilter)}`)).then((r) => {
      if (!cancelled) setFiltered(r.data?.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, flairFilter]);

  const tabs = useMemo<TabItem[]>(
    () => [
      {
        id: 'posts',
        label: t('tab-posts', {
          defaultValue: 'Posts',
        }),
        icon: MessageSquare,
      },
      {
        id: 'fame',
        label: t('tab-fame', {
          defaultValue: 'Hall of fame',
        }),
        icon: Star,
      },
      {
        id: 'challenge',
        label: t('tab-challenge', {
          defaultValue: 'Challenge',
        }),
        icon: Trophy,
      },
      {
        id: 'census',
        label: t('tab-census', {
          defaultValue: 'Census',
        }),
        icon: BarChart3,
      },
      {
        id: 'top',
        label: t('tab-top', {
          defaultValue: 'Top contributors',
        }),
        icon: Award,
      },
      ...(isMod
        ? [
            {
              id: 'mod',
              label: t('tab-mod', {
                defaultValue: 'Mod tools',
              }),
              icon: ShieldCheck,
            },
          ]
        : []),
    ],
    [t, isMod],
  );

  const followed = new Set(extras?.member?.followedFlairIds ?? []);
  const toggleFollow = async (flairId: string) => {
    const next = followed.has(flairId) ? [...followed].filter((f) => f !== flairId) : [...followed, flairId];
    const res = await plusFetch(communityApi(slug, '/flair-follows'), 'PUT', {
      flairIds: next,
    });
    if (res.ok) void loadExtras();
  };

  const pendingOnboarding = extras?.member?.onboarding ?? [];
  // s03-13: the rules ride the same sheet for someone who has just joined.
  const rules = extras?.rules ?? [];
  const justJoined =
    !!extras?.member && Date.now() - new Date(extras.member.joinedAt).getTime() < RULES_SHEET_WINDOW_MS;
  const showOnboarding =
    community.joined &&
    (pendingOnboarding.length > 0 || (rules.length > 0 && justJoined)) &&
    !onboardingClosed &&
    typeof window !== 'undefined' &&
    !wasDismissed(slug);

  // s09-06: the pinned block leads the unfiltered list and its posts are not repeated below it. A post unpinned from
  // a menu goes back into the list at its place in time.
  const pins = useCommunityPins(slug, initialPinned);
  const pinnedItems = useMemo(() => pins?.items ?? [], [pins]);
  const pinnedIds = useMemo(() => new Set(pinnedItems.map((i) => i.id)), [pinnedItems]);
  const lastPinned = useRef<FeedItem[]>(pinnedItems);
  useEffect(() => {
    // Only an explicit unpin (the id left the order) puts a post back; one that merely stopped being visible, a
    // removed post or a blocked author, stays out.
    const order = new Set(pins?.order ?? []);
    const gone = lastPinned.current.filter((i) => !order.has(i.id));
    lastPinned.current = pinnedItems;
    if (gone.length === 0) return;
    setItems((cur) => {
      const have = new Set(cur.map((i) => i.id));
      const back = gone.filter((i) => !have.has(i.id)).map((i) => ({ ...i, communityPinned: false }));
      return back.length === 0
        ? cur
        : [...cur, ...back].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    });
  }, [pins, pinnedItems, setItems]);
  const unpinned = useMemo(() => items.filter((i) => !pinnedIds.has(i.id)), [items, pinnedIds]);
  const posts = flairFilter ? filtered : unpinned;
  // `/extras` lands after first paint; a flair filter swaps the list for a spinner and back.
  const extrasArrival = useArrival(!!extras);
  const postsArrival = useArrival(posts !== null);
  const panelFallback = (
    <div className="flex justify-center py-12">
      <Spinner />
    </div>
  );

  return (
    <div>
      {community.role === 'MOD' && <HandoverBanner slug={slug} name={community.name} />}
      {extras && <CommunityRulesRail rules={extras.rules} communityName={community.name} className={extrasArrival} />}
      {extras?.requireImageAlt && <ImageAltRule className={extrasArrival} />}
      {extras?.publicModLog && <PublicModLog slug={slug} communityName={community.name} className={extrasArrival} />}
      {extras && <RelatedRail sisters={extras.sisters} className={extrasArrival} />}

      {community.joined && !composerLocked && (
        <CommunityComposer
          communityId={community.id}
          extras={extras}
          onPosted={(item) => setItems((prev) => [item, ...prev])}
        />
      )}

      {extras?.member && extras.member.roleTags.length > 0 && (
        <p className={cn('flex flex-wrap items-center gap-1.5 px-4 pt-2 text-xs text-site-text-muted', extrasArrival)}>
          {t('your-roles', {
            defaultValue: 'Your roles:',
          })}
          {extras.member.roleTags.map((r) => (
            <span key={r} className="rounded-full border border-site-border px-2 py-px">
              {r}
            </span>
          ))}
        </p>
      )}

      <div className="px-3 py-3">
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          aria-label={t('tabs-label', {
            defaultValue: 'Community sections',
          })}
        />
      </div>

      {tab === 'posts' && (
        <>
          {extras && extras.flairs.length > 0 && (
            <div
              className={cn('flex flex-wrap items-center gap-1.5 px-4 pb-3', extrasArrival)}
              role="group"
              aria-label={t('flair-filter', {
                defaultValue: 'Filter by flair',
              })}
            >
              <Button size="xs" variant={flairFilter ? 'default' : 'default'} onClick={() => setFlairFilter(null)}>
                {t('flair-all', {
                  defaultValue: 'All posts',
                })}
              </Button>
              {extras.flairs.map((f) => (
                <FlairChip
                  key={f.id}
                  as="button"
                  flair={f}
                  aria-pressed={flairFilter === f.id}
                  onClick={() => setFlairFilter((cur) => (cur === f.id ? null : f.id))}
                  className={`cursor-pointer focus-visible:ring-2 focus-visible:ring-site-accent ${
                    flairFilter === f.id ? 'ring-2 ring-site-accent' : 'opacity-80 hover:opacity-100'
                  }`}
                />
              ))}
              {flairFilter && extras.member && (
                <Button size="xs" variant="ghost" onClick={() => void toggleFollow(flairFilter)}>
                  {followed.has(flairFilter)
                    ? t('flair-unfollow', {
                        defaultValue: 'Following (tap to unfollow)',
                      })
                    : t('flair-follow', {
                        defaultValue: 'Follow this flair',
                      })}
                </Button>
              )}
            </div>
          )}
          {!flairFilter && <PinnedPosts items={pinnedItems} />}
          {posts === null ? (
            panelFallback
          ) : posts.length === 0 && (flairFilter || pinnedItems.length === 0) ? (
            <EmptyState
              className={postsArrival}
              description={
                flairFilter
                  ? t('no-flair-posts', {
                      defaultValue: 'No posts with this flair yet.',
                    })
                  : t('no-posts-yet', {
                      defaultValue: 'No posts yet. Be the first!',
                    })
              }
            />
          ) : (
            <VirtualPostList items={posts} className={postsArrival} />
          )}
        </>
      )}

      <ArrivalSuspense fallback={panelFallback}>
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
          <ModPanel
            slug={slug}
            isPrivate={community.isPrivate}
            isOwner={community.role === 'ADMIN'}
            extras={extras}
            onExtrasChange={() => void loadExtras()}
          />
        )}
      </ArrivalSuspense>

      {showOnboarding && (
        <OnboardingSheet
          slug={slug}
          communityName={community.name}
          questions={pendingOnboarding}
          rules={rules}
          onDone={() => {
            setOnboardingClosed(true);
            try {
              window.localStorage.setItem(dismissKey(slug), '1');
            } catch {
              /* private mode: the sheet may show once more */
            }
            void loadExtras();
            // The feed now leads with the flairs they follow.
            void plusFetch<{
              items: FeedItem[];
            }>(communityApi(slug, '/feed')).then((r) => {
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
