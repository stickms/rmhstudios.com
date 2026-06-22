/**
 * RMH Study — in-room Flashcards panel.
 *
 * Brings the solo flashcard feature (decks + SM-2 spaced repetition) directly
 * into a study room so members can drill cards during focus sessions. Uses the
 * existing /api/study endpoints; each member reviews their own decks and keeps
 * their own SRS state. Deck management (create / AI-generate) lives on the full
 * Flashcards page, linked from here.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layers, Loader2, ArrowLeft, ExternalLink, RotateCw } from 'lucide-react';
import { toast } from '@/lib/rmhstudy/toast-store';

interface DeckRow {
  id: string;
  title: string;
  description: string | null;
  cardCount: number;
  isPublic?: boolean;
  user?: { name: string | null; handle: string | null };
}

interface DueCard {
  id: string;
  front: string;
  back: string;
}

const GRADES: { grade: number; label: string; cls: string }[] = [
  { grade: 0, label: 'Again', cls: 'bg-(--rmhstudy-danger-dim) text-(--rmhstudy-danger)' },
  { grade: 1, label: 'Hard', cls: 'bg-(--rmhstudy-surface-hover) text-(--rmhstudy-text)' },
  { grade: 2, label: 'Good', cls: 'bg-(--rmhstudy-surface-hover) text-(--rmhstudy-text)' },
  { grade: 3, label: 'Easy', cls: 'bg-(--rmhstudy-accent) text-white' },
];

export default function RmhStudyFlashcards() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [mine, setMine] = useState<DeckRow[]>([]);
  const [popular, setPopular] = useState<DeckRow[]>([]);

  // Review session
  const [activeDeck, setActiveDeck] = useState<DeckRow | null>(null);
  const [cards, setCards] = useState<DueCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [done, setDone] = useState(false);

  const loadDecks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/study/decks', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setMine(data.mine ?? []);
        setPopular(data.popular ?? []);
        setSignedIn(!!data.signedIn);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDecks();
  }, [loadDecks]);

  const startReview = useCallback(async (deck: DeckRow) => {
    try {
      const res = await fetch(`/api/study/decks/${deck.id}/review`, { credentials: 'include' });
      if (!res.ok) {
        toast.error('Could not load cards');
        return;
      }
      const data = await res.json();
      const due: DueCard[] = data.due ?? [];
      if (due.length === 0) {
        toast.info('No cards due right now — nice work!');
        return;
      }
      setActiveDeck(deck);
      setCards(due);
      setIndex(0);
      setRevealed(false);
      setDone(false);
    } catch {
      toast.error('Could not load cards');
    }
  }, []);

  const grade = useCallback(async (g: number) => {
    const card = cards[index];
    if (!card || grading) return;
    setGrading(true);
    try {
      await fetch(`/api/study/cards/${card.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ grade: g }),
      });
    } catch {
      /* keep going — the card stays in this local session */
    } finally {
      setGrading(false);
    }
    if (index + 1 >= cards.length) {
      setDone(true);
    } else {
      setIndex((i) => i + 1);
      setRevealed(false);
    }
  }, [cards, index, grading]);

  const exitReview = useCallback(() => {
    setActiveDeck(null);
    setCards([]);
    setIndex(0);
    setRevealed(false);
    setDone(false);
    loadDecks();
  }, [loadDecks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-(--rmhstudy-accent)" />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="p-6 text-center text-sm text-(--rmhstudy-text-muted)">
        Sign in to study flashcards in this room.
      </div>
    );
  }

  // ── Review session ──────────────────────────────────────────────
  if (activeDeck) {
    const card = cards[index];
    return (
      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={exitReview}
            className="flex items-center gap-1.5 text-sm text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-text)"
          >
            <ArrowLeft className="h-4 w-4" /> Decks
          </button>
          <span className="text-xs text-(--rmhstudy-text-muted)">
            {done ? `${cards.length}/${cards.length}` : `${index + 1}/${cards.length}`} · {activeDeck.title}
          </span>
        </div>

        {done ? (
          <div className="rounded-xl border border-(--rmhstudy-border) bg-(--rmhstudy-surface) p-8 text-center space-y-4">
            <Layers className="h-8 w-8 mx-auto text-(--rmhstudy-accent)" />
            <p className="font-semibold">Session complete!</p>
            <p className="text-sm text-(--rmhstudy-text-muted)">You reviewed {cards.length} card{cards.length === 1 ? '' : 's'}.</p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => startReview(activeDeck)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-(--rmhstudy-surface-hover) text-(--rmhstudy-text) hover:bg-(--rmhstudy-surface-active)"
              >
                <RotateCw className="h-4 w-4" /> Again
              </button>
              <button
                onClick={exitReview}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-(--rmhstudy-accent) hover:bg-(--rmhstudy-accent-hover)"
              >
                Back to decks
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="w-full min-h-44 rounded-xl border border-(--rmhstudy-border) bg-(--rmhstudy-surface) p-6 flex flex-col items-center justify-center gap-3 text-center transition-colors hover:border-(--rmhstudy-accent)"
            >
              <span className="text-lg font-medium whitespace-pre-wrap">{card?.front}</span>
              {revealed ? (
                <>
                  <span className="w-full border-t border-(--rmhstudy-border)" />
                  <span className="text-(--rmhstudy-text-muted) whitespace-pre-wrap">{card?.back}</span>
                </>
              ) : (
                <span className="text-xs text-(--rmhstudy-text-dim)">Tap to reveal</span>
              )}
            </button>

            {revealed && (
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map((g) => (
                  <button
                    key={g.grade}
                    disabled={grading}
                    onClick={() => grade(g.grade)}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${g.cls}`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Deck list ───────────────────────────────────────────────────
  const DeckButton = ({ deck, subtitle }: { deck: DeckRow; subtitle?: string }) => (
    <button
      onClick={() => startReview(deck)}
      className="w-full flex items-center gap-3 rounded-lg border border-(--rmhstudy-border) bg-(--rmhstudy-surface) p-3 text-left transition-colors hover:border-(--rmhstudy-accent)"
    >
      <Layers className="h-4 w-4 shrink-0 text-(--rmhstudy-accent)" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{deck.title}</div>
        <div className="text-xs text-(--rmhstudy-text-muted) truncate">
          {deck.cardCount} card{deck.cardCount === 1 ? '' : 's'}{subtitle ? ` · ${subtitle}` : ''}
        </div>
      </div>
    </button>
  );

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Layers className="h-4 w-4 text-(--rmhstudy-accent)" /> Flashcards
        </h3>
        <a
          href="/study"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-text)"
        >
          Manage decks <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-(--rmhstudy-text-muted)">My decks</p>
        {mine.length === 0 ? (
          <p className="text-xs text-(--rmhstudy-text-dim) py-2">
            No decks yet. Create one on the{' '}
            <a href="/study" target="_blank" rel="noreferrer" className="underline">Flashcards page</a>.
          </p>
        ) : (
          mine.map((d) => <DeckButton key={d.id} deck={d} />)
        )}
      </div>

      {popular.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-(--rmhstudy-text-muted)">Popular decks</p>
          {popular.map((d) => (
            <DeckButton key={d.id} deck={d} subtitle={d.user?.name ? `by ${d.user.name}` : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
