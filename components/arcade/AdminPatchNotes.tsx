'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageLayout } from '@/components/feed/PageLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { games } from '@/lib/games';

/** Publish a short patch note; players see it once on their next launch of that game. */
export function AdminPatchNotes() {
  const { t } = useTranslation('f-arcade');
  const [gameId, setGameId] = useState(games[0]?.id ?? '');
  const [version, setVersion] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function publish() {
    setBusy(true);
    const res = await fetch('/api/arcade/patch-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, version, title, body }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      toast.success(t('admin-published', { defaultValue: 'Patch note published' }));
      setVersion('');
      setTitle('');
      setBody('');
    } else {
      toast.error(t('admin-failed', { defaultValue: 'Could not publish' }));
    }
  }

  return (
    <PageLayout title={t('admin-title', { defaultValue: 'Patch notes' })}>
      <Card className="mx-4 space-y-3 p-4">
        <Select
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          aria-label={t('admin-game', { defaultValue: 'Game' })}
        >
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </Select>
        <Input
          value={version}
          maxLength={32}
          onChange={(e) => setVersion(e.target.value)}
          placeholder={t('admin-version', { defaultValue: 'Version, e.g. 2026-10-12' })}
        />
        <Input
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('admin-note-title', { defaultValue: 'Headline' })}
        />
        <Textarea
          rows={5}
          value={body}
          maxLength={1000}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('admin-body', { defaultValue: 'What changed (short)' })}
        />
        <div className="flex justify-end">
          <Button
            variant="accent"
            loading={busy}
            disabled={!version.trim() || !title.trim() || !body.trim()}
            onClick={() => void publish()}
          >
            {t('admin-publish', { defaultValue: 'Publish' })}
          </Button>
        </div>
      </Card>
    </PageLayout>
  );
}
