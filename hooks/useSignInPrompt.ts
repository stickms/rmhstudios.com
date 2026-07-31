import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

/**
 * Shared "you need an account for that" prompt.
 *
 * Signed-out engagement controls (like, reRMHark, bookmark, …) used to `return`
 * silently, which reads as a broken button. This turns that dead end into a
 * toast whose action button lands on `/login` and returns the visitor to
 * exactly where they were.
 *
 * The caller supplies the message so it stays in that feature's i18n namespace;
 * only the action label is shared (`common:sign-in`).
 *
 * The current path is read from `window.location` at click time rather than
 * from `useRouterState`, so mounting this hook (once per feed card) doesn't
 * subscribe every action bar to router updates.
 */
export function useSignInPrompt() {
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  return useCallback(
    (message: string) => {
      toast.error(message, {
        action: {
          label: t('sign-in', { defaultValue: 'Sign in' }),
          onClick: () =>
            navigate({
              to: '/login',
              search: { callbackURL: window.location.pathname + window.location.search },
            }),
        },
      });
    },
    [navigate, t],
  );
}
