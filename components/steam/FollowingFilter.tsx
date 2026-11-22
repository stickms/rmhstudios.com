import { BellOff } from 'lucide-react';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { unfollowGameApi } from '@/lib/arcade/updates.contract';

/**
 * The library's "Following" filter, in pieces: the filter's own label, its empty note and the Unfollow button on a
 * followed game's capsule. Each is its own component so the strings stay in the `game-updates` namespace beside
 * the library's `games-hub` ones.
 */
export function FollowingLabel() {
  const { t } = useTranslation('game-updates');
  return (
    <>
      {t('following', {
        defaultValue: 'Following',
      })}
    </>
  );
}

export function FollowingEmpty() {
  const { t } = useTranslation('game-updates');
  return (
    <>
      {t('following-empty', {
        defaultValue: 'You are not following any games yet.',
      })}
    </>
  );
}

/** Unfollow `gameId` and refresh the library's loader so the capsule leaves the filter. */
export function UnfollowButton({ gameId, title }: { gameId: string; title: string }) {
  const { t } = useTranslation('game-updates');
  const router = useRouter();
  const unfollow = async () => {
    try {
      await api(unfollowGameApi, {
        params: {
          gameId,
        },
      });
      await router.invalidate();
    } catch {
      toast.error(
        t('follow-failed', {
          defaultValue: 'Could not change that. Try again.',
        }),
      );
    }
  };
  return (
    <button type="button" className="stm-btn stm-btn-ghost stm-capsule-action" onClick={() => void unfollow()}>
      <BellOff aria-hidden />
      {t('unfollow', {
        defaultValue: 'Unfollow',
      })}
      <span className="stm-sr">{title}</span>
    </button>
  );
}
