import { lazy, Suspense } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { GiftSubDialog } from '@/components/economy/GiftSubDialog';
import { useResolvedUser } from '@/components/Providers';
import { useUserDisplayStore } from '@/stores/userDisplayStore';
import type { ProfileData } from '@/components/profile/profile-types';
import type { ProfileSongControls } from '@/hooks/useProfileSong';
import { ProfileEditModal } from '../ProfileEditModal';
import type { SavedProfileData } from '../ProfileEditModal';
import { SocialListModal } from '../SocialListModal';
import { applySavedProfile, buildEditInitial, savedDisplayUser } from './profile-column-state';

// P7 — only fetched when a visitor taps a song that has no preview clip.
const ProfileSongEmbed = lazy(() => import('@/components/profile/plus/ProfileSongEmbed'));
// Lazy and mounted on first open, as in RMHarkOverflowMenu: the dialog
// validates with the API's zod schema, which would otherwise put zod on every
// profile page for a button most visitors never press.
const TipDialog = lazy(() =>
  import('@/components/economy/TipDialog').then((m) => ({ default: m.TipDialog })),
);

export type SocialModalKind = 'followers' | 'following';

interface ProfileDialogsProps {
  userId: string;
  profile: ProfileData;
  setProfile: Dispatch<SetStateAction<ProfileData | null>>;
  displayName: string | null | undefined;
  displayImage: string | null | undefined;
  song: ProfileSongControls;
  tipMounted: boolean;
  tipOpen: boolean;
  onTipOpenChange: (open: boolean) => void;
  giftOpen: boolean;
  onGiftOpenChange: (open: boolean) => void;
  showEdit: boolean;
  onCloseEdit: () => void;
  socialModal: SocialModalKind | null;
  onCloseSocial: () => void;
}

/** Everything the profile opens on top of itself: song embed, tip, gift, edit and followers/following. */
export function ProfileDialogs({
  userId,
  profile,
  setProfile,
  displayName,
  displayImage,
  song,
  tipMounted,
  tipOpen,
  onTipOpenChange,
  giftOpen,
  onGiftOpenChange,
  showEdit,
  onCloseEdit,
  socialModal,
  onCloseSocial,
}: ProfileDialogsProps) {
  const { refresh: refreshResolvedUser } = useResolvedUser();

  const handleSaved = (data: SavedProfileData) => {
    setProfile((prev) => applySavedProfile(prev, data));

    // Sync display name into the better-auth session
    // (avatar is handled by useResolvedUser via UserProfile.customImage)
    if (data.displayName !== undefined && data.displayName !== null) {
      // Loaded on the save: a profile page is preloaded from every signed-in page's sidebar, and the auth client
      // should not ride along (third-pass audit RT1).
      const name = data.displayName;
      void import('@/lib/auth-client').then(({ authClient }) => authClient.updateUser({ name }));
    }
    refreshResolvedUser();

    // Force-update user display cache so all rendered RMHarks get fresh data
    // (forceSetUser because reset avatar intentionally sets image to null/default)
    useUserDisplayStore.getState().forceSetUser(savedDisplayUser(profile, data));
  };

  return (
    <>
      {song.embedOpen && profile.profileSongSpotifyId && (
        <Suspense fallback={null}>
          <ProfileSongEmbed
            spotifyId={profile.profileSongSpotifyId}
            title={profile.profileSongTitle}
            onClose={song.closeEmbed}
          />
        </Suspense>
      )}

      {/* Tip dialog (non-owner) */}
      {profile && !profile.isOwnProfile && tipMounted && (
        <Suspense fallback={null}>
          <TipDialog
            open={tipOpen}
            onOpenChange={onTipOpenChange}
            recipientId={profile.id}
            recipientName={displayName ?? profile.name}
            entityType="profile"
            entityId={profile.id}
          />
        </Suspense>
      )}

      {/* Gift membership dialog (non-owner) */}
      {profile && !profile.isOwnProfile && (
        <GiftSubDialog
          open={giftOpen}
          onOpenChange={onGiftOpenChange}
          recipientId={profile.id}
          recipientName={displayName ?? profile.name}
        />
      )}

      {/* Edit modal */}
      {showEdit && (
        <ProfileEditModal
          open={showEdit}
          onClose={onCloseEdit}
          initial={buildEditInitial(profile, displayName, displayImage)}
          onSaved={handleSaved}
        />
      )}

      {/* Followers / Following modal */}
      {socialModal && (
        <SocialListModal
          open={socialModal !== null}
          onClose={onCloseSocial}
          userId={userId}
          type={socialModal}
        />
      )}
    </>
  );
}
