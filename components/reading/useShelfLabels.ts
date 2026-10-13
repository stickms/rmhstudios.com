import { useTranslation } from 'react-i18next';
import type { ShelfId } from '@/lib/reading/schema';

export function useShelfLabels() {
  const { t } = useTranslation('f-reading');
  return {
    want: t('shelf-want', { defaultValue: 'Want to read' }),
    reading: t('shelf-reading', { defaultValue: 'Reading' }),
    read: t('shelf-read', { defaultValue: 'Read' }),
  } satisfies Record<ShelfId, string>;
}
