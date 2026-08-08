'use client';

import { useEffect, useMemo, useRef, useState } from'react';
import { Link } from'@tanstack/react-router';
import {
 Hash,
 TrendingUp,
 Users,
 Package,
 BookOpen,
 Coins,
 Gamepad2,
 type LucideIcon,
} from'lucide-react';
import { useTranslation } from'react-i18next';
import { RMHarkCard } from'./RMHarkCard';
import { listCuratedBuilds } from'@/lib/builds/curated';
import { RevealGroup, RevealItem } from'@/components/motion';
import { Spinner } from'@/components/ui/spinner';
import { EmptyState } from'@/components/ui/empty-state';
import { UserAvatar } from'@/components/ui/UserAvatar';
import { OptimizedImage } from'@/components/ui/OptimizedImage';
import type { FeedItem } from'@/lib/feed-types';
import { LIFT_CARD } from'@/components/feed/motionHelpers';

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
 suggestedUsers: { id: string; name: string | null; image: string | null; handle: string | null; followerCount: number }[];
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
export type ExploreTab ='top'|'people'|'posts'|'builds'|'blog'|'library'|'places';

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
 tab ='top',
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
 tab ==='top'|| tab ==='people'|| tab ==='posts'|| tab ==='library';

 useEffect(() => {
 let active = true;
 // Only the client fallback path fetches: with a loader-seeded payload this
 // request would re-ask for what is already on screen.
 if (!seeded.current) {
 fetch('/api/explore', { credentials:'include'})
 .then((r) => (r.ok ? r.json() : null))
 .then((d) => active && setData(d))
 .finally(() => active && setLoading(false));
 }
 // The tips leaderboard is its own endpoint and stays client-fetched — it is
 // below the fold and must not hold up the page's blocking loader.
 fetch('/api/tips/leaderboard?range=week')
 .then((r) => (r.ok ? r.json() : { leaders: [] }))
 .then((d) => active && setTipLeaders(d.leaders ?? []))
 .catch(() => {});
 return () => {
 active = false;
 };
 }, []);

 const showTrending = tab ==='top'|| tab ==='posts';
 const showPeople = tab ==='top'|| tab ==='people';
 const showCommunities = tab ==='top'|| tab ==='people';
 const showHot = tab ==='top'|| tab ==='posts';
 const showBuilds = tab ==='builds';
 const showBlog = tab ==='blog';
 const showLibrary = tab ==='library';
 const showPlaces = tab ==='places';

 // The catalog is a pure, static import (lib/games.ts + lib/apps.ts) — no
 // request, so the Games & Apps tab paints with the rest of the page.
 const catalog = useMemo(() => {
 const all = listCuratedBuilds();
 return {
 game: all.filter((b) => b.kind ==='game').slice(0, CATALOG_PREVIEW),
 app: all.filter((b) => b.kind ==='app').slice(0, CATALOG_PREVIEW),
 };
 }, []);

 // Both headings are STATIC t() calls, not ``t(`${kind}-heading`)`` — a computed
 // key is invisible to i18next-parser, so it would never reach locales/ and
 // every non-English locale would silently serve the English default.
 const catalogSections = [
 {
 kind:'game'as const,
 to:'/games'as const,
 heading: t('games-heading', { defaultValue:'Games to play'}),
 icon: Gamepad2,
 },
 {
 kind:'app'as const,
 to:'/apps'as const,
 heading: t('apps-heading', { defaultValue:'Apps to try'}),
 icon: Package,
 },
 ];

 if (needsExploreData && loading) {
 return (
 <div className="flex justify-center py-20">
 <Spinner />
 </div>
 );
 }

 const builds = [...officialBuilds, ...userBuilds];

 return (
 <RevealGroup as="div">
 {/* Trending tags */}
 {showTrending && data && data.trendingTags.length > 0 && (
 <RevealItem as="section"className="border-b border-site-border p-4">
 <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
 <TrendingUp className="h-3.5 w-3.5"/> {t('trending-heading', { defaultValue:'Trending'})}
 </h2>
 <div className="flex flex-wrap gap-2">
 {data.trendingTags.map((tag) => (
 <Link
 key={tag.tag}
 to={`/tag/${tag.tag}`as string}
 className="inline-flex items-center gap-1 rounded-full border border-site-border bg-site-surface px-3 py-1 text-sm text-site-text transition-colors duration-site hover:border-site-accent/50"
 >
 <Hash className="h-3 w-3 text-site-accent"/>
 {tag.tag}
 <span className="text-xs text-site-text-dim">{tag.count}</span>
 </Link>
 ))}
 </div>
 </RevealItem>
 )}

 {/* Who to follow */}
 {showPeople && data && data.suggestedUsers.length > 0 && (
 <RevealItem as="section"className="border-b border-site-border p-4">
 <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('who-to-follow', { defaultValue:'Who to follow'})}</h2>
 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
 {data.suggestedUsers.map((u) => (
 <Link
 key={u.id}
 to={`/u/${u.handle || u.id}`as string}
 className={`flex items-center gap-3 rounded-site border border-site-border bg-site-surface p-2.5 ${LIFT_CARD}`}
 >
 <UserAvatar src={u.image} alt={u.name || t('user-alt', { defaultValue:'User'})} size={36} fallbackName={u.name ||'U'} />
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold text-site-text">{u.name || u.handle}</p>
 <p className="truncate text-xs text-site-text-muted">{t('follower-count', { count: u.followerCount, defaultValue:'{{count}} followers'})}</p>
 </div>
 </Link>
 ))}
 </div>
 </RevealItem>
 )}

 {/* Top supported creators — a people section, so it follows the same tab
 gate as "who to follow" rather than being a fourth thing on Top only. */}
 {showPeople && tipLeaders.length > 0 && (
 <RevealItem as="section"className="border-b border-site-border p-4">
 <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
 <Coins className="h-3.5 w-3.5 text-site-warning"/>{''}
 {t('top-supported-this-week', { defaultValue:'Top supported this week'})}
 </h2>
 <div className="space-y-1.5">
 {tipLeaders.slice(0, 5).map((l, i) => (
 <Link
 key={l.user.id}
 to={`/u/${l.user.handle || l.user.id}`as string}
 className="flex items-center gap-3 rounded-site-sm px-2 py-1.5 hover:bg-site-surface-hover"
 >
 <span className="w-5 text-center text-sm font-bold text-site-text-dim">{i + 1}</span>
 <UserAvatar
 src={l.user.image}
 alt={l.user.name || t('user-alt', { defaultValue:'User'})}
 size={28}
 fallbackName={l.user.name ||'U'}
 />
 <span className="min-w-0 flex-1 truncate text-sm font-medium text-site-text">
 {l.user.name || l.user.handle}
 </span>
 <span className="inline-flex items-center gap-1 text-sm font-semibold text-site-warning">
 <Coins className="h-3.5 w-3.5"/> {l.total.toLocaleString()}
 </span>
 </Link>
 ))}
 </div>
 </RevealItem>
 )}

 {/* Communities to discover */}
 {showCommunities && data && data.communities.length > 0 && (
 <RevealItem as="section"className="border-b border-site-border p-4">
 <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
 <Users className="h-3.5 w-3.5"/> {t('communities-heading', { defaultValue:'Communities'})}
 </h2>
 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
 {data.communities.map((c) => (
 <Link
 key={c.id}
 to={`/c/${c.slug}`as string}
 className={`flex items-center gap-3 rounded-site border border-site-border bg-site-surface p-2.5 ${LIFT_CARD}`}
 >
 <div
 className="flex h-10 w-10 shrink-0 items-center justify-center rounded-site text-xl"
 style={{ background: (c.color ||'var(--site-accent)') +'22'}}
 >
 {c.icon ||'👥'}
 </div>
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold text-site-text">{c.name}</p>
 <p className="truncate text-xs text-site-text-muted">
 {c.memberCount} member{c.memberCount === 1 ?'':'s'}
 {c.description ? `· ${c.description}`:''}
 </p>
 </div>
 </Link>
 ))}
 </div>
 </RevealItem>
 )}

 {/* Builds to try */}
 {showBuilds && (
 builds.length > 0 ? (
 <RevealItem as="section"className="p-4">
 <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
 <Package className="h-3.5 w-3.5"/> {t('builds-heading', { defaultValue:'Builds to try'})}
 </h2>
 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
 {officialBuilds.map((b) => (
 <a
 key={b.id}
 href={b.href}
 className={`flex items-center gap-3 rounded-site border border-site-border bg-site-surface p-2.5 ${LIFT_CARD}`}
 >
 <BuildThumb src={b.thumbnailUrl} title={b.title} />
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold text-site-text">{b.title}</p>
 <p className="truncate text-xs text-site-text-muted">{b.status || t('official-build', { defaultValue:'Official build'})}</p>
 </div>
 </a>
 ))}
 {userBuilds.map((b) => (
 <Link
 key={b.id}
 to={`/user-builds/${b.slug}`as string}
 className={`flex items-center gap-3 rounded-site border border-site-border bg-site-surface p-2.5 ${LIFT_CARD}`}
 >
 <BuildThumb src={b.thumbnailUrl} title={b.title} />
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold text-site-text">{b.title}</p>
 <p className="truncate text-xs text-site-text-muted">{t('community-build', { defaultValue:'Community build'})}</p>
 </div>
 </Link>
 ))}
 </div>
 </RevealItem>
 ) : (
 <EmptyState description={t('search-builds-hint', { defaultValue:'Type to search games, apps, and community builds.'})} />
 )
 )}

 {/* Blog to read */}
 {showBlog && (
 blogPosts.length > 0 ? (
 <RevealItem as="section"className="py-2">
 <h2 className="flex items-center gap-1.5 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
 <BookOpen className="h-3.5 w-3.5"/> {t('blog-heading', { defaultValue:'From the blog'})}
 </h2>
 {blogPosts.map((p) => (
 <Link
 key={p.slug}
 to={`/blog/${p.slug}`as string}
 className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-site-surface-hover"
 >
 <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-site-accent"/>
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold text-site-text">{p.title}</p>
 <p className="truncate text-xs text-site-text-muted">{new Date(p.date).toLocaleDateString()}</p>
 </div>
 </Link>
 ))}
 </RevealItem>
 ) : (
 <EmptyState description={t('search-blog-hint', { defaultValue:'Type to search the blog.'})} />
 )
 )}

 {/* Books to open. `data &&` guards the whole block, not just the list: with
 no payload at all the catch-all empty state at the bottom already speaks,
 and an inner fallback here would stack a second one under it. */}
 {showLibrary && data && (
 data.libraryDocs.length > 0 ? (
 <RevealItem as="section"className="p-4">
 <SectionHeading
 icon={BookOpen}
 label={t('library-heading', { defaultValue:'Books to open'})}
 to="/library"
 seeAll={t('see-all', { defaultValue:'See all'})}
 />
 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
 {data.libraryDocs.map((doc) => (
 <Link
 key={doc.id}
 to={`/library/${doc.slug}`as string}
 className={`glass-fill flex items-center gap-3 rounded-site p-2.5 ${LIFT_CARD}`}
 >
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-site bg-site-surface-hover">
 <BookOpen className="h-4 w-4 text-site-accent"aria-hidden />
 </div>
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold text-site-text">{doc.title}</p>
 <p className="truncate text-xs text-site-text-muted">
 {doc.description || t('library-book', { defaultValue:'In the library'})}
 </p>
 </div>
 </Link>
 ))}
 </div>
 </RevealItem>
 ) : (
 <EmptyState description={t('search-library-hint', { defaultValue:'Type to search the library.'})} />
 )
 )}

 {/* Games & Apps — the curated catalog, previewed. Cards link straight into
 the game or app (top-level full-screen routes, hence <a> and not <Link>),
 and each heading links to the catalog page holding the rest. */}
 {showPlaces && (
 <RevealItem as="section"className="space-y-5 p-4">
 {catalogSections.map(({ kind, to, heading, icon }) => (
 <div key={kind}>
 <SectionHeading
 icon={icon}
 label={heading}
 to={to}
 seeAll={t('see-all', { defaultValue:'See all'})}
 />
 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
 {catalog[kind].map((b) => (
 <a
 key={b.id}
 href={b.href}
 className={`glass-fill flex items-center gap-3 rounded-site p-2.5 ${LIFT_CARD}`}
 >
 <BuildThumb src={b.thumbnailUrl} title={b.title} />
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold text-site-text">{b.title}</p>
 <p className="truncate text-xs text-site-text-muted">{b.description}</p>
 </div>
 </a>
 ))}
 </div>
 </div>
 ))}
 </RevealItem>
 )}

 {/* Hot posts — feed cards keep their own entrance; the block reveals once. */}
 {showHot && data && data.hotPosts.length > 0 && (
 <RevealItem as="section">
 <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('hot-this-week', { defaultValue:'Hot this week'})}</h2>
 <div className="divide-y divide-site-border">
 {data.hotPosts.map((item) => (
 <RMHarkCard key={item.id} item={item} />
 ))}
 </div>
 </RevealItem>
 )}

 {/* Nothing to show for the social tabs (no data yet). */}
 {needsExploreData && !data && (
 <EmptyState description={t('explore-empty-hint', { defaultValue:'Start typing to search across people, posts, builds, and the blog.'})} />
 )}
 </RevealGroup>
 );
}

/**
 * A discovery section heading with a link to the page that holds the rest.
 *
 * The tabs that hand off to a real destination (Library → /library, Games &
 * Apps → /games and /apps) need that link to be visible: the panel is a
 * preview, and without the "see all" the preview reads as the whole set. The
 * heading itself keeps the same uppercase/dim treatment every other section
 * here uses, so this is placement, not a second style.
 */
function SectionHeading({
 icon: Icon,
 label,
 to,
 seeAll,
}: {
 icon: LucideIcon;
 label: string;
 to: string;
 seeAll: string;
}) {
 return (
 <div className="mb-2 flex items-baseline justify-between gap-3">
 <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
 <Icon className="h-3.5 w-3.5"aria-hidden /> {label}
 </h2>
 <Link
 to={to as string}
 className="shrink-0 text-xs font-semibold text-site-accent hover:underline"
 >
 {seeAll}
 </Link>
 </div>
 );
}

function BuildThumb({ src, title }: { src: string | null; title: string }) {
 if (!src) {
 return (
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-site bg-site-surface-hover text-sm font-bold text-site-text/70">
 {title.slice(0, 1).toUpperCase()}
 </div>
 );
 }
 return (
 <div className="h-10 w-10 shrink-0 overflow-hidden rounded-site bg-site-bg">
 <OptimizedImage src={src} alt={title} width={40} height={40} className="h-full w-full object-cover"/>
 </div>
 );
}
