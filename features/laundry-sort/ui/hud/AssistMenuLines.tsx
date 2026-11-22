import { useTranslation } from 'react-i18next';
import { AssistStartNotice } from '@/components/games/assist-run';

/** The start screen: the shared notice when assists are on, and a link to the one settings page. */
export function AssistMenuLines({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation('driftway-laundry-assists');
  if (!signedIn) return null;
  return (
    <div className="space-y-1 text-center text-xs">
      <AssistStartNotice signedIn={signedIn} className="ls-muted" />
      <p>
        <a href="/settings/game-assists" className="ls-muted underline">
          {t('settings-link', { defaultValue: 'Game assists' })}
        </a>
      </p>
    </div>
  );
}
