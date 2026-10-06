'use client';

/**
 * Who is "logged in" to Dunesday 7: the visitor's real RMH Studios profile
 * when they are signed in to the site (display name and avatar, including a
 * custom profile picture), otherwise a Guest account.
 */

import { useTranslation } from 'react-i18next';
import { useResolvedUser, useSession } from '@/components/Providers';

export interface Profile {
  name: string;
  image: string | null;
  handle: string | null;
  signedIn: boolean;
  pending: boolean;
}

export function useProfile(): Profile {
  const { t } = useTranslation('c-dunesday');
  const { data: session, isPending } = useSession();
  const { resolved } = useResolvedUser();
  const user = session?.user as { name?: string | null; image?: string | null } | undefined;
  const name =
    resolved?.name?.trim() || user?.name?.trim() || t('guest', { defaultValue: 'Guest' });
  return {
    name: name.slice(0, 40),
    image: resolved?.image ?? user?.image ?? null,
    handle: resolved?.handle ?? null,
    signedIn: Boolean(user),
    pending: isPending,
  };
}

/** A folder-safe version of the display name for C:\Users\<name>. */
export function profileFolderName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|.]/g, '')
      .trim()
      .slice(0, 40) || 'User'
  );
}
