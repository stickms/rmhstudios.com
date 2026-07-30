'use client';

/**
 *"Friends online"widget — surfaces followed users who are online now and
 * what joinable room they're in, so the multiplayer apps stop depending on
 * everyone independently deciding to open the same lobby.
 */

import { useEffect, useState } from'react';
import { Link } from'@tanstack/react-router';
import { Users } from'lucide-react';
import { useTranslation } from'react-i18next';
import { useSession } from'@/components/Providers';
import { UserAvatar } from'@/components/ui/UserAvatar';
import { useIsDesktop } from'@/hooks/useIsDesktop';
import { useIdleReady } from'@/hooks/useIdleReady';
import { pulseSnapshot, subscribePulse } from'@/lib/pulse';

interface OnlineFriend {
 user: { id: string; name: string | null; handle: string | null; image: string | null };
 activity: { kind:'rmhtube'|'rmhmusic'; label: string; href: string } | null;
}

export function FriendsOnlineWidget() {
 const { t } = useTranslation('feed');
 const { data: session } = useSession();
 const isDesktop = useIsDesktop();
 const idle = useIdleReady();
 const [friends, setFriends] = useState<OnlineFriend[] | null>(
 () => pulseSnapshot().friends as OnlineFriend[] | null,
 );

 // Reads the `friends` section of the shared pulse (lib/pulse.ts) instead of
 // running its own 60s poll against /api/presence/friends. Still gated on desktop
 // (this widget lives in the `hidden lg:block` right sidebar) and on browser-idle
 // — and because the pulse only asks for sections that have a live subscriber, a
 // phone never makes the server compute the follow-graph fan-out at all.
 useEffect(() => {
 if (!session?.user || !isDesktop || !idle) return;
 return subscribePulse(['friends'], (data) => setFriends(data.friends as OnlineFriend[] | null));
 }, [session?.user, isDesktop, idle]);

 // Render nothing until we know there's at least one friend online — keeps the
 // sidebar clean for solo sessions.
 if (!session?.user || !friends || friends.length === 0) return null;

 return (
 <section className="rad-live__card">
 <h2 className="mb-3 flex items-center gap-2 font-(family-name:--site-font-display) text-lg font-bold text-site-text">
 <Users className="h-5 w-5 text-site-accent"aria-hidden />
 {t('friends-online', { defaultValue:'Friends online'})}
 </h2>
 <ul className="space-y-1">
 {friends.map(({ user, activity }) => {
 const name = user.name || user.handle || t('someone', { defaultValue:'Someone'});
 const profileHref = `/u/${user.handle ?? user.id}`;
 return (
 <li key={user.id}>
 <Link
 to={activity?.href ?? profileHref}
 className="-mx-2 flex items-center gap-2.5 rounded-site-sm px-2 py-1.5 transition-colors hover:bg-site-surface-hover"
 >
 <span className="relative shrink-0">
 <UserAvatar src={user.image} alt=""size={32} fallbackName={name} />
 <span
 aria-hidden
 className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-site-surface bg-site-success"
 />
 </span>
 <span className="min-w-0 flex-1">
 <span className="block truncate text-sm font-medium text-site-text">{name}</span>
 <span className="block truncate text-xs text-site-text-dim">
 {activity
 ? t(`activity-${activity.kind}`, { defaultValue: activity.label })
 : t('activity-online', { defaultValue:'Online'})}
 </span>
 </span>
 {activity && (
 <span className="shrink-0 rounded-full bg-site-accent-dim px-2 py-0.5 text-[11px] font-semibold text-site-accent">
 {t('activity-join', { defaultValue:'Join'})}
 </span>
 )}
 </Link>
 </li>
 );
 })}
 </ul>
 </section>
 );
}
