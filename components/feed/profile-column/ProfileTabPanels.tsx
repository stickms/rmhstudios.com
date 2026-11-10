import { lazy, Suspense } from 'react';
import { Spinner } from '@/components/ui/spinner';
import type { ProfileData } from '@/components/profile/profile-types';
import { AchievementsColumn } from '../AchievementsColumn';
import type { ProfileTab } from './profile-column-state';

// Plan U15 — loaded the first time the tab is opened, never on a plain profile view.
const GuestbookPanel = lazy(() => import('@/components/profile/GuestbookPanel'));
// P13 reading (L7) — the shelves panel is lazy; only the tiny tab hook ships with the column.
// P11 gifting (G4) — the kudos panel loads only when needed.
const KudosPanel = lazy(() => import('@/components/gifting/KudosPanel'));
const ProfileShelvesPanel = lazy(() => import('@/components/reading/ProfileShelves'));

function PanelFallback() {
  return (
    <div className="flex justify-center py-12">
      <Spinner />
    </div>
  );
}

/** The non-post tab bodies: achievements, guestbook, kudos and shelves. */
export function ProfileTabPanels({
  tab,
  profile,
  onGuestbookModeChange,
}: {
  tab: ProfileTab;
  profile: ProfileData;
  onGuestbookModeChange: (mode: string) => void;
}) {
  return (
    <>
      {/* Achievements tab content — AchievementsColumn self-fetches (public API) */}
      {tab === 'achievements' && (
        <div className="p-4">
          <AchievementsColumn userId={profile.id} hideHeader />
        </div>
      )}

      {tab === 'guestbook' && (
        <Suspense fallback={<PanelFallback />}>
          <GuestbookPanel ownerId={profile.id} onModeChange={onGuestbookModeChange} />
        </Suspense>
      )}

      {tab === 'kudos' && (
        <Suspense fallback={<PanelFallback />}>
          <KudosPanel ownerId={profile.id} isOwner={profile.isOwnProfile} />
        </Suspense>
      )}

      {tab === 'shelves' && (
        <Suspense fallback={<PanelFallback />}>
          <ProfileShelvesPanel ownerId={profile.id} />
        </Suspense>
      )}
    </>
  );
}
