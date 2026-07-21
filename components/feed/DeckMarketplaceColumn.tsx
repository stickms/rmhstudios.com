'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Library, Search, Plus, Check, Loader2, ArrowLeft } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface MarketplaceDeck {
  id: string;
  title: string;
  description: string | null;
  cardCount: number;
  user: { name: string | null; handle: string | null; image: string | null };
  isOwn: boolean;
  alreadyCloned: boolean;
}

interface MarketplaceData {
  decks: MarketplaceDeck[];
  signedIn: boolean;
}

export function DeckMarketplaceColumn({ initialData }: { initialData: MarketplaceData }) {
  const { t } = useTranslation('feed');
  const [decks, setDecks] = useState<MarketplaceDeck[]>(initialData.decks);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  // Per-deck clone status: 'cloning' while the request is in flight, 'done' once added.
  const [status, setStatus] = useState<Record<string, 'cloning' | 'done'>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/study/marketplace?q=${encodeURIComponent(q)}`, { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as MarketplaceData;
        setDecks(data.decks);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const onQueryChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(value.trim()), 300);
  };

  const clone = async (deck: MarketplaceDeck) => {
    if (!initialData.signedIn) {
      toast.error(t('deck-clone-signin', { defaultValue: 'Sign in to add decks.' }));
      return;
    }
    setStatus((s) => ({ ...s, [deck.id]: 'cloning' }));
    try {
      const res = await fetch(`/api/study/decks/${deck.id}/clone`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus((s) => {
          const next = { ...s };
          delete next[deck.id];
          return next;
        });
        toast.error(data.error ?? t('deck-clone-failed', { defaultValue: 'Could not add deck.' }));
        return;
      }
      setStatus((s) => ({ ...s, [deck.id]: 'done' }));
      toast.success(t('deck-clone-added', { defaultValue: 'Added to your decks.' }));
    } catch {
      setStatus((s) => {
        const next = { ...s };
        delete next[deck.id];
        return next;
      });
      toast.error(t('deck-clone-failed', { defaultValue: 'Could not add deck.' }));
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-2 z-10 mx-2 flex items-center gap-2 rounded-site glass-chrome px-4 py-3 shadow-site-sm md:top-3 md:mx-3">
        <Link
          to="/study"
          className="rounded-site-sm p-1 text-site-text-muted hover:text-site-text hover:bg-site-surface"
          aria-label={t('back', { defaultValue: 'Back' })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Library className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">{t('deck-marketplace', { defaultValue: 'Browse decks' })}</h1>
      </header>

      <div className="space-y-4 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-dim" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('deck-search-placeholder', { defaultValue: 'Search public decks…' })}
            aria-label={t('deck-search-label', { defaultValue: 'Search public decks' })}
            className="w-full rounded-site-sm border border-site-border bg-site-surface py-2 pl-9 pr-3 text-sm text-site-text outline-none focus:border-site-accent"
          />
        </div>

        {decks.length === 0 ? (
          <EmptyState
            icon={Library}
            title={t('deck-empty-title', { defaultValue: 'No public decks found' })}
            description={t('deck-empty-desc', { defaultValue: 'Try a different search, or publish one of your own decks.' })}
          />
        ) : (
          <div className={`grid gap-3 sm:grid-cols-2 ${loading ? 'opacity-60' : ''}`}>
            {decks.map((deck) => {
              const st = status[deck.id];
              const added = st === 'done' || deck.alreadyCloned;
              return (
                <div
                  key={deck.id}
                  className="flex flex-col rounded-site border border-site-border bg-site-surface p-4"
                >
                  <Link to="/study/$deckId" params={{ deckId: deck.id }} className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-site-text hover:text-site-accent">{deck.title}</h2>
                  </Link>
                  {deck.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-site-text-muted">{deck.description}</p>
                  )}
                  <p className="mt-2 text-[11px] text-site-text-dim">
                    {t('deck-card-count', { defaultValue: '{{n}} cards', n: deck.cardCount })}
                    {deck.user.name || deck.user.handle
                      ? ` · ${t('deck-by', { defaultValue: 'by' })} ${deck.user.name || '@' + deck.user.handle}`
                      : ''}
                  </p>
                  <div className="mt-3">
                    {deck.isOwn ? (
                      <span className="text-xs font-medium text-site-text-dim">
                        {t('deck-your-deck', { defaultValue: 'Your deck' })}
                      </span>
                    ) : added ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-site-success">
                        <Check className="h-4 w-4" aria-hidden /> {t('deck-added', { defaultValue: 'Added' })}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => clone(deck)}
                        disabled={st === 'cloning'}
                        className="inline-flex items-center gap-1.5 rounded-site-sm border border-site-border bg-site-bg px-3 py-1.5 text-xs font-semibold text-site-text transition-colors hover:border-site-accent hover:text-site-accent disabled:opacity-60"
                      >
                        {st === 'cloning' ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Plus className="h-4 w-4" aria-hidden />
                        )}
                        {t('deck-add', { defaultValue: 'Add to my decks' })}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
