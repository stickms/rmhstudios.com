import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { useEffect, useState, useCallback } from 'react';
import { Megaphone, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AIGenerateButton } from '@/components/feed/AIGenerateButton';
import { toast } from 'sonner';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
    throw redirect({ to: '/' });
  }
  return null;
});

export const Route = createFileRoute('/_site/admin/announcements')({
  head: () => ({ meta: [{ title: 'Announcements | RMH Studios' }] }),
  beforeLoad: () => getAdminSession(),
  component: AdminAnnouncementsPage,
});

interface Announcement {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  variant: string;
  active: boolean;
  pinned: boolean;
  createdAt: string;
  expiresAt: string | null;
}

const VARIANTS = ['info', 'success', 'warning', 'event'] as const;

function AdminAnnouncementsPage() {
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [variant, setVariant] = useState<(typeof VARIANTS)[number]>('info');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/announcements', { credentials: 'include' });
      if (res.ok) setList((await res.json()).announcements);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          linkUrl: linkUrl.trim() || undefined,
          linkLabel: linkLabel.trim() || undefined,
          variant,
        }),
      });
      if (res.ok) {
        toast.success('Announcement published');
        setTitle('');
        setBody('');
        setLinkUrl('');
        setLinkLabel('');
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Failed to publish');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (a: Announcement) => {
    await fetch(`/api/admin/announcements/${a.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ active: !a.active }),
    });
    load();
  };

  const remove = async (a: Announcement) => {
    if (!confirm('Delete this announcement?')) return;
    await fetch(`/api/admin/announcements/${a.id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const inputCls =
    'w-full rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none';

  return (
    <PageLayout title="Announcements" wide>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-site-accent" />
          <div>
            <h1 className="font-display text-2xl font-bold text-site-text">Feed Announcements</h1>
            <p className="mt-1 text-sm text-site-text-muted">Pinned banners shown at the top of everyone&apos;s feed.</p>
          </div>
        </div>

        {/* Create form */}
        <div className="space-y-3 rounded-xl border border-site-border bg-site-surface p-4">
          <div className="relative">
            <input className={`${inputCls} pr-10`} placeholder="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
              <AIGenerateButton
                size="sm"
                request={{ mode: 'announcement-title', title, body }}
                onGenerated={setTitle}
                title="Generate a title with AI"
              />
            </div>
          </div>
          <div className="relative">
            <textarea className={`${inputCls} pr-10`} placeholder="Message" rows={3} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="absolute right-1.5 top-1.5">
              <AIGenerateButton
                size="sm"
                request={{ mode: 'announcement-body', title, body }}
                onGenerated={setBody}
                title="Generate a message with AI"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className={inputCls} placeholder="Link URL (optional)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            <input className={inputCls} placeholder="Link label (optional)" value={linkLabel} maxLength={60} onChange={(e) => setLinkLabel(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {VARIANTS.map((v) => (
                <button
                  key={v}
                  onClick={() => setVariant(v)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    variant === v ? 'bg-site-accent text-(--site-accent-fg)' : 'border border-site-border bg-site-bg text-site-text-muted'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button variant="accent" onClick={create} disabled={submitting || !title.trim() || !body.trim()}>
              {submitting ? 'Publishing…' : 'Publish'}
            </Button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-12 text-center text-sm text-site-text-muted">No announcements yet.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((a) => (
              <li key={a.id} className="rounded-xl border border-site-border bg-site-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-site-bg px-1.5 py-0.5 text-[10px] uppercase text-site-text-muted">{a.variant}</span>
                      {!a.active && <span className="rounded bg-site-danger/15 px-1.5 py-0.5 text-[10px] uppercase text-site-danger">inactive</span>}
                      <p className="truncate font-semibold text-site-text">{a.title}</p>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-site-text-muted">{a.body}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => toggleActive(a)}>
                      {a.active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Delete" onClick={() => remove(a)}>
                      <Trash2 className="h-4 w-4 text-site-danger" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageLayout>
  );
}
