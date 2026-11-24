import { useDeferredValue, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '@/components/ui/copy-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToolFrame, ToolSection, ToolSwitch } from '@/components/toolbox/ToolFrame';
import { diffLines, splitLines, summarise, unifiedDiff } from '@/lib/toolbox/diff';
import { cn } from '@/lib/utils';

/** Past this many lines the list stops drawing; the unified diff still holds everything. */
const RENDER_LIMIT = 3000;

export function DiffTool() {
  const { t } = useTranslation('toolbox');
  const oldId = useId();
  const newId = useId();
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const a = useDeferredValue(before);
  const b = useDeferredValue(after);

  const lines = useMemo(
    () => diffLines(splitLines(a), splitLines(b), { ignoreWhitespace, ignoreCase }),
    [a, b, ignoreWhitespace, ignoreCase],
  );
  const summary = summarise(lines);
  const patch = useMemo(() => unifiedDiff(lines), [lines]);
  const hasInput = a !== '' || b !== '';

  return (
    <ToolFrame slug="diff">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={oldId}>{t('diff-original', { defaultValue: 'Original' })}</Label>
          <Textarea
            id={oldId}
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            rows={10}
            spellCheck={false}
            dir="ltr"
            className="font-mono"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={newId}>{t('diff-changed', { defaultValue: 'Changed' })}</Label>
          <Textarea
            id={newId}
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            rows={10}
            spellCheck={false}
            dir="ltr"
            className="font-mono"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6">
        <ToolSwitch
          label={t('diff-ignore-whitespace', { defaultValue: 'Ignore whitespace' })}
          checked={ignoreWhitespace}
          onCheckedChange={setIgnoreWhitespace}
        />
        <ToolSwitch
          label={t('diff-ignore-case', { defaultValue: 'Ignore case' })}
          checked={ignoreCase}
          onCheckedChange={setIgnoreCase}
        />
      </div>

      {hasInput && (
        <ToolSection
          title={t('diff-result', { defaultValue: 'Differences' })}
          action={
            patch ? (
              <CopyButton value={patch} toastOnCopy>
                {t('diff-copy-patch', { defaultValue: 'Copy unified diff' })}
              </CopyButton>
            ) : undefined
          }
        >
          <p className="t-body" aria-live="polite">
            {summary.added === 0 && summary.removed === 0
              ? t('diff-identical', { defaultValue: 'The texts are the same.' })
              : t('diff-summary', {
                  defaultValue: '{{added}} added, {{removed}} removed, {{unchanged}} unchanged',
                  added: summary.added,
                  removed: summary.removed,
                  unchanged: summary.unchanged,
                })}
          </p>
          <ol dir="ltr" className="overflow-x-auto border-y border-site-border font-mono text-sm">
            {lines.slice(0, RENDER_LIMIT).map((line, i) => (
              <li
                key={i}
                className={cn(
                  'flex gap-3 whitespace-pre px-3 py-0.5',
                  line.op === 'insert' && 'text-site-success',
                  line.op === 'delete' && 'text-site-danger',
                )}
              >
                <span aria-hidden className="w-10 shrink-0 text-right text-site-text-muted">
                  {line.oldLine ?? ''}
                </span>
                <span aria-hidden className="w-10 shrink-0 text-right text-site-text-muted">
                  {line.newLine ?? ''}
                </span>
                <span className="w-3 shrink-0">
                  {line.op === 'insert' ? '+' : line.op === 'delete' ? '−' : ''}
                  <span className="sr-only">
                    {line.op === 'insert'
                      ? t('diff-added-line', { defaultValue: 'Added' })
                      : line.op === 'delete'
                        ? t('diff-removed-line', { defaultValue: 'Removed' })
                        : ''}
                  </span>
                </span>
                <span>{line.text || ' '}</span>
              </li>
            ))}
          </ol>
          {lines.length > RENDER_LIMIT && (
            <p className="t-meta">
              {t('diff-truncated', {
                defaultValue: 'Showing the first {{limit}} lines. The unified diff has all of them.',
                limit: RENDER_LIMIT,
              })}
            </p>
          )}
        </ToolSection>
      )}
    </ToolFrame>
  );
}
