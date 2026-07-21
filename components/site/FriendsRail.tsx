'use client';

import { memo } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Users, UserPlus, Check } from 'lucide-react';

import { UserAvatar } from '@/components/ui/UserAvatar';
import { useActiveFriends } from '@/hooks/useActiveFriends';
import { useClipboard } from '@/hooks/useClipboard';
import { contextVerb, sameActiveFriend, type ActiveFriend } from '@/lib/presence-types';
import { ActivityLine } from './ActivityLine';

/**
 * FriendsRail (§9) — the desktop home right-rail card: online mutuals
 * (in-something first), each an avatar + name + {@link ActivityLine} + a
 * trailing context button (Join/Watch/Hop in) when joinable. Empty state links
 * to referrals. Hidden on mobile (the strip + sheet are the mobile surface).
 */
export function FriendsRail() {
  const { t } = useTranslation('site');
  const { friends } = useActiveFriends(true);
  const { copied, copy } = useClipboard({ resetMs: 2500 });

  const copyInvite = async () => {
    try {
      const res = await fetch('/api/referrals/me', { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as { url: string };
      await copy(data.url);
    } catch {
      // clipboard unavailable — nothing to do
    }
  };

  // Until we know, render nothing (no skeleton flash in the rail).
  if (friends === null) return null;

  return (
    <section className="rounded-site border border-site-border bg-site-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 font-(family-name:--site-font-display) text-lg font-bold text-site-text">
        <Users className="h-5 w-5 text-site-accent" aria-hidden />
        {t('friends-rail-title', { defaultValue: 'Friends' })}
      </h2>

      {friends.length === 0 ? (
        <div className="flex flex-col items-start gap-2 text-sm text-site-text-muted">
          <p>{t('friends-none-online', { defaultValue: 'No friends online.' })}</p>
          <button
            type="button"
            onClick={copyInvite}
            className="flex items-center gap-1.5 text-sm font-medium text-site-accent hover:underline"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" aria-hidden />
                {t('invite-link-copied', { defaultValue: 'Link copied!' })}
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" aria-hidden />
                {t('friends-invite', { defaultValue: 'Invite a friend' })}
              </>
            )}
          </button>
        </div>
      ) : (
        <ul className="space-y-1">
          {friends.map((f) => (
            <FriendRailRow key={f.user.id} friend={f} />
          ))}
        </ul>
      )}
    </section>
  );
}

// Memoized on the rendered fields (not prop identity): the poll hands every row
// a new `friend` object each cycle, so without this each of N rows re-renders
// (and re-runs its avatar + t()) on every poll even when nothing changed.
const FriendRailRow = memo(function FriendRailRow({ friend }: { friend: ActiveFriend }) {
  const { t } = useTranslation('site');
  const { user, activity, joinable } = friend;
  const name = user.name || user.handle || user.username || t('someone', { defaultValue: 'Someone' });
  const profileHref = `/u/${user.handle ?? user.id}`;
  return (
    <li className="flex items-center gap-2.5 rounded-site-sm px-1 py-1.5">
      <Link to={profileHref} className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="relative shrink-0">
          <UserAvatar src={user.image} alt="" size={32} fallbackName={name} />
          <span
            aria-hidden
            className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-site-surface bg-site-success"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-site-text">{name}</span>
          <ActivityLine activity={activity} />
        </span>
      </Link>
      {joinable && activity ? (
        <Link
          to={joinable.href}
          className="glass-interactive shrink-0 rounded-full bg-site-accent-dim px-2.5 py-1 text-[11px] font-semibold text-site-accent"
        >
          {t(`presence-context-${activity.kind}`, { defaultValue: contextVerb(activity.kind) })}
        </Link>
      ) : null}
    </li>
  );
}, (prev, next) => sameActiveFriend(prev.friend, next.friend));
