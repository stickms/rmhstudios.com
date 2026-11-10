import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ProfileData } from '@/components/profile/profile-types';
import { useUserDisplayStore } from '@/stores/userDisplayStore';
import { api } from '@/lib/contract/client';
import { getProfileApi } from '@/lib/profile/profile.contract';
import { HttpError } from '@/lib/http';
import { profileDisplayUser } from './profile-column-state';

export interface ProfileLoader {
  profile: ProfileData | null;
  setProfile: Dispatch<SetStateAction<ProfileData | null>>;
  loading: boolean;
  notFound: boolean;
}

/**
 * The profile record: seeded from the route loader when present (so the profile
 * paints immediately) and otherwise fetched on the client. `undefined`
 * `initialProfile` means no loader supplied one; `null` means the loader ran and
 * the user wasn't found.
 */
export function useProfileLoader(
  userId: string,
  initialProfile: ProfileData | null | undefined,
): ProfileLoader {
  const seeded = useRef(initialProfile !== undefined);
  const [profile, setProfile] = useState<ProfileData | null>(initialProfile ?? null);
  const [loading, setLoading] = useState(initialProfile === undefined);
  const [notFound, setNotFound] = useState(initialProfile === null);

  // Fetch profile
  useEffect(() => {
    // Loader already provided this profile — prime the display cache from it and
    // skip the redundant client fetch. (The component is remounted via `key` on
    // profile→profile navigation, so `seeded`/`initialProfile` are always fresh.)
    if (seeded.current) {
      if (initialProfile) {
        useUserDisplayStore.getState().setUsers([profileDisplayUser(initialProfile)]);
      }
      return;
    }
    setLoading(true);
    setNotFound(false);
    api(getProfileApi, { params: { id: userId } })
      .then((data) => {
        // Seed user display cache with profile data
        useUserDisplayStore.getState().setUsers([profileDisplayUser(data)]);
        setProfile(data);
      })
      .catch((err: unknown) => {
        // A non-2xx answer (404 or otherwise) is the not-found state; transport failures only log.
        if (err instanceof HttpError) setNotFound(true);
        else console.error(err);
      })
      .finally(() => setLoading(false));
  }, [initialProfile, userId]);

  return { profile, setProfile, loading, notFound };
}
