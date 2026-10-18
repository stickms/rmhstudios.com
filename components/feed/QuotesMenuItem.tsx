'use client';

import { Quote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/components/ui/menu';

/**
 * The "View quotes" row for the repost menu (X10). Kept apart from
 * `QuotesDialog` so the menu pays for one icon and a string, not the dialog:
 * the dialog is its own chunk, fetched the first time someone opens it.
 */
export function QuotesMenuItem({ onSelect }: { onSelect: () => void }) {
  const { t } = useTranslation('f-feed-plus');
  return (
    <MenuItem icon={Quote} onSelect={onSelect}>
      {t('quotes-menu', { defaultValue: 'View quotes' })}
    </MenuItem>
  );
}
