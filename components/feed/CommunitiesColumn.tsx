'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { Users, Plus, MessageSquare, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RevealGroup, RevealItem } from '@/components/motion';
import { CommunityListSkeleton } from '@/components/feed/CommunitiesSkeleton';
import { EmptyState } from '@/components/ui/empty-state';
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
  postCount: number;
  joined: boolean;
  role: string | null;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export function CommunitiesColumn({ initialCommunities = [] }: { initialCommunities?: Community[] }) {
  const navigate = useNavigate();
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const [items, setItems] = useState<Community[]>(initialCommunities);
  // The route loader already provided the first page, so we start resolved —
  // no spinner, no client-side fetch waterfall on mount.
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const url = q && q.trim() ? `/api/communities?q=${encodeURIComponent(q.trim())}` : '/api/communities';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) setItems((await res.json()).communities);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search. The initial list comes from the route loader, so we skip
  // the first run and only re-fetch when the query actually changes — otherwise
  // the search debounce would pointlessly delay (and re-request) the already-
  // seeded list on mount.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(query), 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, load]);

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
    'w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-site-border glass-chrome px-4 py-3">
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

      <div className="border-b border-site-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-dim" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search-communities', { defaultValue: 'Search communities…' })}
            aria-label={t('search-communities', { defaultValue: 'Search communities' })}
            className="w-full rounded-site-sm border border-site-border bg-site-bg py-2 pl-9 pr-3 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
          />
        </div>
      </div>

      {loading && items.length === 0 ? (
        <CommunityListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          description={
            query.trim()
              ? t('no-communities-found', { defaultValue: 'No communities match your search.' })
              : t('no-communities', { defaultValue: 'No communities yet — create the first one!' })
          }
        />
      ) : (
        <RevealGroup as="ul" className="flex flex-col gap-3 p-3">
          {items.map((c) => {
            const roleLabel =
              c.role === 'ADMIN'
                ? t('role-owner', { defaultValue: 'Owner' })
                : c.role === 'MOD'
                  ? t('role-mod', { defaultValue: 'Mod' })
                  : c.joined
                    ? t('joined-badge', { defaultValue: 'Joined' })
                    : null;
            return (
              <RevealItem as="li" key={c.id}>
                <Link
                  to={`/c/${c.slug}` as string}
                  className="flex items-start gap-4 rounded-site border border-site-border bg-site-surface p-4 transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-site-accent/50 hover:bg-site-surface-hover"
                >
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-site text-3xl"
                    style={{ background: (c.color || 'var(--site-accent)') + '22' }}
                  >
                    {c.icon || '👥'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-bold text-site-text">{c.name}</p>
                      {roleLabel && (
                        <span className="shrink-0 rounded-full bg-site-accent-dim px-2 py-0.5 text-xs font-medium text-site-accent">
                          {roleLabel}
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-site-text-muted">{c.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-4 text-xs text-site-text-dim">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {t('members-stat', { count: c.memberCount, formatted: formatCount(c.memberCount), defaultValue: '{{formatted}} members' })}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {t('posts-stat', { count: c.postCount, formatted: formatCount(c.postCount), defaultValue: '{{formatted}} posts' })}
                      </span>
                    </div>
                  </div>
                </Link>
              </RevealItem>
            );
          })}
        </RevealGroup>
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
