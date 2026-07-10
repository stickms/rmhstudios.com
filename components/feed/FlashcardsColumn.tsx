'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, BookOpen, Plus, Sparkles, X, Globe, Lock, Layers } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

interface Deck {
  id: string;
  title: string;
  description: string | null;
  isPublic?: boolean;
  cardCount: number;
  user?: { name: string | null; handle: string | null };
}

export function FlashcardsColumn({
  initialData,
}: {
  /** Deck list prefetched by the route loader; `null` when signed out. */
  initialData?: { mine: Deck[]; popular: Deck[]; signedIn: boolean } | null;
} = {}) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  // Seed from the loader when provided so the list paints immediately.
  const seeded = useRef(initialData != null);
  const [mine, setMine] = useState<Deck[]>(initialData?.mine ?? []);
  const [popular, setPopular] = useState<Deck[]>(initialData?.popular ?? []);
  const [signedIn, setSignedIn] = useState(initialData?.signedIn ?? false);
  const [loading, setLoading] = useState(!initialData);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', isPublic: false, generateTopic: '' });

  const load = useCallback(async () => {
    const res = await fetch('/api/study/decks', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setMine(data.mine ?? []);
      setPopular(data.popular ?? []);
      setSignedIn(!!data.signedIn);
    }
  }, []);

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

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/study/decks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          isPublic: form.isPublic,
          generateTopic: form.generateTopic.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t('could-not-create', { defaultValue: 'Could not create' }));
        return;
      }
      navigate({ to: `/study/${data.id}` as string });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const DeckCard = (d: Deck, showOwner = false) => (
    <Link
      key={d.id}
      to={`/study/${d.id}` as string}
      className="flex items-center gap-3 rounded-site border border-site-border bg-site-surface p-3 transition-colors hover:border-site-accent/60"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-site bg-site-accent/12 text-site-accent">
        <Layers className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-site-text">{d.title}</p>
        {d.description && <p className="truncate text-xs text-site-text-muted">{d.description}</p>}
        <p className="mt-0.5 text-[11px] text-site-text-dim">
          {t('card-count', { count: d.cardCount, defaultValue: '{{count}} card', defaultValue_other: '{{count}} cards' })}
          {showOwner && d.user ? t('deck-by-owner', { owner: d.user.name || d.user.handle || t('someone', { defaultValue: 'someone' }), defaultValue: ' · by {{owner}}' }) : ''}
          {d.isPublic ? t('deck-public-suffix', { defaultValue: ' · public' }) : ''}
        </p>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <BookOpen className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">{t('flashcards-title', { defaultValue: 'Flashcards' })}</h1>
        {signedIn && (
          <Button size="sm" variant="accent" className="ml-auto gap-1" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> {t('new-deck', { defaultValue: 'New deck' })}
          </Button>
        )}
      </header>

      {showForm && (
        <div className="border-b border-site-border bg-site-surface/30 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-site-text">{t('new-deck', { defaultValue: 'New deck' })}</h2>
            <button onClick={() => setShowForm(false)} className="text-site-text-dim hover:text-site-text" aria-label={t('close', { defaultValue: 'Close' })}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t('deck-title-placeholder', { defaultValue: 'Deck title' })}
              maxLength={100}
              className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t('description-placeholder', { defaultValue: 'Description (optional)' })}
              maxLength={500}
              className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <div className="rounded-site-sm border border-site-accent/30 bg-site-accent/5 p-2">
              <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-site-accent">
                <Sparkles className="h-3 w-3" /> {t('ai-tutor-label', { defaultValue: 'AI tutor — auto-generate cards' })}
              </label>
              <input
                value={form.generateTopic}
                onChange={(e) => setForm((f) => ({ ...f, generateTopic: e.target.value }))}
                placeholder={t('generate-topic-placeholder', { defaultValue: "Topic, e.g. 'French Revolution causes' (optional)" })}
                maxLength={200}
                className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isPublic: !f.isPublic }))}
                className="inline-flex items-center gap-1.5 rounded-site-sm border border-site-border px-2.5 py-1.5 text-xs font-medium text-site-text-muted hover:text-site-text"
              >
                {form.isPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {form.isPublic ? t('public', { defaultValue: 'Public' }) : t('private', { defaultValue: 'Private' })}
              </button>
              {error && <p className="text-xs text-site-danger">{error}</p>}
              <Button size="sm" variant="accent" disabled={busy || form.title.trim().length < 1} onClick={create}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('create-deck', { defaultValue: 'Create deck' })}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6 p-4">
        {mine.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('your-decks', { defaultValue: 'Your decks' })}</h2>
            <div className="space-y-2">{mine.map((d) => DeckCard(d))}</div>
          </section>
        )}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('public-decks', { defaultValue: 'Public decks' })}</h2>
          {popular.length === 0 ? (
            <p className="py-10 text-center text-sm text-site-text-muted">{t('no-public-decks', { defaultValue: 'No public decks yet.' })}</p>
          ) : (
            <div className="space-y-2">{popular.map((d) => DeckCard(d, true))}</div>
          )}
        </section>
      </div>
    </div>
  );
}
