'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import {
  Hammer,
  Package,
  UserPlus,
  BookOpen,
  Eye,
  Heart,
  MessageCircle,
  Gift,
  Check,
} from 'lucide-react';
import { useSession } from '@/components/Providers';
import { useClipboard } from '@/hooks/useClipboard';
import { TodayWidget } from '@/components/feed/TodayWidget';
import { FriendsOnlineWidget } from '@/components/feed/FriendsOnlineWidget';

interface SidebarOfficialBuild {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  href: string;
  status?: string;
}

interface SidebarBuild {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  creator?: {
    id: string;
    handle: string | null;
    username: string | null;
    name: string | null;
    image: string | null;
  };
}

interface SidebarUser {
  id: string;
  handle: string | null;
  username: string | null;
  name: string | null;
  image: string | null;
  followerCount: number;
}

interface SidebarPost {
  slug: string;
  title: string;
  date: string;
}

interface RightSidebarProps {
  officialBuilds: SidebarOfficialBuild[];
  userBuilds: SidebarBuild[];
  recommendedUsers: SidebarUser[];
  blogPosts: SidebarPost[];
}

/** Live "N people online" pill. Polls the cached count once a minute. */
function OnlineNowPill() {
  const { t } = useTranslation('feed');
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/presence/online-count');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCount(data.count ?? null);
      } catch {
        // decorative — ignore
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!count) return null;
  return (
    <div className="flex items-center gap-2 rounded-full border border-site-border bg-site-glass-tint px-3 py-1.5 text-sm text-site-text-muted shadow-[inset_0_1px_0_var(--site-glass-rim-soft)]">
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-site-success opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-site-success" />
      </span>
      {t('online-now-count', { count, defaultValue: '{{count}} people online now' })}
    </div>
  );
}

/** "Invite friends" card — copies the caller's referral link. */
function InviteFriendsCard() {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const { copied, copy } = useClipboard({ resetMs: 2500 });
  const [reward, setReward] = useState(50);

  if (!session?.user) return null;

  const copyLink = async () => {
    try {
      const res = await fetch('/api/referrals/me', { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as { url: string; reward: number };
      setReward(data.reward);
      await copy(data.url);
    } catch {
      // clipboard unavailable — nothing to do
    }
  };

  return (
    <section className="glass-fill p-4">
      <h2 className="font-(family-name:--site-font-display) font-semibold tracking-[-0.022em] text-lg text-site-text flex items-center gap-2 mb-1.5">
        <Gift className="w-5 h-5 text-site-accent" />
        {t('invite-friends', { defaultValue: 'Invite friends' })}
      </h2>
      <p className="mb-3 text-sm text-site-text-muted">
        {t('invite-friends-blurb', {
          reward,
          defaultValue: 'Share your link — you both earn {{reward}} coins when they get going.',
        })}
      </p>
      <button
        onClick={copyLink}
        className="flex w-full items-center justify-center gap-2 rounded-site-sm border border-site-border bg-site-bg py-2 text-sm font-medium text-site-text transition-colors hover:bg-site-surface-hover"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-site-success" aria-hidden />
            {t('invite-link-copied', { defaultValue: 'Link copied!' })}
          </>
        ) : (
          t('copy-invite-link', { defaultValue: 'Copy invite link' })
        )}
      </button>
    </section>
  );
}

export function RightSidebar({
  officialBuilds,
  userBuilds,
  recommendedUsers,
  blogPosts,
}: RightSidebarProps) {
  const { t } = useTranslation('feed');
  return (
    <div className="p-4 space-y-6">
      <OnlineNowPill />

      <TodayWidget />

      <FriendsOnlineWidget />

      <InviteFriendsCard />

      {/* Official Builds */}
      <section className="glass-fill p-4">
        <h2 className="font-(family-name:--site-font-display) font-semibold tracking-[-0.022em] text-lg text-site-text flex items-center gap-2 mb-3">
          <Package className="w-5 h-5 text-site-accent" />
          {t('official-builds', { defaultValue: 'Official Builds' })}
        </h2>
        <div className="space-y-2.5">
          {officialBuilds.map((build) => {
            const isInternal = build.href.startsWith('/');
            return isInternal ? (
              <Link
                key={build.id}
                to={build.href}
                className="-mx-2 px-2 flex items-center gap-2.5 rounded-site-sm py-1.5 hover:bg-site-surface-hover transition-colors group"
              >
                <div className="relative w-10 h-10 rounded-site-sm overflow-hidden bg-site-bg shrink-0 border border-site-border">
                  {build.thumbnailUrl ? (
                    <OptimizedImage src={build.thumbnailUrl} alt={build.title} width={40} height={40} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-linear-to-br from-site-accent/30 to-site-surface" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors truncate">
                    {build.title}
                  </p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-site-text-dim">
                    {build.status}
                  </span>
                </div>
              </Link>
            ) : (
              <a
                key={build.id}
                href={build.href}
                target="_blank"
                rel="noopener noreferrer"
                className="-mx-2 px-2 flex items-center gap-2.5 rounded-site-sm py-1.5 hover:bg-site-surface-hover transition-colors group"
              >
                <div className="relative w-10 h-10 rounded-site-sm overflow-hidden bg-site-bg shrink-0 border border-site-border">
                  {build.thumbnailUrl ? (
                    <OptimizedImage src={build.thumbnailUrl} alt={build.title} width={40} height={40} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-linear-to-br from-site-accent/30 to-site-surface" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors truncate">
                    {build.title}
                  </p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-site-text-dim">
                    {build.status}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
        <Link to="/builds" className="block text-sm text-site-accent hover:text-site-accent-hover mt-3 transition-colors">
          {t('show-more', { defaultValue: 'Show more' })}
        </Link>
      </section>

      {/* User Builds */}
      <section className="glass-fill p-4">
        <h2 className="font-(family-name:--site-font-display) font-semibold tracking-[-0.022em] text-lg text-site-text flex items-center gap-2 mb-3">
          <Hammer className="w-5 h-5 text-site-accent" />
          {t('user-builds', { defaultValue: 'User Builds' })}
        </h2>
        <div className="space-y-2.5">
          {userBuilds.map((build) => (
            <Link
              key={build.id}
              to={`/builds/${build.slug}` as string}
              className="-mx-2 px-2 flex items-center gap-2.5 rounded-site-sm py-1.5 hover:bg-site-surface-hover transition-colors group"
            >
              <div className="relative w-10 h-10 rounded-site-sm overflow-hidden bg-site-bg shrink-0 border border-site-border">
                {build.thumbnailUrl ? (
                  <OptimizedImage src={build.thumbnailUrl} alt={build.title} width={40} height={40} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-linear-to-br from-site-accent/30 to-site-surface" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors line-clamp-2">
                  {build.title}
                </p>
                {build.creator && (
                  <p className="text-xs text-site-text-dim truncate mt-0.5">
                    {t('build-by', { creator: build.creator.name || build.creator.username || t('unknown', { defaultValue: 'Unknown' }), defaultValue: 'by {{creator}}' })}
                  </p>
                )}
                <div className="flex items-center gap-2 text-[11px] text-site-text-dim mt-0.5">
                  <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3" />{build.likeCount}</span>
                  <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" />{build.commentCount}</span>
                  <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" />{build.viewCount}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <Link to="/user-builds" className="block text-sm text-site-accent hover:text-site-accent-hover mt-3 transition-colors">
          Show more
        </Link>
      </section>

      {/* Recommended Users */}
      <section className="glass-fill p-4">
        <h2 className="font-(family-name:--site-font-display) font-semibold tracking-[-0.022em] text-lg text-site-text flex items-center gap-2 mb-3">
          <UserPlus className="w-5 h-5 text-site-accent" />
          {t('recommended-users', { defaultValue: 'Recommended Users' })}
        </h2>
        <div className="space-y-2.5">
          {recommendedUsers.map((user) => {
            const profileHref = user.handle ? `/u/${user.handle}` : `/profile/${user.id}`;
            return (
              <div key={user.id} className="-mx-2 px-2 flex items-center gap-2.5 rounded-site-sm py-1.5 hover:bg-site-surface-hover transition-colors">
                <Link to={profileHref as string} className="flex items-center gap-2.5 min-w-0 flex-1">
                  <UserAvatar src={user.image ?? undefined} alt={user.name || user.username || t('user', { defaultValue: 'User' })} size={36} fallbackName={(user.name || user.username) ?? undefined} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-site-text truncate">{user.name || user.username || t('user', { defaultValue: 'User' })}</p>
                    <p className="text-xs text-site-text-dim">
                      {t('follower-count', { count: user.followerCount, defaultValue: '{{count}} followers' })}
                    </p>
                  </div>
                </Link>
                <Link to={profileHref as string} className="text-xs font-semibold text-site-accent hover:text-site-accent-hover transition-colors">
                  {t('follow', { defaultValue: 'Follow' })}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Blog */}
      <section className="glass-fill p-4">
        <h2 className="font-(family-name:--site-font-display) font-semibold tracking-[-0.022em] text-lg text-site-text flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5 text-site-accent" />
          {t('blog', { defaultValue: 'Blog' })}
        </h2>
        <div className="space-y-3">
          {blogPosts.map((post) => (
            <Link key={post.slug} to={`/blog/${post.slug}` as string} className="block group">
              <p className="text-xs text-site-text-dim">{post.date}</p>
              <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors line-clamp-2">
                {post.title}
              </p>
            </Link>
          ))}
        </div>
        <Link to="/blog" className="block text-sm text-site-accent hover:text-site-accent-hover mt-3 transition-colors">
          Show more
        </Link>
      </section>

      {/* Footer */}
      <div className="text-xs text-site-text-dim px-2 space-y-1">
        <p>{t('footer-tagline', { defaultValue: 'RMH | The Everything Platform' })}</p>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <Link to="/security" className="hover:text-site-text transition-colors">{t('security', { defaultValue: 'Security' })}</Link>
          <Link to="/optimization" className="hover:text-site-text transition-colors">{t('optimization', { defaultValue: 'Speed' })}</Link>
          <Link to="/roadmap" className="hover:text-site-text transition-colors">{t('roadmap', { defaultValue: 'Roadmap' })}</Link>
        </div>
      </div>
    </div>
  );
}
