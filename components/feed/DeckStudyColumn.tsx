'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, ArrowLeft, Plus, Trash2, RotateCcw, GraduationCap, Check } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useTranslation } from 'react-i18next';
import { Reveal } from '@/components/motion';
import { LIFT_CARD } from '@/components/feed/motionHelpers';

interface Card {
  id: string;
  front: string;
  back: string;
}
interface Deck {
  id: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  isOwner: boolean;
  cardCount: number;
}

const GRADES: { grade: number; label: string; cls: string }[] = [
  { grade: 0, label: 'Again', cls: 'text-site-danger' },
  { grade: 1, label: 'Hard', cls: 'text-site-warning' },
  { grade: 2, label: 'Good', cls: 'text-site-accent' },
  { grade: 3, label: 'Easy', cls: 'text-site-success' },
];

export function DeckStudyColumn({
  deckId,
  initialData,
}: {
  deckId: string;
  /**
   * Deck detail prefetched by the route loader. `null` means not-found /
   * private for this viewer; `undefined` means no loader supplied one → the
   * column fetches on mount.
   */
  initialData?: { deck: Deck; cards: Card[]; dueCount: number; signedIn: boolean } | null;
}) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const navigate = useNavigate();
  // Seed from the loader when it ran (even a `null` result is a resolved
  // not-found, so skip the client fetch in that case too).
  const seeded = useRef(initialData !== undefined);
  const [deck, setDeck] = useState<Deck | null>(initialData?.deck ?? null);
  const [cards, setCards] = useState<Card[]>(initialData?.cards ?? []);
  const [dueCount, setDueCount] = useState(initialData?.dueCount ?? 0);
  const [signedIn, setSignedIn] = useState(initialData?.signedIn ?? false);
  const [loading, setLoading] = useState(initialData === undefined);
  const [notFound, setNotFound] = useState(initialData === null);

  // Review session
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);

  // Add card
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/study/decks/${encodeURIComponent(deckId)}`, { credentials: 'include' });
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setDeck(data.deck);
      setCards(data.cards ?? []);
      setDueCount(data.dueCount ?? 0);
      setSignedIn(!!data.signedIn);
    }
  }, [deckId]);

  useEffect(() => {
    if (seeded.current) return;
    let active = true;
    (async () => {
      try {
        await load();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function startReview() {
    const res = await fetch(`/api/study/decks/${encodeURIComponent(deckId)}/review`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setQueue(data.due ?? []);
      setIdx(0);
      setRevealed(false);
    }
  }

  async function grade(g: number) {
    if (!queue || reviewBusy) return;
    const card = queue[idx];
    setReviewBusy(true);
    try {
      await fetch(`/api/study/cards/${card.id}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: g }),
      });
      if (idx + 1 >= queue.length) {
        setQueue(null);
        await load();
      } else {
        setIdx((i) => i + 1);
        setRevealed(false);
      }
    } finally {
      setReviewBusy(false);
    }
  }

  async function addCard() {
    if (!front.trim() || !back.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/study/decks/${encodeURIComponent(deckId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front: front.trim(), back: back.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setCards((c) => [...c, data.card]);
        setFront('');
        setBack('');
      }
    } finally {
      setAdding(false);
    }
  }

  async function deleteDeck() {
    if (!(await confirm({ title: t('delete-deck-confirm', { defaultValue: 'Delete this deck and all its cards?' }), danger: true }))) return;
    const res = await fetch(`/api/study/decks/${encodeURIComponent(deckId)}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) navigate({ to: '/study' });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (notFound || !deck) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
        <p className="font-medium text-site-text">{t('deck-not-found', { defaultValue: 'Deck not found' })}</p>
        <Link to="/study">
          <Button variant="outline">{t('back-to-decks', { defaultValue: 'Back to decks' })}</Button>
        </Link>
      </div>
    );
  }

  // Review mode
  if (queue && queue.length > 0) {
    const card = queue[idx];
    return (
      <div className="min-h-screen">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
          <button onClick={() => setQueue(null)} className="text-site-text-dim hover:text-site-text">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-sm font-bold text-site-text">{deck.title}</h1>
          <span className="ml-auto text-xs text-site-text-dim">{idx + 1} / {queue.length}</span>
        </header>
        <div className="p-4">
          <div className="flex min-h-64 flex-col items-center justify-center rounded-site border border-site-border bg-site-surface p-8 text-center">
            <p className="text-lg font-semibold text-site-text">{card.front}</p>
            {revealed && (
              <>
                <div className="my-4 h-px w-16 bg-site-border" />
                <p className="whitespace-pre-wrap text-site-text-muted">{card.back}</p>
              </>
            )}
          </div>
          {revealed ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map((g) => (
                <Button key={g.grade} variant="outline" disabled={reviewBusy} onClick={() => grade(g.grade)} className={`flex-col ${g.cls}`}>
                  {t(`grade-${g.grade}`, { defaultValue: g.label })}
                </Button>
              ))}
            </div>
          ) : (
            <Button variant="accent" className="mt-4 w-full" onClick={() => setRevealed(true)}>
              {t('show-answer', { defaultValue: 'Show answer' })}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Link to="/study" className="text-site-text-dim hover:text-site-text">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-site-text">{deck.title}</h1>
          {deck.description && <p className="truncate text-xs text-site-text-dim">{deck.description}</p>}
        </div>
        {deck.isOwner && (
          <button onClick={deleteDeck} className="text-site-text-dim hover:text-site-danger" title={t('delete-deck', { defaultValue: 'Delete deck' })} aria-label={t('delete-deck', { defaultValue: 'Delete deck' })}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className="space-y-4 p-4">
        {signedIn && (
          <Reveal>
            <Button variant="accent" className="w-full gap-2" disabled={cards.length === 0} onClick={startReview}>
              <GraduationCap className="h-4 w-4" />
              {dueCount > 0 ? t('study-due-cards', { count: dueCount, defaultValue: 'Study {{count}} due card' }) : t('review-deck', { defaultValue: 'Review deck' })}
            </Button>
          </Reveal>
        )}

        {deck.isOwner && (
          <Reveal className={`rounded-site border border-site-border bg-site-surface p-3 ${LIFT_CARD}`}>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              <Plus className="h-3.5 w-3.5" /> {t('add-a-card', { defaultValue: 'Add a card' })}
            </p>
            <div className="space-y-2">
              <input
                value={front}
                onChange={(e) => setFront(e.target.value)}
                placeholder={t('front-placeholder', { defaultValue: 'Front (question)' })}
                maxLength={500}
                className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
              />
              <textarea
                value={back}
                onChange={(e) => setBack(e.target.value)}
                placeholder={t('back-placeholder', { defaultValue: 'Back (answer)' })}
                maxLength={500}
                rows={2}
                className="w-full resize-none rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
              />
              <div className="flex justify-end">
                <Button size="sm" variant="accent" disabled={adding || !front.trim() || !back.trim()} onClick={addCard} className="gap-1">
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {t('add', { defaultValue: 'Add' })}
                </Button>
              </div>
            </div>
          </Reveal>
        )}

        <Reveal as="section">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
            <RotateCcw className="h-3.5 w-3.5" /> {t('card-count', { count: cards.length, defaultValue: '{{count}} card' })}
          </h2>
          <div className="space-y-1">
            {cards.map((c) => (
              <div key={c.id} className={`rounded-site-sm border border-site-border bg-site-surface p-3 ${LIFT_CARD}`}>
                <p className="text-sm font-medium text-site-text">{c.front}</p>
                <p className="mt-0.5 text-sm text-site-text-muted">{c.back}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
