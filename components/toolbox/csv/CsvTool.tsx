import { useDeferredValue, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '@/components/ui/copy-button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FieldError, ToolFrame, ToolSection, ToolSwitch } from '@/components/toolbox/ToolFrame';
import { detectDelimiter, jsonToRows, parseCsv, rowsToJson, writeCsv } from '@/lib/toolbox/csv';

type Direction = 'csv-to-json' | 'json-to-csv';
type DelimiterChoice = 'auto' | ',' | ';' | 'tab' | '|';

/** Rows the preview table draws; the converted text always holds every row. */
const PREVIEW_ROWS = 20;

export function CsvTool() {
  const { t } = useTranslation('toolbox');
  const inputId = useId();
  const outputId = useId();
  const delimiterId = useId();
  const [direction, setDirection] = useState<Direction>('csv-to-json');
  const [text, setText] = useState('');
  const [delimiterChoice, setDelimiterChoice] = useState<DelimiterChoice>('auto');
  const [header, setHeader] = useState(true);
  const [infer, setInfer] = useState(true);
  const input = useDeferredValue(text);

  const delimiter =
    delimiterChoice === 'auto' ? detectDelimiter(input) : delimiterChoice === 'tab' ? '\t' : delimiterChoice;

  const result = useMemo(() => {
    if (input.trim() === '') return null;
    if (direction === 'csv-to-json') {
      const parsed = parseCsv(input, delimiter);
      return {
        output: JSON.stringify(rowsToJson(parsed.rows, { header, infer }), null, 2),
        rows: parsed.rows,
        warning: parsed.unterminatedQuoteAt
          ? t('csv-unterminated', {
              defaultValue: 'A quoted field opened on line {{line}} never closes.',
              line: parsed.unterminatedQuoteAt.line,
            })
          : null,
        error: null,
      };
    }
    const rows = jsonToRows(input);
    if (!rows.ok) {
      return {
        output: '',
        rows: [],
        warning: null,
        error:
          rows.reason === 'invalid-json'
            ? t('csv-invalid-json', { defaultValue: 'This is not valid JSON.' })
            : t('csv-not-array', { defaultValue: 'The JSON must be an array of objects or of arrays.' }),
      };
    }
    return { output: writeCsv(rows.rows, delimiter), rows: rows.rows, warning: null, error: null };
  }, [input, direction, delimiter, header, infer, t]);

  const delimiterName = (d: string) =>
    d === '\t'
      ? t('csv-delimiter-tab', { defaultValue: 'Tab' })
      : d === ';'
        ? t('csv-delimiter-semicolon', { defaultValue: 'Semicolon' })
        : d === '|'
          ? t('csv-delimiter-pipe', { defaultValue: 'Pipe' })
          : t('csv-delimiter-comma', { defaultValue: 'Comma' });

  const [head, ...body] = result?.rows ?? [];

  return (
    <ToolFrame slug="csv">
      <Tabs
        value={direction}
        onChange={(id) => setDirection(id as Direction)}
        aria-label={t('csv-direction', { defaultValue: 'Conversion' })}
        tabs={[
          { id: 'csv-to-json', label: t('csv-to-json', { defaultValue: 'CSV to JSON' }) },
          { id: 'json-to-csv', label: t('json-to-csv', { defaultValue: 'JSON to CSV' }) },
        ]}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor={inputId}>
          {direction === 'csv-to-json'
            ? t('csv-input-csv', { defaultValue: 'CSV' })
            : t('csv-input-json', { defaultValue: 'JSON array' })}
        </Label>
        <Textarea
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          dir="ltr"
          className="font-mono"
          aria-invalid={result?.error ? true : undefined}
        />
        {result?.error && <FieldError>{result.error}</FieldError>}
        {result?.warning && <FieldError>{result.warning}</FieldError>}
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={delimiterId}>{t('csv-delimiter', { defaultValue: 'Delimiter' })}</Label>
          <Select
            id={delimiterId}
            value={delimiterChoice}
            onChange={(e) => setDelimiterChoice(e.target.value as DelimiterChoice)}
          >
            <option value="auto">
              {direction === 'csv-to-json' && input.trim()
                ? t('csv-delimiter-auto-found', { defaultValue: 'Detect ({{found}})', found: delimiterName(delimiter) })
                : t('csv-delimiter-auto', { defaultValue: 'Detect' })}
            </option>
            <option value=",">{delimiterName(',')}</option>
            <option value=";">{delimiterName(';')}</option>
            <option value="tab">{delimiterName('\t')}</option>
            <option value="|">{delimiterName('|')}</option>
          </Select>
        </div>
        {direction === 'csv-to-json' && (
          <>
            <ToolSwitch
              label={t('csv-header', { defaultValue: 'First row is a header' })}
              checked={header}
              onCheckedChange={setHeader}
            />
            <ToolSwitch
              label={t('csv-infer', { defaultValue: 'Read numbers and true/false' })}
              checked={infer}
              onCheckedChange={setInfer}
            />
          </>
        )}
      </div>

      {result && !result.error && (
        <>
          <ToolSection
            title={t('csv-output', { defaultValue: 'Result' })}
            action={<CopyButton value={result.output} label={t('csv-copy', { defaultValue: 'Copy result' })} />}
          >
            <Label htmlFor={outputId} className="sr-only">
              {t('csv-output', { defaultValue: 'Result' })}
            </Label>
            <Textarea id={outputId} value={result.output} readOnly rows={10} spellCheck={false} className="font-mono" />
          </ToolSection>
          {head && (
            <ToolSection
              title={t('csv-preview', {
                defaultValue: 'Preview, {{rows}} rows',
                rows: direction === 'csv-to-json' && !header ? result.rows.length : body.length,
              })}
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  {(direction === 'json-to-csv' || header) && (
                    <thead>
                      <tr>
                        {head.map((cell, i) => (
                          <th key={i} scope="col" className="t-label border-b border-site-border px-2 py-2">
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {(direction === 'csv-to-json' && !header ? result.rows : body)
                      .slice(0, PREVIEW_ROWS)
                      .map((row, r) => (
                        <tr key={r} className="border-b border-site-border">
                          {row.map((cell, c) => (
                            <td key={c} className="max-w-60 truncate px-2 py-2 font-mono">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </ToolSection>
          )}
        </>
      )}
    </ToolFrame>
  );
}
