/**
 * Admin User Builds Route
 */

import { AdminBody } from '@/components/admin/AdminBody';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Search, Edit, ExternalLink, Lock, Award } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { SearchField } from '@/components/ui/search-field';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/components/Providers';

interface Build {
  id: string;
  slug: string;
  title: string;
  status: string;
  visibility: string;
  featured: boolean;
  publishedAt: string | null;
  user: { name: string; username: string; handle?: string | null };
  category?: { name: string } | null;
}

export const Route = createFileRoute('/_site/admin/user-builds')({
  head: () => ({ meta: [{ title: 'All User Builds | Admin | RMH Studios' }] }),
  component: AdminUserBuildsPage,
});

function AdminUserBuildsPage() {
  const { t } = useTranslation("admin");
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLDivElement) => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) loadMore();
    });
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  useEffect(() => {
    if (session && !(session.user as any).isAdmin) navigate({ to: '/' });
  }, [session, navigate]);

  useEffect(() => {
    const fetchBuilds = async () => {
      setLoading(true);
      try {
        const url = search ? `/api/user-builds?search=${encodeURIComponent(search)}&limit=20` : '/api/user-builds?limit=20';
        const res = await fetch(url);
        if (res.ok) { const data = await res.json(); setBuilds(data.items || []); setNextCursor(data.nextCursor); setHasMore(data.hasMore); }
      } catch (error) { console.error("Failed to fetch builds", error); } finally { setLoading(false); }
    };
    const timeoutId = setTimeout(() => fetchBuilds(), 500);
    return () => clearTimeout(timeoutId);
  }, [search]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const url = search ? `/api/user-builds?search=${encodeURIComponent(search)}&cursor=${nextCursor}&limit=20` : `/api/user-builds?cursor=${nextCursor}&limit=20`;
      const res = await fetch(url);
      if (res.ok) { const data = await res.json(); setBuilds(prev => [...prev, ...(data.items || [])]); setNextCursor(data.nextCursor); setHasMore(data.hasMore); }
    } catch (error) { console.error("Failed to fetch more builds", error); } finally { setLoadingMore(false); }
  };

  const handleToggleCurated = async (buildId: string) => {
    const build = builds.find(b => b.id === buildId);
    if (!build) return;
    setBuilds(prev => prev.map(b => b.id === buildId ? { ...b, featured: !b.featured } : b));
    try {
      const res = await fetch(`/api/user-builds/${buildId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: !build.featured }),
      });
      if (!res.ok) throw new Error('Failed to toggle curated badge');
    } catch {
      setBuilds(prev => prev.map(b => b.id === buildId ? { ...b, featured: build.featured } : b));
    }
  };

  return (
    <PageLayout
      title={t("manage-user-builds", { defaultValue: "Manage User Builds" })}
      description={t("user-builds-description", { defaultValue: "Search, moderate, and manage all user-submitted builds." })}
      backTo="/admin"
      backLabel={t("back-to-admin", { defaultValue: "Back to admin" })}
      wide
    >
      <AdminBody>
        <SearchField
          value={search}
          onValueChange={setSearch}
          placeholder={t("search-builds-placeholder", { defaultValue: "Search by build title or description..." })}
          aria-label={t("search-builds-label", { defaultValue: "Search builds" })}
        />

        <div className="glass-fill overflow-hidden rounded-site">
          {loading && builds.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-site-text-muted">
              <Spinner />
              <span>{t("loading-builds", { defaultValue: "Loading builds..." })}</span>
            </div>
          ) : !loading && builds.length === 0 ? (
            <EmptyState icon={Search} title={t("no-builds-found", { defaultValue: "No builds found matching your search." })} />
          ) : (
            <div
              className={`divide-y divide-site-border transition-opacity duration-site-fast ${loading ? 'opacity-60' : ''}`}
              aria-busy={loading}
            >
              {builds.map((build, index) => {
                const isLast = index === builds.length - 1;
                return (
                  <div key={build.id} ref={isLast ? lastElementRef : null} className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-site-surface-hover sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/user-builds/${build.slug}` as string} className="truncate text-base font-semibold text-site-text hover:text-site-accent">{build.title}</Link>
                        <Badge
                          variant={build.visibility === 'PUBLIC' ? 'success' : build.visibility === 'UNLISTED' ? 'warning' : 'default'}
                          icon={build.visibility === 'PRIVATE' ? <Lock aria-hidden /> : undefined}
                          className="capitalize"
                        >
                          {build.visibility.toLowerCase()}
                        </Badge>
                        {build.featured && (
                          <Badge variant="warning" icon={<Award aria-hidden />}>{t("curated-badge", { defaultValue: "Curated" })}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 truncate text-sm text-site-text-dim">
                        <Link to={`/u/${build.user.handle || build.user.username}` as string} className="transition-colors hover:text-site-text">@{build.user.handle || build.user.username}</Link>
                        <span aria-hidden>&bull;</span>
                        <span>{build.category?.name || t("uncategorized", { defaultValue: "Uncategorized" })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <IconButton
                        icon={Award}
                        variant="outline"
                        className={build.featured ? 'border-site-warning/40 text-site-warning' : undefined}
                        aria-pressed={build.featured}
                        onClick={() => handleToggleCurated(build.id)}
                        label={build.featured ? t("remove-curated-badge", { defaultValue: "Remove Curated badge" }) : t("add-curated-badge", { defaultValue: "Add Curated badge" })}
                      />
                      <IconButton asChild variant="outline" label={t("view-build", { defaultValue: "View Build" })}>
                        <Link to={`/user-builds/${build.slug}` as string}><ExternalLink aria-hidden /></Link>
                      </IconButton>
                      <IconButton asChild variant="outline" label={t("edit-build-as-admin", { defaultValue: "Edit Build as Admin" })}>
                        <Link to="/user-builds/submit" search={{ edit: build.id }}><Edit aria-hidden /></Link>
                      </IconButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {loadingMore && (
            <div className="flex justify-center p-4 text-site-text-dim"><Spinner /></div>
          )}
        </div>
      </AdminBody>
    </PageLayout>
  );
}
