import { useState } from'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/http';
import { useTranslation } from'react-i18next';
import { Trophy, Coins, Zap } from'lucide-react';
import { UserAvatar } from'./UserAvatar';
import { ColumnHeader } from'./ColumnHeader';
import { EmptyState } from'@/components/ui/empty-state';
import { Spinner } from'@/components/ui/spinner';
import { Tabs, type TabItem } from'@/components/ui/tabs';
import { Reveal } from'@/components/motion';
import { LIFT_CARD } from'@/components/feed/motionHelpers';

type Scope ='global'|'friends';

interface Entry {
 rank: number;
 userId: string;
 xp: number;
 level: number;
 coins: number;
 isViewer: boolean;
 user: { id: string; name: string | null; handle: string | null; image: string | null };
}

interface LeaderboardData {
 scope: Scope;
 entries: Entry[];
}

const fmt = (n: number) => n.toLocaleString();

/** Rank medal color for the top three, else muted. */
function rankClass(rank: number): string {
 if (rank === 1) return'text-site-podium-gold';
 if (rank === 2) return'text-site-podium-silver';
 if (rank === 3) return'text-site-podium-bronze';
 return'text-site-text-muted';
}

export function LeaderboardColumn({
 initialData,
 signedIn,
 hideHeader = false,
}: {
 initialData: LeaderboardData;
 signedIn: boolean;
 /** Hide the built-in ColumnHeader (e.g. when hosted under the /arcade tab bar). */
 hideHeader?: boolean;
}) {
 const { t } = useTranslation('feed');
 const [scope, setScope] = useState<Scope>('global');
 // The global board is seeded by the route loader; the Friends scope is fetched on demand.
 const board = useQuery({
 queryKey: ['leaderboards', 'players', scope],
 queryFn: () => fetchJson<LeaderboardData>(`/api/leaderboards/players?scope=${scope}`),
 ...(scope === 'global' ? { initialData } : {}),
 staleTime: 30_000,
 });
 const entries = board.data?.entries ?? [];
 const loading = board.isPending;

 // §17.5 sweep: this Global/Friends scope toggle was a hand-rolled underline strip
 // with no tab semantics (invisible to the §16.2 design-lint gate) — migrated to
 // the shared §5.45 Tabs sheet. The Friends tab only exists when signed in.
 const scopeTabs: TabItem[] = [
 { id:'global', label: t('leaderboard-global', { defaultValue:'Global'}) },
 ...(signedIn
 ? [{ id:'friends', label: t('leaderboard-friends', { defaultValue:'Friends'}) }]
 : []),
 ];

 return (
 <div>
 {!hideHeader && (
 <ColumnHeader icon={Trophy} title={t('leaderboard', { defaultValue:'Leaderboard'})} />
 )}

 <div className="space-y-4 p-4">
 {/* Scope toggle — §5.45 tab sheet */}
 <Tabs
 tabs={scopeTabs}
 value={scope}
 onChange={(id) => setScope(id as Scope)}
 size="sm"
 aria-label={t('leaderboard-scope-aria', { defaultValue:'Leaderboard scope'})}
 />

 <p className="text-xs text-site-text-muted">
 {t('leaderboard-subtitle', {
 defaultValue:'Ranked by lifetime XP. Earn XP by posting, playing, studying, and more.',
 })}
 </p>

 {loading ? (
 <div className="flex justify-center px-4 pt-4 pb-12">
 <Spinner />
 </div>
 ) : entries.length === 0 ? (
 <EmptyState
 icon={Trophy}
 title={
 scope ==='friends'
 ? t('leaderboard-empty-friends', {
 defaultValue:'Follow some people to see how you stack up.',
 })
 : t('leaderboard-empty', { defaultValue:'No ranked players yet.'})
 }
 />
 ) : (
 <div className="space-y-1">
 {entries.map((e) => (
 <Reveal
 as="div"
 key={e.userId}
 className={`flex items-center gap-3 rounded-site border p-2.5 ${LIFT_CARD} ${
 e.isViewer
 ?'border-site-accent bg-site-bg-subtle'
 :'border-site-border bg-site-surface'
 }`}
 >
 <span className={`w-6 text-center text-sm font-bold ${rankClass(e.rank)}`}>
 {e.rank}
 </span>
 <UserAvatar user={e.user} />
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-semibold text-site-text">
 {e.user.name ||
 e.user.handle ||
 t('player-fallback', { defaultValue:'Player'})}
 </p>
 <p className="flex items-center gap-2 text-xs text-site-text-muted">
 <span className="inline-flex items-center gap-1 rounded-full bg-site-bg px-1.5 py-0.5 font-bold text-site-accent">
 <Zap className="h-3 w-3"aria-hidden />{''}
 {t('leaderboard-level', { defaultValue:'Lv {{n}}', n: e.level })}
 </span>
 <span>
 {fmt(e.xp)} {t('leaderboard-xp', { defaultValue:'XP'})}
 </span>
 </p>
 </div>
 <span className="flex items-center gap-1 text-sm font-semibold text-site-text">
 <Coins className="h-3.5 w-3.5 text-site-podium-gold"aria-hidden /> {fmt(e.coins)}
 </span>
 </Reveal>
 ))}
 </div>
 )}
 </div>
 </div>
 );
}
