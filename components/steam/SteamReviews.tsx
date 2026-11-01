'use client';

import { useState } from 'react';
import { Award, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { REVIEW_BODY_MAX, type RatingAgg, type ReviewView } from '@/lib/games/reviews';
import { AWARD_CATALOG } from '@/lib/awards/catalog';
import { formatPlaytime } from '@/lib/games/format-playtime';
import { recommendation, summaryLabel } from '@/lib/games/review-extras';
import { PersonAvatar } from './SteamPeople';

function Stars({
  value,
  onRate,
  label,
}: {
  value: number;
  onRate?: (n: number) => void;
  label: string;
}) {
  return (
    <span className="stm-stars" role={onRate ? 'group' : 'img'} aria-label={onRate ? label : `${label}: ${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onRate ? (
          <button
            key={n}
            type="button"
            className="stm-star"
            data-on={n <= value ? 'true' : 'false'}
            aria-label={`${n}`}
            aria-pressed={n === value}
            onClick={() => onRate(n)}
          >
            <Star aria-hidden />
          </button>
        ) : (
          <span key={n} className="stm-star" data-on={n <= value ? 'true' : 'false'} aria-hidden>
            <Star />
          </span>
        ),
      )}
    </span>
  );
}

/** Reviews, the way Steam's hub shows them: who, how many stars, what they said, and whether it helped. */
export function SteamReviews({
  gameId,
  signedIn,
  initialReviews,
  initialAgg,
}: {
  gameId: string;
  signedIn: boolean;
  initialReviews: ReviewView[];
  initialAgg: RatingAgg;
}) {
  const { t } = useTranslation('games-hub');
  const [reviews, setReviews] = useState(initialReviews);
  const [agg, setAgg] = useState(initialAgg);
  const mine = reviews.find((r) => r.isMine);
  const [stars, setStars] = useState(mine?.stars ?? 0);
  const [body, setBody] = useState(mine?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // The API sorts by helpfulness unless asked for `recent`; the page loads in that order.
  const [sort, setSort] = useState<'helpful' | 'recent'>('helpful');

  async function refresh(nextSort: 'helpful' | 'recent' = sort) {
    const res = await fetch(`/api/games/${gameId}/reviews?sort=${nextSort}`);
    if (res.ok) {
      const d = (await res.json()) as { reviews: ReviewView[]; agg: RatingAgg };
      setReviews(d.reviews);
      setAgg(d.agg);
    }
  }

  async function submit() {
    if (stars < 1) {
      setStatus(t('pick-stars', { defaultValue: 'Pick a star rating first' }));
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/games/${gameId}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stars, body: body || null }),
      });
      if (!res.ok) throw new Error('save failed');
      await refresh();
      setStatus(t('review-saved', { defaultValue: 'Review saved' }));
    } catch {
      setStatus(t('error', { defaultValue: 'Something went wrong' }));
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
          ? { ...r, myVote: next, helpfulCount: r.helpfulCount + (next ? 1 : review.myVote === true ? -1 : 0) }
          : r,
      ),
    );
    await fetch(`/api/reviews/${review.id}/vote`, {
      method: next ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: next ? JSON.stringify({ helpful: true }) : undefined,
    }).catch(() => {});
  }

  const ratingLabel = t('rating', { defaultValue: 'Rating' });
  const label = summaryLabel(agg.positive ?? 0, agg.count);
  const labelText = {
    'very-positive': t('steam-rev-very-positive', { defaultValue: 'Very Positive' }),
    'mostly-positive': t('steam-rev-mostly-positive', { defaultValue: 'Mostly Positive' }),
    mixed: t('steam-rev-mixed', { defaultValue: 'Mixed' }),
    'mostly-negative': t('steam-rev-mostly-negative', { defaultValue: 'Mostly Negative' }),
    'very-negative': t('steam-rev-very-negative', { defaultValue: 'Very Negative' }),
  } as const;

  async function award(review: ReviewView, awardId: string) {
    try {
      const res = await fetch('/api/awards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awardId, entityType: 'review', entityId: review.id }),
      });
      if (res.ok) {
        toast.success(t('steam-rev-award-sent', { defaultValue: 'Award given.' }));
        await refresh();
      } else {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(
          b.error === 'INSUFFICIENT_COINS'
            ? t('steam-gems-err-coins', { defaultValue: 'You do not have enough coins.' })
            : t('steam-rev-award-err', { defaultValue: 'Could not give that award.' }),
        );
      }
    } catch {
      toast.error(t('steam-rev-award-err', { defaultValue: 'Could not give that award.' }));
    }
  }

  return (
    <section id="reviews" className="stm-card" aria-labelledby="stm-reviews-h">
      <h2 id="stm-reviews-h" className="stm-card-head">
        {t('reviews', { defaultValue: 'Reviews' })}
        {agg.count > 0 ? (
          <span className="stm-count">
            {label ? `${labelText[label.key]} · ` : ''}
            {agg.average} · {agg.count}
          </span>
        ) : null}
      </h2>

      {signedIn ? (
        <div className="stm-write">
          <h3 className="stm-subhead">
            {mine
              ? t('your-review', { defaultValue: 'Your review' })
              : t('write-review', { defaultValue: 'Write a review' })}
          </h3>
          <Stars value={stars} onRate={setStars} label={t('your-rating', { defaultValue: 'Your rating' })} />
          <textarea
            className="stm-textarea"
            rows={4}
            value={body}
            maxLength={REVIEW_BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('review-placeholder', { defaultValue: 'Share your thoughts (optional)' })}
            aria-label={t('write-review', { defaultValue: 'Write a review' })}
          />
          <div className="stm-write-actions">
            <button type="button" className="stm-btn" onClick={submit} disabled={saving}>
              {mine ? t('update', { defaultValue: 'Update' }) : t('post', { defaultValue: 'Post' })}
            </button>
            {status ? (
              <span className="stm-muted" role="status">
                {status}
              </span>
            ) : null}
            {body.length >= REVIEW_BODY_MAX * 0.9 ? (
              <span className="stm-muted stm-write-count" aria-live="polite" data-full={body.length >= REVIEW_BODY_MAX ? 'true' : 'false'}>
                {t('review-length', { defaultValue: '{{used}}/{{max}}', used: body.length, max: REVIEW_BODY_MAX })}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {reviews.length > 1 ? (
        <div className="stm-card-note stm-sort" role="group" aria-label={t('reviews-sort', { defaultValue: 'Sort reviews' })}>
          {(['helpful', 'recent'] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={sort === key ? 'stm-btn stm-btn-blue' : 'stm-btn stm-btn-ghost'}
              aria-pressed={sort === key}
              onClick={() => {
                setSort(key);
                void refresh(key);
              }}
            >
              {key === 'helpful'
                ? t('sort-helpful', { defaultValue: 'Most helpful' })
                : t('sort-recent', { defaultValue: 'Newest' })}
            </button>
          ))}
        </div>
      ) : null}

      {reviews.length === 0 ? (
        <p className="stm-muted stm-card-note">
          {t('no-reviews-hint', { defaultValue: 'Be the first to say what you thought of it.' })}
        </p>
      ) : (
        <ul className="stm-reviews">
          {reviews.map((r) => {
            const name = r.author.name ?? r.author.handle ?? 'User';
            return (
              <li key={r.id} className="stm-review">
                <PersonAvatar src={r.author.image} name={name} />
                <div className="stm-review-body">
                  <div className="stm-review-head">
                    <span className="stm-person-name">{name}</span>
                    <Stars value={r.stars} label={ratingLabel} />
                    <span className="stm-recommend" data-kind={recommendation(r.stars)}>
                      {recommendation(r.stars) === 'not-recommended' ? (
                        <ThumbsDown aria-hidden size={14} />
                      ) : (
                        <ThumbsUp aria-hidden size={14} />
                      )}
                      {recommendation(r.stars) === 'recommended'
                        ? t('steam-rev-recommended', { defaultValue: 'Recommended' })
                        : recommendation(r.stars) === 'mixed'
                          ? t('steam-rev-mixed-short', { defaultValue: 'Mixed' })
                          : t('steam-rev-not-recommended', { defaultValue: 'Not recommended' })}
                    </span>
                    {r.playtimeSeconds ? (
                      <span className="stm-muted">
                        {t('steam-on-record', { defaultValue: '{{time}} on record', time: formatPlaytime(r.playtimeSeconds) })}
                      </span>
                    ) : null}
                  </div>
                  {r.body ? <p>{r.body}</p> : null}
                  {r.awards && r.awards.length > 0 ? (
                    <ul className="stm-awards" aria-label={t('steam-rev-awards', { defaultValue: 'Awards' })}>
                      {r.awards.map((a) => {
                        const def = AWARD_CATALOG.find((d) => d.id === a.awardId);
                        return (
                          <li key={a.awardId} title={def?.name}>
                            <span aria-hidden>{def?.emoji ?? '🏅'}</span> {a.count}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  <button
                    type="button"
                    className="stm-helpful"
                    aria-pressed={!!r.myVote}
                    disabled={r.isMine}
                    onClick={() => vote(r)}
                  >
                    <ThumbsUp aria-hidden />
                    {r.helpfulCount} {t('helpful', { defaultValue: 'helpful' })}
                  </button>
                  {signedIn && !r.isMine ? (
                    <details className="stm-collmenu stm-award-menu">
                      <summary className="stm-helpful">
                        <Award aria-hidden />
                        {t('steam-rev-award', { defaultValue: 'Award' })}
                      </summary>
                      <div className="stm-collmenu-panel">
                        {AWARD_CATALOG.map((a) => (
                          <button key={a.id} type="button" className="stm-btn" onClick={() => void award(r, a.id)}>
                            <span aria-hidden>{a.emoji}</span> {a.name} · {t('steam-market-price', { defaultValue: '{{n}} coins', n: a.priceCoins })}
                          </button>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
