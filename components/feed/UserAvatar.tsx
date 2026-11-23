import { memo } from'react';
import { Link } from'@tanstack/react-router';
import { useTranslation } from'react-i18next';
import { UserAvatar as AvatarImage } from'@/components/ui/UserAvatar';
import type { FeedItemUser } from'@/lib/feed-types';

interface UserAvatarProps {
 user: FeedItemUser | undefined | null;
 size?:'xs'|'sm'|'md'|'lg';
 linkToProfile?: boolean;
}

const sizeClasses = {
 xs:'w-7 h-7 text-micro',
 sm:'w-8 h-8 text-xs',
 md:'w-10 h-10 text-sm',
 lg:'w-12 h-12 text-sm',
};

const sizePx = { xs: 28, sm: 32, md: 40, lg: 48 };

function userProfileHref(user: FeedItemUser): string {
 return `/u/${user.handle || user.id}`;
}

function UserAvatarImpl({ user, size ='md', linkToProfile = true }: UserAvatarProps) {
 const { t } = useTranslation('feed');
 if (!user) return null;

 // The picture is drawn by the shared avatar (components/ui/UserAvatar), so a face is ONE file at every size and on
 // every surface. This component used to ask the optimizer for its own width (`w=64`/`80`/`96`) while the feed asked
 // for the shared srcset's, so opening a post downloaded every face on it again and each popped in late (owner,
 // 2026-11-23: profile pics flash when opening a post).
 const frame = user.cosmetics?.avatarFrame;

 const inner = (
 <div className={`${sizeClasses[size]} rounded-full bg-site-surface-hover flex items-center justify-center text-site-text font-semibold shrink-0`}>
 {user.image ? (
 <AvatarImage
 src={user.image}
 alt={user.name || t('user-avatar-alt', { defaultValue:'User'})}
 size={sizePx[size]}
 />
 ) : (
 (user.name?.[0] ||'U').toUpperCase()
 )}
 </div>
 );

 // Equipped avatar frame (cosmetic): a thin gradient/solid ring around the avatar.
 const avatar = frame ? (
 <div className="rounded-full p-0.5 shrink-0"style={{ background: frame.gradient ?? frame.color }}>
 {inner}
 </div>
 ) : (
 inner
 );

 if (linkToProfile) {
 // §16.3.7 micro-interactivity: a profile-linking avatar is clickable, so it
 // must respond — a subtle hover dim + press scale + focus ring (reduced motion
 // collapses the transform via the global reset). It was a bare, inert <Link>.
 return (
 <Link
 to={userProfileHref(user)}
 className="block shrink-0 rounded-full transition-[scale,opacity] duration-site-fast hover:opacity-90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
 >
 {avatar}
 </Link>
 );
 }

 return avatar;
}

/**
 * Memoized: avatars render in long feed/message/leaderboard lists, so skipping
 * re-renders when the `user`/`size`props are unchanged avoids wasted work.
 */
export const UserAvatar = memo(UserAvatarImpl);
