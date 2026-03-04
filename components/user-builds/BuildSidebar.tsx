'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Star, TrendingUp, Clock, Loader2 } from 'lucide-react';
import type { Build } from '@/lib/user-builds-types';

interface BuildSidebarProps {
  className?: string;
}

function BuildMiniCard({ build }: { build: Build }) {
  return (
    <Link href={`/user-builds/${build.slug}`}>
      <div className="flex gap-3 p-3 rounded-lg hover:bg-site-surface-hover transition-colors">
        {build.thumbnailUrl ? (
          <img
            src={build.thumbnailUrl}
            alt={build.title}
            className="w-16 h-12 rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-16 h-12 rounded bg-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-bold shrink-0">
            {build.title[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-site-text truncate">{build.title}</h4>
          <p className="text-xs text-site-text-muted truncate">{build.user.name}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-site-text-dim">
            <span>{build.likeCount} likes</span>
            <span>{build.viewCount} views</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function BuildSidebar({ className = '' }: BuildSidebarProps) {
  const [featured, setFeatured] = useState<Build[]>([]);
  const [popular, setPopular] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSidebarData() {
      try {
        const [featuredRes, popularRes] = await Promise.all([
          fetch('/api/user-builds/featured?limit=3'),
          fetch('/api/user-builds?sort=popular&limit=5'),
        ]);

        if (featuredRes.ok) {
          const data = await featuredRes.json();
          setFeatured(data.builds);
        }

        if (popularRes.ok) {
          const data = await popularRes.json();
          setPopular(data.items);
        }
      } catch (error) {
        console.error('Error fetching sidebar data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSidebarData();
  }, []);

  if (loading) {
    return (
      <div className={`flex justify-center py-8 ${className}`}>
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Featured Builds */}
      {featured.length > 0 && (
        <div className="mb-8">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-site-text mb-4">
            <Star className="w-4 h-4 text-yellow-400" />
            Featured
          </h3>
          <div className="space-y-1">
            {featured.map((build) => (
              <BuildMiniCard key={build.id} build={build} />
            ))}
          </div>
        </div>
      )}

      {/* Popular Builds */}
      {popular.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-site-text mb-4">
            <TrendingUp className="w-4 h-4 text-violet-400" />
            Popular
          </h3>
          <div className="space-y-1">
            {popular.map((build) => (
              <BuildMiniCard key={build.id} build={build} />
            ))}
          </div>
        </div>
      )}

      {/* Submit CTA */}
      <div className="mt-8 p-4 rounded-xl border border-site-border bg-gradient-to-br from-violet-500/10 to-fuchsia-600/10">
        <h4 className="font-semibold text-site-text mb-2">Share Your Build</h4>
        <p className="text-sm text-site-text-muted mb-4">
          Built something cool with rmhcode? Share it with the community!
        </p>
        <Link
          href="/user-builds/submit"
          className="block w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium text-center transition-colors"
        >
          Submit a Build
        </Link>
      </div>
    </div>
  );
}
