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
import { SettingsSection } from '@/components/settings/SettingsSection';
import { MUTE_DURATIONS, type MuteDuration, type MutedExpiries } from '@/lib/feed/muted-expiry';

const MAX_WORDS = 100;
const MAX_WORD_LEN = 50;

type DurationChoice = 'forever' | MuteDuration;

/** Short "3d" / "5h" / "12m" label for the time left on a timed mute. */
function timeLeft(at: number, now: number): string {
  const ms = Math.max(0, at - now);
  const day = 24 * 60 * 60 * 1000;
  if (ms >= day) return `${Math.ceil(ms / day)}d`;
  const hour = 60 * 60 * 1000;
  if (ms >= hour) return `${Math.ceil(ms / hour)}h`;
  return `${Math.max(1, Math.ceil(ms / 60_000))}m`;
}

export function MutedWordsPanel() {
  const { t } = useTranslation('feed');
  const [words, setWords] = useState<string[]>([]);
  const [expiries, setExpiries] = useState<MutedExpiries>({});
  const [duration, setDuration] = useState<DurationChoice>('forever');
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
          setExpiries(data.expiries && typeof data.expiries === 'object' ? data.expiries : {});
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
    async (
      next: string[],
      previous: string[],
      nextExpiries: MutedExpiries,
      previousExpiries: MutedExpiries,
    ) => {
      setSaving(true);
      try {
        const res = await fetch('/api/preferences/muted-words', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ words: next, expiries: nextExpiries }),
        });
        if (!res.ok) {
          setWords(previous); // revert optimistic change
          setExpiries(previousExpiries);
          toast.error(t('muted-save-failed', { defaultValue: 'Could not save muted words.' }));
          return;
        }
        const data = await res.json();
        // Trust the server's normalized list.
        if (Array.isArray(data.words)) setWords(data.words);
        if (data.expiries && typeof data.expiries === 'object') setExpiries(data.expiries);
      } catch {
        setWords(previous);
        setExpiries(previousExpiries);
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
    const previousExpiries = expiries;
    const next = [...words, w];
    const nextExpiries =
      duration === 'forever' ? expiries : { ...expiries, [w]: Date.now() + MUTE_DURATIONS[duration] };
    setWords(next); // optimistic
    setExpiries(nextExpiries);
    void persist(next, previous, nextExpiries, previousExpiries);
  };

  const removeWord = (w: string) => {
    const previous = words;
    const previousExpiries = expiries;
    const next = words.filter((x) => x !== w);
    const nextExpiries = { ...expiries };
    delete nextExpiries[w];
    setWords(next); // optimistic
    setExpiries(nextExpiries);
    void persist(next, previous, nextExpiries, previousExpiries);
  };

  return (
    <SettingsSection
      icon={VolumeX}
      title={t('muted-title', { defaultValue: 'Muted words' })}
      description={t('muted-description', {
        defaultValue:
          'Hide posts from your feed when they contain any of these words (case-insensitive). Only you can see this list.',
      })}
    >

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
        <select
          value={duration}
          onChange={(e) => setDuration(e.target.value as DurationChoice)}
          aria-label={t('muted-duration-label', { defaultValue: 'How long to mute' })}
          className="glass-inset h-10 rounded-site-sm px-3 text-sm text-site-text"
        >
          <option value="forever">{t('muted-duration-forever', { defaultValue: 'Until I remove it' })}</option>
          <option value="day">{t('muted-duration-day', { defaultValue: '1 day' })}</option>
          <option value="week">{t('muted-duration-week', { defaultValue: '1 week' })}</option>
          <option value="month">{t('muted-duration-month', { defaultValue: '30 days' })}</option>
        </select>
        <Button onClick={addWord} disabled={saving || !input.trim()} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden />
          {t('muted-add', { defaultValue: 'Add' })}
        </Button>
      </div>

      {!loading && words.length === 0 ? (
        <p className="text-sm text-site-text-dim">
          {t('muted-empty', { defaultValue: 'No muted words yet.' })}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {words.map((w) => (
            <li key={w}>
              <span className="inline-flex items-center gap-2 rounded-full glass-fill px-3 py-1 text-sm text-site-text">
                {w}
                {expiries[w] ? (
                  <span className="font-mono text-xs text-site-text-dim">{timeLeft(expiries[w], Date.now())}</span>
                ) : null}
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
    </SettingsSection>
  );
}
