'use client';

import { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { Star, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { Build } from '@/lib/user-builds-types';
import { OptimizedImage } from '@/components/ui/OptimizedImage';

interface BuildSidebarProps {
  className?: string;
}

function BuildMiniCard({ build }: { build: Build }) {
  const { t } = useTranslation('c-user-builds');
  return (
    <Link to={`/user-builds/${build.slug}` as string}>
      <div className="flex gap-3 rounded-site-sm px-3 py-2 transition-colors hover:bg-site-surface-hover">
        {build.thumbnailUrl ? (
          <OptimizedImage
            src={build.thumbnailUrl}
            alt={build.title}
            width={64}
            height={48}
            className="h-12 w-16 shrink-0 rounded-site-sm object-cover"
          />
        ) : (
          <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-site-sm bg-site-accent-dim text-xs font-bold text-site-accent">
            {build.title[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-site-text truncate">{build.title}</h4>
          <p className="text-xs text-site-text-muted truncate">{build.user.name}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-site-text-dim">
            <span>
              {t('likes-count', { defaultValue: '{{count}} likes', count: build.likeCount })}
            </span>
            <span>
              {t('views-count', { defaultValue: '{{count}} views', count: build.viewCount })}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function BuildSidebar({ className = '' }: BuildSidebarProps) {
  const { t } = useTranslation('c-user-builds');
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
      <div className={`flex justify-center py-20 ${className}`}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className={`space-y-[var(--site-section-gap)] ${className}`}>
      {/* Featured Builds */}
      {featured.length > 0 && (
        <div>
          <h3 className="site-section-label mb-3 flex items-center gap-2">
            <Star className="size-4 text-site-warning" aria-hidden />
            {t('featured', { defaultValue: 'Featured' })}
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
          <h3 className="site-section-label mb-3 flex items-center gap-2">
            <TrendingUp className="size-4 text-site-accent" aria-hidden />
            {t('popular', { defaultValue: 'Popular' })}
          </h3>
          <div className="space-y-1">
            {popular.map((build) => (
              <BuildMiniCard key={build.id} build={build} />
            ))}
          </div>
        </div>
      )}

      {/* Submit CTA */}
      <div className="glass-fill space-y-2 rounded-site px-4 py-3">
        <h4 className="font-semibold text-site-text">
          {t('share-your-build', { defaultValue: 'Share Your Build' })}
        </h4>
        <p className="text-sm text-site-text-muted">
          {t('share-your-build-desc', {
            defaultValue: 'Built something cool with rmhcode? Share it with the community!',
          })}
        </p>
        <Button asChild variant="accent" className="w-full">
          <Link to="/user-builds/submit">
            {t('submit-a-build', { defaultValue: 'Submit a Build' })}
          </Link>
        </Button>
      </div>
    </div>
  );
}
