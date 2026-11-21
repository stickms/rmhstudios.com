import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';

/** The shake sheet: a phone shake opens the shared feedback form (also reachable from Help and Settings). */
export function FeedbackSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('f-access');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('fb-title', { defaultValue: 'Report a problem' })}</SheetTitle>
          <SheetDescription>
            {t('fb-desc', {
              defaultValue: 'You shook your phone. Tell us what went wrong or what you wish worked.',
            })}
          </SheetDescription>
        </SheetHeader>
        <div className="max-h-[70dvh] overflow-y-auto px-1 pb-2">
          {open ? <FeedbackForm onSent={() => onOpenChange(false)} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
