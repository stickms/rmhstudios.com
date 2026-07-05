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
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import '@/components/library/album-admin.css';

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
      if (!res.ok) throw new Error(data?.error || 'Failed to create album');
      toast.success(`Created "${data.album.title}". Now upload media.`);
      // Straight to the manager so the admin can upload all images afterwards.
      navigate({ to: '/admin/albums/$id', params: { id: data.album.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create album');
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageLayout title="Library Albums" wide backTo="/admin">
      <div className="aa">
        <div>
          <h1 className="aa__intro-title">Library Albums</h1>
          <p className="aa__intro-sub">
            Create an album, then bulk-upload photos and videos. Images are compressed to WebP and videos
            transcoded before being stored in object storage.
          </p>
        </div>

        <form onSubmit={createAlbum} className="aa__create">
          <input
            type="text"
            className="aa__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New album title…"
            maxLength={120}
          />
          <button type="submit" className="aa__btn aa__btn--primary" disabled={creating || !title.trim()}>
            <Plus size={16} aria-hidden="true" /> {creating ? 'Creating…' : 'Create album'}
          </button>
        </form>

        {loading ? (
          <p className="aa__empty">Loading…</p>
        ) : albums.length === 0 ? (
          <p className="aa__empty">No albums yet. Create one above.</p>
        ) : (
          <div className="aa__cards">
            {albums.map((album) => {
              const cover = album.slides[0]?.thumb;
              const images = album.slides.filter((s) => s.type === 'image').length;
              const videos = album.slides.length - images;
              return (
                <Link key={album.id} to="/admin/albums/$id" params={{ id: album.id }} className="aa__card">
                  <div className="aa__card-cover">{cover && <img src={cover} alt="" />}</div>
                  <div className="aa__card-body">
                    <span className="aa__card-title">{album.title}</span>
                    <span className="aa__card-sub">/library/albums/{album.slug}</span>
                    <span className="aa__card-stats">
                      <span>
                        <Images size={12} aria-hidden="true" /> {images}
                      </span>
                      <span>
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
