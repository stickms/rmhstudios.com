import { useState } from 'react';
import {
  Bell,
  BellRing,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import {
  followGameApi,
  unfollowGameApi,
  type FollowState,
} from '@/lib/arcade/updates.contract';

/**
 * Follow or unfollow a game: a toggle for signed-in members (nothing is drawn signed out, there is no row to write).
 * Followers are told in-site about the game's patch notes and new guides. `onChange` hands the new state to a parent
 * that shows the follower count.
 */
export function FollowGameButton({
  gameId,
  signedIn,
  initial,
  onChange,
}: {
  gameId: string;
  signedIn: boolean;
  initial: FollowState;
  onChange?: (
    state: FollowState,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'game-updates',
    );
  const [
    following,
    setFollowing,
  ] =
    useState(
      initial.following,
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  if (
    !signedIn
  )
    return null;

  const toggle =
    async () => {
      setBusy(
        true,
      );
      try {
        const next =
          await api(
            following
              ? unfollowGameApi
              : followGameApi,
            {
              params:
                {
                  gameId,
                },
            },
          );
        setFollowing(
          next.following,
        );
        onChange?.(
          next,
        );
      } catch {
        toast.error(
          t(
            'follow-failed',
            {
              defaultValue:
                'Could not change that. Try again.',
            },
          ),
        );
      }
      setBusy(
        false,
      );
    };

  const Icon =
    following
      ? BellRing
      : Bell;
  return (
    <button
      type="button"
      className="stm-btn"
      aria-pressed={
        following
      }
      disabled={
        busy
      }
      onClick={() =>
        void toggle()
      }
    >
      <Icon
        aria-hidden
      />
      {following
        ? t(
            'following',
            {
              defaultValue:
                'Following',
            },
          )
        : t(
            'follow',
            {
              defaultValue:
                'Follow',
            },
          )}
    </button>
  );
}
