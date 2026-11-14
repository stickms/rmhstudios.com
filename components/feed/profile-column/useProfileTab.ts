import {
  useEffect,
  useState,
} from 'react';
import type {
  Dispatch,
  SetStateAction,
} from 'react';
import { initialTabForHash } from './profile-column-state';
import type { ProfileTab } from './profile-column-state';

/**
 * The active profile tab. The column instance is reused across /u/$userid
 * routes, so navigating to another profile resets it (to the guestbook when the
 * URL says `#guestbook`, else RMHarks).
 */
export function useProfileTab(
  userId: string,
): [
  ProfileTab,
  Dispatch<
    SetStateAction<ProfileTab>
  >,
] {
  const [
    tab,
    setTab,
  ] =
    useState<ProfileTab>(
      'rmharks',
    );

  useEffect(() => {
    setTab(
      initialTabForHash(
        window
          .location
          .hash,
      ),
    );
  }, [
    userId,
  ]);

  return [
    tab,
    setTab,
  ];
}
