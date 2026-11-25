/** The mode control (5e), the DC (PF2e), the free roll box and the last result, in a polite live region. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import type { Degree, FreeRollError, RollMode } from '@features/rmhcharacters/engine/rolls';
import { RollLog } from './RollLog';
import { type RollsApi } from './useRolls';

export function RollBar({ rolls }: { rolls: RollsApi }) {
  const { t } = useTranslation('character-rolls');
  const [input, setInput] = useState('');
  const [error, setError] = useState<FreeRollError | null>(null);

  const modes: { id: RollMode; label: string }[] = [
    { id: 'normal', label: t('mode.normal', { defaultValue: 'Normal' }) },
    { id: 'advantage', label: t('mode.advantage', { defaultValue: 'Advantage' }) },
    { id: 'disadvantage', label: t('mode.disadvantage', { defaultValue: 'Disadvantage' }) },
  ];

  const errorText = (e: FreeRollError): string => {
    switch (e) {
      case 'empty':
        return t('error.empty', { defaultValue: 'Type a roll such as 3d6+2.' });
      case 'syntax':
        return t('error.syntax', { defaultValue: 'That is not dice notation. Use forms like d20, 3d6+2 or 4d6kh3.' });
      case 'too-many-dice':
        return t('error.tooManyDice', { defaultValue: 'Too many dice in one term.' });
      case 'too-many-sides':
        return t('error.tooManySides', { defaultValue: 'A die has too many faces.' });
      case 'too-many-terms':
        return t('error.tooManyTerms', { defaultValue: 'Too many terms in one roll.' });
      case 'bad-keep':
        return t('error.badKeep', { defaultValue: 'You cannot keep or drop that many dice.' });
      case 'sheet-dice':
        return t('error.sheetDice', { defaultValue: 'A sheet roll can use at most 50 dice.' });
      case 'sheet-sides':
        return t('error.sheetSides', { defaultValue: 'A sheet roll can use dice of at most 100 faces.' });
    }
  };

  const degreeText = (d: Degree): string => {
    switch (d) {
      case 'critical-success':
        return t('degree.criticalSuccess', { defaultValue: 'Critical success' });
      case 'success':
        return t('degree.success', { defaultValue: 'Success' });
      case 'failure':
        return t('degree.failure', { defaultValue: 'Failure' });
      case 'critical-failure':
        return t('degree.criticalFailure', { defaultValue: 'Critical failure' });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(rolls.free(input));
  };

  const last = rolls.last;
  const o = last?.outcome;
  const attack = last?.attack;

  return (
    <section
      className="rmhc-noprint flex flex-col gap-3 border-b border-app-border py-4"
      aria-label={t('bar.title', { defaultValue: 'Dice' })}
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {rolls.system === '5e' ? (
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="mb-1 text-sm font-medium text-app-text-muted">
              {t('mode.legend', { defaultValue: 'd20 rolls' })}
            </legend>
            <div role="radiogroup" aria-label={t('mode.legend', { defaultValue: 'd20 rolls' })} className="flex gap-2">
              {modes.map((m) => (
                <label
                  key={m.id}
                  className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-app-sm border border-app-border bg-app-surface px-3 text-sm text-app-text has-[:checked]:border-app-accent has-[:checked]:bg-app-surface-active has-[:checked]:font-medium pointer-coarse:min-h-11"
                >
                  <input
                    type="radio"
                    name="rmhc-roll-mode"
                    className="sr-only"
                    checked={rolls.mode === m.id}
                    onChange={() => rolls.setMode(m.id)}
                  />
                  {m.label}
                </label>
              ))}
            </div>
            <label className="inline-flex min-h-9 items-center gap-2 text-sm text-app-text-muted pointer-coarse:min-h-11">
              <input type="checkbox" checked={rolls.pinned} onChange={(e) => rolls.setPinned(e.target.checked)} />
              {t('mode.pin', { defaultValue: 'Keep this mode' })}
            </label>
          </fieldset>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-app-text-muted">{t('dc.label', { defaultValue: 'Target DC' })}</span>
            <Input
              type="number"
              inputMode="numeric"
              value={rolls.dc}
              onChange={(e) => rolls.setDc(e.target.value)}
              placeholder={t('dc.placeholder', { defaultValue: 'Optional' })}
              className="w-28"
            />
          </label>
        )}

        <form onSubmit={submit} className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-app-text-muted">{t('free.label', { defaultValue: 'Free roll' })}</span>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="3d6+2"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'rmhc-free-error' : undefined}
              className="w-40 font-mono"
            />
          </label>
          <Button type="submit">{t('free.roll', { defaultValue: 'Roll' })}</Button>
        </form>
      </div>
      {error ? (
        <p id="rmhc-free-error" className="text-sm text-app-danger">
          {errorText(error)}
        </p>
      ) : null}

      <div role="status" aria-live="polite" className="min-h-6">
        {last && o ? (
          <div key={last.seq} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-app-text">{last.label}</span>
            <span className="font-mono text-sm tabular-nums text-app-text-muted">{last.text}</span>
            {o.critical ? (
              <span className="text-sm font-medium text-app-text">
                {t('result.critical', { defaultValue: 'Natural 20: critical hit' })}
              </span>
            ) : null}
            {o.fumble ? (
              <span className="text-sm font-medium text-app-text">
                {t('result.fumble', { defaultValue: 'Natural 1: miss' })}
              </span>
            ) : null}
            {o.degree ? <span className="text-sm font-medium text-app-text">{degreeText(o.degree)}</span> : null}
            {last.type ? <span className="text-sm text-app-text-muted">{last.type}</span> : null}
          </div>
        ) : null}
      </div>
      {last ? (
        <div className="flex flex-wrap items-center gap-2">
          {(o?.critical || o?.degree === 'critical-success') && attack ? (
            <Button
              type="button"
              onClick={() =>
                rolls.damage(
                  t('what.criticalDamage', { defaultValue: '{{name}} critical damage', name: attack.name }),
                  attack.damage,
                  true,
                )
              }
            >
              {t('result.rollCritical', { defaultValue: 'Roll critical damage' })}
            </Button>
          ) : null}
          <CopyButton
            value={`${last.label}: ${last.text}`}
            label={t('result.copy', { defaultValue: 'Copy roll' })}
            variant="ghost"
          >
            {t('result.copy', { defaultValue: 'Copy roll' })}
          </CopyButton>
        </div>
      ) : null}

      <RollLog rolls={rolls} />
    </section>
  );
}
