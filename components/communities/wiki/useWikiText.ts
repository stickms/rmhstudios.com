/**
 * The wording of the wiki's refusals (s09-04): why a viewer cannot edit a page, and what a failed save said.
 * `lib/` returns codes; this turns them into the member's language.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { useSanctionRefusal } from '@/components/communities/useSanctionRefusal';
import { HttpError, serverError } from '@/lib/http';
import type { EditPolicy, PageRefusal } from '@/lib/communities/page-policy';

export function useWikiText() {
  const { t } = useTranslation('community-wiki');
  const fmt = useLocaleFormat();
  const sanctionText = useSanctionRefusal();

  /** The one line that says why the viewer cannot edit, or `null` when they can. */
  const refusalLine = useCallback(
    (refusal: PageRefusal | null, endsAt: string | null): string | null => {
      switch (refusal) {
        case null:
          return null;
        case 'SIGNED_OUT':
          return t('refusal-signed-out', { defaultValue: 'Sign in to edit this page' });
        case 'NOT_A_MEMBER':
          return t('refusal-not-member', { defaultValue: 'Join this community to edit its pages' });
        case 'MODS_ONLY':
          return t('refusal-mods-only', { defaultValue: 'Only moderators can edit this page' });
        case 'TOO_NEW':
        case 'HAS_STRIKES':
          return t('refusal-trusted', {
            defaultValue: 'Only members who joined 30 days ago with no strikes can edit this page',
          });
        case 'TIMED_OUT':
          return endsAt
            ? t('refusal-timed-out-until', {
                date: fmt.dateTime(endsAt),
                defaultValue: 'You can edit again after {{date}}',
              })
            : t('refusal-timed-out-open', { defaultValue: 'You are timed out of this community and cannot edit' });
        case 'COMMUNITY_BANNED':
          return t('refusal-community-banned', { defaultValue: 'You are banned from this community and cannot edit' });
        case 'SITE_BANNED':
          return t('refusal-site-banned', { defaultValue: 'Your account cannot edit pages right now' });
      }
    },
    [t, fmt],
  );

  /** The toast for a failed save, restore, create or delete. */
  const failureText = useCallback(
    (error: unknown): string => {
      if (error instanceof HttpError && error.status === 409) {
        return t('error-conflict', { defaultValue: 'Someone else edited this page; reload to see their changes' });
      }
      return (
        sanctionText(error) ??
        serverError(error) ??
        t('error-generic', { defaultValue: "That didn't work. Try again." })
      );
    },
    [t, sanctionText],
  );

  const policyLabel = useCallback(
    (policy: EditPolicy): string => {
      switch (policy) {
        case 'mods':
          return t('policy-mods', { defaultValue: 'Moderators' });
        case 'members':
          return t('policy-members', { defaultValue: 'Members' });
        case 'trusted':
          return t('policy-trusted', { defaultValue: 'Trusted members' });
      }
    },
    [t],
  );

  return { refusalLine, failureText, policyLabel };
}
