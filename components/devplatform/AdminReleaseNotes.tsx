'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NoteBody } from '@/components/devplatform/NoteBody';
import type { ReleaseNoteView } from '@/lib/devplatform/release-notes';

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** I2: paste PR titles/bodies, draft with AI, edit, save as a draft or publish. */
export function AdminReleaseNotes() {
  const { t } = useTranslation('f-devplatform');
  const [notes, setNotes] = useState<ReleaseNoteView[]>([]);
  const [prs, setPrs] = useState('');
  const [version, setVersion] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { ok, data } = await api('/api/admin/release-notes', 'GET');
    if (ok) setNotes(data.notes);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function draft() {
    setBusy(true);
    const { ok, data } = await api('/api/admin/release-notes/draft', 'POST', { prs });
    setBusy(false);
    if (!ok)
      return toast.error(data.error || t('admin-draftFailed', { defaultValue: 'Drafting failed' }));
    setTitle(data.draft.title);
    setBody(data.draft.body);
  }

  async function save(publish: boolean) {
    setBusy(true);
    const { ok, data } = await api('/api/admin/release-notes', 'POST', {
      version,
      title,
      body,
      publish,
    });
    setBusy(false);
    if (!ok)
      return toast.error(
        data.error || t('admin-saveFailed', { defaultValue: 'Could not save the note' }),
      );
    setVersion('');
    setTitle('');
    setBody('');
    setPrs('');
    await load();
  }

  async function toggle(n: ReleaseNoteView) {
    await api(`/api/admin/release-notes/${n.id}`, 'PATCH', { publish: !n.publishedAt });
    await load();
  }
  async function remove(n: ReleaseNoteView) {
    await api(`/api/admin/release-notes/${n.id}`, 'DELETE');
    await load();
  }

  return (
    <div className="space-y-6 px-4 pb-12">
      <section className="glass-fill space-y-2 rounded-site p-4">
        <h2 className="text-sm font-bold text-site-text">
          {t('admin-pasteTitle', { defaultValue: 'Merged pull requests' })}
        </h2>
        <Textarea
          value={prs}
          onChange={(e) => setPrs(e.target.value)}
          rows={6}
          maxLength={12000}
          aria-label={t('admin-pasteTitle', { defaultValue: 'Merged pull requests' })}
          placeholder={t('admin-pastePlaceholder', {
            defaultValue: 'Paste PR titles and descriptions, one per line or block',
          })}
        />
        <Button
          variant="accent"
          size="sm"
          className="gap-1"
          disabled={busy || prs.trim().length < 10}
          onClick={draft}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {t('admin-draft', { defaultValue: 'Draft with AI' })}
        </Button>
      </section>

      <section className="glass-fill space-y-2 rounded-site p-4">
        <h2 className="text-sm font-bold text-site-text">
          {t('admin-editTitle', { defaultValue: 'Release note' })}
        </h2>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <Input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            maxLength={40}
            aria-label={t('admin-version', { defaultValue: 'Version' })}
            placeholder={t('admin-version', { defaultValue: 'Version' })}
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            aria-label={t('admin-title', { defaultValue: 'Title' })}
            placeholder={t('admin-title', { defaultValue: 'Title' })}
          />
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={8000}
          aria-label={t('admin-body', { defaultValue: 'Body' })}
          placeholder={t('admin-bodyPlaceholder', {
            defaultValue: 'Body (one bullet per line, starting with -)',
          })}
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !version.trim() || !title.trim() || !body.trim()}
            onClick={() => save(false)}
          >
            {t('admin-saveDraft', { defaultValue: 'Save draft' })}
          </Button>
          <Button
            variant="accent"
            size="sm"
            disabled={busy || !version.trim() || !title.trim() || !body.trim()}
            onClick={() => save(true)}
          >
            {t('admin-publish', { defaultValue: 'Publish' })}
          </Button>
        </div>
      </section>

      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="glass-fill space-y-2 rounded-site p-4">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-site-text">
                {n.version} · {n.title}
              </p>
              <span className="text-xs text-site-text-dim">
                {n.publishedAt
                  ? t('admin-live', { defaultValue: 'Live' })
                  : t('admin-draftLabel', { defaultValue: 'Draft' })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => toggle(n)}>
                {n.publishedAt
                  ? t('admin-unpublish', { defaultValue: 'Unpublish' })
                  : t('admin-publish', { defaultValue: 'Publish' })}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(n)}
                aria-label={t('admin-delete', { defaultValue: 'Delete note' })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <NoteBody body={n.body} />
          </li>
        ))}
      </ul>
    </div>
  );
}
