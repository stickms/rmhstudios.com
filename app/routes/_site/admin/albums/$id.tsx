/**
 * Admin → manage one album: edit meta, bulk-upload media (many files at once),
 * reorder slides, delete slides, delete the album. Admin-gated by the parent
 * /_site/admin route.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { ArrowLeft, Loader2, Play, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';

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

type AdminSlide = { id: string; type: string; position: number; thumb: string; src: string };
type AdminAlbum = {
  id: string;
  slug: string;
  title: string;
  description: string;
  position: number;
  slides: AdminSlide[];
};

const UPLOAD_BATCH = 8;

function ManageAlbumPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [album, setAlbum] = useState<AdminAlbum | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
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

  async function uploadFiles(fileList: FileList | null) {
    if (!album || !fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    let added = 0;
    const failures: string[] = [];
    try {
      for (let i = 0; i < files.length; i += UPLOAD_BATCH) {
        const batch = files.slice(i, i + UPLOAD_BATCH);
        const form = new FormData();
        for (const f of batch) form.append('files', f);
        const res = await fetch(`/api/admin/albums/${album.id}/slides`, { method: 'POST', body: form });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          failures.push(data?.error || `Batch failed (${batch.length} files)`);
        } else {
          const created = (data?.created as AdminSlide[] | undefined) ?? [];
          added += created.length;
          if (created.length) {
            setAlbum((prev) => (prev ? { ...prev, slides: [...prev.slides, ...created] } : prev));
          }
          for (const e of (data?.errors as { name: string; error: string }[] | undefined) ?? []) {
            failures.push(`${e.name}: ${e.error}`);
          }
        }
        setProgress({ done: Math.min(i + batch.length, files.length), total: files.length });
      }
      if (added > 0) toast.success(`Uploaded ${added} item${added === 1 ? '' : 's'}.`);
      if (failures.length > 0) toast.error(`${failures.length} failed. ${failures.slice(0, 3).join(' · ')}`);
      if (added === 0 && failures.length === 0) toast.error('Nothing uploaded.');
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileInput.current) fileInput.current.value = '';
    }
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
        <div className="p-8 text-site-text-muted">Loading…</div>
      </PageLayout>
    );
  }
  if (!album) {
    return (
      <PageLayout title="Manage Album" wide>
        <div className="p-8 text-site-text-muted">Album not found.</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={album.title} wide>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <button
          type="button"
          onClick={() => navigate({ to: '/admin/albums' })}
          className="inline-flex items-center gap-1 text-sm text-site-text-muted hover:text-site-text"
        >
          <ArrowLeft size={14} /> All albums
        </button>

        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="w-full rounded-lg border border-site-border bg-site-surface px-3 py-2 text-lg font-semibold text-site-text outline-none focus:border-site-accent"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (shown on the card + share preview)…"
            rows={2}
            maxLength={2000}
            className="w-full rounded-lg border border-site-border bg-site-surface px-3 py-2 text-site-text outline-none focus:border-site-accent"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveMeta}
              disabled={!dirty || saving || !title.trim()}
              className="rounded-lg bg-site-accent px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save details'}
            </button>
            <span className="text-sm text-site-text-muted">/library/albums/{album.slug}</span>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-site-border bg-site-surface p-6 text-center">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => uploadFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-site-accent px-5 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading
              ? progress
                ? `Uploading ${progress.done}/${progress.total}…`
                : 'Uploading…'
              : 'Upload photos & videos'}
          </button>
          <p className="mt-2 text-sm text-site-text-muted">
            Select many files at once. Images become WebP; videos are transcoded to MP4 with a poster.
          </p>
        </div>

        {slides.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-site-text-muted">
              {slides.length} item{slides.length === 1 ? '' : 's'} · drag to reorder
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {slides.map((slide, index) => (
                <div
                  key={slide.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(index)}
                  onDragEnd={() => setDragIndex(null)}
                  className={`group relative aspect-square overflow-hidden rounded-lg border bg-site-bg ${
                    dragIndex === index ? 'border-site-accent opacity-60' : 'border-site-border'
                  }`}
                >
                  <img src={slide.thumb} alt="" className="h-full w-full object-cover" draggable={false} />
                  {slide.type === 'video' && (
                    <span className="absolute left-1 top-1 rounded bg-black/60 p-1 text-white">
                      <Play size={12} />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteSlide(slide.id)}
                    aria-label="Delete"
                    className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-site-border pt-4">
          <button
            type="button"
            onClick={deleteAlbum}
            className="inline-flex items-center gap-2 rounded-lg border border-red-600/50 px-4 py-2 font-semibold text-red-500 hover:bg-red-600/10"
          >
            <Trash2 size={16} /> Delete album
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
