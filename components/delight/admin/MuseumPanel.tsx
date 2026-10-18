'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { fetchJson } from '@/lib/http';

interface Era {
  id: string;
  eraDate: string;
  title: string;
  body: string;
  imageUrl: string | null;
}
const blank = { eraDate: '', title: '', body: '', imageUrl: '' as string | null };

export default function MuseumPanel() {
  const { t } = useTranslation('f-delight');
  const q = useQuery({
    queryKey: ['delight', 'museum'],
    queryFn: () => fetchJson<{ eras: Era[] }>('/api/museum'),
  });
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    setBusy(true);
    try {
      let imageUrl = form.imageUrl || null;
      const file = fileRef.current?.files?.[0];
      if (file) {
        // The screenshot goes through the same ingest pipeline as post images.
        const fd = new FormData();
        fd.append('images', file);
        imageUrl =
          (await fetchJson<{ urls: string[] }>('/api/rmharks/image', { method: 'POST', body: fd }))
            .urls[0] ?? null;
      }
      await fetchJson(
        editing ? `/api/admin/delight/museum/${editing}` : '/api/admin/delight/museum',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eraDate: form.eraDate,
            title: form.title,
            body: form.body,
            imageUrl,
          }),
        },
      );
      setForm(blank);
      setEditing(null);
      if (fileRef.current) fileRef.current.value = '';
      await q.refetch();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('admin-error', { defaultValue: 'Something went wrong' }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        className="glass-pane space-y-3 rounded-site p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input
          type="date"
          value={form.eraDate}
          onChange={(e) => setForm({ ...form, eraDate: e.target.value })}
          aria-label={t('museum-admin-date', { defaultValue: 'Date' })}
        />
        <Input
          value={form.title}
          maxLength={120}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder={t('museum-admin-name', { defaultValue: 'Era title' })}
          aria-label={t('museum-admin-name', { defaultValue: 'Era title' })}
        />
        <Textarea
          value={form.body}
          rows={4}
          maxLength={2000}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder={t('museum-admin-body', { defaultValue: 'What changed in this era' })}
          aria-label={t('museum-admin-body', { defaultValue: 'What changed in this era' })}
        />
        <label className="block text-sm text-site-text-muted">
          <span className="mb-1 block">
            {t('museum-admin-shot', {
              defaultValue: 'Screenshot (optional; replaces the current one)',
            })}
          </span>
          <input ref={fileRef} type="file" accept="image/*" className="text-site-text" />
        </label>
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="accent"
            loading={busy}
            disabled={!form.eraDate || form.title.trim().length < 2 || form.body.trim().length < 2}
          >
            {editing
              ? t('museum-admin-save', { defaultValue: 'Save era' })
              : t('museum-admin-add', { defaultValue: 'Add era' })}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setForm(blank);
              }}
            >
              {t('museum-admin-cancel', { defaultValue: 'Cancel' })}
            </Button>
          )}
        </div>
      </form>
      <ul className="space-y-2">
        {q.data?.eras.map((e) => (
          <li key={e.id} className="glass-fill flex items-center gap-3 rounded-site px-4 py-3">
            <span className="w-24 shrink-0 text-xs text-site-text-dim">{e.eraDate}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-site-text">{e.title}</span>
            <IconButton
              icon={Pencil}
              variant="ghost"
              size="icon-sm"
              label={t('museum-admin-edit', { defaultValue: 'Edit era' })}
              onClick={() => {
                setEditing(e.id);
                setForm({ eraDate: e.eraDate, title: e.title, body: e.body, imageUrl: e.imageUrl });
              }}
            />
            <IconButton
              icon={Trash2}
              variant="ghost"
              size="icon-sm"
              label={t('museum-admin-delete', { defaultValue: 'Delete era' })}
              onClick={() =>
                void fetchJson(`/api/admin/delight/museum/${e.id}`, { method: 'DELETE' })
                  .then(() => q.refetch())
                  .catch(() =>
                    toast.error(t('admin-error', { defaultValue: 'Something went wrong' })),
                  )
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
