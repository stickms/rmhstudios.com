import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import type { ProfileData } from '@/components/profile/profile-types';
import { VirtualPostList } from '../VirtualPostList';
import type { PostList } from './useProfilePosts';

/** The RMHarks or Likes tab body: the post list, its loading/empty/end states and the scroll sentinel. */
export function ProfilePostsPanel({
  kind,
  profile,
  list,
}: {
  kind: 'rmharks' | 'likes';
  profile: ProfileData;
  list: PostList;
}) {
  const { t } = useTranslation('feed');
  const { items, loadingItems, hasMore, sentinelRef } = list;
  const isRMHarks = kind === 'rmharks';
  return (
    <div>
      <VirtualPostList items={items} />

      {loadingItems && (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      )}

      {!loadingItems && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <p className="text-lg font-medium text-site-text mb-2">
            {isRMHarks
              ? t('no-rmharks-yet', { defaultValue: 'No RMHarks yet' })
              : t('no-likes-yet', { defaultValue: 'No likes yet' })}
          </p>
          <p className="text-sm text-site-text-muted">
            {isRMHarks
              ? profile.isOwnProfile
                ? t('no-rmharks-own', { defaultValue: "You haven't posted any RMHarks yet." })
                : t('no-rmharks-other', {
                    handle: profile.handle,
                    defaultValue: "@{{handle}} hasn't posted any RMHarks yet.",
                  })
              : profile.isOwnProfile
                ? t('no-likes-own', { defaultValue: "You haven't liked any posts yet." })
                : t('no-likes-other', {
                    handle: profile.handle,
                    defaultValue: "@{{handle}} hasn't liked any posts yet.",
                  })}
          </p>
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <div className="py-8 text-center text-sm text-site-text-dim">
          {t('reached-the-end', { defaultValue: "You've reached the end" })}
        </div>
      )}

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
