'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { Users, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useSession } from '@/components/Providers';
import { toast } from 'sonner';

interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  memberCount: number;
  joined: boolean;
}

export function CommunitiesColumn() {
  const navigate = useNavigate();
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const [items, setItems] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/communities', { credentials: 'include' });
      if (res.ok) setItems((await res.json()).communities);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (name.trim().length < 2) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, icon: icon || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(t('community-created', { defaultValue: 'Community created!' }));
        setCreateOpen(false);
        navigate({ to: `/c/${data.slug}` as string });
      } else {
        toast.error(data.error || t('community-create-error', { defaultValue: 'Could not create community' }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-site-accent" />
          <h1 className="text-lg font-bold text-site-text">{t('communities-heading', { defaultValue: 'Communities' })}</h1>
        </div>
        {session && (
          <Button size="sm" variant="accent" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> {t('new-button', { defaultValue: 'New' })}
          </Button>
        )}
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-site-text-muted">{t('no-communities', { defaultValue: 'No communities yet — create the first one!' })}</p>
      ) : (
        <ul className="divide-y divide-site-border">
          {items.map((c) => (
            <li key={c.id}>
              <Link to={`/c/${c.slug}` as string} className="flex items-center gap-3 px-4 py-3 hover:bg-site-surface-hover">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
                  style={{ background: (c.color || 'var(--site-accent)') + '22' }}
                >
                  {c.icon || '👥'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-site-text">{c.name}</p>
                  <p className="truncate text-xs text-site-text-muted">
                    {t('member-count', { count: c.memberCount, defaultValue: '{{count}} member' })}
                    {c.description ? ` · ${c.description}` : ''}
                  </p>
                </div>
                {c.joined && <span className="shrink-0 rounded-full bg-site-accent-dim px-2 py-0.5 text-xs text-site-accent">{t('joined-badge', { defaultValue: 'Joined' })}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('create-community-title', { defaultValue: 'Create a community' })}</DialogTitle>
          </DialogHeader>
          <input className={inputCls} placeholder={t('name-placeholder', { defaultValue: 'Name' })} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <textarea className={inputCls} placeholder={t('description-placeholder', { defaultValue: 'Description (optional)' })} rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          <input className={inputCls} placeholder={t('icon-placeholder', { defaultValue: 'Emoji icon (optional, e.g. 🎮)' })} value={icon} maxLength={8} onChange={(e) => setIcon(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={submitting}>{t('cancel-button', { defaultValue: 'Cancel' })}</Button>
            <Button variant="accent" onClick={create} disabled={submitting || name.trim().length < 2}>
              {submitting ? t('creating-button', { defaultValue: 'Creating…' }) : t('create-button', { defaultValue: 'Create' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
