import { useCallback, useEffect, useId, useState } from 'react';
import type { TFunction } from 'i18next';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { ResultRow, ToolFrame, ToolSection, ToolSwitch } from '@/components/toolbox/ToolFrame';
import { PASSPHRASE_WORDS } from '@/lib/toolbox/password-words';
import {
  MAX_PASSWORD_LENGTH,
  MAX_WORDS,
  MIN_PASSWORD_LENGTH,
  MIN_WORDS,
  estimateStrength,
  generatePassphrase,
  generatePassword,
  passphraseEntropy,
  passwordEntropy,
  rateEntropy,
  type CharsetName,
  type Strength,
} from '@/lib/toolbox/password';

type Mode = 'password' | 'passphrase';

function strengthLabel(t: TFunction, s: Strength): string {
  switch (s) {
    case 'very-weak':
      return t('pw-very-weak', { ns: 'toolbox', defaultValue: 'Very weak' });
    case 'weak':
      return t('pw-weak', { ns: 'toolbox', defaultValue: 'Weak' });
    case 'fair':
      return t('pw-fair', { ns: 'toolbox', defaultValue: 'Fair' });
    case 'strong':
      return t('pw-strong', { ns: 'toolbox', defaultValue: 'Strong' });
    case 'very-strong':
      return t('pw-very-strong', { ns: 'toolbox', defaultValue: 'Very strong' });
  }
}

export function PasswordTool() {
  const { t } = useTranslation('toolbox');
  const lengthId = useId();
  const wordsId = useId();
  const separatorId = useId();
  const outputId = useId();
  const checkId = useId();
  const [mode, setMode] = useState<Mode>('password');
  const [length, setLength] = useState(20);
  const [sets, setSets] = useState<Set<CharsetName>>(
    () => new Set<CharsetName>(['lower', 'upper', 'digits', 'symbols']),
  );
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(true);
  const [words, setWords] = useState(6);
  const [separator, setSeparator] = useState('-');
  const [capitalize, setCapitalize] = useState(false);
  const [addDigit, setAddDigit] = useState(false);
  const [value, setValue] = useState('');
  const [check, setCheck] = useState('');

  const passwordOpts = { length, sets: [...sets], excludeAmbiguous };
  const phraseOpts = { words, separator, capitalize, addDigit };
  const bits =
    mode === 'password' ? passwordEntropy(passwordOpts) : passphraseEntropy(phraseOpts, PASSPHRASE_WORDS.length);

  const regenerate = useCallback(() => {
    if (mode === 'password') {
      setValue(sets.size ? generatePassword({ length, sets: [...sets], excludeAmbiguous }) : '');
    } else {
      setValue(generatePassphrase({ words, separator, capitalize, addDigit }, PASSPHRASE_WORDS));
    }
  }, [mode, length, sets, excludeAmbiguous, words, separator, capitalize, addDigit]);

  // Secrets are generated in the browser only, after hydration: the server never sees or renders one.
  useEffect(() => {
    regenerate();
  }, [regenerate]);

  const toggleSet = (name: CharsetName, on: boolean) =>
    setSets((prev) => {
      const next = new Set(prev);
      if (on) next.add(name);
      else if (next.size > 1) next.delete(name);
      return next;
    });

  const estimate = check ? estimateStrength(check) : null;
  const warning = (w: 'common' | 'repeats' | 'sequence' | 'short') =>
    w === 'common'
      ? t('pw-warn-common', { defaultValue: 'This is one of the most used passwords.' })
      : w === 'repeats'
        ? t('pw-warn-repeats', { defaultValue: 'Repeated characters add little.' })
        : w === 'sequence'
          ? t('pw-warn-sequence', { defaultValue: 'Sequences like abc, 123 or qwerty are tried first.' })
          : t('pw-warn-short', { defaultValue: 'Shorter than 8 characters.' });

  return (
    <ToolFrame slug="password">
      <Tabs
        value={mode}
        onChange={(id) => setMode(id as Mode)}
        aria-label={t('pw-mode', { defaultValue: 'Kind' })}
        tabs={[
          { id: 'password', label: t('pw-tab-password', { defaultValue: 'Password' }) },
          { id: 'passphrase', label: t('pw-tab-passphrase', { defaultValue: 'Passphrase' }) },
        ]}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor={outputId}>{t('pw-output', { defaultValue: 'Generated' })}</Label>
        <div className="flex items-center gap-2">
          <Input id={outputId} value={value} readOnly spellCheck={false} autoComplete="off" className="font-mono" />
          <CopyButton value={value} disabled={!value} />
        </div>
        <p className="t-meta" aria-live="polite">
          {t('pw-entropy', {
            defaultValue: '{{bits}} bits of entropy: {{rating}}',
            bits: Math.floor(bits),
            rating: strengthLabel(t, rateEntropy(bits)).toLowerCase(),
          })}
        </p>
      </div>
      <div>
        <Button variant="primary" onClick={regenerate}>
          <RefreshCw aria-hidden />
          {t('pw-regenerate', { defaultValue: 'Generate another' })}
        </Button>
      </div>

      {mode === 'password' ? (
        <ToolSection title={t('pw-options', { defaultValue: 'Options' })}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={lengthId}>{t('pw-length', { defaultValue: 'Length' })}</Label>
            <Input
              id={lengthId}
              type="number"
              inputMode="numeric"
              min={MIN_PASSWORD_LENGTH}
              max={MAX_PASSWORD_LENGTH}
              value={length}
              onChange={(e) =>
                setLength(Math.max(MIN_PASSWORD_LENGTH, Math.min(MAX_PASSWORD_LENGTH, Number(e.target.value) || 0)))
              }
              className="w-32"
            />
          </div>
          <div className="grid sm:grid-cols-2">
            <ToolSwitch
              label={t('pw-lower', { defaultValue: 'Lower case (a–z)' })}
              checked={sets.has('lower')}
              onCheckedChange={(on) => toggleSet('lower', on)}
            />
            <ToolSwitch
              label={t('pw-upper', { defaultValue: 'Upper case (A–Z)' })}
              checked={sets.has('upper')}
              onCheckedChange={(on) => toggleSet('upper', on)}
            />
            <ToolSwitch
              label={t('pw-digits', { defaultValue: 'Digits (0–9)' })}
              checked={sets.has('digits')}
              onCheckedChange={(on) => toggleSet('digits', on)}
            />
            <ToolSwitch
              label={t('pw-symbols', { defaultValue: 'Symbols (!#$%…)' })}
              checked={sets.has('symbols')}
              onCheckedChange={(on) => toggleSet('symbols', on)}
            />
            <ToolSwitch
              label={t('pw-ambiguous', { defaultValue: 'Leave out look-alikes (I, l, 1, O, 0, o)' })}
              checked={excludeAmbiguous}
              onCheckedChange={setExcludeAmbiguous}
            />
          </div>
        </ToolSection>
      ) : (
        <ToolSection title={t('pw-options', { defaultValue: 'Options' })}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={wordsId}>{t('pw-words', { defaultValue: 'Words' })}</Label>
              <Input
                id={wordsId}
                type="number"
                inputMode="numeric"
                min={MIN_WORDS}
                max={MAX_WORDS}
                value={words}
                onChange={(e) => setWords(Math.max(MIN_WORDS, Math.min(MAX_WORDS, Number(e.target.value) || 0)))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={separatorId}>{t('pw-separator', { defaultValue: 'Between words' })}</Label>
              <Select id={separatorId} value={separator} onChange={(e) => setSeparator(e.target.value)}>
                <option value="-">{t('pw-sep-hyphen', { defaultValue: 'Hyphen' })}</option>
                <option value=" ">{t('pw-sep-space', { defaultValue: 'Space' })}</option>
                <option value=".">{t('pw-sep-dot', { defaultValue: 'Full stop' })}</option>
                <option value="_">{t('pw-sep-underscore', { defaultValue: 'Underscore' })}</option>
                <option value="">{t('pw-sep-none', { defaultValue: 'Nothing' })}</option>
              </Select>
            </div>
          </div>
          <div className="grid sm:grid-cols-2">
            <ToolSwitch
              label={t('pw-capitalize', { defaultValue: 'Capitalise each word' })}
              checked={capitalize}
              onCheckedChange={setCapitalize}
            />
            <ToolSwitch
              label={t('pw-add-digit', { defaultValue: 'Add a digit' })}
              checked={addDigit}
              onCheckedChange={setAddDigit}
            />
          </div>
          <p className="t-meta">
            {t('pw-list', {
              defaultValue: 'Words come from a list of {{count}} common English words.',
              count: PASSPHRASE_WORDS.length,
            })}
          </p>
        </ToolSection>
      )}

      <ToolSection title={t('pw-check', { defaultValue: 'Check a password' })}>
        <p className="t-body text-site-text-muted">
          {t('pw-check-hint', {
            defaultValue: 'The estimate is made on this device. What you type is not saved or sent.',
          })}
        </p>
        <Label htmlFor={checkId} className="sr-only">
          {t('pw-check-input', { defaultValue: 'Password to check' })}
        </Label>
        <Input
          id={checkId}
          type="password"
          value={check}
          onChange={(e) => setCheck(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {estimate && (
          <div aria-live="polite">
            <ResultRow
              label={t('pw-estimate', { defaultValue: 'Estimate' })}
              mono={false}
              value={t('pw-estimate-value', {
                defaultValue: '{{rating}}, about {{bits}} bits',
                rating: strengthLabel(t, estimate.strength),
                bits: Math.floor(estimate.bits),
              })}
            />
            {estimate.warnings.map((w) => (
              <p key={w} className="t-body text-site-danger">
                {warning(w)}
              </p>
            ))}
          </div>
        )}
      </ToolSection>
    </ToolFrame>
  );
}
