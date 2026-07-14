'use client';

/**
 * Muted-words manager (reader-level content control). Fetches and updates
 * /api/preferences/muted-words. Posts whose text contains a muted word are
 * hidden from the viewer's feed (see lib/feed/timeline.ts). Rendered on
 * /settings/privacy. Auto-saves on add/remove.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { VolumeX, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MAX_WORDS = 100;
const MAX_WORD_LEN = 50;

export function MutedWordsPanel() {
  const { t } = useTranslation('feed');
  const [words, setWords] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/preferences/muted-words', { credentials: 'include' });
        if (res.ok && active) {
          const data = await res.json();
          setWords(Array.isArray(data.words) ? data.words : []);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(
    async (next: string[], previous: string[]) => {
      setSaving(true);
      try {
        const res = await fetch('/api/preferences/muted-words', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ words: next }),
        });
        if (!res.ok) {
          setWords(previous); // revert optimistic change
          toast.error(t('muted-save-failed', { defaultValue: 'Could not save muted words.' }));
          return;
        }
        const data = await res.json();
        // Trust the server's normalized list.
        if (Array.isArray(data.words)) setWords(data.words);
      } catch {
        setWords(previous);
        toast.error(t('muted-save-failed', { defaultValue: 'Could not save muted words.' }));
      } finally {
        setSaving(false);
      }
    },
    [t],
  );

  const addWord = () => {
    const w = input.trim().toLowerCase().slice(0, MAX_WORD_LEN);
    setInput('');
    if (!w) return;
    if (words.includes(w)) return;
    if (words.length >= MAX_WORDS) {
      toast.error(t('muted-limit', { defaultValue: 'You have reached the muted-word limit.' }));
      return;
    }
    const previous = words;
    const next = [...words, w];
    setWords(next); // optimistic
    void persist(next, previous);
  };

  const removeWord = (w: string) => {
    const previous = words;
    const next = words.filter((x) => x !== w);
    setWords(next); // optimistic
    void persist(next, previous);
  };

  return (
    <section className="rounded-site border border-site-border bg-site-surface/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <VolumeX className="h-5 w-5 text-site-accent" aria-hidden />
        <h2 className="text-base font-bold text-site-text">
          {t('muted-title', { defaultValue: 'Muted words' })}
        </h2>
      </div>
      <p className="mb-4 text-sm text-site-text-muted">
        {t('muted-description', {
          defaultValue:
            'Hide posts from your feed when they contain any of these words (case-insensitive). Only you can see this list.',
        })}
      </p>

      <div className="flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addWord();
            }
          }}
          maxLength={MAX_WORD_LEN}
          placeholder={t('muted-placeholder', { defaultValue: 'Add a word or phrase…' })}
          aria-label={t('muted-input-label', { defaultValue: 'Add a muted word' })}
          className="flex-1"
        />
        <Button onClick={addWord} disabled={saving || !input.trim()} className="gap-1.5">
          <Plus className="h-4 w-4" aria-hidden />
          {t('muted-add', { defaultValue: 'Add' })}
        </Button>
      </div>

      {!loading && words.length === 0 ? (
        <p className="mt-4 text-sm text-site-text-dim">
          {t('muted-empty', { defaultValue: 'No muted words yet.' })}
        </p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {words.map((w) => (
            <li key={w}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-site-border bg-site-surface px-3 py-1 text-sm text-site-text">
                {w}
                <button
                  type="button"
                  onClick={() => removeWord(w)}
                  disabled={saving}
                  aria-label={t('muted-remove', { defaultValue: 'Remove {{word}}', word: w })}
                  className="text-site-text-dim hover:text-site-danger disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
