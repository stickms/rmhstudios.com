/** A two-button confirmation. One primary action: the confirm button. */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  container: HTMLElement | null;
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmBox({
  open,
  container,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation('c-rmhos');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent container={container} className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-sm font-normal">{title}</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onCancel}>{t('cancel', { defaultValue: 'Cancel' })}</Button>
          <Button variant="primary" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
