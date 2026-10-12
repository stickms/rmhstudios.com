'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  STAMP_MAX_CREATED,
  STAMP_MAX_EDGE,
  STAMP_MAX_UPLOAD_BYTES,
  STAMP_NAME_MAX,
  STAMP_WALL_CAP,
  type StampView,
} from '@/lib/profile/stamps';
import { StampImage } from '../StampWallModule';

type Sort = 'new' | 'popular';

/**
 * P5 — make stamps, collect other members' stamps, and tidy your wall. The
 * limits are the server's (`lib/profile/stamps.ts`); the file picker pre-checks
 * size so an obviously-too-big file never leaves the browser.
 */
export default function StampSettings({ userId }: { userId: string }) {
  const { t } = useTranslation('f-profile-plus');
  const [mine, setMine] = useState<StampView[] | null>(null);
  const [wall, setWall] = useState<StampView[] | null>(null);
  const [gallery, setGallery] = useState<StampView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('new');
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMine = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch('/api/stamps/mine').then((r) => (r.ok ? r.json() : { stamps: [] })),
      fetch(`/api/profile/${encodeURIComponent(userId)}/stamps`).then((r) =>
        r.ok ? r.json() : { stamps: [] },
      ),
    ]);
    setMine((a as { stamps: StampView[] }).stamps);
    setWall((b as { stamps: StampView[] }).stamps);
  }, [userId]);

  const loadGallery = useCallback(
    async (reset: boolean, after: string | null) => {
      setLoadingGallery(true);
      try {
        const q = new URLSearchParams({ sort });
        if (after) q.set('cursor', after);
        const res = await fetch(`/api/stamps?${q}`);
        if (!res.ok) return;
        const json = (await res.json()) as { stamps: StampView[]; nextCursor: string | null };
        setGallery((prev) => (reset ? json.stamps : [...prev, ...json.stamps]));
        setCursor(json.nextCursor);
      } finally {
        setLoadingGallery(false);
      }
    },
    [sort],
  );

  useEffect(() => {
    void loadMine();
  }, [loadMine]);
  useEffect(() => {
    void loadGallery(true, null);
  }, [loadGallery]);

  async function create() {
    if (!file || !name.trim()) return;
    setCreating(true);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('name', name.trim());
      const res = await fetch('/api/stamps', { method: 'POST', body: form });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(
          json.error ?? t('stamp-create-failed', { defaultValue: "Couldn't create that stamp" }),
        );
        return;
      }
      setName('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      toast.success(t('stamp-created', { defaultValue: 'Stamp created' }));
      await Promise.all([loadMine(), loadGallery(true, null)]);
    } finally {
      setCreating(false);
    }
  }

  async function setOnWall(stamp: StampView, on: boolean) {
    const res = await fetch(`/api/stamps/${stamp.id}/wall`, { method: on ? 'POST' : 'DELETE' });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(json.error ?? t('stamp-failed', { defaultValue: "Couldn't update your wall" }));
      return;
    }
    await loadMine();
    setGallery((g) => g.map((s) => (s.id === stamp.id ? { ...s, onMyWall: on } : s)));
  }

  async function remove(stamp: StampView) {
    const res = await fetch(`/api/stamps/${stamp.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error(t('stamp-delete-failed', { defaultValue: "Couldn't delete that stamp" }));
      return;
    }
    toast.success(t('stamp-deleted', { defaultValue: 'Stamp deleted' }));
    await Promise.all([loadMine(), loadGallery(true, null)]);
  }

  function pick(f: File | null) {
    if (f && f.size > STAMP_MAX_UPLOAD_BYTES) {
      toast.error(
        t('stamp-too-large', {
          kb: Math.round(STAMP_MAX_UPLOAD_BYTES / 1024),
          defaultValue: 'That file is too large. Stamps can be up to {{kb}} KB.',
        }),
      );
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setFile(f);
  }

  if (mine === null || wall === null) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="stamp-make">
        <h3 id="stamp-make" className="text-sm font-semibold text-site-text">
          {t('stamp-make', { defaultValue: 'Make a stamp' })}
        </h3>
        <p className="text-xs text-site-text-dim">
          {t('stamp-make-hint', {
            edge: STAMP_MAX_EDGE,
            defaultValue:
              'PNG, GIF or WebP, up to {{edge}}×{{edge}} pixels. Think tiny badge or 88×31 button.',
          })}
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="stamp-name">{t('stamp-name', { defaultValue: 'Name' })}</Label>
            <Input
              id="stamp-name"
              value={name}
              maxLength={STAMP_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stamp-file">{t('stamp-image', { defaultValue: 'Image' })}</Label>
            <Input
              id="stamp-file"
              ref={fileRef}
              type="file"
              accept="image/png,image/gif,image/webp"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="accent"
            size="sm"
            loading={creating}
            disabled={!file || !name.trim() || mine.length >= STAMP_MAX_CREATED}
            onClick={() => void create()}
          >
            <Upload aria-hidden />
            {t('stamp-create', { defaultValue: 'Create stamp' })}
          </Button>
          <span className="text-xs text-site-text-dim">
            {t('stamp-quota', {
              used: mine.length,
              max: STAMP_MAX_CREATED,
              defaultValue: '{{used}} of {{max}} made',
            })}
          </span>
        </div>
        {mine.length > 0 ? (
          <ul className="flex flex-wrap gap-3">
            {mine.map((s) => (
              <li key={s.id} className="glass-fill flex items-center gap-2 rounded-site-sm p-2">
                <StampImage stamp={s} />
                <span className="max-w-28 truncate text-xs text-site-text-muted">{s.name}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t('stamp-delete', { name: s.name, defaultValue: 'Delete {{name}}' })}
                  onClick={() => void remove(s)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-3" aria-labelledby="stamp-wall">
        <h3 id="stamp-wall" className="text-sm font-semibold text-site-text">
          {t('stamp-wall-title', {
            count: wall.length,
            max: STAMP_WALL_CAP,
            defaultValue: 'Your wall ({{count}}/{{max}})',
          })}
        </h3>
        {wall.length === 0 ? (
          <p className="text-sm text-site-text-muted">
            {t('stamp-wall-empty', {
              defaultValue: 'Nothing on your wall yet. Collect some below.',
            })}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {wall.map((s) => (
              <li key={s.id} className="group relative">
                <StampImage stamp={s} />
                <button
                  type="button"
                  onClick={() => void setOnWall(s, false)}
                  aria-label={t('stamp-take-off', {
                    name: s.name,
                    defaultValue: 'Remove {{name}} from my wall',
                  })}
                  className="glass-overlay absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="stamp-browse">
        <h3 id="stamp-browse" className="text-sm font-semibold text-site-text">
          {t('stamp-browse', { defaultValue: 'Collect stamps' })}
        </h3>
        <LiquidTabs
          aria-label={t('stamp-sort', { defaultValue: 'Sort stamps' })}
          tabs={[
            { id: 'new', label: t('stamp-sort-new', { defaultValue: 'Newest' }) },
            { id: 'popular', label: t('stamp-sort-popular', { defaultValue: 'Popular' }) },
          ]}
          value={sort}
          onChange={(id) => setSort(id as Sort)}
        />
        {gallery.length === 0 && !loadingGallery ? (
          <p className="text-sm text-site-text-muted">
            {t('stamp-gallery-empty', { defaultValue: 'No stamps yet. Be the first to make one.' })}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {gallery.map((s) => (
              <li
                key={s.id}
                className="glass-fill flex flex-col items-center gap-2 rounded-site-sm p-2"
              >
                <StampImage stamp={s} />
                <span className="w-full truncate text-center text-xs text-site-text-muted">
                  {s.name}
                </span>
                <Button
                  variant={s.onMyWall ? 'outline' : 'accent-outline'}
                  size="xs"
                  onClick={() => void setOnWall(s, !s.onMyWall)}
                >
                  {s.onMyWall ? null : <Plus aria-hidden />}
                  {s.onMyWall
                    ? t('stamp-on-wall', { defaultValue: 'On your wall' })
                    : t('stamp-add-short', { defaultValue: 'Add' })}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {cursor ? (
          <Button
            variant="outline"
            size="sm"
            loading={loadingGallery}
            onClick={() => void loadGallery(false, cursor)}
          >
            {t('stamp-more', { defaultValue: 'Show more' })}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
