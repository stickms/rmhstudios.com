/**
 * Admin → Library Albums. List + create albums; each links to its manager where
 * media is bulk-uploaded. Admin-gated by the parent /_site/admin route.
 */

import { useEffect, useState } from 'react';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { Images, Plus, Video } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
    throw redirect({ to: '/' });
  }
  return null;
});

export const Route = createFileRoute('/_site/admin/albums/')({
  head: () => ({ meta: [{ title: 'Library Albums | Admin' }] }),
  beforeLoad: () => getAdminSession(),
  component: AdminAlbumsPage,
});

type AdminSlide = { id: string; type: string; position: number; thumb: string; src: string };
type AdminAlbum = {
  id: string;
  slug: string;
  title: string;
  description: string;
  position: number;
  slides: AdminSlide[];
};

function AdminAlbumsPage() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<AdminAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch('/api/admin/albums').catch(() => null);
      if (active && res?.ok) {
        const data = await res.json().catch(() => null);
        if (data?.albums) setAlbums(data.albums as AdminAlbum[]);
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function createAlbum(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || t('album-create-failed', { defaultValue: 'Failed to create album' }));
      toast.success(
        t('album-created', { title: data.album.title, defaultValue: `Created "${data.album.title}". Now upload media.` }),
      );
      // Straight to the manager so the admin can upload all images afterwards.
      navigate({ to: '/admin/albums/$id', params: { id: data.album.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('album-create-failed', { defaultValue: 'Failed to create album' }));
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageLayout
      title={t('albums-title', { defaultValue: 'Library Albums' })}
      backTo="/admin"
      backLabel={t('back-to-admin', { defaultValue: 'Back to admin' })}
      wide
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
        <p className="text-sm text-site-text-muted">
          {t('albums-intro', {
            defaultValue:
              'Create an album, then bulk-upload photos and videos. Images are compressed to WebP and videos transcoded before being stored in object storage.',
          })}
        </p>

        {/* Create — a singular action panel gets the L2 glass pane. */}
        <form
          onSubmit={createAlbum}
          className="glass-pane flex flex-col gap-2 rounded-site p-3 sm:flex-row sm:items-center"
        >
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('album-title-placeholder', { defaultValue: 'New album title…' })}
            maxLength={120}
            className="flex-1"
          />
          <Button type="submit" loading={creating} disabled={!title.trim()} className="shrink-0">
            <Plus aria-hidden="true" /> {t('create-album', { defaultValue: 'Create album' })}
          </Button>
        </form>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-site" />
            ))}
          </div>
        ) : albums.length === 0 ? (
          <EmptyState
            icon={Images}
            title={t('albums-empty', { defaultValue: 'No albums yet' })}
            description={t('albums-empty-hint', { defaultValue: 'Create one above to get started.' })}
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {albums.map((album) => {
              const cover = album.slides[0]?.thumb;
              const images = album.slides.filter((s) => s.type === 'image').length;
              const videos = album.slides.length - images;
              return (
                <Link
                  key={album.id}
                  to="/admin/albums/$id"
                  params={{ id: album.id }}
                  className="glass-fill glass-interactive group flex flex-col overflow-hidden rounded-site"
                  data-glass-light=""
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-site-bg">
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-site-text-dim">
                        <Images className="size-8" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-3">
                    <span className="truncate font-semibold text-site-text">{album.title}</span>
                    <span className="truncate font-mono text-xs text-site-text-dim">/library/albums/{album.slug}</span>
                    <span className="mt-1 flex items-center gap-3 text-xs text-site-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Images size={12} aria-hidden="true" /> {images}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Video size={12} aria-hidden="true" /> {videos}
                      </span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
