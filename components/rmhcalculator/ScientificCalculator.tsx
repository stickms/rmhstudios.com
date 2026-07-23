/**
 * ScientificCalculator — the expression pad.
 *
 * The user builds an expression (typing directly, or via the keypad which inserts
 * tokens at the caret) and presses "=". Nothing is evaluated locally: the
 * expression is streamed to DeepSeek, whose reasoning shows live and whose final
 * JSON answer is rendered. Past results are kept in a session history you can tap
 * to reuse.
 */

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Delete, Equal, History as HistoryIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { computeStream, CalcStreamError } from '@/lib/rmhcalculator/client';
import type { AngleMode, CalcModel, ComputeResult } from '@/lib/rmhcalculator/types';
import { ReasoningStream } from '@/components/rmhcalculator/ReasoningStream';

interface Key {
  label: string;
  /** Text inserted at the caret. */
  insert?: string;
  /** A special action instead of an insert. */
  action?: 'clear' | 'back' | 'equals';
  /** Accessible name when the label is a bare symbol. */
  aria?: string;
  /** Visual emphasis. */
  tone?: 'fn' | 'op' | 'accent' | 'muted';
  /** Column span in the main pad. */
  span?: number;
}

const FN_KEYS: Key[] = [
  { label: 'sin', insert: 'sin(', tone: 'fn' },
  { label: 'cos', insert: 'cos(', tone: 'fn' },
  { label: 'tan', insert: 'tan(', tone: 'fn' },
  { label: 'ln', insert: 'ln(', tone: 'fn' },
  { label: 'log', insert: 'log(', tone: 'fn' },
  { label: 'sin⁻¹', insert: 'asin(', aria: 'inverse sine', tone: 'fn' },
  { label: 'cos⁻¹', insert: 'acos(', aria: 'inverse cosine', tone: 'fn' },
  { label: 'tan⁻¹', insert: 'atan(', aria: 'inverse tangent', tone: 'fn' },
  { label: '√', insert: 'sqrt(', aria: 'square root', tone: 'fn' },
  { label: 'xʸ', insert: '^', aria: 'power', tone: 'fn' },
  { label: 'π', insert: 'pi', aria: 'pi', tone: 'fn' },
  { label: 'e', insert: 'e', tone: 'fn' },
  { label: '(', insert: '(', tone: 'fn' },
  { label: ')', insert: ')', tone: 'fn' },
  { label: 'n!', insert: '!', aria: 'factorial', tone: 'fn' },
];

const PAD_KEYS: Key[] = [
  { label: 'AC', action: 'clear', aria: 'all clear', tone: 'muted' },
  { label: '⌫', action: 'back', aria: 'backspace', tone: 'muted' },
  { label: '%', insert: '%', tone: 'op' },
  { label: '÷', insert: '/', aria: 'divide', tone: 'op' },
  { label: '7', insert: '7' },
  { label: '8', insert: '8' },
  { label: '9', insert: '9' },
  { label: '×', insert: '*', aria: 'multiply', tone: 'op' },
  { label: '4', insert: '4' },
  { label: '5', insert: '5' },
  { label: '6', insert: '6' },
  { label: '−', insert: '-', aria: 'minus', tone: 'op' },
  { label: '1', insert: '1' },
  { label: '2', insert: '2' },
  { label: '3', insert: '3' },
  { label: '+', insert: '+', aria: 'plus', tone: 'op' },
  { label: '0', insert: '0', span: 2 },
  { label: '.', insert: '.' },
  { label: '=', action: 'equals', aria: 'equals', tone: 'accent' },
];

interface HistoryItem {
  expression: string;
  result: string;
}

export function ScientificCalculator({ model }: { model: CalcModel }) {
  const { t } = useTranslation('c-rmhcalculator');
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [expression, setExpression] = useState('');
  const [angleMode, setAngleMode] = useState<AngleMode>('rad');
  const [computing, setComputing] = useState(false);
  const [reasoning, setReasoning] = useState('');
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  /** Insert text at the caret (or append), keeping focus in the field. */
  const insert = useCallback((text: string) => {
    const el = inputRef.current;
    setExpression((prev) => {
      if (!el) return prev + text;
      const start = el.selectionStart ?? prev.length;
      const end = el.selectionEnd ?? prev.length;
      const next = prev.slice(0, start) + text + prev.slice(end);
      // Restore caret just after the inserted text on the next tick.
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + text.length;
        el.setSelectionRange(pos, pos);
      });
      return next;
    });
  }, []);

  const backspace = useCallback(() => {
    const el = inputRef.current;
    setExpression((prev) => {
      if (!el) return prev.slice(0, -1);
      const start = el.selectionStart ?? prev.length;
      const end = el.selectionEnd ?? prev.length;
      if (start === end) {
        if (start === 0) return prev;
        const next = prev.slice(0, start - 1) + prev.slice(end);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(start - 1, start - 1);
        });
        return next;
      }
      const next = prev.slice(0, start) + prev.slice(end);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start, start);
      });
      return next;
    });
  }, []);

  const compute = useCallback(() => {
    const expr = expression.trim();
    if (!expr || computing) return;
    abortRef.current?.abort();
    setComputing(true);
    setReasoning('');
    setResult(null);
    setError(null);

    const { promise, controller } = computeStream(
      { expression: expr, model, angleMode },
      {
        onThinking: (d) => setReasoning((r) => r + d),
        onResult: (res) => {
          setResult(res);
          if (res.result && !res.error) {
            setHistory((h) => [{ expression: expr, result: res.result }, ...h].slice(0, 20));
          }
        },
      },
    );
    abortRef.current = controller;
    promise
      .catch((err) => {
        const message =
          err instanceof CalcStreamError ? err.message : t('error-generic', { defaultValue: 'Something went wrong.' });
        // An abort (new compute / unmount) isn't a real error.
        if (controller.signal.aborted) return;
        setError(message);
      })
      .finally(() => {
        if (abortRef.current === controller) {
          setComputing(false);
          abortRef.current = null;
        }
      });
  }, [expression, computing, model, angleMode, t]);

  const onKey = useCallback(
    (key: Key) => {
      if (key.action === 'clear') {
        setExpression('');
        setResult(null);
        setError(null);
        setReasoning('');
        inputRef.current?.focus();
        return;
      }
      if (key.action === 'back') return backspace();
      if (key.action === 'equals') return compute();
      if (key.insert) insert(key.insert);
    },
    [backspace, compute, insert],
  );

  const applyHistory = (item: HistoryItem) => {
    setExpression(item.expression);
    setResult(null);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const copyResult = () => {
    if (!result?.result) return;
    void navigator.clipboard?.writeText(result.result).then(
      () => toast.success(t('copied', { defaultValue: 'Copied to clipboard' })),
      () => {},
    );
  };

  const toneClass = (tone?: Key['tone']) =>
    tone === 'accent'
      ? 'rmhcalc-key--accent'
      : tone === 'op'
        ? 'rmhcalc-key--op'
        : tone === 'fn'
          ? 'rmhcalc-key--fn'
          : tone === 'muted'
            ? 'rmhcalc-key--muted'
            : '';

  return (
    <div className="rmhcalc-sci">
      <div className="rmhcalc-sci__main">
        {/* Display */}
        <div className="rmhcalc-display">
          <div className="rmhcalc-display__top">
            <div
              role="radiogroup"
              aria-label={t('angle-mode', { defaultValue: 'Angle mode' })}
              className="rmhcalc-angle"
            >
              {(['rad', 'deg'] as AngleMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={angleMode === m}
                  className={cn('rmhcalc-angle__btn', angleMode === m && 'is-active')}
                  onClick={() => setAngleMode(m)}
                >
                  {m === 'rad'
                    ? t('rad', { defaultValue: 'RAD' })
                    : t('deg', { defaultValue: 'DEG' })}
                </button>
              ))}
            </div>
          </div>

          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            className="rmhcalc-display__input"
            placeholder={t('expr-placeholder', { defaultValue: 'Enter an expression…' })}
            aria-label={t('expr-label', { defaultValue: 'Expression' })}
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                compute();
              }
            }}
          />

          <div className="rmhcalc-display__result" aria-live="polite">
            {error ? (
              <span className="rmhcalc-display__error">{error}</span>
            ) : result?.error ? (
              <span className="rmhcalc-display__error">{result.error}</span>
            ) : result?.result ? (
              <button type="button" className="rmhcalc-display__value" onClick={copyResult}
                title={t('copy', { defaultValue: 'Copy result' })}>
                {result.result}
              </button>
            ) : computing ? (
              <span className="rmhcalc-display__hint">
                {t('computing', { defaultValue: 'DeepSeek is calculating…' })}
              </span>
            ) : (
              <span className="rmhcalc-display__hint">
                {t('press-equals', { defaultValue: 'Press = to calculate' })}
              </span>
            )}
            {result?.exact && !result.error ? (
              <span className="rmhcalc-display__exact">= {result.exact}</span>
            ) : null}
          </div>

          {result?.steps && result.steps.length > 0 && !result.error ? (
            <ol className="rmhcalc-steps">
              {result.steps.map((s, i) => (
                <li key={i} className="rmhcalc-steps__item">
                  {s}
                </li>
              ))}
            </ol>
          ) : null}
        </div>

        <ReasoningStream text={reasoning} active={computing} />

        {/* Keypads */}
        <div className="rmhcalc-fnpad">
          {FN_KEYS.map((key) => (
            <button
              key={key.label}
              type="button"
              className={cn('rmhcalc-key', toneClass(key.tone))}
              aria-label={key.aria}
              onClick={() => onKey(key)}
            >
              {key.label}
            </button>
          ))}
        </div>

        <div className="rmhcalc-keypad">
          {PAD_KEYS.map((key) => (
            <button
              key={key.label}
              type="button"
              className={cn('rmhcalc-key', toneClass(key.tone))}
              style={key.span ? { gridColumn: `span ${key.span}` } : undefined}
              aria-label={key.aria}
              onClick={() => onKey(key)}
            >
              {key.action === 'back' ? (
                <Delete size={18} aria-hidden="true" />
              ) : key.action === 'equals' ? (
                <Equal size={18} aria-hidden="true" />
              ) : (
                key.label
              )}
            </button>
          ))}
        </div>
      </div>

      {/* History */}
      <aside className="rmhcalc-history" aria-label={t('history', { defaultValue: 'History' })}>
        <div className="rmhcalc-history__header">
          <HistoryIcon size={15} aria-hidden="true" />
          <span>{t('history', { defaultValue: 'History' })}</span>
        </div>
        {history.length === 0 ? (
          <p className="rmhcalc-history__empty">
            {t('history-empty', { defaultValue: 'Your calculations will appear here.' })}
          </p>
        ) : (
          <ul className="rmhcalc-history__list">
            {history.map((item, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="rmhcalc-history__item"
                  onClick={() => applyHistory(item)}
                >
                  <span className="rmhcalc-history__expr">{item.expression}</span>
                  <span className="rmhcalc-history__res">= {item.result}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
