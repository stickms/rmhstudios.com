'use client';

/** N7 — per-community helpfulness leaderboard (a daily snapshot). */
import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Award } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { communityApi, plusFetch } from '@/components/communities/plus-api';

interface Row {
  user: { id: string; name?: string | null; handle?: string | null; image?: string | null };
  starPosts: number;
  challengeWins: number;
  score: number;
  roleTags: string[];
}

export default function TopContributorsPanel({ slug }: { slug: string }) {
  const { t } = useTranslation('f-communities-plus');
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void plusFetch<{ contributors: Row[] }>(communityApi(slug, '/contributors')).then((r) => {
      if (!cancelled) setRows(r.data?.contributors ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!rows) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title={t('top-empty', { defaultValue: 'No top contributors yet' })}
        description={t('top-empty-desc', {
          defaultValue: 'Hall of fame posts and challenge wins earn a place here. Updated daily.',
        })}
      />
    );
  }
  return (
    <div className="px-3 py-3">
      <p className="px-1 pb-2 text-xs text-site-text-muted">
        {t('top-hint', {
          defaultValue:
            'Ranked by hall of fame posts and challenge wins, not post counts. Updated daily.',
        })}
      </p>
      <ol className="glass-fill divide-y divide-site-border overflow-hidden">
        {rows.map((r, i) => {
          const name = r.user.name || r.user.handle || t('someone', { defaultValue: 'Someone' });
          return (
            <li key={r.user.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-6 text-center text-sm font-bold tabular-nums text-site-text-muted">
                {i + 1}
              </span>
              <UserAvatar src={r.user.image} alt={name} size={36} fallbackName={name} />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/u/${r.user.handle || r.user.id}` as string}
                  className="block truncate text-sm font-semibold text-site-text hover:underline"
                >
                  {name}
                </Link>
                <p className="text-xs text-site-text-muted">
                  {t('top-stats', {
                    stars: r.starPosts,
                    wins: r.challengeWins,
                    defaultValue: '{{stars}} hall of fame posts · {{wins}} challenge wins',
                  })}
                </p>
                {r.roleTags.length > 0 && (
                  <p className="mt-0.5 flex flex-wrap gap-1">
                    {r.roleTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-site-border px-1.5 py-px text-[0.65rem] text-site-text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </p>
                )}
              </div>
              <span className="text-sm font-bold tabular-nums text-site-text">{r.score}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
