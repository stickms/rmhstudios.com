import { memo } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import type { FollowRowData, FollowTab } from '@/lib/social/follow-filters';
import { cn } from '@/lib/utils';

import { Handle } from '@/components/ui/handle';
interface FollowRowProps {
  row: FollowRowData;
  tab: FollowTab;
  selected: boolean;
  busy: boolean;
  /** Extra class on the row root (the arrival fade for rows that join a list already showing). */
  className?: string | undefined;
  onSelect: (id: string, selected: boolean) => void;
  onUnfollow: (row: FollowRowData) => void;
  onFollowBack: (row: FollowRowData) => void;
  onRemove: (row: FollowRowData) => void;
}

/** One person in the follow manager: a checkbox, who they are, how they relate to you, and the row's actions. */
export const FollowRow = memo(function FollowRow({
  row,
  tab,
  selected,
  busy,
  className,
  onSelect,
  onUnfollow,
  onFollowBack,
  onRemove,
}: FollowRowProps) {
  const { t, i18n } = useTranslation('follows');
  const name = row.name || row.username || t('unknown-member', { defaultValue: 'Unknown' });
  const href = `/u/${row.handle || row.id}`;

  return (
    <li className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-site-border py-3', className)}>
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onSelect(row.id, e.target.checked)}
        aria-label={t('select-member', { name, defaultValue: 'Select {{name}}' })}
        className="size-4 shrink-0 accent-site-text pointer-coarse:size-5"
      />
      <Link to={href as string} className="flex min-w-0 flex-1 basis-48 items-center gap-3">
        <UserAvatar src={row.image ?? undefined} alt="" size={40} fallbackName={name} />
        <span className="min-w-0">
          <span className="t-body block truncate font-semibold text-site-text">{name}</span>
          <span className="t-meta flex flex-wrap items-center gap-x-2">
            {row.handle && (
              <span className="truncate">
                <Handle handle={row.handle} />
              </span>
            )}
            {row.followsYou && <span>{t('follows-you', { defaultValue: 'Follows you' })}</span>}
            {row.youFollow && <span>{t('you-follow', { defaultValue: 'You follow' })}</span>}
          </span>
        </span>
      </Link>
      <span className="t-meta shrink-0">
        {row.lastActive ? (
          <>
            {t('last-active', { defaultValue: 'Active' })}{' '}
            <RelativeTime date={row.lastActive} format={(at, now) => formatRelativeTime(at, i18n.language, now)} />
          </>
        ) : (
          t('no-activity', { defaultValue: 'No activity yet' })
        )}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {tab === 'following' ? (
          <Button size="sm" disabled={busy} onClick={() => onUnfollow(row)}>
            {t('unfollow', { defaultValue: 'Unfollow' })}
          </Button>
        ) : (
          <>
            {!row.youFollow && (
              <Button size="sm" disabled={busy} onClick={() => onFollowBack(row)}>
                {t('follow-back', { defaultValue: 'Follow back' })}
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(row)}>
              {t('remove-follower', { defaultValue: 'Remove follower' })}
            </Button>
          </>
        )}
      </div>
    </li>
  );
});
