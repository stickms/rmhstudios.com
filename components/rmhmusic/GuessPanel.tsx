'use client';

/**
 * RMH Music — in-room "Guess the Song" panel.
 *
 * Brings the music-trivia feature directly into a listening room: members can
 * browse puzzles, reveal hints, and guess for coins without leaving the room.
 * Uses the existing /api/rmhmusic/guess endpoints. Puzzle creation lives on the
 * full Guess the Song page, linked from the header.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music2, Loader2, ArrowLeft, ExternalLink, Lightbulb, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';

interface PuzzleRow {
  id: string;
  artist: string;
  plays: number;
  solves: number;
  solved: boolean;
  author?: { name: string | null };
}

interface ActivePuzzle {
  id: string;
  artist: string;
  hints: string[];
  solved: boolean;
  title: string | null;
  signedIn: boolean;
}

export default function GuessPanel() {
  const { t } = useTranslation("c-rmhmusic");
  const isGuessOpen = useRmhMusicStore((s) => s.isGuessOpen);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [puzzles, setPuzzles] = useState<PuzzleRow[]>([]);

  const [active, setActive] = useState<ActivePuzzle | null>(null);
  const [revealed, setRevealed] = useState(1);
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState<{ correct: boolean; title?: string; reward?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadPuzzles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rmhmusic/guess', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPuzzles(data.puzzles ?? []);
        setSignedIn(!!data.signedIn);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isGuessOpen) loadPuzzles();
  }, [isGuessOpen, loadPuzzles]);

  const openPuzzle = useCallback(async (id: string) => {
    setActive(null);
    setRevealed(1);
    setGuess('');
    setResult(null);
    const res = await fetch(`/api/rmhmusic/guess/${id}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setActive(data);
      if (data.solved) setResult({ correct: true, title: data.title });
    }
  }, []);

  const submitGuess = useCallback(async () => {
    if (!active || !guess.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rmhmusic/guess/${active.id}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ guess: guess.trim(), hintsUsed: Math.max(0, revealed - 1) }),
      });
      const data = await res.json();
      if (data.correct) {
        setResult({ correct: true, title: data.title, reward: data.reward });
      } else {
        setResult({ correct: false });
      }
    } finally {
      setSubmitting(false);
    }
  }, [active, guess, revealed, submitting]);

  const backToList = useCallback(() => {
    setActive(null);
    loadPuzzles();
  }, [loadPuzzles]);

  return (
    <AnimatePresence>
      {isGuessOpen && (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed right-0 top-0 bottom-[73px] w-80 z-40 flex flex-col overflow-hidden backdrop-blur-xl border-l"
          style={{ background: 'color-mix(in srgb, var(--site-bg) 90%, transparent)', borderColor: 'color-mix(in srgb, var(--site-text) 10%, transparent)' }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'color-mix(in srgb, var(--site-text) 10%, transparent)' }}>
            <div className="flex items-center gap-2">
              <Music2 className="w-4 h-4" style={{ color: 'var(--site-accent)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--site-text)' }}>{t("guess-the-song", { defaultValue: "Guess the Song" })}</span>
            </div>
            <a
              href="/music-trivia"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--site-text-muted)' }}
            >
              {t("new", { defaultValue: "New" })} <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--site-accent)' }} />
              </div>
            ) : active ? (
              /* ── Play view ── */
              <div className="space-y-3">
                <button
                  onClick={backToList}
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: 'var(--site-text-muted)' }}
                >
                  <ArrowLeft className="w-4 h-4" /> {t("puzzles", { defaultValue: "Puzzles" })}
                </button>

                <div>
                  <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--site-text-dim)' }}>{t("artist", { defaultValue: "Artist" })}</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--site-text)' }}>{active.artist}</p>
                </div>

                <div className="space-y-1.5">
                  {active.hints.slice(0, revealed).map((h, i) => (
                    <div key={i} className="flex gap-2 text-sm rounded-lg px-3 py-2" style={{ background: 'var(--site-surface)', color: 'var(--site-text)' }}>
                      <Lightbulb className="w-4 h-4 shrink-0" style={{ color: 'var(--site-accent)' }} />
                      <span>{h}</span>
                    </div>
                  ))}
                  {revealed < active.hints.length && !result?.correct && (
                    <button
                      onClick={() => setRevealed((r) => r + 1)}
                      className="text-xs"
                      style={{ color: 'var(--site-accent)' }}
                    >
                      {t("reveal-another-hint", { defaultValue: "Reveal another hint ({{count}} left)", count: active.hints.length - revealed })}
                    </button>
                  )}
                </div>

                {result?.correct ? (
                  <div className="rounded-lg px-3 py-3 text-sm flex items-center gap-2" style={{ background: 'color-mix(in srgb, var(--site-accent) 15%, transparent)', color: 'var(--site-text)' }}>
                    <Check className="w-4 h-4" style={{ color: 'var(--site-accent)' }} />
                    <span>
                      {t("correct-title", { defaultValue: "Correct — {{title}}", title: result.title })}
                      {typeof result.reward === 'number' ? t("reward-coins", { defaultValue: " · +{{reward}} coins", reward: result.reward }) : ''}
                    </span>
                  </div>
                ) : active.signedIn || signedIn ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={guess}
                        onChange={(e) => setGuess(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submitGuess()}
                        placeholder={t("song-title-placeholder", { defaultValue: "Song title..." })}
                        className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ background: 'var(--site-surface)', color: 'var(--site-text)' }}
                        maxLength={160}
                      />
                      <button
                        onClick={submitGuess}
                        disabled={!guess.trim() || submitting}
                        className="px-3 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
                        style={{ background: 'var(--site-accent)', color: '#fff' }}
                      >
                        {t("guess", { defaultValue: "Guess" })}
                      </button>
                    </div>
                    {result && !result.correct && (
                      <p className="text-xs" style={{ color: 'var(--site-text-muted)' }}>
                        {t("not-quite", { defaultValue: "Not quite — try another hint or guess." })}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--site-text-muted)' }}>{t("sign-in-to-guess", { defaultValue: "Sign in to guess." })}</p>
                )}
              </div>
            ) : (
              /* ── List view ── */
              <div className="space-y-2">
                {puzzles.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: 'var(--site-text-muted)' }}>
                    {t("no-puzzles-yet", { defaultValue: "No puzzles yet." })}
                  </p>
                ) : (
                  puzzles.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openPuzzle(p.id)}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors"
                      style={{ background: 'var(--site-surface)' }}
                    >
                      <Music2 className="w-4 h-4 shrink-0" style={{ color: 'var(--site-accent)' }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--site-text)' }}>{p.artist}</div>
                        <div className="text-xs" style={{ color: 'var(--site-text-muted)' }}>
                          {t("solves-plays", { defaultValue: "{{solves}} solved · {{plays}} plays", solves: p.solves, plays: p.plays })}
                        </div>
                      </div>
                      {p.solved && <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--site-accent)' }} />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
