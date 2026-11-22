import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// Its own file because the string extractor reads one namespace per file.
/** Shown in place of a followers or following list the owner keeps private from this viewer. */
export function PrivateListNotice({ ownerName, className }: { ownerName?: string | null; className?: string }) {
  const { t } = useTranslation('follow-list-privacy');
  return (
    <div className={cn('flex flex-col items-center justify-center px-5 py-12 text-center', className)}>
      <p className="text-site-text">
        {ownerName
          ? t('keeps-private', {
              defaultValue: '{{name}} keeps this list private',
              name: ownerName,
            })
          : t('keeps-private-anon', {
              defaultValue: 'This list is private',
            })}
      </p>
    </div>
  );
}
