import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { ProfileShowcase } from '@/components/profile/ProfileShowcase';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { useProfileSong } from '@/hooks/useProfileSong';
import type { ProfileData } from '@/components/profile/profile-types';
import { useUserDisplayStore } from '@/stores/userDisplayStore';
import { useShelvesTab } from '@/components/reading/useShelvesTab';
import { useKudosTabLabel } from '@/components/gifting/useKudosTabLabel';
import { ProfileDialogs } from './profile-column/ProfileDialogs';
import type { SocialModalKind } from './profile-column/ProfileDialogs';
import { ProfilePostsPanel } from './profile-column/ProfilePostsPanel';
import { ProfileTabBar } from './profile-column/ProfileTabBar';
import { ProfileTabPanels } from './profile-column/ProfileTabPanels';
import { profileThemeStyle } from './profile-column/profile-column-state';
import type { ProfileTab } from './profile-column/profile-column-state';
import { useProfileActions } from './profile-column/useProfileActions';
import { useProfileLoader } from './profile-column/useProfileLoader';
import { useProfilePosts } from './profile-column/useProfilePosts';
import { useProfileTab } from './profile-column/useProfileTab';

// Plan U15 — loaded when the profile is shown, split out of the main chunk.
const ProfileActivityHeatmap = lazy(() => import('@/components/profile/ProfileActivityHeatmap'));
// P11 gifting (G4) — the birthday chip loads only when needed.
const BirthdayBadge = lazy(() => import('@/components/gifting/BirthdayBadge'));

export function ProfileColumn({
  userId,
  initialProfile,
}: {
  userId: string;
  /**
   * Profile prefetched by the route loader. `undefined`= no loader (fall back
   * to the client fetch); `null`= loader ran and the user wasn't found.
   */
  initialProfile?: ProfileData | null;
}) {
  const { t } = useTranslation('feed');
  const { profile, setProfile, loading, notFound } = useProfileLoader(userId, initialProfile);
  const [tab, setTab] = useProfileTab(userId);
  const [showEdit, setShowEdit] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipMounted, setTipMounted] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [socialModal, setSocialModal] = useState<SocialModalKind | null>(null);
  const kudosTabLabel = useKudosTabLabel();
  const shelvesTab = useShelvesTab(profile?.id, !!profile?.isOwnProfile);

  // Use freshest user data from cache (may have been updated by RMHark fetches)
  const cachedUser = useUserDisplayStore((state) =>
    profile ? state.cache[profile.id] : undefined,
  );
  const displayName = cachedUser?.name ?? profile?.name;
  const displayImage = cachedUser?.image ?? profile?.image;

  const posts = useProfilePosts(userId, profile, loading, tab);

  // Profile song (P7): tap-to-play preview or tap-to-load Spotify embed; nothing
  // is fetched or loaded until the visitor taps.
  const song = useProfileSong(
    profile
      ? { spotifyId: profile.profileSongSpotifyId, previewUrl: profile.profileSongPreviewUrl }
      : null,
  );

  const actions = useProfileActions(userId, profile, setProfile);

  const handleTabChange = (newTab: ProfileTab) => {
    setTab(newTab);
    if (newTab === 'likes') posts.ensureLikesLoaded();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={32} />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="flex flex-col items-start gap-2 py-8">
        <h1 className="t-title">{t('user-not-found', { defaultValue: 'User not found' })}</h1>
        <p className="t-body text-site-text-muted">
          {t('user-not-found-desc', { defaultValue: "This user doesn't exist." })}
        </p>
        <Button asChild className="mt-2">
          <Link to="/">{t('go-home', { defaultValue: 'Go Home' })}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn('flex flex-col', profile.cosmetics?.theme && 'profile-themed')}
      style={profileThemeStyle(profile)}
    >
      <ProfileHero
        profile={profile}
        displayName={displayName}
        displayImage={displayImage}
        signedIn={actions.signedIn}
        isPlaying={song.isPlaying}
        membershipBusy={actions.membershipBusy}
        messageSending={actions.messageSending}
        messageError={actions.messageError}
        onTogglePlay={song.toggle}
        onEdit={() => setShowEdit(true)}
        onFollow={actions.handleFollowToggle}
        onMessage={actions.handleMessage}
        onTip={() => {
          setTipMounted(true);
          setTipOpen(true);
        }}
        onGift={() => setGiftOpen(true)}
        onJoinMembership={actions.handleJoinMembership}
        onShowSocial={setSocialModal}
        onShowAchievements={() => handleTabChange('achievements')}
      />

      {profile.birthdayToday && (
        <Suspense fallback={null}>
          <BirthdayBadge />
        </Suspense>
      )}

      <div className="pt-4">
        <ProfileShowcase
          modules={profile.modules ?? []}
          isOwner={profile.isOwnProfile}
          profile={{
            id: profile.id,
            followerCount: profile.followerCount,
            followingCount: profile.followingCount,
            rmharkCount: profile.rmharkCount,
            status: profile.status ?? null,
          }}
        />
      </div>

      <div className="pt-4">
        <Suspense fallback={null}>
          <ProfileActivityHeatmap userId={profile.id} />
        </Suspense>
      </div>

      <ProfileTabBar
        profile={profile}
        tab={tab}
        onChange={handleTabChange}
        shelvesTab={shelvesTab}
        kudosTabLabel={kudosTabLabel}
      />

      {tab === 'rmharks' && (
        <ProfilePostsPanel kind="rmharks" profile={profile} list={posts.rmharks} />
      )}

      {tab === 'likes' && <ProfilePostsPanel kind="likes" profile={profile} list={posts.likes} />}

      <ProfileTabPanels
        tab={tab}
        profile={profile}
        onGuestbookModeChange={(mode) => setProfile((p) => (p ? { ...p, guestbookMode: mode } : p))}
      />

      <ProfileDialogs
        userId={userId}
        profile={profile}
        setProfile={setProfile}
        displayName={displayName}
        displayImage={displayImage}
        song={song}
        tipMounted={tipMounted}
        tipOpen={tipOpen}
        onTipOpenChange={setTipOpen}
        giftOpen={giftOpen}
        onGiftOpenChange={setGiftOpen}
        showEdit={showEdit}
        onCloseEdit={() => setShowEdit(false)}
        socialModal={socialModal}
        onCloseSocial={() => setSocialModal(null)}
      />
    </div>
  );
}
