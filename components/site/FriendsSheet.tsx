'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useActiveFriends } from '@/hooks/useActiveFriends';
import { contextVerb, type ActiveFriend } from '@/lib/presence-types';
import { ActivityLine } from './ActivityLine';

/**
 * FriendsStrip (§9) — the mobile home surface (the right rail is hidden on
 * mobile). A compact avatar strip of the top online mutuals with activity dots
 * and a "+N" pill; tapping opens {@link FriendsSheet}. Fixed height, and it
 * renders nothing when no mutual is online, so it never shifts the feed below.
 */
const STRIP_MAX = 5;

export function FriendsStrip({ className }: { className?: string }) {
  const { t } = useTranslation('site');
  const { friends } = useActiveFriends(true);
  const [open, setOpen] = useState(false);

  if (!friends || friends.length === 0) return null;

  const shown = friends.slice(0, STRIP_MAX);
  const extra = friends.length - shown.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`glass-fill flex h-14 w-full items-center gap-3 rounded-site px-3 text-start ${className ?? ''}`}
        aria-label={t('friends-strip-label', {
          defaultValue: '{{count}} friends online',
          count: friends.length,
        })}
      >
        <span className="flex -space-x-2">
          {shown.map((f) => (
            <span key={f.user.id} className="relative">
              <UserAvatar
                src={f.user.image}
                alt=""
                size={36}
                fallbackName={f.user.name || f.user.handle || 'Friend'}
                className="ring-2 ring-site-surface"
              />
              <span
                aria-hidden
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-site-surface ${
                  f.activity ? 'bg-site-accent' : 'bg-site-success'
                }`}
              />
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-site-text">
          {t('friends-online-count', { defaultValue: '{{count}} online', count: friends.length })}
        </span>
        {extra > 0 ? (
          <span className="shrink-0 rounded-full bg-site-surface-hover px-2 py-0.5 text-xs font-semibold text-site-text-muted">
            +{extra}
          </span>
        ) : null}
        <ArrowRight className="h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
      </button>

      <FriendsSheet open={open} onOpenChange={setOpen} friends={friends} />
    </>
  );
}

/** The full online-mutuals list in a G1 bottom sheet (also usable standalone). */
export function FriendsSheet({
  open,
  onOpenChange,
  friends,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friends: ActiveFriend[];
}) {
  const { t } = useTranslation('site');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('friends-rail-title', { defaultValue: 'Friends' })}</SheetTitle>
        </SheetHeader>
        <ul className="flex flex-col gap-1 pt-2">
          {friends.map((f) => (
            <FriendSheetRow key={f.user.id} friend={f} onNavigate={() => onOpenChange(false)} />
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function FriendSheetRow({ friend, onNavigate }: { friend: ActiveFriend; onNavigate: () => void }) {
  const { t } = useTranslation('site');
  const { user, activity, joinable } = friend;
  const name = user.name || user.handle || user.username || t('someone', { defaultValue: 'Someone' });
  const profileHref = `/u/${user.handle ?? user.id}`;
  return (
    <li className="flex items-center gap-3 rounded-site px-2 py-2">
      <SheetClose asChild>
        <Link to={profileHref} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative shrink-0">
            <UserAvatar src={user.image} alt="" size={40} fallbackName={name} />
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-site-surface bg-site-success"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-site-text">{name}</span>
            <ActivityLine activity={activity} />
          </span>
        </Link>
      </SheetClose>
      {joinable && activity ? (
        // Full-width context button on mobile (not hover-revealed).
        <SheetClose asChild>
          <Link
            to={joinable.href}
            onClick={onNavigate}
            className="glass-interactive shrink-0 rounded-full bg-site-accent-dim px-3 py-1.5 text-xs font-semibold text-site-accent"
          >
            {t(`presence-context-${activity.kind}`, { defaultValue: contextVerb(activity.kind) })}
          </Link>
        </SheetClose>
      ) : null}
    </li>
  );
}
