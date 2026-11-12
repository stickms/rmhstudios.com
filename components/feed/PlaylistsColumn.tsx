import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { toast } from '@/lib/toast';
import {
  ListVideo,
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Video,
  ExternalLink,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ColumnHeader } from './ColumnHeader';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
  addPlaylistCollaboratorApi,
  createPlaylistApi,
  deletePlaylistApi,
  getPlaylistApi,
  listPlaylistCollaboratorsApi,
  listPlaylistsApi,
  removePlaylistCollaboratorApi,
  removePlaylistItemApi,
  renamePlaylistApi,
} from '@/lib/playlists/playlists.contract';
import '@/components/library/library.css';

interface Summary {
  id: string;
  name: string;
  kind: string;
  itemCount: number;
  updatedAt: string;
  role: 'owner' | 'collaborator';
}
interface Collaborator {
  userId: string;
  handle: string | null;
  name: string | null;
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

export function PlaylistsColumn({
  initialData,
  embedded = false,
  searchQuery = '',
}: {
  initialData: { playlists: Summary[] | null };
  // When hosted inside another page (e.g. the Library "Playlists" section) the host
  // supplies the heading and outer scroll region, so drop our own ColumnHeader
  // and full-height wrapper.
  embedded?: boolean;
  /** Optional host-level filter (used by the combined Library explorer). */
  searchQuery?: string;
}) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const [playlists, setPlaylists] = useState<Summary[]>(initialData.playlists ?? []);
  const signedIn = initialData.playlists !== null;
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [loadingItems, setLoadingItems] = useState(false);
  const [collaborators, setCollaborators] = useState<Record<string, Collaborator[]>>({});
  const [collabHandle, setCollabHandle] = useState('');
  const [addingCollab, setAddingCollab] = useState(false);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visiblePlaylists = normalizedQuery
    ? playlists.filter(
        (playlist) =>
          playlist.name.toLowerCase().includes(normalizedQuery) ||
          playlist.kind.toLowerCase().includes(normalizedQuery),
      )
    : playlists;

  const refresh = useCallback(async () => {
    try {
      setPlaylists((await api(listPlaylistsApi)).playlists ?? []);
    } catch {
      /* keep the current list */
    }
  }, []);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await api(createPlaylistApi, { body: { name, kind: 'video' } });
      setNewName('');
      await refresh();
    } catch (err) {
      toast.error(
        serverError(err) ??
          t('playlist-create-failed', { defaultValue: 'Could not create playlist.' }),
      );
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
    setCollabHandle('');
    if (playlists.find((p) => p.id === id)?.role === 'owner' && !collaborators[id]) {
      api(listPlaylistCollaboratorsApi, { params: { id } })
        .then((d) => {
          setCollaborators((m) => ({ ...m, [id]: d.collaborators ?? [] }));
        })
        .catch(() => {});
    }
    if (!items[id]) {
      setLoadingItems(true);
      try {
        const data = await api(getPlaylistApi, { params: { id } });
        setItems((m) => ({ ...m, [id]: data.items ?? [] }));
      } catch {
        /* leave the item list unloaded */
      } finally {
        setLoadingItems(false);
      }
    }
  };

  const rename = async (pl: Summary) => {
    const name = window.prompt(
      t('playlist-rename-prompt', { defaultValue: 'Rename playlist' }),
      pl.name,
    );
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === pl.name) return;
    try {
      await api(renamePlaylistApi, { params: { id: pl.id }, body: { name: trimmed } });
      setPlaylists((ps) => ps.map((p) => (p.id === pl.id ? { ...p, name: trimmed } : p)));
    } catch {
      toast.error(t('playlist-rename-failed', { defaultValue: 'Could not rename.' }));
    }
  };

  const remove = async (pl: Summary) => {
    const ok = await confirm({
      title: t('playlist-delete-title', { defaultValue: 'Delete this playlist?' }),
      description: t('playlist-delete-desc', { defaultValue: 'This cannot be undone.' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deletePlaylistApi, { params: { id: pl.id } });
      setPlaylists((ps) => ps.filter((p) => p.id !== pl.id));
      if (openId === pl.id) setOpenId(null);
    } catch {
      toast.error(t('playlist-delete-failed', { defaultValue: 'Could not delete.' }));
    }
  };

  const addCollaborator = async (playlistId: string) => {
    const handle = collabHandle.trim();
    if (!handle) return;
    setAddingCollab(true);
    try {
      try {
        await api(addPlaylistCollaboratorApi, { params: { id: playlistId }, body: { handle } });
      } catch (err) {
        toast.error(
          serverError(err) ??
            t('playlist-collab-add-failed', { defaultValue: 'Could not add collaborator.' }),
        );
        return;
      }
      setCollabHandle('');
      try {
        const d = await api(listPlaylistCollaboratorsApi, { params: { id: playlistId } });
        setCollaborators((m) => ({ ...m, [playlistId]: d.collaborators ?? [] }));
      } catch {
        /* the list refreshes next time the playlist is opened */
      }
    } finally {
      setAddingCollab(false);
    }
  };

  const removeCollaborator = async (playlistId: string, userId: string) => {
    try {
      await api(removePlaylistCollaboratorApi, { params: { id: playlistId, userId } });
      setCollaborators((m) => ({
        ...m,
        [playlistId]: (m[playlistId] ?? []).filter((c) => c.userId !== userId),
      }));
    } catch {
      toast.error(
        t('playlist-collab-remove-failed', { defaultValue: 'Could not remove collaborator.' }),
      );
    }
  };

  const removeItem = async (playlistId: string, itemId: string) => {
    try {
      await api(removePlaylistItemApi, { params: { id: playlistId, itemId } });
      setItems((m) => ({
        ...m,
        [playlistId]: (m[playlistId] ?? []).filter((i) => i.id !== itemId),
      }));
      setPlaylists((ps) =>
        ps.map((p) =>
          p.id === playlistId ? { ...p, itemCount: Math.max(0, p.itemCount - 1) } : p,
        ),
      );
    } catch {
      toast.error(t('playlist-item-remove-failed', { defaultValue: 'Could not remove item.' }));
    }
  };

  return (
    <div className={embedded ? 'lib-playlists' : undefined}>
      {!embedded && (
        <ColumnHeader
          icon={ListVideo}
          title={t('playlists-title', { defaultValue: 'Playlists' })}
        />
      )}

      {!signedIn ? (
        <div className="p-4">
          <EmptyState
            icon={ListVideo}
            title={t('playlists-signin-title', { defaultValue: 'Sign in to build playlists' })}
            description={t('playlists-signin-desc-video', {
              defaultValue: 'Save videos into your own persistent playlists.',
            })}
            action={
              <Link to="/login" search={{ callbackURL: '/playlists' }}>
                <Button variant="default" size="sm">
                  {t('sign-in', { defaultValue: 'Sign in' })}
                </Button>
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
            <Button
              variant="default"
              size="sm"
              onClick={create}
              loading={creating}
              disabled={!newName.trim()}
              className="gap-1"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {''}
              {t('playlist-create', { defaultValue: 'Create' })}
            </Button>
          </div>

          {visiblePlaylists.length === 0 ? (
            <EmptyState
              icon={Video}
              title={
                normalizedQuery
                  ? t('playlists-search-empty-title', { defaultValue: 'No matching playlists' })
                  : t('playlists-empty-title', { defaultValue: 'No playlists yet' })
              }
              description={
                normalizedQuery
                  ? t('playlists-search-empty-desc-name', {
                      defaultValue: 'Try a different playlist name.',
                    })
                  : t('playlists-empty-desc-rmhtube', {
                      defaultValue: 'Save videos from an RMHTube room to start a playlist.',
                    })
              }
            />
          ) : (
            <div className="space-y-2">
              {visiblePlaylists.map((pl) => {
                const open = openId === pl.id;
                return (
                  <div
                    key={pl.id}
                    className={
                      embedded
                        ?'surface-press lib-orbit-card'
                        : 'rounded-site border border-site-border bg-site-surface'
                    }
                    data-library-orbit={embedded ? '' : undefined}
                  >
                    <div className="flex items-center gap-2 p-3">
                      <button
                        type="button"
                        onClick={() => toggle(pl.id)}
                        aria-expanded={open}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {open ? (
                          <ChevronDown
                            className="h-4 w-4 shrink-0 text-site-text-muted"
                            aria-hidden
                          />
                        ) : (
                          <ChevronRight
                            className="h-4 w-4 shrink-0 text-site-text-muted"
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-site-text">
                            {pl.name}
                          </span>
                          <span className="block text-xs text-site-text-muted">
                            {t('playlist-item-count', {
                              defaultValue: '{{n}} items',
                              n: pl.itemCount,
                            })}
                            {''}· {pl.kind}
                            {pl.role === 'collaborator' &&
                              ` · ${t('playlist-shared-badge', { defaultValue: 'Shared with you' })}`}
                          </span>
                        </span>
                      </button>
                      {pl.role === 'owner' && (
                        <>
                          <button
                            type="button"
                            onClick={() => rename(pl)}
                            aria-label={t('playlist-rename', { defaultValue: 'Rename' })}
                            className="rounded-site-sm p-1.5 text-site-text-muted hover:bg-site-surface-hover hover:text-site-text"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(pl)}
                            aria-label={t('playlist-delete', { defaultValue: 'Delete' })}
                            className="rounded-site-sm p-1.5 text-site-text-muted hover:bg-site-surface-hover hover:text-site-danger"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </>
                      )}
                    </div>

                    {open && (
                      <div className="border-t border-site-border p-2">
                        {loadingItems && !items[pl.id] ? (
                          <p className="py-4 text-center text-sm text-site-text-muted">
                            {t('loading', { defaultValue: 'Loading…' })}
                          </p>
                        ) : (items[pl.id] ?? []).length === 0 ? (
                          <p className="py-4 text-center text-sm text-site-text-muted">
                            {t('playlist-no-items', { defaultValue: 'Nothing here yet.' })}
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {(items[pl.id] ?? []).map((it) => (
                              <li
                                key={it.id}
                                className="flex items-center gap-2 rounded-site-sm px-2 py-1.5 hover:bg-site-surface-hover"
                              >
                                {it.thumbnail ? (
                                  <img
                                    src={it.thumbnail}
                                    alt=""
                                    className="h-9 w-9 shrink-0 rounded object-cover"
                                  />
                                ) : (
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-site-bg">
                                    <Video className="h-4 w-4 text-site-text-muted" aria-hidden />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm text-site-text">{it.title}</p>
                                  {it.subtitle && (
                                    <p className="truncate text-xs text-site-text-muted">
                                      {it.subtitle}
                                    </p>
                                  )}
                                </div>
                                {it.url && (
                                  <a
                                    href={it.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-site-sm p-1.5 text-site-text-muted hover:text-site-accent"
                                    aria-label={t('playlist-open-item', { defaultValue: 'Open' })}
                                  >
                                    <ExternalLink className="h-4 w-4" aria-hidden />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeItem(pl.id, it.id)}
                                  aria-label={t('playlist-remove-item', {
                                    defaultValue: 'Remove from playlist',
                                  })}
                                  className="rounded-site-sm p-1.5 text-site-text-muted hover:text-site-danger"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {pl.role === 'owner' && (
                          <div className="mt-2 border-t border-site-border px-2 pt-3">
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-site-text-muted">
                              <Users className="h-3.5 w-3.5" aria-hidden />
                              {t('playlist-collaborators', { defaultValue: 'Collaborators' })}
                            </p>
                            <ul className="mb-2 flex flex-wrap gap-2">
                              {(collaborators[pl.id] ?? []).map((c) => (
                                <li
                                  key={c.userId}
                                  className="flex items-center gap-1 rounded-site-sm px-2 py-1 text-xs text-site-text hover:bg-site-surface-hover"
                                >
                                  <span>@{c.handle ?? c.name ?? c.userId}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeCollaborator(pl.id, c.userId)}
                                    aria-label={t('playlist-collab-remove', {
                                      defaultValue: 'Remove collaborator',
                                    })}
                                    className="rounded-site-sm p-0.5 text-site-text-muted hover:text-site-danger"
                                  >
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                  </button>
                                </li>
                              ))}
                            </ul>
                            <div className="flex items-center gap-2">
                              <Input
                                value={collabHandle}
                                onChange={(e) => setCollabHandle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addCollaborator(pl.id);
                                  }
                                }}
                                maxLength={21}
                                placeholder={t('playlist-collab-placeholder', {
                                  defaultValue: 'Add by @handle…',
                                })}
                                aria-label={t('playlist-collab-label', {
                                  defaultValue: 'Collaborator handle',
                                })}
                                className="flex-1"
                              />
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => addCollaborator(pl.id)}
                                loading={addingCollab}
                                disabled={!collabHandle.trim()}
                              >
                                {t('playlist-collab-add', { defaultValue: 'Add' })}
                              </Button>
                            </div>
                          </div>
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
