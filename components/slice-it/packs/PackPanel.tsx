import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Layers, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  AUTHORABLE_PACK_KINDS,
  PACK_TITLE_MAX,
  packLibraryPath,
  type PackSummary,
} from '@/lib/slice-it/packs';
import type { LibrarySong } from '@/lib/slice-it/library-filters';

/**
 * L16 — the pack builder.
 *
 * `ChartPack` had a model in the plan and no authoring surface anywhere, which
 * meant packs existed only as a thing other features were specified in terms
 * of. This is the surface: create a pack, add public charts (yours or not),
 * reorder them, publish.
 *
 * Two modes, because they are the two things anyone actually wants to do:
 *
 * - **Browse/edit** — the default. Your packs, then the published ones.
 * - **Add-to-pack** — opened from a song, with `addSongId` set. Every pack row
 *   grows an "Add" button and creating a pack seeds it with that song, so
 *   "put this track in a new pack" is one gesture rather than create-then-find-
 *   then-add.
 *
 * Reordering is up/down buttons rather than drag: a drag handle inside a modal
 * inside a full-screen game is three nested scroll contexts fighting over a
 * pointer, and the keyboard story for it has to be written anyway. The whole
 * order goes to the server on every move (`PackItemsZ.order`), never a
 * `{from, to}` pair — a positional diff sent by a client whose copy is one edit
 * stale reorders the wrong row, silently.
 */

interface PackPanelProps {
  /** When set, the panel is in add-to-pack mode for this song. */
  addSongId?: string | null;
  /** Called after a successful add, so the opener can close itself. */
  onAdded?: () => void;
}

interface PackDetail {
  pack: PackSummary;
  songs: LibrarySong[];
}

export function PackPanel({ addSongId = null, onAdded }: PackPanelProps) {
  const { t } = useTranslation('r-slice-it');

  const [packs, setPacks] = React.useState<PackSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<PackDetail | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [newTitle, setNewTitle] = React.useState('');
  const [newKind, setNewKind] = React.useState<(typeof AUTHORABLE_PACK_KINDS)[number]>('pack');

  const loadPacks = React.useCallback(async () => {
    setLoading(true);
    try {
      // Two requests because "mine" includes unpublished drafts and the public
      // browse must not — one endpoint answering both would need a scope the
      // server cannot trust from the client anyway.
      const [mineRes, publicRes] = await Promise.all([
        fetch('/api/slice-it/packs?scope=mine&limit=50'),
        fetch('/api/slice-it/packs?scope=public&limit=50'),
      ]);
      const mine = mineRes.ok ? ((await mineRes.json()) as { packs: PackSummary[] }).packs : [];
      const shared = publicRes.ok
        ? ((await publicRes.json()) as { packs: PackSummary[] }).packs
        : [];
      const seen = new Set(mine.map((p) => p.id));
      setPacks([...mine, ...shared.filter((p) => !seen.has(p.id))]);
    } catch {
      toast.error(t('packs-load-failed', { defaultValue: 'Could not load packs.' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadPacks();
  }, [loadPacks]);

  const openPack = React.useCallback(async (id: string) => {
    setOpenId(id);
    setDetail(null);
    const res = await fetch(`/api/slice-it/packs/${id}`);
    if (!res.ok) return;
    setDetail((await res.json()) as PackDetail);
  }, []);

  const createPack = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      const res = await fetch('/api/slice-it/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          kind: newKind,
          isPublic: false,
          // The whole point of add-to-pack mode: the pack and its first member
          // arrive in one request, so a failure cannot leave a titled empty
          // pack in somebody's list.
          ...(addSongId ? { songIds: [addSongId] } : {}),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setNewTitle('');
      toast.success(t('pack-created', { defaultValue: 'Pack created.' }));
      await loadPacks();
      if (addSongId) onAdded?.();
    } catch {
      toast.error(t('pack-create-failed', { defaultValue: 'Could not create the pack.' }));
    } finally {
      setBusy(false);
    }
  };

  const patchItems = async (
    packId: string,
    patch: { add?: string[]; remove?: string[]; order?: string[] },
  ) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/slice-it/packs/${packId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? String(res.status));
      }
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.length < 200
          ? error.message
          : t('pack-update-failed', { defaultValue: 'Could not update the pack.' }),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addToPack = async (packId: string) => {
    if (!addSongId) return;
    if (await patchItems(packId, { add: [addSongId] })) {
      toast.success(t('pack-song-added', { defaultValue: 'Added to pack.' }));
      onAdded?.();
      await loadPacks();
    }
  };

  const move = async (index: number, delta: number) => {
    if (!detail) return;
    const ids = detail.songs.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    // Optimistic: the reorder is the whole list, so replaying it locally and
    // sending the same list cannot diverge from what the server will store.
    setDetail({ ...detail, songs: ids.map((id) => detail.songs.find((s) => s.id === id)!) });
    if (!(await patchItems(detail.pack.id, { order: ids }))) await openPack(detail.pack.id);
  };

  const removeFromPack = async (songId: string) => {
    if (!detail) return;
    if (await patchItems(detail.pack.id, { remove: [songId] })) {
      await openPack(detail.pack.id);
      await loadPacks();
    }
  };

  const togglePublish = async (pack: PackSummary) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/slice-it/packs/${pack.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !pack.isPublic }),
      });
      if (!res.ok) throw new Error(String(res.status));
      await loadPacks();
      if (openId === pack.id) await openPack(pack.id);
    } catch {
      toast.error(t('pack-update-failed', { defaultValue: 'Could not update the pack.' }));
    } finally {
      setBusy(false);
    }
  };

  const deletePack = async (pack: PackSummary) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/slice-it/packs/${pack.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      if (openId === pack.id) {
        setOpenId(null);
        setDetail(null);
      }
      await loadPacks();
    } catch {
      toast.error(t('pack-delete-failed', { defaultValue: 'Could not delete the pack.' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="neumorphic-inset rounded-xl p-3 space-y-2">
        <label
          htmlFor="slice-pack-title"
          className="text-[11px] font-bold uppercase tracking-wide text-slice-text-light"
        >
          {t('pack-new', { defaultValue: 'New pack' })}
        </label>
        <div className="flex gap-2">
          <Input
            id="slice-pack-title"
            value={newTitle}
            maxLength={PACK_TITLE_MAX}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t('pack-title-placeholder', { defaultValue: 'Pack title' })}
            className="bg-slice-card-bg border-slice-shadow-dark/50 text-slice-text rounded-lg"
          />
          <Button
            type="button"
            onClick={() => void createPack()}
            disabled={busy || !newTitle.trim()}
            className="rounded-lg bg-blue-500 text-white hover:bg-blue-600 font-bold shrink-0"
          >
            <Plus className="w-4 h-4 mr-1" aria-hidden />
            {t('pack-create', { defaultValue: 'Create' })}
          </Button>
        </div>
        <div className="flex gap-1.5">
          {AUTHORABLE_PACK_KINDS.map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setNewKind(kind)}
              className={`h-7 px-2.5 text-[11px] font-bold rounded-lg ${
                newKind === kind
                  ? 'bg-blue-500/15 text-blue-500'
                  : 'text-slice-text-muted hover:text-slice-text'
              }`}
            >
              {kind === 'pack'
                ? t('pack-kind-pack', { defaultValue: 'Pack' })
                : t('pack-kind-course', { defaultValue: 'Course' })}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-slice-text-light">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
        </div>
      ) : packs.length === 0 ? (
        <p className="text-center text-slice-text-light py-8 text-sm font-bold">
          {t('packs-empty', { defaultValue: 'No packs yet — make the first one.' })}
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-80 overflow-y-auto">
          {packs.map((pack) => (
            <li key={pack.id} className="neumorphic-sm rounded-xl p-2.5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 shrink-0 text-slice-text-light" aria-hidden />
                <button
                  type="button"
                  onClick={() => void (openId === pack.id ? setOpenId(null) : openPack(pack.id))}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate font-bold text-slice-text text-sm">
                    {pack.title}
                  </span>
                  <span className="block text-[11px] text-slice-text-light">
                    {t('pack-track-count', {
                      defaultValue: '{{count}} tracks',
                      count: pack.songCount,
                    })}
                    {!pack.isPublic &&
                      ` • ${t('pack-draft', { defaultValue: 'Draft' })}`}
                    {pack.kind === 'album' &&
                      ` • ${t('pack-kind-album', { defaultValue: 'Album' })}`}
                  </span>
                </button>

                {addSongId ? (
                  pack.isOwner && pack.kind !== 'album' ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void addToPack(pack.id)}
                      className="h-7 rounded-lg bg-blue-500 text-white hover:bg-blue-600 text-[11px] font-bold shrink-0"
                    >
                      {t('pack-add', { defaultValue: 'Add' })}
                    </Button>
                  ) : null
                ) : (
                  <a
                    href={packLibraryPath(pack.id)}
                    className="text-[11px] font-bold text-blue-500 hover:underline shrink-0"
                  >
                    {t('pack-open', { defaultValue: 'Open' })}
                  </a>
                )}
              </div>

              {openId === pack.id && (
                <div className="mt-2 pt-2 border-t border-slice-shadow-dark/40 space-y-2">
                  {pack.isOwner && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="flex items-center gap-2 text-[11px] font-bold text-slice-text-muted">
                        <Switch
                          checked={pack.isPublic}
                          disabled={busy}
                          onCheckedChange={() => void togglePublish(pack)}
                        />
                        {t('pack-published', { defaultValue: 'Published' })}
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void deletePack(pack)}
                        className="h-7 px-2 text-[11px] font-bold text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-3 h-3 mr-1" aria-hidden />
                        {t('pack-delete', { defaultValue: 'Delete' })}
                      </Button>
                    </div>
                  )}

                  {!detail ? (
                    <div className="flex justify-center py-3 text-slice-text-light">
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                    </div>
                  ) : (
                    <ol className="space-y-1">
                      {detail.songs.map((song, index) => (
                        <li key={song.id} className="flex items-center gap-2 text-xs">
                          <span className="w-5 tabular-nums text-slice-text-light">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-slice-text">
                            {song.title}
                            <span className="text-slice-text-light"> — {song.artist}</span>
                          </span>
                          {pack.isOwner && pack.kind !== 'album' && (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={busy || index === 0}
                                onClick={() => void move(index, -1)}
                                className="h-6 w-6 text-slice-text-muted"
                                aria-label={t('pack-move-up', { defaultValue: 'Move up' })}
                              >
                                <ChevronUp className="w-3 h-3" aria-hidden />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={busy || index === detail.songs.length - 1}
                                onClick={() => void move(index, 1)}
                                className="h-6 w-6 text-slice-text-muted"
                                aria-label={t('pack-move-down', { defaultValue: 'Move down' })}
                              >
                                <ChevronDown className="w-3 h-3" aria-hidden />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={busy}
                                onClick={() => void removeFromPack(song.id)}
                                className="h-6 w-6 text-slice-text-muted"
                                aria-label={t('pack-remove', { defaultValue: 'Remove' })}
                              >
                                <X className="w-3 h-3" aria-hidden />
                              </Button>
                            </>
                          )}
                        </li>
                      ))}
                      {detail.songs.length === 0 && (
                        <li className="text-[11px] text-slice-text-light">
                          {t('pack-empty', {
                            defaultValue: 'Empty — add tracks from a song’s details panel.',
                          })}
                        </li>
                      )}
                    </ol>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
