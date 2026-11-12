import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import type { ProfileData } from '@/components/profile/profile-types';
import { Spine, SpineStation } from '@/components/ui/spine';
import { MemoRMHarkCard } from '../VirtualPostList';
import { groupPostsByPeriod } from './profile-column-state';
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
      {/* The person's history is the spine: stations by period, posts hanging under them. */}
      {items.length > 0 && (
        <Spine>
          {groupPostsByPeriod(items).map((period) => (
            <Fragment key={period.key}>
              <SpineStation>
                {period.kind === 'this-week'
                  ? t('profile-period-this-week', { defaultValue: 'This week' })
                  : period.kind === 'last-week'
                    ? t('profile-period-last-week', { defaultValue: 'Last week' })
                    : period.text}
              </SpineStation>
              {period.items.map((item) => (
                <MemoRMHarkCard key={item.id} item={item} />
              ))}
            </Fragment>
          ))}
        </Spine>
      )}

      {loadingItems && (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      )}

      {!loadingItems && items.length === 0 && (
        <div className="py-8">
          <p className="t-heading mb-1">
            {isRMHarks
              ? t('no-rmharks-yet', { defaultValue: 'No RMHarks yet' })
              : t('no-likes-yet', { defaultValue: 'No likes yet' })}
          </p>
          <p className="t-body text-site-text-muted">
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
        <div className="t-meta py-6">
          {t('reached-the-end', { defaultValue: "You've reached the end" })}
        </div>
      )}

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
