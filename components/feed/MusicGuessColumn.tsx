'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Music, Plus, X, Check, Lightbulb, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { UserAvatar } from './UserAvatar';

interface PuzzleRow {
  id: string;
  artist: string;
  plays: number;
  solves: number;
  solved: boolean;
  author: { id: string; name: string | null; handle: string | null; image: string | null };
}

export function MusicGuessColumn() {
  const { t } = useTranslation('feed');
  const [puzzles, setPuzzles] = useState<PuzzleRow[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [playId, setPlayId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', artist: '', hints: '' });

  const load = useCallback(async () => {
    const res = await fetch('/api/rmhmusic/guess', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setPuzzles(data.puzzles ?? []);
      setSignedIn(!!data.signedIn);
    }
  }, []);

  useEffect(() => {
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
      const hints = form.hints.split('\n').map((h) => h.trim()).filter(Boolean);
      const res = await fetch('/api/rmhmusic/guess', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title.trim(), artist: form.artist.trim(), hints }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t('could-not-create', { defaultValue: 'Could not create' }));
        return;
      }
      setForm({ title: '', artist: '', hints: '' });
      setShowForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }

  const hintLines = form.hints.split('\n').map((h) => h.trim()).filter(Boolean);
  const validForm = form.title.trim() && form.artist.trim() && hintLines.length >= 1;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Music className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">{t('guess-the-song', { defaultValue: 'Guess the Song' })}</h1>
        {signedIn && (
          <Button size="sm" variant="accent" className="ml-auto gap-1" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> {t('new-puzzle', { defaultValue: 'New puzzle' })}
          </Button>
        )}
      </header>

      {showForm && (
        <div className="border-b border-site-border bg-site-surface/30 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-site-text">{t('new-puzzle', { defaultValue: 'New puzzle' })}</h2>
            <button onClick={() => setShowForm(false)} className="text-site-text-dim hover:text-site-text" aria-label={t('close', { defaultValue: 'Close' })}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t('song-title-placeholder', { defaultValue: 'Song title (the answer)' })} maxLength={160} className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent" />
            <input value={form.artist} onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))} placeholder={t('artist-placeholder', { defaultValue: 'Artist (shown to players)' })} maxLength={160} className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent" />
            <textarea value={form.hints} onChange={(e) => setForm((f) => ({ ...f, hints: e.target.value }))} placeholder={t('hints-placeholder', { defaultValue: 'Hints, one per line (revealed progressively). e.g. a lyric, the year, the genre…' })} rows={4} className="w-full resize-none rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent" />
            {error && <p className="text-xs text-site-danger">{error}</p>}
            <div className="flex justify-end">
              <Button size="sm" variant="accent" disabled={busy || !validForm} onClick={create}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('create-puzzle', { defaultValue: 'Create puzzle' })}
              </Button>
            </div>
          </div>
        </div>
      )}

      {puzzles.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-site-text-muted">{t('no-puzzles-yet', { defaultValue: 'No puzzles yet — create the first!' })}</p>
      ) : (
        <div className="space-y-2 p-4">
          {puzzles.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlayId(p.id)}
              className="flex w-full items-center gap-3 rounded-site border border-site-border bg-site-surface p-3 text-left transition-colors hover:border-site-accent/60"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-site bg-site-accent/12 text-site-accent">
                <Music className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-site-text">{t('artist-label', { defaultValue: 'Artist' })}: {p.artist}</p>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-site-text-dim">
                  <UserAvatar user={p.author} />
                  <span className="truncate">{p.author.name || p.author.handle || t('someone', { defaultValue: 'Someone' })}</span>
                  <span aria-hidden>·</span>
                  <span>{t('solves-count', { count: p.solves, defaultValue: '{{count}} solved' })}</span>
                </div>
              </div>
              {p.solved && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-site-success">
                  <Check className="h-4 w-4" /> {t('solved', { defaultValue: 'Solved' })}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {playId && <PlayModal id={playId} signedIn={signedIn} onClose={() => { setPlayId(null); load(); }} />}
    </div>
  );
}

interface Puzzle {
  id: string;
  artist: string;
  hints: string[];
  solved: boolean;
  title: string | null;
  signedIn: boolean;
}

function PlayModal({ id, signedIn, onClose }: { id: string; signedIn: boolean; onClose: () => void }) {
  const { t } = useTranslation('feed');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [revealed, setRevealed] = useState(1);
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState<{ correct: boolean; title?: string; reward?: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/rmhmusic/guess/${id}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Puzzle | null) => {
        setPuzzle(p);
        if (p?.solved) setResult({ correct: true, title: p.title ?? undefined });
      });
  }, [id]);

  async function submit() {
    if (!guess.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rmhmusic/guess/${id}/attempt`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guess: guess.trim(), hintsUsed: revealed - 1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.correct) setResult({ correct: true, title: data.title, reward: data.reward });
        else setResult({ correct: false });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md rounded-site border border-site-border bg-site-bg p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-site-text">
            <Music className="h-5 w-5 text-site-accent" /> {t('guess-the-song', { defaultValue: 'Guess the Song' })}
          </h2>
          <button onClick={onClose} className="text-site-text-dim hover:text-site-text" aria-label={t('close', { defaultValue: 'Close' })}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {!puzzle ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
          </div>
        ) : (
          <>
            <p className="text-sm text-site-text-dim">{t('artist-label', { defaultValue: 'Artist' })}: <span className="font-semibold text-site-text">{puzzle.artist}</span></p>

            <div className="mt-3 space-y-2">
              {puzzle.hints.slice(0, revealed).map((h, i) => (
                <div key={i} className="flex items-start gap-2 rounded-site-sm bg-site-surface p-2.5 text-sm text-site-text">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-site-warning" /> {h}
                </div>
              ))}
            </div>

            {result?.correct ? (
              <div className="mt-4 rounded-site border border-site-success/30 bg-site-success/10 p-3 text-center">
                <p className="inline-flex items-center gap-1.5 font-semibold text-site-success">
                  <Trophy className="h-4 w-4" /> {t('correct-answer', { title: result.title, defaultValue: 'Correct! It\'s "{{title}}"' })}
                </p>
                {result.reward != null && (
                  <p className="mt-1 inline-flex items-center gap-1 text-sm text-site-text-muted">
                    +<CoinIcon className="h-3.5 w-3.5" /> {result.reward}
                  </p>
                )}
              </div>
            ) : signedIn ? (
              <>
                {revealed < puzzle.hints.length && (
                  <button onClick={() => setRevealed((r) => r + 1)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-site-accent hover:underline">
                    <Lightbulb className="h-3.5 w-3.5" /> {t('reveal-another-hint', { revealed, total: puzzle.hints.length, defaultValue: 'Reveal another hint ({{revealed}}/{{total}})' })}
                  </button>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    placeholder={t('your-guess-placeholder', { defaultValue: 'Your guess…' })}
                    className="flex-1 rounded-site-sm border border-site-border bg-site-surface px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
                  />
                  <Button variant="accent" size="sm" disabled={!guess.trim() || busy} onClick={submit}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('guess-button', { defaultValue: 'Guess' })}
                  </Button>
                </div>
                {result && !result.correct && <p className="mt-2 text-sm text-site-danger">{t('not-quite', { defaultValue: 'Not quite — try another hint or guess.' })}</p>}
              </>
            ) : (
              <p className="mt-4 text-center text-sm text-site-text-muted">{t('sign-in-to-guess', { defaultValue: 'Sign in to guess.' })}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
