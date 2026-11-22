/** The pasted-text custom test on the progress page's Keys section. Not ranked; per-key stats still count. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { buildCustomTest, type GeneratedTest } from '@/lib/rmhtype/custom-test';

export function CustomTestPanel({
  onStartTest,
  punctuation,
  numbers,
  onPunctuation,
  onNumbers,
}: {
  onStartTest?: ((test: GeneratedTest) => void) | undefined;
  punctuation: boolean;
  numbers: boolean;
  onPunctuation: (next: boolean) => void;
  onNumbers: (next: boolean) => void;
}) {
  const { t } = useTranslation('c-rmhtype');
  const [pasted, setPasted] = useState('');

  function startCustom() {
    const text = pasted.trim();
    if (text.length === 0) return;
    onStartTest?.(buildCustomTest({ mode: 'custom', text }));
  }

  return (
    <div className="flex flex-col gap-3 border-t border-app-border pt-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="t-heading">{t('custom-title', { defaultValue: 'Custom test' })}</h3>
        <Badge variant="default">{t('not-ranked', { defaultValue: 'Not ranked' })}</Badge>
      </div>
      <p className="text-sm text-app-text-muted">
        {t('custom-note', {
          defaultValue:
            'You choose the text, so you choose the difficulty — custom and practice runs are kept off global leaderboards. Your per-key stats still count.',
        })}
      </p>

      <Textarea
        value={pasted}
        onChange={(event) => setPasted(event.target.value)}
        rows={4}
        placeholder={t('custom-placeholder', { defaultValue: 'Paste any text to type…' })}
        aria-label={t('custom-label', { defaultValue: 'Custom test text' })}
      />

      <div className="flex flex-wrap items-center gap-4">
        <ToggleRow
          id="rmhtype-punctuation"
          checked={punctuation}
          onCheckedChange={onPunctuation}
          label={t('punctuation', { defaultValue: 'Punctuation' })}
        />
        <ToggleRow
          id="rmhtype-numbers"
          checked={numbers}
          onCheckedChange={onNumbers}
          label={t('numbers', { defaultValue: 'Numbers' })}
        />
        <Button onClick={startCustom} disabled={pasted.trim().length === 0}>
          {t('custom-start', { defaultValue: 'Type this' })}
        </Button>
      </div>
    </div>
  );
}

/** A labelled switch on a 44px row, so the whole thing is a comfortable target on a phone. */
function ToggleRow({
  id,
  checked,
  onCheckedChange,
  label,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex h-11 items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
