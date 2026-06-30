'use client';

import { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { Star, TrendingUp, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import type { Build } from '@/lib/user-builds-types';
import { OptimizedImage } from '@/components/ui/OptimizedImage';

interface BuildSidebarProps {
  className?: string;
}

function BuildMiniCard({ build }: { build: Build }) {
  const { t } = useTranslation("c-user-builds");
  return (
    <Link to={`/user-builds/${build.slug}` as string}>
      <div className="flex gap-3 p-3 rounded-site-sm hover:bg-site-surface-hover transition-colors">
        {build.thumbnailUrl ? (
          <OptimizedImage
            src={build.thumbnailUrl}
            alt={build.title}
            width={64}
            height={48}
            className="w-16 h-12 rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-16 h-12 rounded bg-site-accent/20 flex items-center justify-center text-site-accent text-xs font-bold shrink-0">
            {build.title[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-site-text truncate">{build.title}</h4>
          <p className="text-xs text-site-text-muted truncate">{build.user.name}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-site-text-dim">
            <span>{t("likes-count", { defaultValue: "{{count}} likes", count: build.likeCount })}</span>
            <span>{t("views-count", { defaultValue: "{{count}} views", count: build.viewCount })}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function BuildSidebar({ className = '' }: BuildSidebarProps) {
  const { t } = useTranslation("c-user-builds");
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
        <Spinner />
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Featured Builds */}
      {featured.length > 0 && (
        <div className="mb-8">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-site-text mb-4">
            <Star className="w-4 h-4 text-site-warning" />
            {t("featured", { defaultValue: "Featured" })}
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
            <TrendingUp className="w-4 h-4 text-site-accent" />
            {t("popular", { defaultValue: "Popular" })}
          </h3>
          <div className="space-y-1">
            {popular.map((build) => (
              <BuildMiniCard key={build.id} build={build} />
            ))}
          </div>
        </div>
      )}

      {/* Submit CTA */}
      <div className="mt-8 p-4 rounded-site border border-site-border bg-gradient-to-br from-violet-500/10 to-fuchsia-600/10">
        <h4 className="font-semibold text-site-text mb-2">{t("share-your-build", { defaultValue: "Share Your Build" })}</h4>
        <p className="text-sm text-site-text-muted mb-4">
          {t("share-your-build-desc", { defaultValue: "Built something cool with rmhcode? Share it with the community!" })}
        </p>
        <Link
          to="/user-builds/submit"
          className="block w-full py-2 rounded-site-sm bg-site-accent hover:bg-site-accent text-white text-sm font-medium text-center transition-colors"
        >
          {t("submit-a-build", { defaultValue: "Submit a Build" })}
        </Link>
      </div>
    </div>
  );
}
