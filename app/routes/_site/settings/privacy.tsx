/**
 * Privacy & data settings — data export (DSAR) and account deletion (erasure)
 * for the signed-in user.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ShieldUser } from 'lucide-react';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { DataExportPanel } from '@/components/site/DataExportPanel';
import { DeleteAccountPanel } from '@/components/site/DeleteAccountPanel';
import { useSession } from '@/components/Providers';

export const Route = createFileRoute('/_site/settings/privacy')({
  head: () => ({
    meta: [{ title: 'Privacy & data | RMH Studios' }],
  }),
  component: PrivacySettingsPage,
});

function PrivacySettingsPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();

  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <div className="border-b border-site-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldUser className="h-5 w-5 text-site-accent" aria-hidden />
            <h1 className="text-lg font-bold text-site-text">
              {t('privacy-title', { defaultValue: 'Privacy & data' })}
            </h1>
          </div>
          <p className="text-sm text-site-text-muted">
            {t('privacy-subtitle', { defaultValue: 'Export or delete the data tied to your account.' })}
          </p>
        </div>

        <div className="space-y-4 p-4">
          {!isPending && !session?.user ? (
            <p className="text-sm text-site-text-muted">
              <Link
                to="/login"
                search={{ callbackURL: '/settings/privacy' }}
                className="text-site-accent hover:underline"
              >
                {t('privacy-sign-in', { defaultValue: 'Sign in' })}
              </Link>{' '}
              {t('privacy-sign-in-rest', { defaultValue: 'to manage your privacy settings.' })}
            </p>
          ) : (
            <>
              <DataExportPanel />
              <DeleteAccountPanel />
            </>
          )}
        </div>
      </AnimatedMain>

      {/* Trailing gutter to match the blog/feed wide layout */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
