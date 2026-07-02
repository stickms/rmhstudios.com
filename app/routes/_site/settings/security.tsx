/**
 * Security settings — passkey management for the signed-in user.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { PasskeyManager } from '@/components/site/PasskeyManager';
import { useSession } from '@/components/Providers';

export const Route = createFileRoute('/_site/settings/security')({
  head: () => ({
    meta: [{ title: 'Security | RMH Studios' }],
  }),
  component: SecuritySettingsPage,
});

function SecuritySettingsPage() {
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
            <ShieldCheck className="h-5 w-5 text-site-accent" aria-hidden />
            <h1 className="text-lg font-bold text-site-text">
              {t('security-title', { defaultValue: 'Security' })}
            </h1>
          </div>
          <p className="text-sm text-site-text-muted">
            {t('security-subtitle', { defaultValue: 'Manage how you sign in to your account.' })}
          </p>
        </div>

        <div className="space-y-4 p-4">
          {!isPending && !session?.user ? (
            <p className="text-sm text-site-text-muted">
              <Link
                to="/login"
                search={{ callbackURL: '/settings/security' }}
                className="text-site-accent hover:underline"
              >
                {t('security-sign-in', { defaultValue: 'Sign in' })}
              </Link>{' '}
              {t('security-sign-in-rest', { defaultValue: 'to manage your security settings.' })}
            </p>
          ) : (
            <PasskeyManager />
          )}
        </div>
      </AnimatedMain>

      {/* Trailing gutter to match the blog/feed wide layout */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
