'use client';

import { useState } from 'react';
import { Star, ThumbsUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RatingAgg, ReviewView } from '@/lib/games/reviews';
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

  async function refresh() {
    const res = await fetch(`/api/games/${gameId}/reviews`);
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

  return (
    <section id="reviews" className="stm-card" aria-labelledby="stm-reviews-h">
      <h2 id="stm-reviews-h" className="stm-card-head">
        {t('reviews', { defaultValue: 'Reviews' })}
        {agg.count > 0 ? (
          <span className="stm-count">
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
            rows={3}
            value={body}
            maxLength={2000}
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
          </div>
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
                  </div>
                  {r.body ? <p>{r.body}</p> : null}
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
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
