import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/feed/PageLayout';

/**
 * What a self-excluded member sees in place of `/predictions` and `/wager/$id` (W8): a calm sentence and the way to
 * the setting, no hub. The route's loader decides it on the server, so it is in the HTML with scripting off.
 */
export function ExcludedNotice({ until }: { until: string }) {
  const { t, i18n } = useTranslation('exclusion-hides');
  // The server renders in its own zone and the browser in the viewer's, so a day boundary between them changed the
  // text at hydration (React #418). Both render the date in UTC first; after mount it is shown in the viewer's zone.
  const [timeZone, setTimeZone] = useState<'UTC' | undefined>('UTC');
  useEffect(() => setTimeZone(undefined), []);
  const date = new Date(until).toLocaleDateString(i18n.language, { dateStyle: 'long', timeZone });
  return (
    <EmptyState
      title={t('excluded-title', { defaultValue: 'You excluded yourself from staking until {{date}}', date })}
      description={t('excluded-body', {
        defaultValue: 'Coin games are hidden from menus and search while it lasts. Nothing else on the site changed.',
      })}
      action={
        <Button asChild variant="default">
          <Link to="/settings/privacy">{t('excluded-settings', { defaultValue: 'Play limits' })}</Link>
        </Button>
      }
    />
  );
}

/** `/wager/$id` for a self-excluded member: the page frame with the notice, and the way back to the hub. */
export function ExcludedWagerPage({ until }: { until: string }) {
  const { t } = useTranslation('exclusion-hides');
  return (
    <PageLayout
      title={t('wager-title', { defaultValue: 'Wager Match' })}
      backTo="/compete"
      backLabel={t('wager-back', { defaultValue: 'Back to compete' })}
    >
      <ExcludedNotice until={until} />
    </PageLayout>
  );
}

/** Said next to the exclusion in Settings: what it hides (`when` is already in the member's locale). */
export function HiddenNote({ when }: { when: string }) {
  const { t } = useTranslation('exclusion-hides');
  return (
    <p className="t-meta">
      {t('hidden-until', { defaultValue: 'Coin games are hidden from menus and search until {{date}}', date: when })}
    </p>
  );
}

/** In place of a casino table's join code and link, for a self-excluded member. */
export function ExcludedInvite() {
  const { t } = useTranslation('exclusion-hides');
  return (
    <span className="text-micro text-site-text-muted sm:text-xs">
      {t('invite-excluded', { defaultValue: 'You excluded yourself from staking' })}
    </span>
  );
}
