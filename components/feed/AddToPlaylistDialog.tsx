'use client';

import { useEffect, useState } from'react';
import { useTranslation } from'react-i18next';
import { toast } from'sonner';
import { Plus, ListMusic, Check } from'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from'@/components/ui/dialog';
import { Button } from'@/components/ui/button';
import { Input } from'@/components/ui/input';
import { Spinner } from'@/components/ui/spinner';

export interface PlaylistItemInput {
 externalId: string;
 title: string;
 subtitle?: string | null;
 thumbnail?: string | null;
 url?: string | null;
 durationMs?: number | null;
}

interface Summary {
 id: string;
 name: string;
 itemCount: number;
}

/**
 * Reusable"save this track/video to a playlist"dialog. Controlled: pass the
 * `item`to add and toggle `open`. Lists the caller's playlists (of the given
 * kind) and lets them create a new one inline.
 */
export function AddToPlaylistDialog({
 item,
 open,
 onOpenChange,
 kind ='music',
}: {
 item: PlaylistItemInput | null;
 open: boolean;
 onOpenChange: (open: boolean) => void;
 kind?:'music'|'video';
}) {
 const { t } = useTranslation('feed');
 const [playlists, setPlaylists] = useState<Summary[]>([]);
 const [loading, setLoading] = useState(false);
 const [busyId, setBusyId] = useState<string | null>(null);
 const [addedId, setAddedId] = useState<string | null>(null);
 const [newName, setNewName] = useState('');
 const [creating, setCreating] = useState(false);

 useEffect(() => {
 if (!open) return;
 setAddedId(null);
 setLoading(true);
 fetch(`/api/playlists?kind=${kind}`, { credentials:'include'})
 .then((r) => (r.ok ? r.json() : { playlists: [] }))
 .then((d) => setPlaylists(d.playlists ?? []))
 .catch(() => setPlaylists([]))
 .finally(() => setLoading(false));
 }, [open, kind]);

 const add = async (playlistId: string) => {
 if (!item) return;
 setBusyId(playlistId);
 try {
 const res = await fetch(`/api/playlists/${playlistId}/items`, {
 method:'POST',
 credentials:'include',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify(item),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) {
 toast.error(data.error ?? t('playlist-add-failed', { defaultValue:'Could not add.'}));
 return;
 }
 setAddedId(playlistId);
 setPlaylists((ps) => ps.map((p) => (p.id === playlistId ? { ...p, itemCount: p.itemCount + (data.duplicate ? 0 : 1) } : p)));
 toast.success(
 data.duplicate
 ? t('playlist-already', { defaultValue:'Already in that playlist.'})
 : t('playlist-added', { defaultValue:'Added to playlist.'}),
 );
 } catch {
 toast.error(t('playlist-add-failed', { defaultValue:'Could not add.'}));
 } finally {
 setBusyId(null);
 }
 };

 const createAndAdd = async () => {
 const name = newName.trim();
 if (!name || !item) return;
 setCreating(true);
 try {
 const res = await fetch('/api/playlists', {
 method:'POST',
 credentials:'include',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ name, kind }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data.id) {
 toast.error(data.error ?? t('playlist-create-failed', { defaultValue:'Could not create playlist.'}));
 return;
 }
 setNewName('');
 setPlaylists((ps) => [{ id: data.id, name, itemCount: 0 }, ...ps]);
 await add(data.id);
 } finally {
 setCreating(false);
 }
 };

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>{t('add-to-playlist', { defaultValue:'Add to playlist'})}</DialogTitle>
 </DialogHeader>

 {item && (
 <p className="truncate text-sm text-site-text-muted">
 {item.title}
 {item.subtitle ? `· ${item.subtitle}`:''}
 </p>
 )}

 <div className="flex items-center gap-2">
 <Input
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 onKeyDown={(e) => {
 if (e.key ==='Enter') {
 e.preventDefault();
 createAndAdd();
 }
 }}
 maxLength={100}
 placeholder={t('playlist-new-placeholder', { defaultValue:'New playlist name…'})}
 aria-label={t('playlist-new-label', { defaultValue:'New playlist name'})}
 className="flex-1"
 />
 <Button variant="outline"size="sm"onClick={createAndAdd} loading={creating} disabled={!newName.trim()} className="gap-1">
 <Plus className="h-4 w-4"aria-hidden /> {t('playlist-create', { defaultValue:'Create'})}
 </Button>
 </div>

 <div className="max-h-[45dvh] overflow-y-auto">
 {loading ? (
 <div className="flex justify-center py-8">
 <Spinner size={20} />
 </div>
 ) : playlists.length === 0 ? (
 <p className="py-6 text-center text-sm text-site-text-dim">
 {t('playlist-none-yet', { defaultValue:'No playlists yet — create one above.'})}
 </p>
 ) : (
 <ul className="space-y-1">
 {playlists.map((pl) => (
 <li key={pl.id}>
 <button
 type="button"
 onClick={() => add(pl.id)}
 disabled={busyId === pl.id}
 className="flex w-full items-center gap-3 rounded-site-sm px-3 py-2 text-left hover:bg-site-surface-hover disabled:opacity-60"
 >
 <ListMusic className="h-4 w-4 shrink-0 text-site-text-dim"aria-hidden />
 <span className="min-w-0 flex-1">
 <span className="block truncate text-sm text-site-text">{pl.name}</span>
 <span className="block text-[11px] text-site-text-dim">
 {t('playlist-item-count', { defaultValue:'{{n}} items', n: pl.itemCount })}
 </span>
 </span>
 {addedId === pl.id && <Check className="h-4 w-4 shrink-0 text-site-success"aria-hidden />}
 </button>
 </li>
 ))}
 </ul>
 )}
 </div>
 </DialogContent>
 </Dialog>
 );
}
