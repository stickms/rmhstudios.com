import { useId, useRef, useState } from 'react';
import { Dices } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, ResultRow, ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import { MAX_DICE, MAX_SIDES, average, formatDice, parseDice, range, roll, type RollResult } from '@/lib/toolbox/dice';
import { cn } from '@/lib/utils';

const PRESETS = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', '2d6', '4d6kh3', '2d20kh1', '2d20kl1'];
const HISTORY = 20;

interface Entry {
  id: number;
  expression: string;
  result: RollResult;
}

export function DiceTool() {
  const { t, i18n } = useTranslation('toolbox');
  const id = useId();
  const nextId = useRef(1);
  const [text, setText] = useState('1d20+5');
  const [history, setHistory] = useState<Entry[]>([]);
  const parsed = parseDice(text);
  const num = (n: number) => new Intl.NumberFormat(i18n.language || 'en', { maximumFractionDigits: 1 }).format(n);

  const doRoll = (expression: string) => {
    const p = parseDice(expression);
    if (!p.ok) return;
    const entry = { id: nextId.current++, expression: formatDice(p.terms), result: roll(p.terms) };
    setHistory((prev) => [entry, ...prev].slice(0, HISTORY));
  };

  const errorText = () => {
    if (parsed.ok) return '';
    switch (parsed.error) {
      case 'empty':
        return t('dice-error-empty', { defaultValue: 'Enter dice, such as 2d6+3.' });
      case 'syntax':
        return t('dice-error-syntax', { defaultValue: 'Write dice as NdS, such as 3d6, 4d6kh3 or d20+2.' });
      case 'too-many-dice':
        return t('dice-error-count', { defaultValue: 'Roll from 1 to {{max}} dice at a time.', max: MAX_DICE });
      case 'too-many-sides':
        return t('dice-error-sides', { defaultValue: 'A die has from 2 to {{max}} sides.', max: MAX_SIDES });
      case 'too-many-terms':
        return t('dice-error-terms', { defaultValue: 'Use at most 20 parts.' });
      case 'bad-keep':
        return t('dice-error-keep', { defaultValue: 'Keep or drop fewer dice than you roll.' });
    }
  };

  const latest = history[0];
  const stats = parsed.ok ? { ...range(parsed.terms), avg: average(parsed.terms) } : null;

  return (
    <ToolFrame slug="dice">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          doRoll(text);
        }}
      >
        <Label htmlFor={id}>{t('dice-expression', { defaultValue: 'Dice' })}</Label>
        <div className="flex gap-2">
          <Input
            id={id}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="font-mono"
            aria-invalid={parsed.ok ? undefined : true}
          />
          <Button type="submit" variant="primary" disabled={!parsed.ok}>
            <Dices aria-hidden />
            {t('dice-roll', { defaultValue: 'Roll' })}
          </Button>
        </div>
        {!parsed.ok && <FieldError>{errorText()}</FieldError>}
        <p className="t-meta">
          {t('dice-help', {
            defaultValue: 'kh3 keeps the highest 3, kl1 the lowest, dl1 drops the lowest; ! rerolls and adds a maximum.',
          })}
        </p>
      </form>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p}
            variant="default"
            size="sm"
            className="font-mono"
            onClick={() => {
              setText(p);
              doRoll(p);
            }}
          >
            {p}
          </Button>
        ))}
      </div>

      {stats && (
        <p className="t-meta">
          {t('dice-stats', {
            defaultValue: 'Range {{min}} to {{max}}',
            min: num(stats.min),
            max: stats.max === Infinity ? '∞' : num(stats.max),
          })}
          {stats.avg !== null && ` · ${t('dice-average', { defaultValue: 'average {{avg}}', avg: num(stats.avg) })}`}
        </p>
      )}

      {latest && (
        <ToolSection title={latest.expression}>
          <p className="t-title font-mono" aria-live="polite" aria-atomic>
            {latest.result.total}
          </p>
          <ul>
            {latest.result.terms.map((tr, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 border-b border-site-border py-2 last:border-b-0">
                <span className="t-label">{formatDice([{ ...tr.term, sign: 1 }])}</span>
                {tr.dice.length === 0 ? (
                  <span className="font-mono text-sm">{tr.subtotal}</span>
                ) : (
                  tr.dice.map((d, j) => (
                    <span key={j} className={cn('font-mono text-sm', !d.kept && 'text-site-text-muted line-through')}>
                      {d.faces.length > 1 ? `${d.faces.join('+')}` : d.value}
                      {!d.kept && <span className="sr-only">{t('dice-dropped', { defaultValue: '(dropped)' })}</span>}
                    </span>
                  ))
                )}
                {tr.dice.length > 0 && (
                  <span className="ml-auto font-mono text-sm">
                    {tr.term.sign === -1 ? '−' : ''}
                    {Math.abs(tr.subtotal)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </ToolSection>
      )}

      {history.length > 1 && (
        <ToolSection title={t('dice-history', { defaultValue: 'Earlier rolls' })}>
          <ol>
            {history.slice(1).map((h) => (
              <ResultRow key={h.id} as="li" label={h.expression} value={h.result.total} />
            ))}
          </ol>
        </ToolSection>
      )}
    </ToolFrame>
  );
}
