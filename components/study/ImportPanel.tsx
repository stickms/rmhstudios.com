import { useDeferredValue, useId, useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { rowsFor } from '@/lib/study/card-types';
import { parseCards, SEPARATORS, type ParsedCard, type RejectReason, type Separator } from '@/lib/study/import';
import {
  MAX_DECK_CARDS,
  MAX_IMPORT_CARDS,
  MAX_IMPORT_FILE_BYTES,
} from '@/lib/study/limits';

const PREVIEW_ROWS = 50;

/** Pasted text or a file, parsed in the browser; only the parsed cards are sent. */
export function ImportPanel({
  existingFronts,
  cardCount,
  onImport,
}: {
  /** The deck's current fronts, for "skip cards already in the deck". */
  existingFronts: string[];
  cardCount: number;
  /** Resolves true when the cards were added. */
  onImport: (cards: ParsedCard[]) => Promise<boolean>;
}) {
  const { t } = useTranslation('study-editor');
  const { t: ts } = useTranslation('flashcard-types');
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [separator, setSeparator] = useState<Separator | 'auto'>('auto');
  const [hasHeader, setHasHeader] = useState(false);
  const [swap, setSwap] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [busy, setBusy] = useState(false);
  const deferred = useDeferredValue(text);

  const parsed = useMemo(
    () =>
      parseCards(deferred, {
        separator: separator === 'auto' ? undefined : separator,
        hasHeader,
        swap,
      }),
    [deferred, separator, hasHeader, swap],
  );

  const known = useMemo(
    () => new Set(existingFronts.map((f) => f.trim().toLowerCase())),
    [existingFronts],
  );
  const { cards, duplicates } = useMemo(() => {
    if (!skipDuplicates) return { cards: parsed.cards, duplicates: 0 };
    const kept = parsed.cards.filter((c) => !known.has(c.front.toLowerCase()));
    return { cards: kept, duplicates: parsed.cards.length - kept.length };
  }, [parsed.cards, known, skipDuplicates]);

  const tooMany = cards.length > MAX_IMPORT_CARDS;
  // The cap counts every row: a reversible card adds two, a cloze card one per deletion index and itself.
  const newRows = cards.reduce((sum, c) => sum + rowsFor({ kind: c.kind ?? 'basic', front: c.front, back: c.back }), 0);
  const deckFull = cardCount + newRows > MAX_DECK_CARDS;
  const typed = cards.some((c) => c.kind !== undefined);
  const hasText = text.trim() !== '';
  const canImport = cards.length > 0 && !tooMany && !deckFull && !busy;

  const separatorLabel: Record<Separator, string> = {
    tab: t('sep-tab', { defaultValue: 'Tab' }),
    comma: t('sep-comma', { defaultValue: 'Comma' }),
    semicolon: t('sep-semicolon', { defaultValue: 'Semicolon' }),
    dash: t('sep-dash', { defaultValue: 'Dash ( - )' }),
    equals: t('sep-equals', { defaultValue: 'Equals (=)' }),
    colon: t('sep-colon', { defaultValue: 'Colon (:)' }),
  };
  const reasonLabel: Record<RejectReason, string> = {
    'missing-front': t('reason-missing-front', { defaultValue: 'No front' }),
    'missing-back': t('reason-missing-back', { defaultValue: 'No back' }),
    'front-too-long': t('reason-front-too-long', { defaultValue: 'Front is over 500 characters' }),
    'back-too-long': t('reason-back-too-long', { defaultValue: 'Back is over 500 characters' }),
    'invalid-cloze': ts('reason-invalid-cloze', {
      defaultValue: 'The cloze text has a broken, nested or missing deletion',
    }),
  };
  const typeLabel = {
    basic: ts('type-basic', { defaultValue: 'Basic' }),
    reversible: ts('type-reversible', { defaultValue: 'Reversible' }),
    cloze: ts('type-cloze', { defaultValue: 'Cloze' }),
  };

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      toast.error(t('file-too-large', { defaultValue: 'That file is over 1 MB' }));
      return;
    }
    try {
      setText(await file.text());
    } catch {
      toast.error(t('file-unreadable', { defaultValue: 'Could not read that file' }));
    }
  }

  async function run() {
    if (!canImport) return;
    setBusy(true);
    const ok = await onImport(cards);
    setBusy(false);
    if (ok) setText('');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-text`}>{t('paste-label', { defaultValue: 'Paste cards' })}</Label>
        <Textarea
          id={`${uid}-text`}
          dir="auto"
          rows={8}
          value={text}
          placeholder={t('paste-placeholder', {
            defaultValue: 'One card per line: term, then a tab, comma, dash, = or : and the definition',
          })}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.tsv,.csv,text/plain,text/csv,text/tab-separated-values"
            className="sr-only"
            tabIndex={-1}
            aria-label={t('file-input', { defaultValue: 'Choose a .txt, .tsv or .csv file' })}
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button variant="default" onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden />
            {t('choose-file', { defaultValue: 'Choose file' })}
          </Button>
          <p className="t-meta">{t('file-hint', { defaultValue: '.txt, .tsv or .csv, up to 1 MB' })}</p>
        </div>
        <p className="t-meta">
          {ts('import-types-hint', {
            defaultValue:
              'A third column reading reverse makes a reversible card. A front with {{syntax}} makes a cloze card.',
            syntax: '{{c1::answer}}',
            interpolation: { escapeValue: false },
          })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-sep`}>{t('separator', { defaultValue: 'Separator' })}</Label>
          <Select
            id={`${uid}-sep`}
            value={separator}
            onChange={(e) => setSeparator(e.target.value as Separator | 'auto')}
          >
            <option value="auto">
              {parsed.separator && separator === 'auto'
                ? t('sep-auto-detected', {
                    defaultValue: 'Detect ({{name}})',
                    name: separatorLabel[parsed.separator],
                  })
                : t('sep-auto', { defaultValue: 'Detect' })}
            </option>
            {SEPARATORS.map((s) => (
              <option key={s} value={s}>
                {separatorLabel[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-3">
          <ToggleRow
            label={t('has-header', { defaultValue: 'First row is a header' })}
            checked={hasHeader}
            onChange={setHasHeader}
          />
          <ToggleRow
            label={t('swap-sides', { defaultValue: 'Swap front and back' })}
            checked={swap}
            onChange={setSwap}
          />
          <ToggleRow
            label={t('skip-duplicates', { defaultValue: 'Skip cards already in the deck' })}
            checked={skipDuplicates}
            onChange={setSkipDuplicates}
          />
        </div>
      </div>

      {hasText && (
        <div className="flex flex-col gap-4" aria-live="polite">
          <p className="t-body">
            {t('preview-summary', {
              count: cards.length,
              defaultValue_one: '{{count}} card ready to import',
              defaultValue: '{{count}} cards ready to import',
            })}
            {parsed.rejected.length > 0 &&
              ` · ${t('rejected-count', {
                count: parsed.rejected.length,
                defaultValue_one: '{{count}} line rejected',
                defaultValue: '{{count}} lines rejected',
              })}`}
            {duplicates > 0 &&
              ` · ${t('duplicates-count', {
                count: duplicates,
                defaultValue_one: '{{count}} already in the deck',
                defaultValue: '{{count}} already in the deck',
              })}`}
          </p>
          {tooMany && (
            <p role="alert" className="t-body text-site-danger">
              {t('too-many', {
                max: MAX_IMPORT_CARDS,
                defaultValue: 'One import adds at most {{max}} cards. Split the list.',
              })}
            </p>
          )}
          {deckFull && !tooMany && (
            <p role="alert" className="t-body text-site-danger">
              {t('deck-full', {
                max: MAX_DECK_CARDS,
                defaultValue: 'A deck holds at most {{max}} cards.',
              })}
            </p>
          )}

          {cards.length > 0 && (
            <table className="w-full border-collapse text-start">
              <caption className="t-label pb-2 text-start">
                {cards.length > PREVIEW_ROWS
                  ? t('preview-caption-first', {
                      count: PREVIEW_ROWS,
                      defaultValue: 'Preview: the first {{count}} cards',
                    })
                  : t('preview-caption', { defaultValue: 'Preview' })}
              </caption>
              <thead>
                <tr className="border-b border-site-border">
                  <th scope="col" className="t-label py-2 pe-3 text-start">
                    {swap ? t('back', { defaultValue: 'Back' }) : t('front', { defaultValue: 'Front' })}
                  </th>
                  <th scope="col" className="t-label py-2 pe-3 text-start">
                    {swap ? t('front', { defaultValue: 'Front' }) : t('back', { defaultValue: 'Back' })}
                  </th>
                  {typed && (
                    <th scope="col" className="t-label py-2 text-start">
                      {ts('type', { defaultValue: 'Type' })}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {cards.slice(0, PREVIEW_ROWS).map((c, i) => (
                  <tr key={i} className="border-b border-site-border align-top">
                    <td dir="auto" className="t-body py-2 pe-3 break-words">
                      {c.front}
                    </td>
                    <td dir="auto" className="t-body py-2 pe-3 break-words whitespace-pre-wrap text-site-text-muted">
                      {c.back}
                    </td>
                    {typed && <td className="t-meta py-2">{typeLabel[c.kind ?? 'basic']}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {parsed.rejected.length > 0 && (
            <table className="w-full border-collapse text-start">
              <caption className="t-label pb-2 text-start">
                {t('rejected-caption', { defaultValue: 'Rejected lines' })}
              </caption>
              <thead>
                <tr className="border-b border-site-border">
                  <th scope="col" className="t-label py-2 pe-3 text-start">
                    {t('line', { defaultValue: 'Line' })}
                  </th>
                  <th scope="col" className="t-label py-2 text-start">
                    {t('reason', { defaultValue: 'Reason' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {parsed.rejected.map((r) => (
                  <tr key={r.line} id={`${uid}-line-${r.line}`} className="border-b border-site-border">
                    <th scope="row" className="t-meta py-2 pe-3 text-start font-normal">
                      {r.line}
                    </th>
                    <td className="t-body py-2">{reasonLabel[r.reason]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div>
        <Button variant="primary" disabled={!canImport} loading={busy} onClick={run}>
          {t('import-cards', {
            count: cards.length,
            defaultValue_one: 'Import {{count}} card',
            defaultValue: 'Import {{count}} cards',
          })}
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={id} className="t-body">
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-labelledby={id} />
    </div>
  );
}
