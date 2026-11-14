import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import type { ProfileData } from '@/components/profile/profile-types';
import { Spine, SpineStation } from '@/components/ui/spine';
import { MemoRMHarkCard } from '../VirtualPostList';
import { cn } from '@/lib/utils';
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
  // Steel M9: the first page replaces the spinner; later pages append rows that fade one by one.
  const arrival = useArrival(items.length > 0 || !loadingItems);
  const isNew = useArrivingKeys(items.map((i) => i.id));
  const endArrival = useArrival(!hasMore);
  return (
    <div>
      {/* The person's history is the spine: stations by period, posts hanging under them. */}
      {items.length > 0 && (
        <Spine className={arrival}>
          {groupPostsByPeriod(items).map((period) => (
            <Fragment key={period.key}>
              <SpineStation
                className={period.items[0] && isNew(period.items[0].id) ? ARRIVE : undefined}
              >
                {period.kind === 'this-week'
                  ? t('profile-period-this-week', { defaultValue: 'This week' })
                  : period.kind === 'last-week'
                    ? t('profile-period-last-week', { defaultValue: 'Last week' })
                    : period.text}
              </SpineStation>
              {period.items.map((item) =>
                isNew(item.id) ? (
                  <div key={item.id} className="arrive-group">
                    <MemoRMHarkCard item={item} />
                  </div>
                ) : (
                  <MemoRMHarkCard key={item.id} item={item} />
                ),
              )}
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
        <div className={cn('py-8', arrival)}>
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
        <div className={cn('t-meta py-6', endArrival)}>
          {t('reached-the-end', { defaultValue: "You've reached the end" })}
        </div>
      )}

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
