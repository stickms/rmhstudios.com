import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { exploreApi, tipsLeaderboardApi } from '@/lib/discovery/explore.contract';
import { RMHarkCard } from './RMHarkCard';
import { WhyTrending } from '@/components/discovery/WhyTrending';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spine, SpineItem, SpineStation } from '@/components/ui/spine';
import { toggleFollowApi } from '@/lib/profile/follow.contract';
import { Spinner } from '@/components/ui/spinner';
import { DeferOnNavigate } from '@/components/ui/defer-on-navigate';
import { EmptyState } from '@/components/ui/empty-state';
import type { FeedItem } from '@/lib/feed-types';
import { useArrival } from '@/components/ui/arrive';

interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  memberCount: number;
}

/** The `/api/explore` payload — also what the route loader prefetches for SSR. */
export interface DiscoveryData {
  trendingTags: { tag: string; count: number }[];
  hotPosts: FeedItem[];
  suggestedUsers: {
    id: string;
    name: string | null;
    image: string | null;
    handle: string | null;
    followerCount: number;
  }[];
  communities: Community[];
  libraryDocs: LibraryDoc[];
}

interface LibraryDoc {
  id: string;
  slug: string;
  title: string;
  description: string;
}

/**
 * Titles per kind on the Games & Apps tab before it hands off to the catalog
 * page. A preview, not a second copy of `/games` — the "See all" link is the
 * whole point of keeping it short.
 */
const CATALOG_PREVIEW = 6;

interface TipLeader {
  user: { id: string; name: string | null; image: string | null; handle: string | null };
  total: number;
}

export interface DiscoveryOfficialBuild {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  href: string;
  status?: string;
}

export interface DiscoveryUserBuild {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
}

export interface DiscoveryBlogPost {
  slug: string;
  title: string;
  date: string;
}

/**
 * Every tab `SEARCH_TAB_KINDS` declares. This list used to stop at `blog`, and
 * `ExploreColumn` mapped the two it was missing onto `top` — so with the field
 * empty, Library and Games & Apps rendered the social discovery mix and read as
 * filters that did nothing. Adding a search tab means adding a discovery
 * section for it here; the type is what makes that non-optional.
 */
export type ExploreTab = 'top' | 'people' | 'posts' | 'builds' | 'blog' | 'library' | 'places';

interface ExploreRecommendationsProps {
  /** Active search tab — discovery content is filtered to match it. */
  tab?: ExploreTab;
  /**
   * Discovery payload from the route loader. Seeding it means the page paints
   * its recommendations server-side instead of flashing a spinner while the
   * client re-fetches what SSR already had.
   */
  initialData?: DiscoveryData | null;
  officialBuilds?: DiscoveryOfficialBuild[];
  userBuilds?: DiscoveryUserBuild[];
  blogPosts?: DiscoveryBlogPost[];
}

/**
 * Discovery content shown on the Explore page when no query is active.
 * The active tab filters which sections appear, so the tab bar stays functional
 * even before the user types: People → who to follow + communities, Posts →
 * trending tags + hot posts, Builds → builds to try, Blog → recent writing,
 * Library → books to open, Games & Apps → the curated catalog, and Top shows
 * the social discovery mix.
 */
export function ExploreRecommendations({
  tab = 'top',
  initialData,
  officialBuilds = [],
  userBuilds = [],
  blogPosts = [],
}: ExploreRecommendationsProps) {
  const { t } = useTranslation('feed');
  const seeded = useRef(initialData != null);
  const [data, setData] = useState<DiscoveryData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!seeded.current);
  const [tipLeaders, setTipLeaders] = useState<TipLeader[]>([]);

  // The social discovery sections (trending/people/communities/hot) come from
  // /api/explore, and so do the library books; the Builds and Blog tabs render
  // from props and Games & Apps from the static catalog, so those three don't
  // need to wait on that request.
  const needsExploreData =
    tab === 'top' || tab === 'people' || tab === 'posts' || tab === 'library';

  useEffect(() => {
    let active = true;
    // Only the client fallback path fetches: with a loader-seeded payload this
    // request would re-ask for what is already on screen.
    if (!seeded.current) {
      api(exploreApi)
        .then((d) => active && setData(d))
        .catch(() => {})
        .finally(() => active && setLoading(false));
    }
    // The tips leaderboard is its own endpoint and stays client-fetched — it is
    // below the fold and must not hold up the page's blocking loader.
    api(tipsLeaderboardApi, { query: { range: 'week' } })
      .then((d) => active && setTipLeaders(d.leaders ?? []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const showTrending = tab === 'top' || tab === 'posts';
  const showPeople = tab === 'top' || tab === 'people';
  const showCommunities = tab === 'top' || tab === 'people';
  const showHot = tab === 'top' || tab === 'posts';
  const showBuilds = tab === 'builds';
  const showBlog = tab === 'blog';
  const showLibrary = tab === 'library';
  const showPlaces = tab === 'places';

  // The catalog is a pure, static import (lib/catalog) — no
  // request, so the Games & Apps tab paints with the rest of the page.
  const catalog = useMemo(() => {
    const all = listCuratedBuilds();
    return {
      game: all.filter((b) => b.kind === 'game').slice(0, CATALOG_PREVIEW),
      app: all.filter((b) => b.kind === 'app').slice(0, CATALOG_PREVIEW),
    };
  }, []);

  // Both headings are STATIC t() calls, not ``t(`${kind}-heading`)`` — a computed
  // key is invisible to i18next-parser, so it would never reach locales/ and
  // every non-English locale would silently serve the English default.
  const catalogSections = [
    {
      kind: 'game' as const,
      to: '/games' as const,
      heading: t('games-heading', { defaultValue: 'Games to play' }),
    },
    {
      kind: 'app' as const,
      to: '/apps' as const,
      heading: t('apps-heading', { defaultValue: 'Apps to try' }),
    },
  ];

  // Steel M9: discovery fetched here replaces the spinner; the tips leaderboard lands later on its own.
  const arrival = useArrival(!(needsExploreData && loading));
  const tipsArrival = useArrival(tipLeaders.length > 0);

  if (needsExploreData && loading) {
    return (
      <div className="flex justify-center px-4 pt-4 pb-12">
        <Spinner />
      </div>
    );
  }

  const builds = [...officialBuilds, ...userBuilds];
  const studioPosts = tab === 'top' ? blogPosts.slice(0, 3) : [];

  // Steel section 10, Explore: stations per kind, rows on rules. Each station is a heading on the spine and rows under
  // it; there are no cards, tiles or pictures.
  return (
    <Spine className={arrival}>
      {/* Trending tags */}
      {showTrending && data && data.trendingTags.length > 0 && (
        <section>
          <SpineStation>{t('trending-heading', { defaultValue: 'Trending' })}</SpineStation>
          <SpineItem dot={false}>
            <div className="t-body flex flex-wrap gap-x-5 gap-y-2">
              {data.trendingTags.map((tag) => (
                <span key={tag.tag} className="inline-flex items-baseline gap-1.5">
                  <Link to={`/tag/${tag.tag}` as string} className="font-medium">
                    #{tag.tag}
                  </Link>
                  <span className="t-meta">{tag.count}</span>
                  <WhyTrending tag={tag.tag} />
                </span>
              ))}
            </div>
          </SpineItem>
        </section>
      )}

      {/* People: a row each, with Follow */}
      {showPeople && data && data.suggestedUsers.length > 0 && (
        <section>
          <SpineStation>{t('tab-people', { defaultValue: 'People' })}</SpineStation>
          {data.suggestedUsers.map((u) => (
            <SpineItem key={u.id}>
              <div className="flex items-center justify-between gap-3">
                <Link to={`/u/${u.handle || u.id}` as string} className="min-w-0">
                  <p className="t-body truncate font-semibold">{u.name || u.handle}</p>
                  <p className="t-meta truncate">
                    {t('follower-count', {
                      count: u.followerCount,
                      defaultValue: '{{count}} followers',
                    })}
                  </p>
                </Link>
                <FollowButton userId={u.id} />
              </div>
            </SpineItem>
          ))}
        </section>
      )}

      {/* Everything from here down is below the fold on Top, which shows trending and people first. On a page switch it
          is built after the top of the page has painted, in a transition React time-slices. Only on Top: on Posts and
          People these sections ARE the top of the page, and `enabled` is read once at mount, so a later tab change never
          hides anything. */}
      <DeferOnNavigate enabled={tab === 'top'} minHeight="100vh">
        {/* Top supported creators: a people section, so it follows the same tab gate as People. */}
        {showPeople && tipLeaders.length > 0 && (
          <section className={tipsArrival}>
            <SpineStation>
              {t('top-supported-this-week', { defaultValue: 'Top supported this week' })}
            </SpineStation>
            {tipLeaders.slice(0, 5).map((l) => (
              <SpineItem key={l.user.id}>
                <Link
                  to={`/u/${l.user.handle || l.user.id}` as string}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="t-body truncate font-semibold">
                    {l.user.name || l.user.handle}
                  </span>
                  <span className="t-meta">{l.total.toLocaleString()}</span>
                </Link>
              </SpineItem>
            ))}
          </section>
        )}

        {/* Communities to discover */}
        {showCommunities && data && data.communities.length > 0 && (
          <section>
            <SpineStation>{t('communities-heading', { defaultValue: 'Communities' })}</SpineStation>
            {data.communities.map((c) => (
              <SpineItem key={c.id}>
                <Link to={`/c/${c.slug}` as string} className="block">
                  <p className="t-body truncate font-semibold">{c.name}</p>
                  <p className="t-meta truncate">
                    {c.memberCount} member{c.memberCount === 1 ? '' : 's'}
                    {c.description ? ` · ${c.description}` : ''}
                  </p>
                </Link>
              </SpineItem>
            ))}
          </section>
        )}

        {/* Builds to try */}
        {showBuilds &&
          (builds.length > 0 ? (
            <section>
              <SpineStation>{t('builds-heading', { defaultValue: 'Builds to try' })}</SpineStation>
              {officialBuilds.map((b) => (
                <SpineItem key={b.id}>
                  <a href={b.href} className="block">
                    <p className="t-body truncate font-semibold">{b.title}</p>
                    <p className="t-meta truncate">
                      {b.status || t('official-build', { defaultValue: 'Official build' })}
                    </p>
                  </a>
                </SpineItem>
              ))}
              {userBuilds.map((b) => (
                <SpineItem key={b.id}>
                  <Link to={`/user-builds/${b.slug}` as string} className="block">
                    <p className="t-body truncate font-semibold">{b.title}</p>
                    <p className="t-meta truncate">
                      {t('community-build', { defaultValue: 'Community build' })}
                    </p>
                  </Link>
                </SpineItem>
              ))}
            </section>
          ) : (
            <EmptyState
              description={t('search-builds-hint', {
                defaultValue: 'Type to search games, apps, and community builds.',
              })}
            />
          ))}

        {/* From the studio: the writing */}
        {(showBlog || studioPosts.length > 0) &&
          ((showBlog ? blogPosts : studioPosts).length > 0 ? (
            <section>
              <SpineStation>
                {t('explore-from-studio', { defaultValue: 'From the studio' })}
              </SpineStation>
              {(showBlog ? blogPosts : studioPosts).map((p) => (
                <SpineItem key={p.slug}>
                  <Link to={`/blog/${p.slug}` as string} className="block">
                    <p className="t-body truncate font-semibold">{p.title}</p>
                    <p className="t-meta truncate">{new Date(p.date).toLocaleDateString()}</p>
                  </Link>
                </SpineItem>
              ))}
            </section>
          ) : (
            <EmptyState
              description={t('search-blog-hint', { defaultValue: 'Type to search the blog.' })}
            />
          ))}

        {/* Books to open. `data &&` guards the whole block, not just the list: with no payload at all the catch-all
            empty state at the bottom already speaks, and an inner fallback here would stack a second one under it. */}
        {showLibrary &&
          data &&
          (data.libraryDocs.length > 0 ? (
            <section>
              <SpineStation>{t('library-heading', { defaultValue: 'Books to open' })}</SpineStation>
              {data.libraryDocs.map((doc) => (
                <SpineItem key={doc.id}>
                  <Link to={`/library/${doc.slug}` as string} className="block">
                    <p className="t-body truncate font-semibold">{doc.title}</p>
                    <p className="t-meta truncate">
                      {doc.description || t('library-book', { defaultValue: 'In the library' })}
                    </p>
                  </Link>
                </SpineItem>
              ))}
              <SpineItem dot={false}>
                <Link to="/library" className="t-body underline">
                  {t('see-all', { defaultValue: 'See all' })}
                </Link>
              </SpineItem>
            </section>
          ) : (
            <EmptyState
              description={t('search-library-hint', {
                defaultValue: 'Type to search the library.',
              })}
            />
          ))}

        {/* Games & Apps: the curated catalog, previewed. Rows link straight into the game or app (top-level full-screen
            routes, hence <a> and not <Link>), and each heading's last row links to the catalog page holding the rest. */}
        {showPlaces &&
          catalogSections.map(({ kind, to, heading }) => (
            <section key={kind}>
              <SpineStation>{heading}</SpineStation>
              {catalog[kind].map((b) => (
                <SpineItem key={b.id}>
                  <a href={b.href} className="block">
                    <p className="t-body truncate font-semibold">{b.title}</p>
                    <p className="t-meta truncate">{b.description}</p>
                  </a>
                </SpineItem>
              ))}
              <SpineItem dot={false}>
                <Link to={to as string} className="t-body underline">
                  {t('see-all', { defaultValue: 'See all' })}
                </Link>
              </SpineItem>
            </section>
          ))}

        {/* Talked about: the hot posts */}
        {showHot && data && data.hotPosts.length > 0 && (
          <section>
            <SpineStation>
              {t('explore-talked-about', { defaultValue: 'Talked about' })}
            </SpineStation>
            {data.hotPosts.map((item) => (
              <RMHarkCard key={item.id} item={item} />
            ))}
          </section>
        )}
      </DeferOnNavigate>

      {/* Posts and People are the two tabs whose sections are bare `&&` guards, so when the payload held nothing for them
          they rendered an empty column under the search box with no explanation. Gated on the exact tab, not on
          `showHot`/`showPeople`: those are also true for Top, where one empty section among several populated ones should
          stay silent rather than plant a notice mid-page. */}
      {tab === 'posts' && data && !data.hotPosts.length && !data.trendingTags.length && (
        <EmptyState
          description={t('explore-empty-posts', {
            defaultValue:
              'No posts to show yet — once people start posting, what they are talking about shows up here.',
          })}
        />
      )}
      {tab === 'people' &&
        data &&
        !data.suggestedUsers.length &&
        !data.communities.length &&
        !tipLeaders.length && (
          <EmptyState
            description={t('explore-empty-people', {
              defaultValue:
                'No one to suggest yet. Once more people join, you will find them here.',
            })}
          />
        )}

      {/* Nothing to show for the social tabs (no data yet). */}
      {needsExploreData && !data && (
        <EmptyState
          description={t('explore-empty-hint', {
            defaultValue: 'Start typing to search across people, posts, builds, and the blog.',
          })}
        />
      )}
    </Spine>
  );
}

/**
 * A Follow button for a suggested person: optimistic, undone if the request fails. Signed out, it sends you to sign in.
 */
function FollowButton({ userId }: { userId: string }) {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!session) {
    return (
      <Button asChild variant="default">
        <Link to="/login" search={{ callbackURL: '/explore' }}>
          {t('follow', { defaultValue: 'Follow' })}
        </Link>
      </Button>
    );
  }
  return (
    <Button
      variant="default"
      aria-pressed={following}
      disabled={busy}
      onClick={async () => {
        const was = following;
        setFollowing(!was);
        setBusy(true);
        try {
          await api(toggleFollowApi, { params: { id: userId } });
        } catch {
          setFollowing(was);
        } finally {
          setBusy(false);
        }
      }}
    >
      {following
        ? t('following', { defaultValue: 'Following' })
        : t('follow', { defaultValue: 'Follow' })}
    </Button>
  );
}
