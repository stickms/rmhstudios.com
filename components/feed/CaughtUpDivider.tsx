import { useTranslation } from 'react-i18next';
import { SpineItem } from '@/components/ui/spine';

/**
 * X7: drawn in the home timeline where the previous visit's posts begin. Scrolling past it means everything new has been
 * seen. A dotless spine item (P3: it is not a post) with one line of `t-label`, no icon and no colour.
 */
export function CaughtUpDivider() {
  const { t } = useTranslation('f-feed-plus');
  return (
    <SpineItem
      dot={false}
      role="separator"
      aria-label={t('caught-up-aria', { defaultValue: 'You are caught up. Older posts follow.' })}
    >
      <span className="t-label">{t('caught-up', { defaultValue: "You're all caught up" })}</span>
    </SpineItem>
  );
}
