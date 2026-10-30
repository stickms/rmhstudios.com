/**
 * Privacy & data settings — data export (DSAR) and account deletion (erasure)
 * for the signed-in user.
 */

import { createFileRoute } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { DataExportPanel } from '@/components/site/DataExportPanel';
import { DeleteAccountPanel } from '@/components/site/DeleteAccountPanel';
import { MutedWordsPanel } from '@/components/site/MutedWordsPanel';
import { PresencePrivacyControls } from '@/components/settings/PresencePrivacyControls';
import { PlayLimitsPanel } from '@/components/settings/PlayLimitsPanel';
import { PlaytimePrivacyControls } from '@/components/settings/PlaytimePrivacyControls';
import { CookieConsentControls } from '@/components/site/CookieConsentControls';
import { useSession } from '@/components/Providers';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';

export const Route = createFileRoute('/_site/settings/privacy')({
  head: () => ({
    meta: [{ title: 'Privacy & data | RMH Studios' }],
  }),
  component: PrivacySettingsPage,
});

function PrivacySettingsPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('privacy-title', { defaultValue: 'Privacy & data' });

  return (
    <PageLayout
      title={title}
      description={t('privacy-subtitle', {
        defaultValue: 'Export or delete the data tied to your account.',
      })}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        {/* Above the sign-in gate on purpose. The cookie choice belongs to the
            browser, not the account, and a signed-out visitor is exactly who
            needs to be able to withdraw it. */}
        <CookieConsentControls />
        {!isPending && !session?.user ? (
          <SignedOutPrompt
            icon={Lock}
            title={t('privacy-signed-out', {
              defaultValue: 'Sign in to manage your privacy settings.',
            })}
            callbackURL="/settings/privacy"
          />
        ) : (
          <>
            <PresencePrivacyControls />
            <PlaytimePrivacyControls />
            <MutedWordsPanel />
            <PlayLimitsPanel />
            <DataExportPanel />
            <DeleteAccountPanel />
          </>
        )}
      </SettingsPageBody>
    </PageLayout>
  );
}
