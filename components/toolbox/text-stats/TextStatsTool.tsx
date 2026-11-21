import { useDeferredValue, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResultRow, ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import { formatDuration, textStats, topWords } from '@/lib/toolbox/text-stats';

export function TextStatsTool() {
  const { t, i18n } = useTranslation('toolbox');
  const locale = i18n.language || 'en';
  const id = useId();
  const [text, setText] = useState('');
  // Counting a long document on every keystroke is the one cost here; deferring keeps typing responsive.
  const deferred = useDeferredValue(text);
  const stats = useMemo(() => textStats(deferred, locale), [deferred, locale]);
  const top = useMemo(() => topWords(deferred, { locale }), [deferred, locale]);
  const num = (n: number, digits = 0) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);

  return (
    <ToolFrame slug="text-stats">
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{t('text-stats-input', { defaultValue: 'Your text' })}</Label>
        <Textarea
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={t('text-stats-placeholder', { defaultValue: 'Paste or type text here' })}
        />
      </div>

      <ToolSection title={t('text-stats-counts', { defaultValue: 'Counts' })}>
        <div aria-live="polite">
          <ResultRow label={t('text-stats-words', { defaultValue: 'Words' })} value={num(stats.words)} />
          <ResultRow label={t('text-stats-characters', { defaultValue: 'Characters' })} value={num(stats.characters)} />
          <ResultRow
            label={t('text-stats-characters-no-spaces', { defaultValue: 'Characters without spaces' })}
            value={num(stats.charactersNoSpaces)}
          />
          <ResultRow label={t('text-stats-sentences', { defaultValue: 'Sentences' })} value={num(stats.sentences)} />
          <ResultRow label={t('text-stats-paragraphs', { defaultValue: 'Paragraphs' })} value={num(stats.paragraphs)} />
          <ResultRow label={t('text-stats-lines', { defaultValue: 'Lines' })} value={num(stats.lines)} />
        </div>
      </ToolSection>

      <ToolSection title={t('text-stats-details', { defaultValue: 'Details' })}>
        <div>
          <ResultRow
            label={t('text-stats-reading', { defaultValue: 'Reading time' })}
            value={formatDuration(stats.readingSeconds)}
          />
          <ResultRow
            label={t('text-stats-speaking', { defaultValue: 'Speaking time' })}
            value={formatDuration(stats.speakingSeconds)}
          />
          <ResultRow
            label={t('text-stats-average', { defaultValue: 'Average word length' })}
            value={num(stats.averageWordLength, 1)}
          />
          <ResultRow
            label={t('text-stats-longest', { defaultValue: 'Longest word' })}
            value={stats.longestWord || '–'}
          />
          <ResultRow
            label={t('text-stats-code-units', { defaultValue: 'UTF-16 code units' })}
            value={num(stats.codeUnits)}
          />
          <ResultRow label={t('text-stats-bytes', { defaultValue: 'UTF-8 bytes' })} value={num(stats.bytes)} />
        </div>
      </ToolSection>

      <ToolSection title={t('text-stats-top', { defaultValue: 'Most used words' })}>
        {top.length === 0 ? (
          <p className="t-body text-site-text-muted">
            {t('text-stats-top-empty', { defaultValue: 'Words of four letters or more appear here.' })}
          </p>
        ) : (
          <ol>
            {top.map((entry) => (
              <ResultRow key={entry.word} as="li" label={entry.word} value={num(entry.count)} />
            ))}
          </ol>
        )}
      </ToolSection>
    </ToolFrame>
  );
}
