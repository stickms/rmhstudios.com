'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Coins, Zap } from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { ColumnHeader } from './ColumnHeader';
import { Spinner } from '@/components/ui/spinner';
import { Reveal } from '@/components/motion';
import { LIFT_CARD } from '@/components/feed/motionHelpers';

type Scope = 'global' | 'friends';

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
  if (rank === 1) return 'text-yellow-400';
  if (rank === 2) return 'text-slate-300';
  if (rank === 3) return 'text-amber-600';
  return 'text-site-text-dim';
}

export function LeaderboardColumn({
  initialData,
  signedIn,
}: {
  initialData: LeaderboardData;
  signedIn: boolean;
}) {
  const { t } = useTranslation('feed');
  const [scope, setScope] = useState<Scope>('global');
  const [entries, setEntries] = useState<Entry[]>(initialData.entries);
  const [loading, setLoading] = useState(false);
  // Cache the global scope from the loader so toggling back is instant.
  const cache = useRef<Partial<Record<Scope, Entry[]>>>({ global: initialData.entries });

  const load = useCallback(async (next: Scope) => {
    if (cache.current[next]) {
      setEntries(cache.current[next]!);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboards/players?scope=${next}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = (await res.json()) as LeaderboardData;
        cache.current[next] = data.entries;
        setEntries(data.entries);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(scope);
  }, [scope, load]);

  const tabClass = (active: boolean) =>
    `relative px-3 py-1.5 text-sm font-bold rounded-sm transition-colors ${
      active ? 'text-site-text' : 'text-site-text-muted hover:text-site-text'
    }`;

  return (
    <div className="min-h-screen">
      <ColumnHeader icon={Trophy} title={t('leaderboard', { defaultValue: 'Leaderboard' })} />

      <div className="space-y-4 p-4">
        {/* Scope toggle */}
        <div className="flex items-center gap-1">
          <button onClick={() => setScope('global')} className={tabClass(scope === 'global')}>
            {t('leaderboard-global', { defaultValue: 'Global' })}
            {scope === 'global' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-site-accent" />
            )}
          </button>
          {signedIn && (
            <button onClick={() => setScope('friends')} className={tabClass(scope === 'friends')}>
              {t('leaderboard-friends', { defaultValue: 'Friends' })}
              {scope === 'friends' && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-site-accent" />
              )}
            </button>
          )}
        </div>

        <p className="text-xs text-site-text-dim">
          {t('leaderboard-subtitle', {
            defaultValue: 'Ranked by lifetime XP. Earn XP by posting, playing, studying, and more.',
          })}
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <p className="py-16 text-center text-sm text-site-text-muted">
            {scope === 'friends'
              ? t('leaderboard-empty-friends', {
                  defaultValue: 'Follow some people to see how you stack up.',
                })
              : t('leaderboard-empty', { defaultValue: 'No ranked players yet.' })}
          </p>
        ) : (
          <div className="space-y-1">
            {entries.map((e) => (
              <Reveal
                as="div"
                key={e.userId}
                className={`flex items-center gap-3 rounded-site border p-2.5 ${LIFT_CARD} ${
                  e.isViewer
                    ? 'border-site-accent bg-site-accent-dim'
                    : 'border-site-border bg-site-surface'
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
                      t('player-fallback', { defaultValue: 'Player' })}
                  </p>
                  <p className="flex items-center gap-2 text-[11px] text-site-text-dim">
                    <span className="inline-flex items-center gap-1 rounded-full bg-site-bg px-1.5 py-0.5 font-bold text-site-accent">
                      <Zap className="h-3 w-3" aria-hidden />{' '}
                      {t('leaderboard-level', { defaultValue: 'Lv {{n}}', n: e.level })}
                    </span>
                    <span>
                      {fmt(e.xp)} {t('leaderboard-xp', { defaultValue: 'XP' })}
                    </span>
                  </p>
                </div>
                <span className="flex items-center gap-1 text-sm font-semibold text-site-text">
                  <Coins className="h-3.5 w-3.5 text-yellow-400" aria-hidden /> {fmt(e.coins)}
                </span>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
