import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export interface RevealedSecret {
  secret: string;
  /** `created` for a new endpoint, `rotated` for a new secret on an existing one. */
  reason: 'created' | 'rotated';
}

/**
 * Shows a signing secret exactly once. The server never returns it again, so
 * closing the dialog drops it from memory.
 */
export function SecretDialog({ revealed, onClose }: { revealed: RevealedSecret | null; onClose: () => void }) {
  const { t } = useTranslation('dev-webhooks');
  return (
    <Dialog open={revealed !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {revealed?.reason === 'rotated'
              ? t('secret-title-rotated', { defaultValue: 'New signing secret' })
              : t('secret-title-created', { defaultValue: 'Endpoint created' })}
          </DialogTitle>
          <DialogDescription className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {t('secret-warning', {
                defaultValue: 'Copy this secret now. It is shown once and cannot be retrieved later.',
              })}
            </span>
          </DialogDescription>
        </DialogHeader>
        {revealed && (
          <div className="space-y-2">
            <label htmlFor="webhook-secret" className="t-label block">
              {t('secret-label', { defaultValue: 'Signing secret' })}
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="webhook-secret"
                readOnly
                dir="ltr"
                value={revealed.secret}
                className="font-mono"
                onFocus={(e) => e.currentTarget.select()}
              />
              <CopyButton
                value={revealed.secret}
                variant="default"
                size="icon"
                label={t('secret-copy', { defaultValue: 'Copy signing secret' })}
              />
            </div>
            {revealed.reason === 'rotated' && (
              <p className="t-meta">
                {t('secret-overlap', {
                  defaultValue:
                    'The previous secret stays valid for 24 hours. Deliveries carry both signatures until then.',
                })}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t('secret-done', { defaultValue: 'Done' })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
