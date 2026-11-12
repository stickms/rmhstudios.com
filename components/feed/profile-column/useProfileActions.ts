import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { useNavigate } from '@tanstack/react-router';
import { useSession } from '@/components/Providers';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import type { ProfileData } from '@/components/profile/profile-types';
import { api } from '@/lib/contract/client';
import { toggleFollowApi } from '@/lib/profile/follow.contract';
import { serverError } from '@/lib/http';
import { sendMessageApi } from '@/lib/messages/messages.contract';
import { joinProfileMembershipApi } from '@/lib/profile/profile-extras.contract';
import { applyFollow, applyMembershipJoined, rollbackFollow } from './profile-column-state';

export interface ProfileActions {
  signedIn: boolean;
  membershipBusy: boolean;
  messageSending: boolean;
  messageError: string | null;
  handleFollowToggle: () => void;
  handleJoinMembership: () => Promise<void>;
  handleMessage: () => Promise<void>;
}

/**
 * The visitor's actions on a profile: follow (optimistic, rolled back on
 * failure), join the membership, and start a direct conversation. All three need
 * a session and a loaded profile.
 */
export function useProfileActions(
  userId: string,
  profile: ProfileData | null,
  setProfile: Dispatch<SetStateAction<ProfileData | null>>,
): ProfileActions {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const navigate = useNavigate();
  const { run: runFollow } = useOptimisticAction();
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [messageSending, setMessageSending] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  // Follow toggle
  const handleFollowToggle = () => {
    if (!profile || !session) return;
    const wasFollowing = profile.isFollowing;
    runFollow({
      apply: () => setProfile((prev) => applyFollow(prev, wasFollowing)),
      rollback: () => setProfile((prev) => rollbackFollow(prev, wasFollowing)),
      commit: () => api(toggleFollowApi, { params: { id: userId } }),
    });
  };

  const handleJoinMembership = async () => {
    if (!profile || !session || membershipBusy) return;
    setMembershipBusy(true);
    try {
      await api(joinProfileMembershipApi, { params: { id: profile.id } });
      setProfile(applyMembershipJoined);
      toast.success(t('membership-joined', { defaultValue: "You're now a member! 🎉" }));
    } catch (e) {
      toast.error(serverError(e) || t('membership-failed', { defaultValue: 'Could not join' }));
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleMessage = async () => {
    if (!profile || !session || messageSending) return;
    setMessageSending(true);
    setMessageError(null);

    try {
      const data = await api(sendMessageApi, { body: { recipientId: profile.id } });
      navigate({ to: `/messages/${data.conversationId}` });
    } catch (err) {
      setMessageError(
        serverError(err) ||
          t('failed-to-start-conversation', { defaultValue: 'Failed to start conversation' }),
      );
    } finally {
      setMessageSending(false);
    }
  };

  return {
    signedIn: Boolean(session),
    membershipBusy,
    messageSending,
    messageError,
    handleFollowToggle,
    handleJoinMembership,
    handleMessage,
  };
}
