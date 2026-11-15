/**
 * Shown in place of the boot screen when the session ended (another tab signed out, the cookie
 * expired) and the machine has been taken down: never a frozen canvas under a live-looking
 * toolbar. Signing in again comes back to /rmhos.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export default function SignedOut() {
  const {
    t,
  } =
    useTranslation(
      'c-rmhos',
    );
  return (
    <div
      className="rmhos-boot"
      data-phase="signed-out"
    >
      <div className="rmhos-boot-panel">
        <h1 className="text-lg font-semibold">
          {t(
            'signed-out-title',
            {
              defaultValue:
                'You are signed out',
            },
          )}
        </h1>
        <div role="status">
          <p className="text-sm text-(--app-text-muted)">
            {t(
              'signed-out-body',
              {
                defaultValue:
                  'rmhOS has stopped. Sign in to start it again. Files saved in this browser stay with your account.',
              },
            )}
          </p>
        </div>
        <div>
          <Button
            variant="primary"
            asChild
          >
            <a href="/login?callbackURL=%2Frmhos">
              {t(
                'sign-in',
                {
                  defaultValue:
                    'Sign in',
                },
              )}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
