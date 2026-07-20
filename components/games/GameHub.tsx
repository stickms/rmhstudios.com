'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ThumbsUp, BookOpen, Play } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { EmptyState } from '@/components/ui/empty-state';
import { StarRating } from './StarRating';
import type { ReviewView, RatingAgg, GuideSummary } from '@/lib/games/reviews';

interface GameHubData {
  gameId: string;
  title: string;
  playHref: string;
  image: string | null;
  agg: RatingAgg;
  reviews: ReviewView[];
  guides: GuideSummary[];
  signedIn: boolean;
}

export function GameHub({ data }: { data: GameHubData }) {
  const { t } = useTranslation('games-hub');
  const [reviews, setReviews] = useState(data.reviews);
  const [agg, setAgg] = useState(data.agg);
  const mine = reviews.find((r) => r.isMine);
  const [stars, setStars] = useState(mine?.stars ?? 0);
  const [body, setBody] = useState(mine?.body ?? '');
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/games/${data.gameId}/reviews`);
    if (res.ok) {
      const d = (await res.json()) as { reviews: ReviewView[]; agg: RatingAgg };
      setReviews(d.reviews);
      setAgg(d.agg);
    }
  }

  async function submit() {
    if (stars < 1) {
      toast.error(t('pick-stars', { defaultValue: 'Pick a star rating first' }));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/games/${data.gameId}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stars, body: body || null }),
      });
      if (!res.ok) throw new Error('save failed');
      await refresh();
      toast.success(t('review-saved', { defaultValue: 'Review saved' }));
    } catch {
      toast.error(t('error', { defaultValue: 'Something went wrong' }));
    } finally {
      setSaving(false);
    }
  }

  async function vote(review: ReviewView) {
    if (review.isMine) return;
    const next = review.myVote === true ? null : true;
    setReviews((prev) =>
      prev.map((r) =>
        r.id === review.id
          ? {
              ...r,
              myVote: next,
              helpfulCount: r.helpfulCount + (next ? 1 : review.myVote === true ? -1 : 0),
            }
          : r,
      ),
    );
    await fetch(`/api/reviews/${review.id}/vote`, {
      method: next ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: next ? JSON.stringify({ helpful: true }) : undefined,
    }).catch(() => {});
  }

  return (
    <div className="px-4 pt-4 pb-12 space-y-6">
      {/* Header */}
      <Card pane className="flex flex-row items-center gap-4 p-4">
        {data.image ? (
          <img src={data.image} alt="" className="h-20 w-20 shrink-0 rounded-site object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="font-(family-name:--site-font-display) text-lg font-bold text-site-text">
            {data.title}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <StarRating value={Math.round(agg.average)} size={16} label={t('rating', { defaultValue: 'Rating' })} />
            <span className="text-sm text-site-text-muted">
              {agg.average ? `${agg.average} · ${agg.count}` : t('no-ratings', { defaultValue: 'No ratings yet' })}
            </span>
          </div>
        </div>
        <Button asChild variant="accent">
          <a href={data.playHref}>
            <Play className="h-4 w-4" aria-hidden />
            {t('play', { defaultValue: 'Play' })}
          </a>
        </Button>
      </Card>

      {/* Your review */}
      {data.signedIn ? (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-site-text">
            {mine ? t('your-review', { defaultValue: 'Your review' }) : t('write-review', { defaultValue: 'Write a review' })}
          </h2>
          <StarRating value={stars} onRate={setStars} label={t('your-rating', { defaultValue: 'Your rating' })} />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 2000))}
            placeholder={t('review-placeholder', { defaultValue: 'Share your thoughts (optional)' })}
            className="mt-2"
            rows={3}
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="accent" onClick={submit} loading={saving}>
              {mine ? t('update', { defaultValue: 'Update' }) : t('post', { defaultValue: 'Post' })}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Reviews */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-site-text">
          {t('reviews', { defaultValue: 'Reviews' })}
        </h2>
        {reviews.length === 0 ? (
          <EmptyState title={t('no-reviews', { defaultValue: 'No reviews yet' })} />
        ) : (
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id}>
                <Card className="p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <UserAvatar src={r.author.image ?? undefined} alt={r.author.name ?? 'User'} size={24} fallbackName={r.author.name ?? undefined} />
                    <span className="truncate text-sm font-medium text-site-text">{r.author.name ?? r.author.handle}</span>
                    <StarRating value={r.stars} size={14} />
                  </div>
                  {r.body ? <p className="whitespace-pre-wrap break-words text-sm text-site-text">{r.body}</p> : null}
                  <button
                    type="button"
                    onClick={() => vote(r)}
                    disabled={r.isMine}
                    className={cn(
                      'mt-2 inline-flex items-center gap-1 text-xs',
                      r.myVote ? 'text-site-accent' : 'text-site-text-muted',
                      r.isMine ? 'cursor-default opacity-60' : 'hover:text-site-text',
                    )}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                    {r.helpfulCount} {t('helpful', { defaultValue: 'helpful' })}
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Guides */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-site-text">{t('guides', { defaultValue: 'Player guides' })}</h2>
          {data.signedIn ? (
            <Button asChild variant="ghost" size="sm">
              <a href={`/games/${data.gameId}/guides/new`}>{t('write-guide', { defaultValue: 'Write a guide' })}</a>
            </Button>
          ) : null}
        </div>
        {data.guides.length === 0 ? (
          <EmptyState icon={BookOpen} title={t('no-guides', { defaultValue: 'No guides yet' })} />
        ) : (
          <ul className="space-y-2">
            {data.guides.map((g) => (
              <li key={g.id}>
                <Card interactive className="flex-row items-center gap-3 px-4 py-3">
                  <a href={`/games/${data.gameId}/guides/${g.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <BookOpen className="h-5 w-5 shrink-0 text-site-accent" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-site-text">
                        {g.title}
                        {!g.published ? (
                          <span className="ms-2 text-xs text-site-text-dim">({t('draft', { defaultValue: 'draft' })})</span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-site-text-muted">{g.author.name ?? g.author.handle}</span>
                    </span>
                  </a>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
