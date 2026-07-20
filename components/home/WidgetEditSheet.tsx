'use client';

import { useTranslation } from 'react-i18next';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { WidgetEditor } from './WidgetEditor';

/**
 * WidgetEditSheet (§15) — the home rail's "Edit layout" affordance. Wraps
 * {@link WidgetEditor} in the responsive G1 Sheet (mobile bottom-sheet, desktop
 * dialog). The same editor also renders inline on /settings/layout.
 */
export function WidgetEditSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('c-layout');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('edit-layout', { defaultValue: 'Edit layout' })}</SheetTitle>
          <SheetDescription>
            {t('edit-layout-desc', {
              defaultValue: 'Reorder, add, or remove the widgets on your home page.',
            })}
          </SheetDescription>
        </SheetHeader>
        <div className="pt-2">
          <WidgetEditor />
        </div>
      </SheetContent>
    </Sheet>
  );
}
