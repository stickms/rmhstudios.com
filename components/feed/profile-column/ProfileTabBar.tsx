import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import type { ProfileData } from '@/components/profile/profile-types';
import { canSeeGuestbookTab, canSeeLikesTab } from './profile-column-state';
import type { ProfileTab } from './profile-column-state';

/**
 * Tab bar → shared Tabs (§5.4). The column's tab handler keeps the lazy
 * liked-posts fetch on first switch.
 */
export function ProfileTabBar({
  profile,
  tab,
  onChange,
  shelvesTab,
  kudosTabLabel,
}: {
  profile: ProfileData;
  tab: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  shelvesTab: { show: boolean; label: string };
  kudosTabLabel: string;
}) {
  const { t } = useTranslation('feed');
  const showLikesTab = canSeeLikesTab(profile);
  const showGuestbookTab = canSeeGuestbookTab(profile);
  return (
    <div className="px-4 py-3">
      <Tabs
        tabs={[
          {
            id: 'rmharks',
            label: t('rmharks-label', { defaultValue: 'RMHarks' }),
          },
          ...(showLikesTab ? [{ id: 'likes', label: t('likes', { defaultValue: 'Likes' }) }] : []),
          { id: 'achievements', label: t('achievements', { defaultValue: 'Achievements' }) },
          ...(showGuestbookTab
            ? [{ id: 'guestbook', label: t('guestbook-tab', { defaultValue: 'Guestbook' }) }]
            : []),
          ...(shelvesTab.show ? [{ id: 'shelves', label: shelvesTab.label }] : []),
          { id: 'kudos', label: kudosTabLabel },
        ]}
        value={tab}
        onChange={(id) => onChange(id as ProfileTab)}
      />
    </div>
  );
}
