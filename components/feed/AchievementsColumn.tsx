'use client';

import { useEffect, useState, useRef } from 'react';
import { Trophy, Users, Gamepad2, Coins, Hammer, Sparkles, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { TIER_COLORS, CATEGORY_LABELS, type AchievementCategory, type AchievementTier } from '@/lib/achievements/catalog';

// Library icons per achievement category (replaces emoji badges).
const CATEGORY_ICON: Record<AchievementCategory, typeof Users> = {
  social: Users,
  games: Gamepad2,
  economy: Coins,
  creator: Hammer,
  special: Sparkles,
};

interface AchievementView {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  tier: AchievementTier;
  group: string | null;
  target: number;
  coinReward: number;
  secret: boolean;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: number;
}
interface Payload {
  stats: { unlocked: number; total: number; coinsEarned: number };
  achievements: AchievementView[];
}

const CATEGORY_ORDER: AchievementCategory[] = ['social', 'games', 'creator', 'economy', 'special'];

export function AchievementsColumn({
  userId,
  hideHeader = false,
  initialData,
}: {
  userId: string;
  hideHeader?: boolean;
  /** Achievement payload prefetched by the route loader; `null` when signed out. */
  initialData?: Payload | null;
}) {
  const { t } = useTranslation("feed");
  // Seed from the loader when provided so the grid paints immediately.
  const seeded = useRef(initialData != null);
  const [data, setData] = useState<Payload | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (seeded.current) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/achievements/${encodeURIComponent(userId)}`, { credentials: 'include' });
        if (res.ok && active) setData(await res.json());
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (!data) {
    return <EmptyState description={t("could-not-load-achievements", { defaultValue: "Could not load achievements." })} />;
  }

  const pct = data.stats.total ? Math.round((data.stats.unlocked / data.stats.total) * 100) : 0;

  const Stats = (
    <>
      <div className="flex items-center gap-3 text-sm text-site-text-muted">
        <span>
          <strong className="text-site-text">{data.stats.unlocked}</strong> / {data.stats.total} {t("unlocked", { defaultValue: "unlocked" })}
        </span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1"><Coins className="h-3.5 w-3.5 text-site-warning" /> {data.stats.coinsEarned} {t("earned", { defaultValue: "earned" })}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-site-surface">
        <div className="h-full rounded-full bg-site-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </>
  );

  return (
    <div className={hideHeader ? '' : 'min-h-screen'}>
      {hideHeader ? (
        <div className="px-4 pt-4">{Stats}</div>
      ) : (
        <header className="sticky top-0 z-10 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-site-accent" />
            <h1 className="text-lg font-bold text-site-text">{t("achievements-header", { defaultValue: "Achievements" })}</h1>
          </div>
          <div className="mt-2">{Stats}</div>
        </header>
      )}

      <div className="space-y-6 p-4">
        {CATEGORY_ORDER.map((cat) => {
          const list = data.achievements.filter((a) => a.category === cat);
          if (list.length === 0) return null;
          return (
            <section key={cat}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
                {CATEGORY_LABELS[cat]}
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {list.map((a) => {
                  const incremental = a.target > 1 && !a.unlocked;
                  return (
                    <div
                      key={a.id}
                      className={`flex items-start gap-3 rounded-site border p-3 transition-colors ${
                        a.unlocked
                          ? 'border-site-border bg-site-surface'
                          : 'border-site-border/60 bg-site-bg opacity-70'
                      }`}
                    >
                      {(() => {
                        const Icon = a.secret && !a.unlocked ? Lock : CATEGORY_ICON[a.category];
                        return (
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-site-sm"
                            style={{ background: a.unlocked ? `${TIER_COLORS[a.tier]}22` : 'var(--site-surface)' }}
                          >
                            <Icon
                              className="h-5 w-5"
                              style={{ color: a.unlocked ? TIER_COLORS[a.tier] : 'var(--site-text-dim)' }}
                            />
                          </div>
                        );
                      })()}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-site-text">{a.name}</p>
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                            style={{ background: `${TIER_COLORS[a.tier]}22`, color: TIER_COLORS[a.tier] }}
                          >
                            {a.tier}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-site-text-muted">{a.description}</p>
                        {incremental && (
                          <div className="mt-1.5">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-site-surface">
                              <div
                                className="h-full rounded-full bg-site-accent"
                                style={{ width: `${Math.min(100, (a.progress / a.target) * 100)}%` }}
                              />
                            </div>
                            <p className="mt-0.5 text-[10px] text-site-text-dim">
                              {a.progress} / {a.target}
                            </p>
                          </div>
                        )}
                        {a.unlocked && a.coinReward > 0 && (
                          <p className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-site-text-dim">
                            <Coins className="h-3 w-3 text-site-warning" /> +{a.coinReward}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
