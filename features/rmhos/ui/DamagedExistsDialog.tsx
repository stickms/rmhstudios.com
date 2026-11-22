/**
 * An earlier damaged copy is still stored, and another cannot be kept without discarding it:
 * the operation was refused and nothing was touched. The person decides what happens to the
 * earlier copy: download it, or remove it (after a confirmation: it cannot be recovered).
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  container: HTMLElement | null;
  onDownload: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export default function DamagedExistsDialog({ open, container, onDownload, onRemove, onClose }: Props) {
  const { t } = useTranslation('c-rmhos');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent container={container} className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-sm font-normal">
            {t('damaged-exists', {
              defaultValue: 'An earlier damaged copy is still stored. Download it or remove it first.',
            })}
          </DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <Button variant="primary" onClick={onDownload}>
            {t('download-earlier', {
              defaultValue: 'Download the earlier copy',
            })}
          </Button>
          <Button onClick={onRemove}>
            {t('remove-earlier', {
              defaultValue: 'Remove the earlier copy',
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
