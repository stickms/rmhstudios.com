'use client';

/**
 * Search the library in a sentence. (Feature 6.)
 *
 * Two things this does not do, both deliberate:
 *
 *  - **It does not replace the search box.** It sits beside it. Typing an
 *    artist's name into a plain filter is faster than a model call and always
 *    will be; this is for the requests a substring cannot express ("fast tracks
 *    I have not played").
 *  - **It does not hide what it did.** The route returns the query object it
 *    built and the panel prints its `interpretation`, so a player who gets
 *    unexpected results can see the filter rather than concluding search is
 *    broken. When no model ran, it says the phrase was matched literally.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LibrarySong } from '@/lib/slice-it/library-filters';
import type { SearchQuery } from '@/lib/slice-it/ai/types';
import { useSliceAi } from './useSliceAi';

interface SearchResponse {
  query: SearchQuery;
  songs: LibrarySong[];
  interpreted: boolean;
}

export function AiSearchBar({
  onResults,
  onClear,
}: {
  /** Hand the matched songs to the library to render in place of its own list. */
  onResults: (songs: LibrarySong[]) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation('c-game');
  const [phrase, setPhrase] = React.useState('');
  const [summary, setSummary] = React.useState<string | null>(null);

  const ai = useSliceAi<SearchResponse, { phrase: string }>('search', (body) => {
    const payload = body as SearchResponse;
    setSummary(
      payload.interpreted && payload.query.interpretation
        ? payload.query.interpretation
        : t('ai-search-literal', {
            defaultValue: 'Matched "{{phrase}}" against titles and artists.',
            phrase: payload.query.terms[0] ?? '',
          }),
    );
    onResults(payload.songs);
    // Always non-null: this route answers with results in every case, so the
    // panel has no `unavailable` state to fall into.
    return payload;
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = phrase.trim();
    if (trimmed) ai.run({ phrase: trimmed });
  };

  const clear = () => {
    setPhrase('');
    setSummary(null);
    ai.reset();
    onClear();
  };

  return (
    <div className="space-y-2">
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-500 pointer-events-none"
            aria-hidden="true"
          />
          <Input
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            maxLength={200}
            placeholder={t('ai-search-placeholder', {
              defaultValue: 'Ask for it — "short fast tracks I haven\'t played"',
            })}
            aria-label={t('ai-search-label', { defaultValue: 'Describe what you want to play' })}
            className="pl-9 h-10 bg-slice-input-bg border-slice-input-border text-slice-text text-xs rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={ai.state === 'loading' || phrase.trim() === ''}
          className="h-10 px-4 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest border-none transition-colors"
        >
          {ai.state === 'loading'
            ? t('ai-search-running', { defaultValue: 'Finding' })
            : t('ai-search-go', { defaultValue: 'Find' })}
        </Button>
        {summary ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={clear}
            aria-label={t('ai-search-clear', { defaultValue: 'Clear this search' })}
            className="h-10 w-10 p-0 rounded-xl text-slice-text-light hover:text-slice-text hover:bg-slice-shadow-dark/20 border-none transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </Button>
        ) : null}
      </form>

      {summary ? (
        <p
          className="text-[10px] font-medium text-slice-text-light leading-relaxed"
          aria-live="polite"
        >
          {summary}
        </p>
      ) : null}
      {ai.state === 'budget' ? (
        <p className="text-[10px] font-medium text-slice-text-light">
          {t('ai-budget', {
            defaultValue: "You've used this month's AI allowance. It resets on the 1st.",
          })}
        </p>
      ) : null}
      {ai.state === 'error' ? (
        <p className="text-[10px] font-medium text-slice-text-light">
          {t('ai-error', { defaultValue: 'That did not come back. Try again in a moment.' })}
        </p>
      ) : null}
    </div>
  );
}
