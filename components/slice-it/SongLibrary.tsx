'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Heart, Image as ImageIcon, Loader2, Pause, Play, Search, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useSession } from '@/components/Providers';
import { useSliceItStore } from '@/lib/slice-it/store';
import {
  AUDIO_MAX_BYTES,
  COVER_MAX_BYTES,
  MAX_SONG_DURATION_SEC,
  SONG_SORTS,
  type SongSort,
} from '@/lib/slice-it/constants';
import type { SliceSong, SongPage } from '@/lib/slice-it/types';
import { NeumorphicModal } from './NeumorphicModal';

interface SongLibraryProps {
  onSelect: (song: SliceSong) => void;
  onHighlight: (song: SliceSong) => void;
  selectedSongId: string | null;
  onStopPreviewRef?: React.MutableRefObject<(() => void) | null>;
  readOnly?: boolean;
}

/**
 * The song library.
 *
 * ## What changed
 *
 * - **Search and sort are the server's job now.** The old version fetched fifty
 *   songs once and `.filter()`ed them in the browser, so "search" only ever
 *   searched the page you already had — and songs 51+ were unreachable by any
 *   means the UI offered.
 * - **It paginates.** Infinite scroll over a keyset cursor.
 * - **Uploads can carry cover art.** The API accepted a `cover` field from the
 *   day it was written; no client ever sent one, so every song in the library
 *   showed its first letter in a grey box.
 * - **The upload form reports what actually failed.** It used to `toast.error`
 *   the literal string "Upload failed" for every non-2xx, discarding the
 *   server's message — including the ones a user can act on ("you have reached
 *   your upload limit", "you already uploaded this track").
 */
export function SongLibrary({
  onSelect,
  onHighlight,
  selectedSongId,
  onStopPreviewRef,
  readOnly = false,
}: SongLibraryProps) {
  const { t } = useTranslation('c-game');
  const { data: session } = useSession();
  const volume = useSliceItStore((s) => s.volume);

  const [songs, setSongs] = React.useState<SliceSong[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState<SongSort>('recent');

  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [likingId, setLikingId] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  /* ── Fetching ────────────────────────────────────────────────────────── */

  // Debounced so typing does not fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const load = React.useCallback(
    async (cursor: string | null, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ sort });
        if (debouncedSearch) params.set('q', debouncedSearch);
        if (cursor) params.set('cursor', cursor);

        const response = await fetch(`/api/slice-it/songs?${params}`);
        if (!response.ok) throw new Error(String(response.status));
        const page = (await response.json()) as SongPage;

        setSongs((previous) => (append ? [...previous, ...page.songs] : page.songs));
        setNextCursor(page.nextCursor);
        // Only the first page carries a total; later pages of the same query
        // would only recount the same rows, so the client keeps the number.
        if (page.total !== undefined) setTotal(page.total);
      } catch {
        if (!append) setSongs([]);
        toast.error(t('library-load-failed', { defaultValue: 'Could not load the song library.' }));
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, sort, t],
  );

  React.useEffect(() => {
    void load(null, false);
  }, [load]);

  /* ── Preview playback ────────────────────────────────────────────────── */

  const previewRef = React.useRef<HTMLAudioElement | null>(null);
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const stopPreview = React.useCallback(() => {
    previewRef.current?.pause();
    previewRef.current = null;
    setPreviewId(null);
  }, []);

  React.useEffect(() => {
    if (!onStopPreviewRef) return;
    onStopPreviewRef.current = stopPreview;
    return () => {
      onStopPreviewRef.current = null;
    };
  }, [stopPreview, onStopPreviewRef]);

  React.useEffect(() => {
    const onHidden = () => {
      if (document.hidden) stopPreview();
    };
    document.addEventListener('visibilitychange', onHidden);
    // Unmount must stop the audio too — a preview left playing over the
    // gameplay music was the single most reported bug in this screen.
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      previewRef.current?.pause();
      previewRef.current = null;
    };
  }, [stopPreview]);

  React.useEffect(() => {
    if (previewRef.current) previewRef.current.volume = volume / 100;
  }, [volume]);

  const togglePreview = (song: SliceSong) => {
    if (previewId === song.id && previewRef.current) {
      if (previewRef.current.paused) void previewRef.current.play();
      else previewRef.current.pause();
      // Re-render so the icon flips.
      setPreviewId((id) => id);
      return;
    }
    previewRef.current?.pause();

    const audio = new Audio(song.audioUrl);
    audio.volume = volume / 100;
    audio.onended = () => setPreviewId(null);
    void audio.play().catch(() => setPreviewId(null));
    previewRef.current = audio;
    setPreviewId(song.id);
  };

  /* ── Mutations ───────────────────────────────────────────────────────── */

  const handleLike = async (event: React.MouseEvent, song: SliceSong) => {
    event.stopPropagation();
    if (!session || likingId) return;
    setLikingId(song.id);
    try {
      const response = await fetch(`/api/slice-it/songs/${song.id}/like`, { method: 'POST' });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { liked: boolean; likeCount: number };
      // The server returns the resulting count; the old client incremented its
      // own copy and drifted from the truth on every concurrent like.
      setSongs((previous) =>
        previous.map((s) =>
          s.id === song.id ? { ...s, isLiked: body.liked, likeCount: body.likeCount } : s,
        ),
      );
    } catch {
      toast.error(t('like-failed', { defaultValue: 'Could not update that like.' }));
    } finally {
      setLikingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const response = await fetch(`/api/slice-it/songs/${deleteId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      setSongs((previous) => previous.filter((s) => s.id !== deleteId));
      setTotal((n) => Math.max(0, n - 1));
      toast.success(t('delete-success', { defaultValue: 'Track purged from system library' }));
    } catch {
      toast.error(t('delete-failed', { defaultValue: 'Failure: Could not delete track.' }));
    } finally {
      setDeleteId(null);
    }
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="w-full h-full bg-slice-bg flex flex-col">
      <div className="flex gap-2 items-center shrink-0 p-3 border-b border-slice-shadow-dark/50">
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slice-text-light w-4 h-4"
            aria-hidden
          />
          {/* `pointer-coarse:h-11` rather than `.touch-target`: that utility
              grows the hit area with an `::after`, and neither a replaced
              `<input>` nor a `<select>` renders one. These two controls can be
              44px, so on a coarse pointer they are. */}
          <Input
            placeholder={t('search-placeholder', { defaultValue: 'Search songs, artists...' })}
            className="pl-9 bg-slice-card-bg border border-slice-shadow-dark/50 rounded-lg h-9 pointer-coarse:h-11 text-sm text-slice-text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('search-placeholder', { defaultValue: 'Search songs, artists...' })}
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SongSort)}
          className="h-9 pointer-coarse:h-11 shrink-0 max-w-28 rounded-lg bg-slice-card-bg border border-slice-shadow-dark/50 text-xs font-bold text-slice-text px-2"
          aria-label={t('sort-by', { defaultValue: 'Sort by' })}
        >
          {SONG_SORTS.map((option) => (
            <option key={option} value={option}>
              {sortLabel(option, t)}
            </option>
          ))}
        </select>

        {!readOnly && session && (
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button
                className="h-9 w-9 shrink-0 rounded-lg bg-blue-500 text-white hover:bg-blue-600 p-0 touch-target"
                aria-label={t('upload-track-title', { defaultValue: 'UPLOAD TRACK' })}
              >
                <Upload className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slice-bg border-none shadow-2xl rounded-2xl max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-slice-text font-black">
                  {t('upload-track-title', { defaultValue: 'UPLOAD TRACK' })}
                </DialogTitle>
              </DialogHeader>
              <UploadForm
                onDone={() => {
                  setUploadOpen(false);
                  void load(null, false);
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {songs.length === 0 && !loading && (
          <p className="text-center text-slice-text-light py-12 text-sm font-bold">
            {debouncedSearch
              ? t('no-search-results', {
                  defaultValue: 'Nothing matches "{{query}}".',
                  query: debouncedSearch,
                })
              : t('library-empty', { defaultValue: 'No tracks yet — upload the first one.' })}
          </p>
        )}

        <ul>
          {songs.map((song) => (
            <li key={song.id}>
              <div
                className={`p-2 flex items-center justify-between gap-2 group hover:bg-slice-shadow-dark/40 cursor-pointer border-l-4 ${
                  selectedSongId === song.id
                    ? 'bg-blue-500/10 border-l-blue-500'
                    : 'bg-transparent border-l-transparent'
                }`}
                onClick={() => onHighlight(song)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onHighlight(song);
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 rounded-full bg-slice-shadow-dark text-blue-500 shrink-0 touch-target"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePreview(song);
                    }}
                    aria-label={t('preview', { defaultValue: 'Preview' })}
                  >
                    {previewId === song.id && !previewRef.current?.paused ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 ml-0.5" />
                    )}
                  </Button>

                  <div className="w-10 h-10 rounded-md bg-slice-shadow-dark shrink-0 overflow-hidden relative">
                    {song.coverUrl ? (
                      <img
                        src={song.coverUrl}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-slice-text-muted font-bold text-xs">
                        {song.title.charAt(0)}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slice-text text-sm leading-tight truncate">
                      {song.title}
                    </div>
                    <div className="text-xs text-slice-text-muted truncate">
                      {song.artist}
                      {song.bpm > 0 ? ` • ${Math.round(song.bpm)} BPM` : ''} •{' '}
                      {formatDuration(song.duration)}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-[10px] text-slice-text-light">
                        <Play className="w-2.5 h-2.5 fill-current" aria-hidden />
                        {song.plays}
                      </span>
                      <span
                        className={`flex items-center gap-1 text-[10px] ${
                          song.isLiked ? 'text-red-400' : 'text-slice-text-light'
                        }`}
                      >
                        <Heart
                          className={`w-2.5 h-2.5 ${song.isLiked ? 'fill-current' : ''}`}
                          aria-hidden
                        />
                        {song.likeCount}
                      </span>
                      {song.isOwner && (
                        <span className="text-[10px] text-blue-500 font-bold">
                          {t('your-track', { defaultValue: 'YOUR TRACK' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!readOnly && song.isOwner && (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(song.id);
                      }}
                      // Visible by default and hover-revealed only where hover
                      // exists. `opacity-0 group-hover:opacity-100` alone meant
                      // the control was invisible on every touch device while
                      // still taking its 32px of a row that had none to spare.
                      className="h-8 w-8 rounded-lg touch-target sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      aria-label={t('delete-song', { defaultValue: 'Delete Song' })}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                  {session && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 rounded-lg shrink-0 touch-target ${
                        song.isLiked ? 'text-red-500' : 'text-slice-text-light'
                      }`}
                      onClick={(e) => void handleLike(e, song)}
                      disabled={likingId === song.id}
                      aria-label={
                        song.isLiked
                          ? t('unlike', { defaultValue: 'Unlike' })
                          : t('like', { defaultValue: 'Like' })
                      }
                    >
                      <Heart className={`w-4 h-4 ${song.isLiked ? 'fill-current' : ''}`} />
                    </Button>
                  )}
                  {!readOnly && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        stopPreview();
                        onSelect(song);
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-3 h-8 rounded-lg text-xs touch-target"
                    >
                      {t('play', { defaultValue: 'PLAY' })}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {nextCursor && (
          <div className="p-4 flex justify-center">
            <Button
              variant="outline"
              onClick={() => void load(nextCursor, true)}
              disabled={loading}
              className="rounded-xl"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              ) : (
                t('load-more', { defaultValue: 'Load more ({{count}} total)', count: total })
              )}
            </Button>
          </div>
        )}
      </div>

      <NeumorphicModal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
        title={t('wipe-track-title', { defaultValue: 'Wipe Track Data?' })}
        description={t('wipe-track-description', {
          defaultValue:
            'This will permanently delete the song, analysis data, and leaderboard entries. This action is irreversible.',
        })}
        confirmText={t('purge', { defaultValue: 'PURGE' })}
        cancelText={t('cancel', { defaultValue: 'CANCEL' })}
        variant="danger"
      />
    </div>
  );
}

/* ─── Upload ─────────────────────────────────────────────────────────────── */

function UploadForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('c-game');
  const { data: session } = useSession();

  const [file, setFile] = React.useState<File | null>(null);
  const [cover, setCover] = React.useState<File | null>(null);
  const [coverPreview, setCoverPreview] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [artist, setArtist] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [duration, setDuration] = React.useState(0);
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [statusText, setStatusText] = React.useState('');

  // Object URLs leak until revoked, and this component can be opened and closed
  // repeatedly without ever submitting.
  React.useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  const pickAudio = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) return;

    if (picked.size > AUDIO_MAX_BYTES) {
      toast.error(
        t('audio-too-large', {
          defaultValue: 'Audio file too large ({{sizeMb}} MB). Maximum size is 50 MB.',
          sizeMb: (picked.size / 1024 / 1024).toFixed(1),
        }),
      );
      event.target.value = '';
      return;
    }

    setFile(picked);
    setTitle(picked.name.replace(/\.[^/.]+$/, ''));
    setArtist(session?.user?.name ?? 'Unknown');

    const objectUrl = URL.createObjectURL(picked);
    const probe = new Audio(objectUrl);
    probe.onloadedmetadata = () => {
      setDuration(probe.duration || 0);
      URL.revokeObjectURL(objectUrl);
    };
    probe.onerror = () => URL.revokeObjectURL(objectUrl);

    // ID3 tags, including embedded artwork — most people's files already carry
    // a cover, and asking them to find one again is a step they will skip.
    //
    // Imported here rather than at the top of the file: `music-metadata` is a
    // full container parser, it is reachable from `GameCanvas`, and it was
    // therefore in the chunk every player downloads to *play* the game — to
    // serve the one moment someone picks a file to upload.
    try {
      const { parseBlob } = await import('music-metadata');
      const tags = await parseBlob(picked);
      if (tags.common.title) setTitle(tags.common.title);
      if (tags.common.artist) setArtist(tags.common.artist);
      const picture = tags.common.picture?.[0];
      if (picture && !cover) {
        // `picture.data` is a view over a possibly-shared buffer; copy it into
        // a plain ArrayBuffer so it satisfies BlobPart.
        const source = picture.data as unknown as Uint8Array;
        const bytes = new Uint8Array(source.length);
        bytes.set(source);
        const blob = new Blob([bytes.buffer as ArrayBuffer], {
          type: picture.format || 'image/jpeg',
        });
        const embedded = new File([blob], 'cover', { type: blob.type });
        if (embedded.size <= COVER_MAX_BYTES) {
          setCover(embedded);
          setCoverPreview(URL.createObjectURL(embedded));
        }
      }
    } catch {
      // No tags is normal; the filename is a fine fallback.
    }
  };

  const pickCover = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (picked.size > COVER_MAX_BYTES) {
      toast.error(t('cover-too-large', { defaultValue: 'Cover image must be under 10 MB.' }));
      event.target.value = '';
      return;
    }
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCover(picked);
    setCoverPreview(URL.createObjectURL(picked));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || uploading) return;

    if (duration > MAX_SONG_DURATION_SEC) {
      toast.error(
        t('audio-too-long', {
          defaultValue: 'Tracks must be under {{minutes}} minutes.',
          minutes: MAX_SONG_DURATION_SEC / 60,
        }),
      );
      return;
    }

    setUploading(true);
    setProgress(0);
    setStatusText(t('status-uploading', { defaultValue: 'Uploading track…' }));

    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    form.append('artist', artist);
    form.append('description', description);
    form.append('duration', String(duration));
    if (cover) form.append('cover', cover);

    // XHR rather than fetch, purely for upload progress — `fetch` still has no
    // request-side progress event in any shipping browser.
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable) return;
      const percent = Math.round((e.loaded / e.total) * 100);
      setProgress(percent);
      if (percent >= 100) {
        // The bytes are up; the server is now decoding and charting, which is
        // the slow part and has no progress to report.
        setStatusText(t('status-analyzing', { defaultValue: 'Analyzing audio…' }));
      }
    });

    xhr.addEventListener('load', () => {
      setUploading(false);
      let body: { error?: string; notes?: Record<string, number> } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON body — fall through to the generic message.
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        const expert = body.notes?.expert;
        toast.success(
          expert
            ? t('upload-success-notes', {
                defaultValue: 'Track uploaded — {{count}} notes charted.',
                count: expert,
              })
            : t('upload-success', { defaultValue: 'Track uploaded and map generated.' }),
        );
        onDone();
        return;
      }
      // Surface what the server actually said: "you already uploaded this
      // track", "you have reached your upload limit" and "that file could not
      // be decoded" are all things the user can act on.
      toast.error(body.error || t('upload-failed', { defaultValue: 'Upload failed' }));
    });

    xhr.addEventListener('error', () => {
      setUploading(false);
      toast.error(t('upload-error', { defaultValue: 'Upload error' }));
    });

    xhr.open('POST', '/api/slice-it/songs/upload');
    xhr.send(form);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {!file ? (
        <label className="p-8 border-2 border-dashed border-slice-shadow-dark/50 rounded-xl flex flex-col items-center justify-center text-slice-text-muted relative h-56 cursor-pointer">
          <input
            type="file"
            accept="audio/*"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => void pickAudio(e)}
          />
          <Upload className="w-12 h-12 mb-4 text-slice-text-light" aria-hidden />
          <span className="font-bold text-lg">
            {t('click-to-select', { defaultValue: 'Click to select audio file' })}
          </span>
          <span className="text-sm text-slice-text-light mt-2">
            {t('supported-formats', { defaultValue: 'MP3, WAV, OGG and FLAC — up to 50 MB' })}
          </span>
        </label>
      ) : (
        <div className="space-y-4">
          <div className="p-3 bg-slice-card-bg rounded-xl border border-slice-shadow-dark/50 flex items-center justify-between gap-2">
            <span className="font-bold text-blue-600 truncate">{file.name}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)}>
              {t('change', { defaultValue: 'Change' })}
            </Button>
          </div>

          <div className="flex gap-4">
            <label className="w-24 h-24 shrink-0 rounded-xl bg-slice-shadow-dark/40 border border-dashed border-slice-shadow-dark relative overflow-hidden flex items-center justify-center cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={pickCover}
              />
              {coverPreview ? (
                <img src={coverPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="flex flex-col items-center text-slice-text-light text-[10px] font-bold uppercase">
                  <ImageIcon className="w-6 h-6 mb-1" aria-hidden />
                  {t('cover-art', { defaultValue: 'Cover' })}
                </span>
              )}
            </label>

            <div className="flex-1 space-y-3 min-w-0">
              <Field
                label={t('label-title', { defaultValue: 'Title' })}
                value={title}
                onChange={setTitle}
              />
              <Field
                label={t('label-artist', { defaultValue: 'Artist' })}
                value={artist}
                onChange={setArtist}
              />
            </div>
          </div>

          <Field
            label={t('label-description', { defaultValue: 'Description (Optional)' })}
            value={description}
            onChange={setDescription}
            placeholder={t('description-placeholder', {
              defaultValue: 'Tell us about this track…',
            })}
          />
        </div>
      )}

      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-bold text-slice-text-muted uppercase">
            <span>{statusText}</span>
            {progress > 0 && progress < 100 && <span>{progress}%</span>}
          </div>
          <div className="w-full h-3 bg-slice-shadow-dark rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 origin-left transition-transform duration-300"
              style={{ transform: `scaleX(${Math.max(5, progress) / 100})` }}
            />
          </div>
        </div>
      )}

      <Button
        type="submit"
        disabled={uploading || !file}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold h-12 rounded-xl"
      >
        {uploading
          ? t('processing', { defaultValue: 'PROCESSING…' })
          : t('upload-track-title', { defaultValue: 'UPLOAD TRACK' })}
      </Button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-slice-text-light uppercase">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-slice-card-bg text-slice-text border border-slice-shadow-dark/30"
      />
    </label>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function sortLabel(sort: SongSort, t: (key: string, opts: { defaultValue: string }) => string) {
  switch (sort) {
    case 'recent':
      return t('sort-recent', { defaultValue: 'Newest' });
    case 'popular':
      return t('sort-popular', { defaultValue: 'Most played' });
    case 'liked':
      return t('sort-liked', { defaultValue: 'Most liked' });
    case 'title':
      return t('sort-title', { defaultValue: 'Title' });
    case 'duration':
      return t('sort-duration', { defaultValue: 'Shortest' });
  }
}
