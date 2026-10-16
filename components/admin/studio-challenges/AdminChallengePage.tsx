'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { fetchJson } from '@/lib/http';

const DAY = 24 * 60 * 60_000;
// <input type="datetime-local"> wants local wall-clock time without a zone.
const local = (ms: number) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/** /admin/studio-challenges — start a weekly sample-flip challenge (F12). */
export function AdminChallengePage() {
  const { t } = useTranslation('f-creative');
  const now = Date.now();
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [startsAt, setStartsAt] = useState(local(now));
  const [endsAt, setEndsAt] = useState(local(now + 5 * DAY));
  const [votingEndsAt, setVotingEndsAt] = useState(local(now + 7 * DAY));
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set('audio', file);
      const up = await fetch('/api/admin/studio-challenges/upload', { method: 'POST', body: form });
      const data = (await up.json()) as { key?: string; error?: string };
      if (!up.ok || !data.key) throw new Error(data.error ?? 'Upload failed');
      await fetchJson('/api/admin/studio-challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          brief,
          sampleKey: data.key,
          sampleName: file.name.slice(0, 120),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          votingEndsAt: new Date(votingEndsAt).toISOString(),
        }),
      });
      toast.success(t('admin-created', { defaultValue: 'Challenge created' }));
      setTitle('');
      setBrief('');
      setFile(null);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('admin-error', { defaultValue: 'Something went wrong' }),
      );
    } finally {
      setBusy(false);
    }
  };

  const dateField = (label: string, value: string, set: (v: string) => void) => (
    <label className="block text-xs font-medium text-site-text-muted">
      {label}
      <Input
        type="datetime-local"
        className="glass-inset mt-1"
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );

  return (
    <PageLayout
      title={t('admin-page-title', { defaultValue: 'Studio sample flip' })}
      description={t('admin-page-desc', {
        defaultValue: 'Post a sample and a window; members submit flips and vote.',
      })}
      backTo="/admin"
    >
      <div className="glass-pane mx-4 mt-4 mb-12 space-y-3 rounded-site p-4">
        <Input
          className="glass-inset"
          placeholder={t('admin-title', { defaultValue: 'Challenge title' })}
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          className="glass-inset"
          placeholder={t('admin-brief', { defaultValue: 'Brief and rules' })}
          maxLength={1000}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <label className="block text-xs font-medium text-site-text-muted">
          {t('admin-sample', { defaultValue: 'Sample audio (WAV or MP3, up to 8 MB)' })}
          <input
            type="file"
            accept="audio/*"
            className="mt-1 block text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {dateField(t('admin-starts', { defaultValue: 'Opens' }), startsAt, setStartsAt)}
          {dateField(t('admin-ends', { defaultValue: 'Submissions close' }), endsAt, setEndsAt)}
          {dateField(
            t('admin-voting', { defaultValue: 'Voting ends' }),
            votingEndsAt,
            setVotingEndsAt,
          )}
        </div>
        <Button
          variant="accent"
          disabled={busy || !title.trim() || !file}
          onClick={() => void create()}
        >
          {t('admin-create', { defaultValue: 'Start challenge' })}
        </Button>
      </div>
    </PageLayout>
  );
}
