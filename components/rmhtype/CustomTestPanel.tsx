/** The pasted-text custom test on the progress page's Keys section. Not ranked; per-key stats still count. */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { toast } from '@/lib/toast';
import { HttpError } from '@/lib/http';
import { RMHTYPE_TEXTS_KEY, createRmhTypeText } from '@/lib/rmhtype/rmhtype.queries';
import { MAX_TEXTS_PER_MEMBER, normaliseTextBody, normaliseTextTitle } from '@/lib/rmhtype/texts';
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
  const prompt = usePrompt();
  const queryClient = useQueryClient();
  const saveText = useMutation({
    mutationFn: createRmhTypeText,
    onSuccess: () => {
      toast.success(t('saved-from-test', { ns: 'type-texts', defaultValue: 'Saved to your texts' }));
      return queryClient.invalidateQueries({ queryKey: RMHTYPE_TEXTS_KEY });
    },
    onError: (error) =>
      toast.error(
        error instanceof HttpError && error.status === 409
          ? t('cap-reached', {
              ns: 'type-texts',
              defaultValue: 'You can keep up to {{max}} texts. Delete one to add another.',
              max: MAX_TEXTS_PER_MEMBER,
            })
          : t('save-failed', { ns: 'type-texts', defaultValue: 'Could not save the text. Try again.' }),
      ),
  });
  const bodyOk = normaliseTextBody(pasted).ok;

  async function saveAsText() {
    const body = normaliseTextBody(pasted);
    if (!body.ok) return;
    const title = await prompt({
      title: t('save-title', { ns: 'type-texts', defaultValue: 'Save this text' }),
      label: t('field-title', { ns: 'type-texts', defaultValue: 'Title' }),
      confirmLabel: t('save', { ns: 'type-texts', defaultValue: 'Save text' }),
      cancelLabel: t('cancel', { ns: 'type-texts', defaultValue: 'Cancel' }),
      validate: (value) =>
        normaliseTextTitle(value).ok
          ? null
          : t('title-empty', { ns: 'type-texts', defaultValue: 'Give the text a title.' }),
    });
    if (title === null) return;
    const clean = normaliseTextTitle(title);
    if (clean.ok) saveText.mutate({ title: clean.value, body: body.value });
  }

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
        <Button
          variant="ghost"
          onClick={() => void saveAsText()}
          disabled={!bodyOk || saveText.isPending}
          title={
            bodyOk
              ? undefined
              : t('save-needs-text', { ns: 'type-texts', defaultValue: 'Paste 20 to 3,000 characters to save a text.' })
          }
        >
          {t('save-this-text', { ns: 'type-texts', defaultValue: 'Save this text' })}
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
