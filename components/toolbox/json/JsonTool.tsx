import { useDeferredValue, useId, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '@/components/ui/copy-button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FieldError, ResultRow, ToolFrame, ToolSection, ToolSwitch } from '@/components/toolbox/ToolFrame';
import { MAX_JSON_DEPTH, formatJson, jsonStats, type JsonError, type JsonIndent } from '@/lib/toolbox/json';

function errorReason(t: TFunction, error: JsonError): string {
  switch (error.code) {
    case 'empty':
      return t('json-error-empty', { ns: 'toolbox', defaultValue: 'There is nothing to read yet.' });
    case 'unexpected-character':
      return t('json-error-unexpected', { ns: 'toolbox', defaultValue: 'A value cannot start here.' });
    case 'unexpected-end':
      return t('json-error-end', { ns: 'toolbox', defaultValue: 'The document ends too early.' });
    case 'bad-escape':
      return t('json-error-escape', { ns: 'toolbox', defaultValue: 'This escape sequence is not valid.' });
    case 'bad-number':
      return t('json-error-number', { ns: 'toolbox', defaultValue: 'This number is not written the JSON way.' });
    case 'control-character':
      return t('json-error-control', {
        ns: 'toolbox',
        defaultValue: 'Strings cannot hold a raw tab or line break; escape it as \\t or \\n.',
      });
    case 'trailing-content':
      return t('json-error-trailing', { ns: 'toolbox', defaultValue: 'There is more text after the document ends.' });
    case 'expected-colon':
      return t('json-error-colon', { ns: 'toolbox', defaultValue: 'A colon should follow this key.' });
    case 'expected-key':
      return t('json-error-key', { ns: 'toolbox', defaultValue: 'Object keys must be strings in double quotes.' });
    case 'expected-comma':
      return t('json-error-comma', { ns: 'toolbox', defaultValue: 'A comma or a closing bracket should come here.' });
    case 'too-deep':
      return t('json-error-deep', {
        ns: 'toolbox',
        count: Number(MAX_JSON_DEPTH),
        defaultValue_one: 'The document nests more than {{max}} level deep.',
        defaultValue: 'The document nests more than {{max}} levels deep.',
        max: MAX_JSON_DEPTH,
      });
  }
}

export function JsonTool() {
  const { t, i18n } = useTranslation('toolbox');
  const inputId = useId();
  const outputId = useId();
  const indentId = useId();
  const [text, setText] = useState('');
  const [indent, setIndent] = useState<JsonIndent>('2');
  const [sortKeys, setSortKeys] = useState(false);
  const deferred = useDeferredValue(text);
  const result = useMemo(() => formatJson(deferred, indent, sortKeys), [deferred, indent, sortKeys]);
  const stats = useMemo(() => (result.ok ? jsonStats(result.value) : null), [result]);
  const num = (n: number) => new Intl.NumberFormat(i18n.language || 'en').format(n);

  return (
    <ToolFrame slug="json">
      <div className="flex flex-col gap-2">
        <Label htmlFor={inputId}>{t('json-input', { defaultValue: 'JSON' })}</Label>
        <Textarea
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          dir="ltr"
          className="font-mono"
          aria-invalid={!result.ok && deferred.trim() !== '' ? true : undefined}
          placeholder={t('json-placeholder', { defaultValue: 'Paste JSON here' })}
        />
        {!result.ok && deferred.trim() !== '' && (
          <FieldError>
            {t('json-error-at', {
              defaultValue: 'Line {{line}}, column {{column}}: {{reason}}',
              line: result.error.line,
              column: result.error.column,
              reason: errorReason(t, result.error),
            })}
          </FieldError>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={indentId}>{t('json-indent', { defaultValue: 'Layout' })}</Label>
          <Select id={indentId} value={indent} onChange={(e) => setIndent(e.target.value as JsonIndent)}>
            <option value="2">{t('json-indent-2', { defaultValue: 'Two spaces' })}</option>
            <option value="4">{t('json-indent-4', { defaultValue: 'Four spaces' })}</option>
            <option value="tab">{t('json-indent-tab', { defaultValue: 'Tabs' })}</option>
            <option value="minify">{t('json-indent-minify', { defaultValue: 'Minified' })}</option>
          </Select>
        </div>
        <ToolSwitch
          label={t('json-sort-keys', { defaultValue: 'Sort keys' })}
          checked={sortKeys}
          onCheckedChange={setSortKeys}
        />
      </div>

      {result.ok && (
        <>
          <ToolSection
            title={t('json-output', { defaultValue: 'Formatted' })}
            action={<CopyButton value={result.text} label={t('json-copy', { defaultValue: 'Copy formatted JSON' })} />}
          >
            <Label htmlFor={outputId} className="sr-only">
              {t('json-output', { defaultValue: 'Formatted' })}
            </Label>
            <Textarea id={outputId} value={result.text} readOnly rows={12} spellCheck={false} className="font-mono" />
          </ToolSection>
          {stats && (
            <ToolSection title={t('json-stats', { defaultValue: 'Structure' })}>
              <div>
                <ResultRow label={t('json-stats-depth', { defaultValue: 'Depth' })} value={num(stats.depth)} />
                <ResultRow label={t('json-stats-objects', { defaultValue: 'Objects' })} value={num(stats.objects)} />
                <ResultRow label={t('json-stats-arrays', { defaultValue: 'Arrays' })} value={num(stats.arrays)} />
                <ResultRow label={t('json-stats-keys', { defaultValue: 'Keys' })} value={num(stats.keys)} />
                <ResultRow label={t('json-stats-strings', { defaultValue: 'Strings' })} value={num(stats.strings)} />
                <ResultRow label={t('json-stats-numbers', { defaultValue: 'Numbers' })} value={num(stats.numbers)} />
                <ResultRow label={t('json-stats-booleans', { defaultValue: 'Booleans' })} value={num(stats.booleans)} />
                <ResultRow label={t('json-stats-nulls', { defaultValue: 'Nulls' })} value={num(stats.nulls)} />
                <ResultRow
                  label={t('json-stats-size', { defaultValue: 'Size, formatted' })}
                  value={t('json-bytes', {
                    defaultValue_one: '{{count}} byte',
                    defaultValue: '{{count}} bytes',
                    count: new TextEncoder().encode(result.text).length,
                  })}
                />
              </div>
            </ToolSection>
          )}
        </>
      )}
    </ToolFrame>
  );
}
