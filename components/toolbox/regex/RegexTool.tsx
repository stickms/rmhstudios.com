import { useDeferredValue, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FieldError, ToolFrame, ToolSection, ToolSwitch } from '@/components/toolbox/ToolFrame';
import {
  MAX_MATCHES,
  REGEX_FLAGS,
  compileRegex,
  findMatches,
  replacePreview,
  segmentText,
  type RegexFlag,
} from '@/lib/toolbox/regex';

/** Matches listed in detail; the highlight shows them all. */
const LIST_LIMIT = 100;

export function RegexTool() {
  const { t } = useTranslation('toolbox');
  const patternId = useId();
  const textId = useId();
  const replaceId = useId();
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState<Set<RegexFlag>>(() => new Set<RegexFlag>(['g']));
  const [text, setText] = useState('');
  const [replacement, setReplacement] = useState('');
  const subject = useDeferredValue(text);
  const deferredPattern = useDeferredValue(pattern);

  const flagLabel = (flag: RegexFlag): string => {
    switch (flag) {
      case 'g':
        return t('regex-flag-g', { defaultValue: 'Global (g): every match' });
      case 'i':
        return t('regex-flag-i', { defaultValue: 'Ignore case (i)' });
      case 'm':
        return t('regex-flag-m', { defaultValue: 'Multiline (m): ^ and $ per line' });
      case 's':
        return t('regex-flag-s', { defaultValue: 'Dot all (s): . matches line breaks' });
      case 'u':
        return t('regex-flag-u', { defaultValue: 'Unicode (u)' });
      case 'y':
        return t('regex-flag-y', { defaultValue: 'Sticky (y)' });
    }
  };

  const compiled = useMemo(
    () => (deferredPattern ? compileRegex(deferredPattern, [...flags].join('')) : null),
    [deferredPattern, flags],
  );
  const result = useMemo(() => (compiled?.ok ? findMatches(compiled.regex, subject) : null), [compiled, subject]);
  const segments = useMemo(() => (result ? segmentText(subject, result.matches) : []), [result, subject]);
  const replaced = useMemo(
    () => (compiled?.ok && replacement !== '' ? replacePreview(compiled.regex, subject, replacement) : null),
    [compiled, subject, replacement],
  );

  const toggle = (flag: RegexFlag, on: boolean) =>
    setFlags((prev) => {
      const next = new Set(prev);
      if (on) next.add(flag);
      else next.delete(flag);
      return next;
    });

  return (
    <ToolFrame slug="regex">
      <div className="flex flex-col gap-2">
        <Label htmlFor={patternId}>{t('regex-pattern', { defaultValue: 'Pattern' })}</Label>
        <Input
          id={patternId}
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          dir="ltr"
          className="font-mono"
          placeholder={t('regex-pattern-placeholder', { defaultValue: 'For example: (?<year>\\d{4})-(\\d{2})' })}
          aria-invalid={compiled && !compiled.ok ? true : undefined}
        />
        {compiled && !compiled.ok && <FieldError>{compiled.message}</FieldError>}
      </div>
      <fieldset className="grid gap-x-6 sm:grid-cols-2">
        <legend className="t-label pb-1">{t('regex-flags', { defaultValue: 'Flags' })}</legend>
        {REGEX_FLAGS.map((flag) => (
          <ToolSwitch
            key={flag}
            label={flagLabel(flag)}
            checked={flags.has(flag)}
            onCheckedChange={(on) => toggle(flag, on)}
          />
        ))}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor={textId}>{t('regex-text', { defaultValue: 'Test text' })}</Label>
        <Textarea
          id={textId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          spellCheck={false}
          dir="ltr"
          className="font-mono"
        />
      </div>

      {result && (
        <ToolSection
          title={
            result.truncated
              ? t('regex-matches-capped', {
                  defaultValue_one: 'First {{count}} match',
                  defaultValue: 'First {{count}} matches',
                  count: MAX_MATCHES,
                })
              : t('regex-matches', {
                  defaultValue_one: '{{count}} match',
                  defaultValue: '{{count}} matches',
                  count: result.matches.length,
                })
          }
        >
          {subject && (
            <p
              dir="ltr"
              className="whitespace-pre-wrap break-all border-y border-site-border py-3 font-mono text-sm"
            >
              {segments.map((seg, i) =>
                seg.match === -1 ? (
                  <span key={i}>{seg.text}</span>
                ) : (
                  <mark key={i} className="rounded-site-sm bg-site-text text-site-bg">
                    {seg.text}
                  </mark>
                ),
              )}
            </p>
          )}
          {result.matches.length > 0 && (
            <ol>
              {result.matches.slice(0, LIST_LIMIT).map((m, i) => (
                <li key={i} className="flex flex-col gap-1 border-b border-site-border py-2 last:border-b-0">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-all font-mono text-sm">{m.value === '' ? '∅' : m.value}</span>
                    <span className="t-meta shrink-0">
                      {t('regex-span', { defaultValue: '{{start}}–{{end}}', start: m.start, end: m.end })}
                    </span>
                  </span>
                  {m.groups.map((g) => (
                    <span key={g.index} className="t-meta flex gap-2">
                      <span>{g.name ? `${g.index} ${g.name}` : g.index}</span>
                      <span className="break-all text-site-text">
                        {g.value ?? t('regex-group-unmatched', { defaultValue: 'did not take part' })}
                      </span>
                    </span>
                  ))}
                </li>
              ))}
            </ol>
          )}
        </ToolSection>
      )}

      {compiled?.ok && (
        <ToolSection
          title={t('regex-replace', { defaultValue: 'Replace' })}
          action={replaced !== null ? <CopyButton value={replaced} /> : undefined}
        >
          <Label htmlFor={replaceId} className="sr-only">
            {t('regex-replacement', { defaultValue: 'Replacement' })}
          </Label>
          <Input
            id={replaceId}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            spellCheck={false}
            dir="ltr"
            className="font-mono"
            placeholder={t('regex-replacement-placeholder', { defaultValue: 'Replacement, for example $2/$<year>' })}
          />
          {replaced !== null && <p className="whitespace-pre-wrap break-all font-mono text-sm">{replaced}</p>}
        </ToolSection>
      )}
    </ToolFrame>
  );
}
