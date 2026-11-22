import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitPrompt, type PromptOptions } from '@/components/ui/prompt-rule';

/**
 * The form inside the dialog. Its own component so it mounts fresh for every prompt (the field
 * starts at `initialValue`, the error clears) and so it renders without the dialog portal.
 */
export function PromptForm({ options, settle }: { options: PromptOptions; settle: (value: string | null) => void }) {
  const { t } = useTranslation('c-ui');
  const ids = React.useId();
  const inputId = `${ids}-input`;
  const errorId = `${ids}-error`;
  const [value, setValue] = React.useState(options.initialValue ?? '');
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = submitPrompt(value, options.validate);
    if (result.ok) settle(result.value);
    else setError(result.error);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-5 sm:gap-6">
      <DialogHeader>
        <DialogTitle>{options.title}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-2">
        {options.label ? <Label htmlFor={inputId}>{options.label}</Label> : null}
        <Input
          id={inputId}
          value={value}
          autoFocus
          autoComplete="off"
          aria-label={options.label ? undefined : options.title}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
        />
        {error ? (
          <p id={errorId} role="alert" className="t-meta text-site-danger">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="default" onClick={() => settle(null)}>
          {options.cancelLabel ?? t('cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button type="submit" variant="primary">
          {options.confirmLabel ?? t('confirm', { defaultValue: 'Confirm' })}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The dialog `usePrompt()` opens, loaded by the first prompt (see `prompt-dialog.tsx`). Escape,
 * the scrim and the close button all resolve `null`; `DialogContent` returns focus to the element
 * that opened it, so no focus code lives here.
 */
export function PromptDialogView({
  pending,
  settle,
}: {
  pending: PromptOptions | null;
  settle: (value: string | null) => void;
}) {
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) settle(null);
      }}
    >
      {pending && (
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <PromptForm options={pending} settle={settle} />
        </DialogContent>
      )}
    </Dialog>
  );
}
