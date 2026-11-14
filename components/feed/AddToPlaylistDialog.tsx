import { useEffect, useState } from'react';
import { useTranslation } from'react-i18next';
import { toast } from '@/lib/toast';
import { Plus, ListMusic, Check } from'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from'@/components/ui/dialog';
import { Button } from'@/components/ui/button';
import { Input } from'@/components/ui/input';
import { Spinner } from'@/components/ui/spinner';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
 addPlaylistItemApi,
 createPlaylistApi,
 listPlaylistsApi,
} from '@/lib/playlists/playlists.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

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
 * Reusable"save this video to a playlist"dialog. Controlled: pass the
 * `item`to add and toggle `open`. Lists the caller's video playlists and lets
 * them create a new one inline. (Music playlists belonged to the retired
 * RMHMusic listening-party app; none can be created or filled now.)
 */
export function AddToPlaylistDialog({
 item,
 open,
 onOpenChange,
}: {
 item: PlaylistItemInput | null;
 open: boolean;
 onOpenChange: (open: boolean) => void;
}) {
 const { t } = useTranslation('feed');
 const [playlists, setPlaylists] = useState<Summary[]>([]);
 const [loading, setLoading] = useState(false);
 const [busyId, setBusyId] = useState<string | null>(null);
 const [addedId, setAddedId] = useState<string | null>(null);
 const [newName, setNewName] = useState('');
 const [creating, setCreating] = useState(false);
 // Steel M9: the playlists replace the spinner inside the open dialog.
 const arrival = useArrival(!loading);

 useEffect(() => {
 if (!open) return;
 setAddedId(null);
 setLoading(true);
 api(listPlaylistsApi)
 .then((d) => setPlaylists(d.playlists ?? []))
 .catch(() => setPlaylists([]))
 .finally(() => setLoading(false));
 }, [open]);

 const add = async (playlistId: string) => {
 if (!item) return;
 setBusyId(playlistId);
 try {
 const data = await api(addPlaylistItemApi, { params: { id: playlistId }, body: item });
 setAddedId(playlistId);
 setPlaylists((ps) => ps.map((p) => (p.id === playlistId ? { ...p, itemCount: p.itemCount + (data.duplicate ? 0 : 1) } : p)));
 toast.success(
 data.duplicate
 ? t('playlist-already', { defaultValue:'Already in that playlist.'})
 : t('playlist-added', { defaultValue:'Added to playlist.'}),
 );
 } catch (err) {
 toast.error(serverError(err) ?? t('playlist-add-failed', { defaultValue:'Could not add.'}));
 } finally {
 setBusyId(null);
 }
 };

 const createAndAdd = async () => {
 const name = newName.trim();
 if (!name || !item) return;
 setCreating(true);
 try {
 const data = await api(createPlaylistApi, { body: { name, kind:'video'} });
 setNewName('');
 setPlaylists((ps) => [{ id: data.id, name, itemCount: 0 }, ...ps]);
 await add(data.id);
 } catch (err) {
 toast.error(serverError(err) ?? t('playlist-create-failed', { defaultValue:'Could not create playlist.'}));
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
 <Button variant="default"size="sm"onClick={createAndAdd} loading={creating} disabled={!newName.trim()} className="gap-1">
 <Plus className="h-4 w-4"aria-hidden /> {t('playlist-create', { defaultValue:'Create'})}
 </Button>
 </div>

 <div className="max-h-[45dvh] overflow-y-auto">
 {loading ? (
 <div className="flex justify-center py-8">
 <Spinner size={20} />
 </div>
 ) : playlists.length === 0 ? (
 <p className={cn('py-6 text-center text-sm text-site-text-muted', arrival)}>
 {t('playlist-none-yet', { defaultValue:'No playlists yet — create one above.'})}
 </p>
 ) : (
 <ul className={cn('space-y-1', arrival)}>
 {playlists.map((pl) => (
 <li key={pl.id}>
 <button
 type="button"
 onClick={() => add(pl.id)}
 disabled={busyId === pl.id}
 className="flex w-full items-center gap-3 rounded-site-sm px-3 py-2 text-left hover:bg-site-surface-hover disabled:opacity-60"
 >
 <ListMusic className="h-4 w-4 shrink-0 text-site-text-muted"aria-hidden />
 <span className="min-w-0 flex-1">
 <span className="block truncate text-sm text-site-text">{pl.name}</span>
 <span className="block text-xs text-site-text-muted">
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
