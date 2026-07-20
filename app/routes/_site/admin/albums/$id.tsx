/**
 * Admin → manage one album: edit meta, bulk-upload media (many files at once,
 * with per-item progress + retry), reorder slides, delete slides, delete the
 * album. Admin-gated by the parent /_site/admin route.
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { AlbumUploader, type AdminSlide } from '@/components/library/AlbumUploader';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';

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
  const { t } = useTranslation('admin');
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();

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
      if (!res.ok) throw new Error(data?.error || t('album-save-failed', { defaultValue: 'Save failed' }));
      setAlbum((prev) => (prev ? { ...prev, title: data.album.title, description: data.album.description } : prev));
      toast.success(t('album-saved', { defaultValue: 'Saved.' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('album-save-failed', { defaultValue: 'Save failed' }));
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
      toast.error(t('slide-delete-failed', { defaultValue: 'Failed to delete slide.' }));
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
      toast.error(t('order-save-failed', { defaultValue: 'Failed to save order.' }));
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
    if (
      !(await confirm({
        title: t('album-delete-confirm', { title: album.title, defaultValue: `Delete album "${album.title}"?` }),
        description: t('album-delete-desc', {
          count: album.slides.length,
          defaultValue: `All ${album.slides.length} item(s) will be removed. This cannot be undone.`,
        }),
        danger: true,
      }))
    )
      return;
    const res = await fetch(`/api/admin/albums/${album.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) {
      toast.success(t('album-deleted', { defaultValue: 'Album deleted.' }));
      navigate({ to: '/admin/albums' });
    } else {
      toast.error(t('album-delete-failed', { defaultValue: 'Failed to delete album.' }));
    }
  }

  if (loading) {
    return (
      <PageLayout
        title={t('manage-album', { defaultValue: 'Manage Album' })}
        backTo="/admin/albums"
        backLabel={t('back-to-albums', { defaultValue: 'All albums' })}
        wide
      >
        <div className="mx-auto flex w-full max-w-3xl justify-center p-8 text-site-text-muted">
          {t('loading', { defaultValue: 'Loading…' })}
        </div>
      </PageLayout>
    );
  }
  if (!album) {
    return (
      <PageLayout
        title={t('manage-album', { defaultValue: 'Manage Album' })}
        backTo="/admin/albums"
        backLabel={t('back-to-albums', { defaultValue: 'All albums' })}
        wide
      >
        <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
          <EmptyState title={t('album-not-found', { defaultValue: 'Album not found.' })} />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={album.title}
      backTo="/admin/albums"
      backLabel={t('back-to-albums', { defaultValue: 'All albums' })}
      wide
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 md:p-8">
        {/* Album details — a singular editing panel gets the L2 glass pane. */}
        <div className="glass-pane flex flex-col gap-3 rounded-site p-4">
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={t('album-title-label', { defaultValue: 'Album title' })}
            className="h-11 text-base font-semibold"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('album-description-placeholder', {
              defaultValue: 'Description (shown on the card + share preview)…',
            })}
            rows={2}
            maxLength={2000}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveMeta} loading={saving} disabled={!dirty || !title.trim()} size="sm">
              {t('save-details', { defaultValue: 'Save details' })}
            </Button>
            <span className="truncate font-mono text-xs text-site-text-dim">/library/albums/{album.slug}</span>
          </div>
        </div>

        <AlbumUploader albumId={album.id} onUploaded={onUploaded} />

        {slides.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="font-mono text-xs uppercase tracking-widest text-site-text-dim">
              {t('slides-count-reorder', {
                count: slides.length,
                defaultValue: `${slides.length} item${slides.length === 1 ? '' : 's'} · drag to reorder`,
              })}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {slides.map((slide, index) => (
                <div
                  key={slide.id}
                  className={`group glass-fill relative aspect-square overflow-hidden rounded-site-sm ${
                    dragIndex === index ? 'opacity-50 ring-2 ring-site-accent' : ''
                  }`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(index)}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <img
                    src={slide.thumb}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="h-full w-full cursor-grab object-cover active:cursor-grabbing"
                  />
                  {slide.type === 'video' && (
                    <span className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white">
                      <Play size={12} aria-hidden="true" />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteSlide(slide.id)}
                    aria-label={t('delete-slide', {
                      type: slide.type,
                      index: index + 1,
                      defaultValue: `Delete ${slide.type} ${index + 1}`,
                    })}
                    // Always visible on touch (no hover); softens in on hover on pointer devices.
                    className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-site-danger sm:size-6 sm:opacity-70 sm:group-hover:opacity-100"
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Danger zone */}
        <div className="mt-2 flex justify-end border-t border-site-border pt-4">
          <Button variant="danger" onClick={deleteAlbum}>
            <Trash2 aria-hidden="true" /> {t('delete-album', { defaultValue: 'Delete album' })}
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
