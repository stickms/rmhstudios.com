'use client';

import { Link } from '@tanstack/react-router';
import { UserAvatar } from '@/components/ui/UserAvatar';
import {
  Hammer,
  Package,
  UserPlus,
  BookOpen,
  Eye,
  Heart,
  MessageCircle,
} from 'lucide-react';

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
  curatedBuilds: SidebarBuild[];
  userBuilds: SidebarBuild[];
  recommendedUsers: SidebarUser[];
  blogPosts: SidebarPost[];
}

export function RightSidebar({
  curatedBuilds,
  userBuilds,
  recommendedUsers,
  blogPosts,
}: RightSidebarProps) {
  return (
    <div className="p-4 space-y-6">
      {/* Curated Builds */}
      <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
        <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
          <Package className="w-5 h-5 text-site-accent" />
          Curated Builds
        </h2>
        <div className="space-y-2.5">
          {curatedBuilds.map((build) => (
            <Link
              key={build.id}
              to={`/builds/${build.slug}`}
              className="-mx-2 px-2 flex items-center gap-2.5 rounded-lg py-1.5 hover:bg-site-surface-hover transition-colors group"
            >
              <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-site-bg shrink-0 border border-site-border">
                {build.thumbnailUrl ? (
                  <img src={build.thumbnailUrl} alt={build.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-linear-to-br from-site-accent/30 to-site-surface" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors truncate">
                  {build.title}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-site-text-dim">
                  <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3" />{build.likeCount}</span>
                  <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" />{build.commentCount}</span>
                  <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" />{build.viewCount}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <Link to="/builds" className="block text-sm text-site-accent hover:text-site-accent-hover mt-3 transition-colors">
          Show more
        </Link>
      </section>

      {/* User Builds */}
      <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
        <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
          <Hammer className="w-5 h-5 text-site-accent" />
          User Builds
        </h2>
        <div className="space-y-2.5">
          {userBuilds.map((build) => (
            <Link
              key={build.id}
              to={`/builds/${build.slug}`}
              className="-mx-2 px-2 flex items-center gap-2.5 rounded-lg py-1.5 hover:bg-site-surface-hover transition-colors group"
            >
              <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-site-bg shrink-0 border border-site-border">
                {build.thumbnailUrl ? (
                  <img src={build.thumbnailUrl} alt={build.title} className="w-full h-full object-cover" />
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
                    by {build.creator.name || build.creator.username || 'Unknown'}
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
      <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
        <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
          <UserPlus className="w-5 h-5 text-site-accent" />
          Recommended Users
        </h2>
        <div className="space-y-2.5">
          {recommendedUsers.map((user) => {
            const profileHref = user.handle ? `/@${user.handle}` : `/profile/${user.id}`;
            const initials = (user.name || user.username || 'U').charAt(0).toUpperCase();
            return (
              <div key={user.id} className="-mx-2 px-2 flex items-center gap-2.5 rounded-lg py-1.5 hover:bg-site-surface-hover transition-colors">
                <Link to={profileHref} className="flex items-center gap-2.5 min-w-0 flex-1">
                  <UserAvatar src={user.image} alt={user.name || user.username || 'User'} size={36} fallbackName={user.name || user.username} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-site-text truncate">{user.name || user.username || 'User'}</p>
                    <p className="text-xs text-site-text-dim">
                      {user.followerCount} followers
                    </p>
                  </div>
                </Link>
                <Link to={profileHref} className="text-xs font-semibold text-site-accent hover:text-site-accent-hover transition-colors">
                  Follow
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Blog */}
      <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
        <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5 text-site-accent" />
          Blog
        </h2>
        <div className="space-y-3">
          {blogPosts.map((post) => (
            <Link key={post.slug} to={`/blog/${post.slug}`} className="block group">
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
        <p>RMH | The Everything Platform</p>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <Link to="/blog" className="hover:text-site-text transition-colors">Blog</Link>
          <Link to="/roadmap" className="hover:text-site-text transition-colors">Roadmap</Link>
        </div>
      </div>
    </div>
  );
}
