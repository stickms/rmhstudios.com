/**
 * Hover profile card: wrap any username/avatar with <ProfileHoverCard userId>
 * and a rich preview (avatar, bio, follower counts, online dot, follow button)
 * appears on hover/focus. Profile data is fetched lazily on first open and
 * cached for the component's lifetime.
 */

import { useCallback, useState } from'react';
import * as HoverCard from'@radix-ui/react-hover-card';
import { Link, useNavigate } from'@tanstack/react-router';
import { useTranslation } from'react-i18next';
import { BadgeCheck, ShieldCheck } from'lucide-react';
import { UserAvatar } from'@/components/ui/UserAvatar';
import { Button } from'@/components/ui/button';
import { useSession } from'@/components/Providers';
import { useOptimisticAction } from'@/hooks/useOptimisticAction';
import { AnimatedCount } from'@/components/ui/AnimatedCount';
import { api } from '@/lib/contract/client';
import { toggleFollowApi } from '@/lib/profile/follow.contract';
import { getProfileApi } from '@/lib/profile/profile.contract';
import { useArrival } from '@/components/ui/arrive';

interface HoverProfile {
 id: string;
 name: string | null;
 handle: string | null;
 image: string | null;
 bio: string | null;
 isVerified?: boolean;
 isAdmin?: boolean;
 isOnline?: boolean;
 followerCount: number;
 followingCount: number;
 isFollowing: boolean;
 isOwnProfile: boolean;
}

export function ProfileHoverCard({
 userId,
 children,
}: {
 /** User id or handle — anything /api/profile/$id resolves. */
 userId: string;
 children: React.ReactNode;
}) {
 const { t } = useTranslation('feed');
 const navigate = useNavigate();
 const { data: session } = useSession();
 const [profile, setProfile] = useState<HoverProfile | null>(null);
 const { run: runFollow, pending: followBusy } = useOptimisticAction();
 // Steel M9: the profile replaces the card's placeholder blocks.
 const arrival = useArrival(!!profile);

 const load = useCallback(
 async (open: boolean) => {
 if (!open || profile) return;
 try {
 setProfile(await api(getProfileApi, { params: { id: userId } }));
 } catch {
 // Hover preview is best-effort.
 }
 },
 [userId, profile]
 );

 const toggleFollow = () => {
 if (!profile) return;
 if (!session?.user) {
 navigate({ to:'/login', search: { callbackURL: undefined } });
 return;
 }
 const wasFollowing = profile.isFollowing;
 const followId = profile.id;
 runFollow({
 apply: () =>
 setProfile((p) =>
 p
 ? { ...p, isFollowing: !wasFollowing, followerCount: p.followerCount + (wasFollowing ? -1 : 1) }
 : p
 ),
 rollback: () =>
 setProfile((p) =>
 p
 ? { ...p, isFollowing: wasFollowing, followerCount: p.followerCount + (wasFollowing ? 1 : -1) }
 : p
 ),
 commit: () => api(toggleFollowApi, { params: { id: followId } }),
 });
 };

 const profileHref = `/u/${profile?.handle || userId}`;

 return (
 <HoverCard.Root openDelay={450} closeDelay={150} onOpenChange={load}>
 <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
 <HoverCard.Portal>
 <HoverCard.Content
 side="bottom"
 align="start"
 sideOffset={6}
 data-motion="pop"
 className="z-(--z-floating) w-72 p-4 surface-overlay outline-none"
 >
 {!profile ? (
 <div className="flex items-center gap-3">
 <div className="h-12 w-12 rounded-full bg-site-surface-active"/>
 <div className="flex-1 space-y-2">
 <div className="h-3.5 w-2/3 rounded bg-site-surface-active"/>
 <div className="h-3 w-1/3 rounded bg-site-surface-active"/>
 </div>
 </div>
 ) : (
 <div className={arrival}>
 <div className="mb-2 flex items-start justify-between gap-2">
 <Link to={profileHref}>
 <span className="relative inline-block">
 <UserAvatar src={profile.image} alt={profile.name ??'User'} size={48} fallbackName={profile.name ?? undefined} />
 {profile.isOnline && (
 <span
 title={t('online-now', { defaultValue:'Online now'})}
 className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-site-bg bg-site-success"
 />
 )}
 </span>
 </Link>
 {!profile.isOwnProfile && (
 <Button
 size="sm"
 variant={profile.isFollowing ?'default':'default'}
 disabled={followBusy}
 onClick={toggleFollow}
 className="rounded-full"
 >
 {profile.isFollowing
 ? t('following', { defaultValue:'Following'})
 : t('follow', { defaultValue:'Follow'})}
 </Button>
 )}
 </div>
 <Link to={profileHref} className="group block">
 <p className="flex items-center gap-1 font-semibold text-site-text group-hover:underline">
 <span className="truncate">{profile.name || t('unknown-user', { defaultValue:'Unknown'})}</span>
 {profile.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-site-success"aria-hidden />}
 {profile.isAdmin && <ShieldCheck className="h-4 w-4 shrink-0 text-site-accent"aria-hidden />}
 </p>
 {profile.handle && <p className="text-sm text-site-text-muted">@{profile.handle}</p>}
 </Link>
 {profile.bio && (
 <p className="mt-2 line-clamp-3 text-sm text-site-text-muted">{profile.bio}</p>
 )}
 <div className="mt-2 flex gap-4 text-sm">
 <span>
 <AnimatedCount value={profile.followingCount} format={(n) => n.toLocaleString()} className="font-semibold text-site-text"/>{' '}
 <span className="text-site-text-muted">{t('following-label', { defaultValue:'Following'})}</span>
 </span>
 <span>
 <AnimatedCount value={profile.followerCount} format={(n) => n.toLocaleString()} className="font-semibold text-site-text"/>{' '}
 <span className="text-site-text-muted">{t('followers-label', { defaultValue:'Followers'})}</span>
 </span>
 </div>
 </div>
 )}
 </HoverCard.Content>
 </HoverCard.Portal>
 </HoverCard.Root>
 );
}
