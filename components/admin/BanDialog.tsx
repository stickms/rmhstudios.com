import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkBanDays, checkBanReason, BAN_DAYS_MAX, BAN_REASON_MAX } from '@/lib/admin/ban-form';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with a valid reason and the length in days (`null` = permanent). The dialog does not close itself. */
  onSubmit: (reason: string, durationDays: number | null) => void;
}

function BanForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: Props['onSubmit'] }) {
  const { t } = useTranslation('admin');
  const ids = useId();
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [daysError, setDaysError] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const r = checkBanReason(reason);
    const d = checkBanDays(days);
    setReasonError(!r.ok);
    setDaysError(!d.ok);
    if (r.ok && d.ok) onSubmit(r.reason, d.days);
  };

  return (
    <form onSubmit={submit} className="grid gap-5 sm:gap-6">
      <DialogHeader>
        <DialogTitle>{t('ban-author', { defaultValue: 'Ban author' })}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor={`${ids}-reason`}>{t('ban-reason-prompt', { defaultValue: 'Ban reason:' })}</Label>
        <Input
          id={`${ids}-reason`}
          value={reason}
          maxLength={BAN_REASON_MAX}
          autoFocus
          autoComplete="off"
          aria-invalid={reasonError || undefined}
          aria-describedby={reasonError ? `${ids}-reason-error` : undefined}
          onChange={(event) => {
            setReason(event.target.value);
            setReasonError(false);
          }}
        />
        {reasonError ? (
          <p id={`${ids}-reason-error`} role="alert" className="t-meta text-site-danger">
            {t('ban-reason-required', { defaultValue: 'Enter a reason.' })}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${ids}-days`}>{t('ban-length-prompt', { defaultValue: 'Ban length in days (blank = permanent):' })}</Label>
        <Input
          id={`${ids}-days`}
          value={days}
          inputMode="numeric"
          maxLength={String(BAN_DAYS_MAX).length}
          autoComplete="off"
          aria-invalid={daysError || undefined}
          aria-describedby={daysError ? `${ids}-days-error` : undefined}
          onChange={(event) => {
            setDays(event.target.value);
            setDaysError(false);
          }}
        />
        {daysError ? (
          <p id={`${ids}-days-error`} role="alert" className="t-meta text-site-danger">
            {t('ban-days-invalid', { defaultValue: 'Enter a number of days or leave blank for permanent' })}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="default" onClick={onCancel}>
          {t('cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button type="submit" variant="danger">
          {t('ban-confirm', { defaultValue: 'Ban' })}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Ban reason and length in one dialog (replaces two native prompts). The form mounts fresh each time
 * the dialog opens, so a cancelled ban never leaks its text into the next one; focus returns to the
 * Ban button through `DialogContent`.
 */
export function BanDialog({ open, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <BanForm onCancel={() => onOpenChange(false)} onSubmit={onSubmit} />
      </DialogContent>
    </Dialog>
  );
}
