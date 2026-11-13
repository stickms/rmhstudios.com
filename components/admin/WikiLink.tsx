import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** The /admin row that leads to the wiki page manager. */
export function WikiLink() {
  const { t } = useTranslation('f-wiki');
  return (
    <AdminHubCard
      to="/admin/wiki"
      title={t('link-title', { defaultValue: 'Wiki' })}
      description={t('link-description', {
        defaultValue:
          'Create, edit and delete the pages on wiki.rmhstudios.com, with a DeepSeek writing assistant.',
      })}
    />
  );
}
