import { AlertTriangle } from 'lucide-react';
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
import type { ConfirmOptions } from '@/components/ui/confirm-dialog';

/**
 * The dialog `useConfirm()` opens. It is its own module so the Radix dialog
 * stack loads with the first confirmation instead of with the shell
 * (third-pass audit RT1): `ConfirmProvider` imports it on the first `confirm()`
 * and keeps it mounted from then on.
 */
export function ConfirmDialogView({
  pending,
  settle,
}: {
  pending: ConfirmOptions | null;
  settle: (value: boolean) => void;
}) {
  const { t } = useTranslation('c-ui');
  const Icon = pending?.icon ?? (pending?.danger ? AlertTriangle : undefined);

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        // Any dismissal (Escape, overlay click, close X) resolves to false.
        if (!open) settle(false);
      }}
    >
      {pending && (
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {Icon && (
                <Icon
                  className={
                    pending.danger
                      ? 'h-5 w-5 shrink-0 text-site-danger'
                      : 'h-5 w-5 shrink-0 text-site-accent'
                  }
                  aria-hidden
                />
              )}
              {pending.title}
            </DialogTitle>
            {pending.description && <DialogDescription>{pending.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="default" onClick={() => settle(false)}>
              {pending.cancelLabel ?? t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button variant={pending.danger ? 'danger' : 'default'} onClick={() => settle(true)}>
              {pending.confirmLabel ?? t('confirm', { defaultValue: 'Confirm' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
