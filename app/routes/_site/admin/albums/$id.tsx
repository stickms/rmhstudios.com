/**
 * Admin → manage one album: edit meta, bulk-upload media (many files at once,
 * with per-item progress + retry), reorder slides, delete slides, delete the
 * album. Admin-gated by the parent /_site/admin route.
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { ArrowLeft, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { AlbumUploader, type AdminSlide } from '@/components/library/AlbumUploader';
import '@/components/library/album-admin.css';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
    throw redirect({ to: '/' });
  }
  return null;
});

export const Route = createFileRoute('/_site/admin/albums/$id')({
  head: () => ({ meta: [{ title: 'Manage Album | Admin' }] }),
  beforeLoad: () => getAdminSession(),
  component: ManageAlbumPage,
});

type AdminAlbum = {
  id: string;
  slug: string;
  title: string;
  description: string;
  position: number;
  slides: AdminSlide[];
};

function ManageAlbumPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [album, setAlbum] = useState<AdminAlbum | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  async function load() {
    const res = await fetch('/api/admin/albums').catch(() => null);
    if (res?.ok) {
      const data = await res.json().catch(() => null);
      const found = (data?.albums as AdminAlbum[] | undefined)?.find((a) => a.id === id) ?? null;
      setAlbum(found);
      if (found) {
        setTitle(found.title);
        setDescription(found.description);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const slides = album?.slides ?? [];
  const dirty = useMemo(
    () => album != null && (title.trim() !== album.title || description !== album.description),
    [album, title, description],
  );

  async function saveMeta() {
    if (!album || !title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/albums/${album.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      setAlbum((prev) => (prev ? { ...prev, title: data.album.title, description: data.album.description } : prev));
      toast.success('Saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // Append freshly-uploaded slides as the uploader finishes each one.
  function onUploaded(created: AdminSlide[]) {
    setAlbum((prev) => (prev ? { ...prev, slides: [...prev.slides, ...created] } : prev));
  }

  async function deleteSlide(slideId: string) {
    if (!album) return;
    const prev = album.slides;
    setAlbum({ ...album, slides: prev.filter((s) => s.id !== slideId) });
    const res = await fetch(`/api/admin/albums/${album.id}/slides/${slideId}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      setAlbum((a) => (a ? { ...a, slides: prev } : a));
      toast.error('Failed to delete slide.');
    }
  }

  async function persistOrder(next: AdminSlide[]) {
    if (!album) return;
    setAlbum({ ...album, slides: next });
    const res = await fetch(`/api/admin/albums/${album.id}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: next.map((s) => s.id) }),
    }).catch(() => null);
    if (!res?.ok) {
      toast.error('Failed to save order.');
      void load();
    }
  }

  function onDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...slides];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDragIndex(null);
    void persistOrder(next);
  }

  async function deleteAlbum() {
    if (!album) return;
    if (!confirm(`Delete album "${album.title}" and all ${album.slides.length} item(s)? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/albums/${album.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) {
      toast.success('Album deleted.');
      navigate({ to: '/admin/albums' });
    } else {
      toast.error('Failed to delete album.');
    }
  }

  if (loading) {
    return (
      <PageLayout title="Manage Album" wide>
        <div className="aa">
          <p className="aa__empty">Loading…</p>
        </div>
      </PageLayout>
    );
  }
  if (!album) {
    return (
      <PageLayout title="Manage Album" wide>
        <div className="aa">
          <p className="aa__empty">Album not found.</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={album.title} wide>
      <div className="aa">
        <button type="button" className="aa__back" onClick={() => navigate({ to: '/admin/albums' })}>
          <ArrowLeft size={14} aria-hidden="true" /> All albums
        </button>

        <div className="aa__fields">
          <input
            type="text"
            className="aa__input aa__title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Album title"
          />
          <textarea
            className="aa__textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (shown on the card + share preview)…"
            rows={2}
            maxLength={2000}
          />
          <div className="aa__meta-row">
            <button
              type="button"
              className="aa__btn aa__btn--primary"
              onClick={saveMeta}
              disabled={!dirty || saving || !title.trim()}
            >
              {saving ? 'Saving…' : 'Save details'}
            </button>
            <span className="aa__slug">/library/albums/{album.slug}</span>
          </div>
        </div>

        <AlbumUploader albumId={album.id} onUploaded={onUploaded} />

        {slides.length > 0 && (
          <div>
            <p className="aa__section-label">
              {slides.length} item{slides.length === 1 ? '' : 's'} · drag to reorder
            </p>
            <div className="aa__grid">
              {slides.map((slide, index) => (
                <div
                  key={slide.id}
                  className={`aa__tile${dragIndex === index ? ' is-drag' : ''}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(index)}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <img src={slide.thumb} alt="" draggable={false} />
                  {slide.type === 'video' && (
                    <span className="aa__tile-badge">
                      <Play size={12} aria-hidden="true" />
                    </span>
                  )}
                  <button
                    type="button"
                    className="aa__tile-remove"
                    onClick={() => deleteSlide(slide.id)}
                    aria-label={`Delete ${slide.type} ${index + 1}`}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="aa__danger-zone">
          <button type="button" className="aa__btn aa__btn--danger" onClick={deleteAlbum}>
            <Trash2 size={16} aria-hidden="true" /> Delete album
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
