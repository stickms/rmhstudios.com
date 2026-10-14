import { useTranslation } from 'react-i18next';
import { NotebookPen } from 'lucide-react';

/** Tab descriptor for the calculator's mode strip (kept apart so the tab body stays lazy). */
export function useNotebookTab() {
  const { t } = useTranslation('f-tools');
  return {
    id: 'notebook',
    label: t('calc-tab-notebook', { defaultValue: 'Notebook' }),
    icon: NotebookPen,
  };
}
