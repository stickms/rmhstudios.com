import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** D4: marks posts and profiles from accounts flagged as automated. */
export function AutomatedBadge() {
  const { t } = useTranslation('f-devplatform');
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-site-sm bg-site-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-site-accent"
      title={t('automated-hint', { defaultValue: 'Automated account' })}
    >
      <Bot className="size-3" aria-hidden />
      {t('automated-label', { defaultValue: 'Automated' })}
    </span>
  );
}
