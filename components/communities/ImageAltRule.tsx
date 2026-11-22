/** The community page's one-line statement of the image-description rule (s07-16). */
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function ImageAltRule({ className }: { className?: string | undefined }) {
  const { t } = useTranslation('community-alt-text');
  return (
    <p className={cn('t-meta border-b border-site-border px-4 py-3', className)}>
      {t('page-line', {
        defaultValue: 'Images here need a description.',
      })}
    </p>
  );
}
