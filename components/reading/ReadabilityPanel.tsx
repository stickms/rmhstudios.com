'use client';

/**
 * L4 readability meter (built on lib/creator/readability.ts): reading time, a
 * Flesch–Kincaid grade for English drafts only (hidden, not wrong, for other
 * languages) and the specific 30+-word sentences worth splitting. Measures a
 * debounced copy of the draft, never on each keystroke, and never blocks typing.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Gauge } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { measure, LONG_SENTENCE, proseOf } from '@/lib/creator/readability';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 450;
const SHOW_SENTENCES = 6;

export default function ReadabilityPanel({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const { t } = useTranslation('f-reading');
  const [debounced, setDebounced] = useState(text);
  const [lang, setLang] = useState<'en' | 'other'>('en');

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(text), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [text]);

  const result = useMemo(() => measure(debounced, lang === 'en' ? 'en' : 'xx'), [debounced, lang]);
  const prose = useMemo(() => proseOf(debounced), [debounced]);
  const stale = debounced !== text;

  const excerpts = useMemo(
    () =>
      result.longSentences.slice(0, SHOW_SENTENCES).map((s) => {
        const raw = prose.slice(s.start, s.end).replace(/\s+/g, ' ').trim();
        return {
          words: s.words,
          text: raw.length > 140 ? `${raw.slice(0, 137)}…` : raw,
          key: s.start,
        };
      }),
    [result, prose],
  );

  return (
    <section
      aria-label={t('readability-heading', { defaultValue: 'Readability' })}
      aria-busy={stale}
      className={cn('glass-fill space-y-3 rounded-site-sm p-3 text-sm', className)}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="font-semibold text-site-text">
          {t('readability-heading', { defaultValue: 'Readability' })}
        </h3>
        <span className="inline-flex items-center gap-1.5 text-site-text-muted">
          <Clock className="size-4" aria-hidden />
          {t('reading-time', {
            count: result.minutes,
            defaultValue: '{{count}} min read',
            defaultValue_other: '{{count}} min read',
          })}
        </span>
        <span className="text-site-text-muted">
          {t('word-count', {
            count: result.words,
            defaultValue: '{{count}} word',
            defaultValue_other: '{{count}} words',
          })}
        </span>
        {result.grade !== null ? (
          <span className="inline-flex items-center gap-1.5 text-site-text-muted">
            <Gauge className="size-4" aria-hidden />
            {t('grade-level', { grade: result.grade, defaultValue: 'Grade {{grade}}' })}
          </span>
        ) : null}
        <label className="ms-auto flex items-center gap-2 text-site-text-muted">
          <span>{t('draft-language', { defaultValue: 'Draft language' })}</span>
          <Select
            controlSize="sm"
            className="w-32"
            value={lang}
            onChange={(e) => setLang(e.target.value === 'en' ? 'en' : 'other')}
            aria-label={t('draft-language', { defaultValue: 'Draft language' })}
          >
            <option value="en">{t('lang-english', { defaultValue: 'English' })}</option>
            <option value="other">{t('lang-other', { defaultValue: 'Other' })}</option>
          </Select>
        </label>
      </div>

      {lang === 'other' ? (
        <p className="text-site-text-dim">
          {t('grade-hidden', {
            defaultValue:
              'The grade level is only calculated for English, so it is hidden rather than shown wrong.',
          })}
        </p>
      ) : null}

      {excerpts.length > 0 ? (
        <div>
          <p className="font-medium text-site-text">
            {t('long-sentences', {
              count: result.longSentences.length,
              n: LONG_SENTENCE,
              defaultValue: '{{count}} sentence has {{n}} or more words',
              defaultValue_other: '{{count}} sentences have {{n}} or more words',
            })}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {excerpts.map((e) => (
              <li
                key={e.key}
                className="rounded-site-sm border border-site-border px-2.5 py-1.5 text-site-text-muted"
              >
                <span className="me-2 font-mono text-xs font-semibold text-site-warning">
                  {t('n-words', { n: e.words, defaultValue: '{{n}} words' })}
                </span>
                {e.text}
              </li>
            ))}
          </ul>
          {result.longSentences.length > SHOW_SENTENCES ? (
            <p className="mt-1.5 text-site-text-dim">
              {t('more-long-sentences', {
                count: result.longSentences.length - SHOW_SENTENCES,
                defaultValue: '…and {{count}} more',
              })}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-site-text-dim">
          {t('no-long-sentences', {
            n: LONG_SENTENCE,
            defaultValue: 'No sentences of {{n}} or more words.',
          })}
        </p>
      )}
    </section>
  );
}
