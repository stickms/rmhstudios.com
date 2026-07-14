'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ListMusic, Plus, Trash2, Pencil, ChevronDown, ChevronRight, Music2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface Summary {
  id: string;
  name: string;
  kind: string;
  itemCount: number;
  updatedAt: string;
}
interface Item {
  id: string;
  externalId: string;
  title: string;
  subtitle: string | null;
  thumbnail: string | null;
  url: string | null;
  durationMs: number | null;
}

export function PlaylistsColumn({ initialData }: { initialData: { playlists: Summary[] | null } }) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const [playlists, setPlaylists] = useState<Summary[]>(initialData.playlists ?? []);
  const signedIn = initialData.playlists !== null;
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [loadingItems, setLoadingItems] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/playlists', { credentials: 'include' });
    if (res.ok) setPlaylists((await res.json()).playlists ?? []);
  }, []);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('playlist-create-failed', { defaultValue: 'Could not create playlist.' }));
        return;
      }
      setNewName('');
      await refresh();
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (!items[id]) {
      setLoadingItems(true);
      try {
        const res = await fetch(`/api/playlists/${id}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setItems((m) => ({ ...m, [id]: data.items ?? [] }));
        }
      } finally {
        setLoadingItems(false);
      }
    }
  };

  const rename = async (pl: Summary) => {
    const name = window.prompt(t('playlist-rename-prompt', { defaultValue: 'Rename playlist' }), pl.name);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === pl.name) return;
    const res = await fetch(`/api/playlists/${pl.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) setPlaylists((ps) => ps.map((p) => (p.id === pl.id ? { ...p, name: trimmed } : p)));
    else toast.error(t('playlist-rename-failed', { defaultValue: 'Could not rename.' }));
  };

  const remove = async (pl: Summary) => {
    const ok = await confirm({
      title: t('playlist-delete-title', { defaultValue: 'Delete this playlist?' }),
      description: t('playlist-delete-desc', { defaultValue: 'This cannot be undone.' }),
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/playlists/${pl.id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      setPlaylists((ps) => ps.filter((p) => p.id !== pl.id));
      if (openId === pl.id) setOpenId(null);
    } else {
      toast.error(t('playlist-delete-failed', { defaultValue: 'Could not delete.' }));
    }
  };

  const removeItem = async (playlistId: string, itemId: string) => {
    const res = await fetch(`/api/playlists/${playlistId}/items/${itemId}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      setItems((m) => ({ ...m, [playlistId]: (m[playlistId] ?? []).filter((i) => i.id !== itemId) }));
      setPlaylists((ps) => ps.map((p) => (p.id === playlistId ? { ...p, itemCount: Math.max(0, p.itemCount - 1) } : p)));
    } else {
      toast.error(t('playlist-item-remove-failed', { defaultValue: 'Could not remove item.' }));
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <ListMusic className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">{t('playlists-title', { defaultValue: 'Playlists' })}</h1>
      </header>

      {!signedIn ? (
        <div className="p-4">
          <EmptyState
            icon={ListMusic}
            title={t('playlists-signin-title', { defaultValue: 'Sign in to build playlists' })}
            description={t('playlists-signin-desc', { defaultValue: 'Save tracks and videos into your own persistent playlists.' })}
            action={
              <Link to="/login" search={{ callbackURL: '/playlists' }}>
                <Button variant="accent" size="sm">{t('sign-in', { defaultValue: 'Sign in' })}</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {/* Create */}
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  create();
                }
              }}
              maxLength={100}
              placeholder={t('playlist-new-placeholder', { defaultValue: 'New playlist name…' })}
              aria-label={t('playlist-new-label', { defaultValue: 'New playlist name' })}
              className="flex-1"
            />
            <Button variant="accent" size="sm" onClick={create} loading={creating} disabled={!newName.trim()} className="gap-1">
              <Plus className="h-4 w-4" aria-hidden /> {t('playlist-create', { defaultValue: 'Create' })}
            </Button>
          </div>

          {playlists.length === 0 ? (
            <EmptyState
              icon={Music2}
              title={t('playlists-empty-title', { defaultValue: 'No playlists yet' })}
              description={t('playlists-empty-desc', { defaultValue: 'Create one above, then add tracks from RMHMusic.' })}
            />
          ) : (
            <div className="space-y-2">
              {playlists.map((pl) => {
                const open = openId === pl.id;
                return (
                  <div key={pl.id} className="rounded-site border border-site-border bg-site-surface">
                    <div className="flex items-center gap-2 p-3">
                      <button
                        type="button"
                        onClick={() => toggle(pl.id)}
                        aria-expanded={open}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-site-text">{pl.name}</span>
                          <span className="block text-[11px] text-site-text-dim">
                            {t('playlist-item-count', { defaultValue: '{{n}} items', n: pl.itemCount })} · {pl.kind}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => rename(pl)}
                        aria-label={t('playlist-rename', { defaultValue: 'Rename' })}
                        className="rounded-site-sm p-1.5 text-site-text-dim hover:bg-site-surface-hover hover:text-site-text"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(pl)}
                        aria-label={t('playlist-delete', { defaultValue: 'Delete' })}
                        className="rounded-site-sm p-1.5 text-site-text-dim hover:bg-site-surface-hover hover:text-site-danger"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>

                    {open && (
                      <div className="border-t border-site-border p-2">
                        {loadingItems && !items[pl.id] ? (
                          <p className="py-4 text-center text-sm text-site-text-muted">{t('loading', { defaultValue: 'Loading…' })}</p>
                        ) : (items[pl.id] ?? []).length === 0 ? (
                          <p className="py-4 text-center text-sm text-site-text-dim">{t('playlist-no-items', { defaultValue: 'Nothing here yet.' })}</p>
                        ) : (
                          <ul className="space-y-1">
                            {(items[pl.id] ?? []).map((it) => (
                              <li key={it.id} className="flex items-center gap-2 rounded-site-sm px-2 py-1.5 hover:bg-site-surface-hover">
                                {it.thumbnail ? (
                                  <img src={it.thumbnail} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                                ) : (
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-site-bg">
                                    <Music2 className="h-4 w-4 text-site-text-dim" aria-hidden />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm text-site-text">{it.title}</p>
                                  {it.subtitle && <p className="truncate text-[11px] text-site-text-dim">{it.subtitle}</p>}
                                </div>
                                {it.url && (
                                  <a
                                    href={it.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-site-sm p-1.5 text-site-text-dim hover:text-site-accent"
                                    aria-label={t('playlist-open-item', { defaultValue: 'Open' })}
                                  >
                                    <ExternalLink className="h-4 w-4" aria-hidden />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeItem(pl.id, it.id)}
                                  aria-label={t('playlist-remove-item', { defaultValue: 'Remove from playlist' })}
                                  className="rounded-site-sm p-1.5 text-site-text-dim hover:text-site-danger"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
