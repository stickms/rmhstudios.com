/**
 * Scale timing's dialog: one number, 50–200 %, Apply / Cancel, Enter applies.
 *
 * The editor's own dialog component (the same `Dialog` the shortcut sheet uses),
 * never a native prompt. Opened from `Ctrl+Shift+S` and the Edit menu; it only
 * collects the percentage, the store does the work.
 */

import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  SCALE_MAX_PERCENT,
  SCALE_MIN_PERCENT,
} from '@features/slice-it/engine/editor/clipboard';

interface ScaleTimingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with a whole percentage inside the allowed range. */
  onApply: (percent: number) => void;
}

export function ScaleTimingDialog({ open, onOpenChange, onApply }: ScaleTimingDialogProps) {
  const { t } = useTranslation('slice-it-clipboard');
  const [value, setValue] = useState('100');
  const inputRef = useRef<HTMLInputElement>(null);
  const percent = Number(value);
  const valid =
    value.trim() !== '' &&
    Number.isInteger(percent) &&
    percent >= SCALE_MIN_PERCENT &&
    percent <= SCALE_MAX_PERCENT;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    onApply(percent);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm"
        onOpenAutoFocus={(event) => {
          // The number field is the whole dialog: focus it directly, no frame wait.
          event.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t('scale-title', { defaultValue: 'Scale timing' })}</DialogTitle>
            <DialogDescription>
              {t('scale-description', {
                defaultValue:
                  'Stretches the selected notes about the first one. Under 100% is faster, over 100% is slower.',
              })}
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="slice-scale-percent" className="text-sm">
            {t('scale-label', { defaultValue: 'Percent of the original length' })}
          </label>
          <Input
            id="slice-scale-percent"
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={SCALE_MIN_PERCENT}
            max={SCALE_MAX_PERCENT}
            step={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={!valid}
          />
          {!valid && (
            <p className="text-xs" role="alert">
              {t('scale-invalid', {
                defaultValue: 'Enter a whole number from {{min}} to {{max}}.',
                min: SCALE_MIN_PERCENT,
                max: SCALE_MAX_PERCENT,
              })}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="default" onClick={() => onOpenChange(false)}>
              {t('scale-cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" variant="primary" disabled={!valid}>
              {t('scale-apply', { defaultValue: 'Apply' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
