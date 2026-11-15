import { useEffect, useState, useRef } from'react';
import { useTranslation } from'react-i18next';
import { Link } from'@tanstack/react-router';
import {
 PenSquare,
 Heart,
 MessageCircle,
 UserPlus,
 Trophy,
 Flame,
 CalendarDays,
 Star,
 Gamepad2,
 Layers,
 Award,
} from'lucide-react';
import { CoinIcon } from'@/components/rmhcoins/CoinIcon';
import { Spinner } from'@/components/ui/spinner';
import { EmptyState } from'@/components/ui/empty-state';
import { Button } from'@/components/ui/button';
import { PinnedHero } from'@/components/feed/PinnedHero';
import { api } from'@/lib/contract/client';
import { getWrappedApi } from'@/lib/wrapped/wrapped.contract';
import { useArrival } from '@/components/ui/arrive';

interface Wrapped {
 year: number;
 posts: number;
 likesReceived: number;
 commentsReceived: number;
 newFollowers: number;
 achievementsUnlocked: number;
 coinsEarned: number;
 level: number;
 longestStreak: number;
 busiestMonth: string | null;
 topPost: { id: string; content: string; likeCount: number } | null;
 play?: {
 seconds: number;
 titles: number;
 top: { gameId: string; title: string; seconds: number }[];
 cardDrops: number;
 badges: number;
 } | null;
 blurb: string;
}

const fmt = (n: number) => n.toLocaleString();
/** Seconds as hours with one decimal; under an hour, minutes. */
const hours = (s: number) => (s < 3600 ? `${Math.floor(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

export function WrappedColumn({
 initialData,
}: {
 /** Current-year Wrapped prefetched by the route loader; `null`when signed out. */
 initialData?: Wrapped | null;
} = {}) {
 const { t } = useTranslation('feed');
 // Seed from the loader when provided so the summary paints immediately.
 const seeded = useRef(initialData !== undefined && initialData !== null);
 const [data, setData] = useState<Wrapped | null>(initialData ?? null);
 const [loading, setLoading] = useState(!initialData);
 // Steel M9: a Wrapped fetched here replaces the spinner; the loader's is there on first paint.
 const arrival = useArrival(!loading);

 useEffect(() => {
 if (seeded.current) return;
 api(getWrappedApi)
 .then(setData)
 .catch(console.error)
 .finally(() => setLoading(false));
 }, []);

 if (loading) {
 return (
 <div className="flex justify-center px-4 pt-4 pb-12">
 <Spinner />
 </div>
 );
 }
 if (!data) {
 return <EmptyState className={arrival} description={t('wrapped-load-error', { defaultValue:'Could not load your Wrapped.'})} />;
 }

 const tiles = [
 { label: t('tile-posts', { defaultValue:'Posts'}), value: fmt(data.posts), icon: PenSquare },
 { label: t('tile-likes-earned', { defaultValue:'Likes earned'}), value: fmt(data.likesReceived), icon: Heart },
 { label: t('tile-comments', { defaultValue:'Comments'}), value: fmt(data.commentsReceived), icon: MessageCircle },
 { label: t('tile-new-followers', { defaultValue:'New followers'}), value: fmt(data.newFollowers), icon: UserPlus },
 { label: t('tile-achievements', { defaultValue:'Achievements'}), value: fmt(data.achievementsUnlocked), icon: Trophy },
 { label: t('tile-longest-streak', { defaultValue:'Longest streak'}), value: `${fmt(data.longestStreak)}d`, icon: Flame },
 ];

 return (
 <div className={arrival}>
 {/* Pinned scroll-narrative hero — marquee moment for the year review. */}
 <PinnedHero
 title={
 <>
 {data.year}{''}
 <span className="text-site-accent">
 {t('wrapped-heading-word', { defaultValue:'Wrapped'})}
 </span>
 </>
 }
 subtitle={data.blurb}
 actions={
 <Link to="/recap">
 <Button variant="default"size="sm">
 {t('wrapped-recap-cta', { defaultValue:'This week'})}
 </Button>
 </Link>
 }
 />

 <div className="space-y-6 pt-4 pb-12">
 {/* Level badge — leads the below-fold content. */}
 <div>
 <div className="flex items-center gap-3 rounded-site px-4 py-3">
 <Star className="h-5 w-5 text-site-accent"/>
 <span className="text-sm font-semibold text-site-text">
 {t('level-value', { level: data.level, defaultValue:'Level {{level}}'})}
 </span>
 </div>
 </div>

 {/* Stat tiles */}
 <div>
 <h2 className="site-section-label mb-3">
 {t('wrapped-stats-heading', { defaultValue:'Your year in numbers'})}
 </h2>
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
 {tiles.map((tile) => (
 <div key={tile.label}>
 <div className={`rounded-site p-5`}>
 <tile.icon className="h-5 w-5 text-site-accent"/>
 <p className="mt-2 text-2xl font-semibold text-site-text">{tile.value}</p>
 <p className="text-xs text-site-text-muted">{tile.label}</p>
 </div>
 </div>
 ))}
 <div>
 <div className={`rounded-site p-5`}>
 <CoinIcon className="h-5 w-5"/>
 <p className="mt-2 text-2xl font-semibold text-site-text">{fmt(data.coinsEarned)}</p>
 <p className="text-xs text-site-text-muted">{t('tile-coins-earned', { defaultValue:'Coins earned'})}</p>
 </div>
 </div>
 {data.play ? (
 <>
 <div>
 <div className={`rounded-site p-5`}>
 <Gamepad2 className="h-5 w-5 text-site-accent"/>
 <p className="mt-2 text-2xl font-semibold text-site-text">{hours(data.play.seconds)}</p>
 <p className="text-xs text-site-text-muted">{t('tile-time-played', { defaultValue:'Time played'})}</p>
 </div>
 </div>
 <div>
 <div className={`rounded-site p-5`}>
 <Layers className="h-5 w-5 text-site-accent"/>
 <p className="mt-2 text-2xl font-semibold text-site-text">{fmt(data.play.cardDrops)}</p>
 <p className="text-xs text-site-text-muted">{t('tile-cards-dropped', { defaultValue:'Cards dropped'})}</p>
 </div>
 </div>
 <div>
 <div className={`rounded-site p-5`}>
 <Award className="h-5 w-5 text-site-accent"/>
 <p className="mt-2 text-2xl font-semibold text-site-text">{fmt(data.play.badges)}</p>
 <p className="text-xs text-site-text-muted">{t('tile-badges-crafted', { defaultValue:'Badges crafted'})}</p>
 </div>
 </div>
 </>
 ) : null}
 {data.busiestMonth && (
 <div>
 <div className={`rounded-site p-5`}>
 <CalendarDays className="h-5 w-5 text-site-accent"/>
 <p className="mt-2 text-2xl font-semibold text-site-text">{data.busiestMonth}</p>
 <p className="text-xs text-site-text-muted">{t('tile-busiest-month', { defaultValue:'Busiest month'})}</p>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Top post */}
 {data.play && data.play.top.length > 0 && (
 <div>
 <h2 className="site-section-label mb-3">
 {t('wrapped-top-games', { defaultValue:'Most played'})}
 </h2>
 <ol className="space-y-2">
 {data.play.top.map((g, i) => (
 <li key={g.gameId} className="flex items-center justify-between gap-3 rounded-site px-4 py-3">
 <Link to="/games/$gameId" params={{ gameId: g.gameId }} className="text-site-text">
 {i + 1}. {g.title}
 </Link>
 <span className="text-xs text-site-text-muted">{hours(g.seconds)}</span>
 </li>
 ))}
 </ol>
 </div>
 )}
 {data.topPost && (
 <div>
 <h2 className="site-section-label mb-3">
 {t('your-top-post', { defaultValue:'Your top post'})}
 </h2>
 <Link
 to={`/u/me/post/${data.topPost.id}`as string}
 className={`block rounded-site p-5`}
 >
 <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm text-site-text">
 {data.topPost.content || t('media-post-fallback', { defaultValue:'(media post)'})}
 </p>
 <p className="mt-2 inline-flex items-center gap-1 text-xs text-site-text-muted">
 <Heart className="h-3.5 w-3.5 text-site-accent"/> {t('top-post-likes', { count: data.topPost.likeCount, formattedCount: fmt(data.topPost.likeCount), defaultValue:'{{formattedCount}} likes'})}
 </p>
 </Link>
 </div>
 )}
 </div>
 </div>
 );
}
