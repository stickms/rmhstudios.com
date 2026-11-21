import { Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/components/ui/menu';

/** "Edit descriptions" in a message's action menu, for the sender's own images (shared by the direct and group menus). */
export function EditDescriptionsMenuItem({ onSelect }: { onSelect: () => void }) {
  const { t } = useTranslation('message-alt-text');
  return (
    <MenuItem icon={ImageIcon} onSelect={onSelect}>
      {t('edit-descriptions', {
        defaultValue: 'Edit descriptions',
      })}
    </MenuItem>
  );
}
