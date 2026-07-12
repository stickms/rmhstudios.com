'use client';

import { useEffect, useState, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { Sparkles, Heart, MessageCircle, UserPlus, Trophy, Flame, PenSquare } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { PinnedHero } from '@/components/feed/PinnedHero';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion';
import { LIFT_CARD } from '@/components/feed/motionHelpers';

interface Recap {
  posts: number;
  likesReceived: number;
  commentsReceived: number;
  newFollowers: number;
  achievementsUnlocked: number;
  streak: number;
  topPost: { id: string; content: string; likeCount: number } | null;
  blurb: string;
}

const STAT_META = [
  { key: 'posts', labelKey: 'recap-stat-posts', labelDefault: 'Posts', icon: PenSquare },
  { key: 'likesReceived', labelKey: 'recap-stat-likes-received', labelDefault: 'Likes received', icon: Heart },
  { key: 'commentsReceived', labelKey: 'recap-stat-comments', labelDefault: 'Comments', icon: MessageCircle },
  { key: 'newFollowers', labelKey: 'recap-stat-new-followers', labelDefault: 'New followers', icon: UserPlus },
  { key: 'achievementsUnlocked', labelKey: 'recap-stat-achievements', labelDefault: 'Achievements', icon: Trophy },
  { key: 'streak', labelKey: 'recap-stat-day-streak', labelDefault: 'Day streak', icon: Flame },
] as const;

export function RecapColumn({
  initialData,
}: {
  /** Recap prefetched by the route loader; `null` when signed out. */
  initialData?: Recap | null;
} = {}) {
  const { t } = useTranslation('feed');
  // Seed from the loader when provided so the recap paints immediately.
  const seeded = useRef(initialData !== undefined && initialData !== null);
  const [recap, setRecap] = useState<Recap | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (seeded.current) return;
    let active = true;
    fetch('/api/recap', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setRecap(d))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen">
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !recap ? (
        <EmptyState description={t('recap-load-error', { defaultValue: 'Could not load your recap.' })} />
      ) : (
        <>
          {/* Pinned scroll-narrative hero — marquee moment for the weekly review. */}
          <PinnedHero
            eyebrow={t('recap-your-week', { defaultValue: 'Your week on RMH' })}
            title={
              <>
                {t('recap-weekly-headline', { defaultValue: 'Weekly' })}{' '}
                <span style={{ color: 'var(--site-accent)' }}>
                  {t('recap-recap-word', { defaultValue: 'Recap' })}
                </span>
              </>
            }
            subtitle={recap.blurb}
            actions={
              <Link to="/wrapped">
                <Button variant="accent" size="sm">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('recap-year-wrapped', { defaultValue: 'Year Wrapped' })}
                </Button>
              </Link>
            }
            scrollCue={t('recap-scroll-cue', { defaultValue: 'Scroll to explore' })}
            screens={2.6}
          />

          <div className="space-y-4 p-4">
            {/* Stat grid */}
            <Reveal>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
                {t('recap-stats-heading', { defaultValue: 'This week' })}
              </h2>
              <RevealGroup as="div" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {STAT_META.map(({ key, labelKey, labelDefault, icon: Icon }) => (
                  <RevealItem key={key}>
                    <div className={`rounded-site border border-site-border bg-site-surface p-3 text-center ${LIFT_CARD}`}>
                      <Icon className="mx-auto h-5 w-5 text-site-accent" />
                      <p className="mt-1 text-2xl font-bold text-site-text">{recap[key] as number}</p>
                      <p className="text-xs text-site-text-muted">{t(labelKey, { defaultValue: labelDefault })}</p>
                    </div>
                  </RevealItem>
                ))}
              </RevealGroup>
            </Reveal>

            {recap.topPost && (
              <Reveal>
                <div className={`rounded-site border border-site-border bg-site-surface p-4 ${LIFT_CARD}`}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('recap-top-post', { defaultValue: 'Your top post' })}</p>
                  <p className="line-clamp-3 text-sm text-site-text">{recap.topPost.content}</p>
                  <p className="mt-1 text-xs text-site-text-muted">
                    <Heart className="mr-0.5 inline h-3.5 w-3.5 text-site-accent" />
                    {recap.topPost.likeCount} {t('recap-likes', { defaultValue: 'likes' })}
                  </p>
                </div>
              </Reveal>
            )}

            <Reveal>
              <Link
                to="/achievements"
                className={`block rounded-site border border-site-border bg-site-surface p-3 text-center text-sm font-medium text-site-accent hover:bg-site-surface-hover ${LIFT_CARD}`}
              >
                {t('recap-view-achievements', { defaultValue: 'View your achievements →' })}
              </Link>
            </Reveal>
          </div>
        </>
      )}
    </div>
  );
}
