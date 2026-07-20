'use client';

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { Edit, Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';

export interface GuideData {
  id: string;
  gameId: string;
  title: string;
  body: string;
  published: boolean;
  isAuthor: boolean;
  author: { name: string | null; handle: string | null; image: string | null };
}

/**
 * GuideView (§6) — a player guide reader with library-style typography, plus
 * an author edit mode and a create ("new") mode. Markdown renders through the
 * same react-markdown path as builds/blog (no raw HTML).
 */
export function GuideView({ gameId, guide }: { gameId: string; guide: GuideData | null }) {
  const { t } = useTranslation('games-hub');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isNew = guide === null;
  const [editing, setEditing] = useState(isNew);
  const [title, setTitle] = useState(guide?.title ?? '');
  const [body, setBody] = useState(guide?.body ?? '');
  const [published, setPublished] = useState(guide?.published ?? false);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (title.trim().length < 3 || body.trim().length < 1) {
      toast.error(t('guide-incomplete', { defaultValue: 'Add a title and some content' }));
      return;
    }
    setBusy(true);
    try {
      if (isNew) {
        const res = await fetch('/api/guides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId, title, body }),
        });
        if (!res.ok) throw new Error();
        const { id } = (await res.json()) as { id: string };
        toast.success(t('guide-created', { defaultValue: 'Draft saved' }));
        void navigate({ to: '/games/$gameId/guides/$guideId', params: { gameId, guideId: id } });
      } else {
        const res = await fetch(`/api/guides/${guide.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, body }),
        });
        if (!res.ok) throw new Error();
        setEditing(false);
        toast.success(t('guide-saved', { defaultValue: 'Guide saved' }));
      }
    } catch {
      toast.error(t('error', { defaultValue: 'Something went wrong' }));
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish() {
    if (isNew || !guide) return;
    const next = !published;
    setPublished(next);
    const res = await fetch(`/api/guides/${guide.id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: next }),
    });
    if (!res.ok) setPublished(!next);
    else toast.success(next ? t('published', { defaultValue: 'Published' }) : t('unpublished', { defaultValue: 'Unpublished' }));
  }

  async function remove() {
    if (isNew || !guide) return;
    const ok = await confirm({
      title: t('delete-guide', { defaultValue: 'Delete this guide?' }),
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/guides/${guide.id}`, { method: 'DELETE' });
    if (res.ok) void navigate({ to: '/games/$gameId', params: { gameId } });
  }

  if (editing) {
    return (
      <div className="px-4 pt-4 pb-12 space-y-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 120))}
          placeholder={t('guide-title', { defaultValue: 'Guide title' })}
          aria-label={t('guide-title', { defaultValue: 'Guide title' })}
          className="text-base"
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 40_000))}
          placeholder={t('guide-body', { defaultValue: 'Write your guide in Markdown…' })}
          aria-label={t('guide-body', { defaultValue: 'Guide content' })}
          rows={16}
          className="font-mono text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {!isNew ? (
              <>
                <Button variant="outline" size="sm" onClick={togglePublish}>
                  {published ? t('unpublish', { defaultValue: 'Unpublish' }) : t('publish', { defaultValue: 'Publish' })}
                </Button>
                <Button variant="ghost" size="sm" onClick={remove} className="text-site-danger">
                  {t('delete', { defaultValue: 'Delete' })}
                </Button>
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            {!isNew ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                <Eye className="h-4 w-4" aria-hidden />
                {t('preview', { defaultValue: 'Preview' })}
              </Button>
            ) : null}
            <Button variant="accent" size="sm" onClick={save} loading={busy}>
              {t('save', { defaultValue: 'Save' })}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <article className="px-4 pt-4 pb-12">
      <header className="mb-4">
        <h1 className="font-(family-name:--site-font-display) text-xl font-bold text-site-text">{guide!.title}</h1>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <UserAvatar src={guide!.author.image ?? undefined} alt={guide!.author.name ?? 'User'} size={28} fallbackName={guide!.author.name ?? undefined} />
            <span className="text-sm text-site-text-muted">{guide!.author.name ?? guide!.author.handle}</span>
          </span>
          {guide!.isAuthor ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Edit className="h-4 w-4" aria-hidden />
              {t('edit', { defaultValue: 'Edit' })}
            </Button>
          ) : null}
        </div>
      </header>
      <div className="prose-guide space-y-3 text-[15px] leading-relaxed text-site-text [&_a]:text-site-accent [&_code]:font-mono [&_h2]:mt-5 [&_h2]:font-semibold [&_pre]:overflow-x-auto [&_pre]:rounded-site [&_pre]:bg-site-surface [&_pre]:p-3">
        <ReactMarkdown>{guide!.body}</ReactMarkdown>
      </div>
    </article>
  );
}
