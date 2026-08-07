'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  Heart,
  History,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Loader2,
  Pause,
  Play,
  Search,
  Shuffle,
  Table2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useSession } from '@/components/Providers';
import { useSliceItStore } from '@/lib/slice-it/store';
import { PREVIEW_SECONDS, previewFragment } from '@/lib/slice-it/preview';
import { timeAgoShort } from '@/lib/utils';
import {
  AUDIO_MAX_BYTES,
  COVER_MAX_BYTES,
  MAX_SONG_DURATION_SEC,
  SONGS_PAGE_SIZE_MAX,
  SONG_SORTS,
  type SongSort,
} from '@/lib/slice-it/constants';
import {
  DEFAULT_RANDOM_CONSTRAINTS,
  LIBRARY_TABLE_COLUMNS,
  formatSongDuration,
  normalizeLibrarySearch,
  type LibrarySearch,
  type LibrarySong,
  type LibrarySongPage,
  type LibrarySort,
  type RandomConstraints,
} from '@/lib/slice-it/library-filters';
import type { SliceSong } from '@/lib/slice-it/types';
import { artistPath } from '@/lib/slice-it/artist';
import { NeumorphicModal } from './NeumorphicModal';
import { SongTable } from './SongTable';
import { PackPanel } from './packs/PackPanel';

/**
 * One entry of the artist facet (L15), as `/api/slice-it/songs/artists`
 * returns it. A structural type rather than an import of `ArtistSummary`,
 * which lives in a `.server` module.
 */
interface ArtistChip {
  key: string;
  display: string;
  songCount: number;
}

/**
 * V8 — the hover density strip: sixty-four bars, one per bucket of
 * `songs.server.ts#densityStrip`, previewing where a chart is busy without
 * ever fetching the chart itself.
 *
 * Pure CSS opacity/height, not a canvas — this sits on a list row repeated
 * dozens of times, which is exactly the surface `.glass-fill`/budget rules
 * exist for, and a 64-bar CSS reveal costs nothing this screen's frame timing
 * has to account for.
 */
function DensityStrip({ density }: { density?: number[] }) {
  if (!density || density.length === 0) return null;
  return (
    <div
      className="absolute inset-x-0 bottom-0 h-3.5 flex items-end gap-px px-0.5 opacity-0 group-hover:opacity-80 transition-opacity duration-150 pointer-events-none"
      aria-hidden
    >
      {density.map((value, i) => (
        <span
          key={i}
          className="flex-1 min-w-px bg-blue-300 rounded-t-[1px]"
          style={{ height: `${Math.max(8, (value / 255) * 100)}%` }}
        />
      ))}
    </div>
  );
}

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
 * ## What changed (original)
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
 *
 * ## What changed (this pass — L13, L17, L18, S9)
 *
 * - **A table view (L13), alongside the grid.** `SongTable` is virtualized and
 *   NOT paged (auto-fetches as you scroll) because a table exists to be
 *   scanned; the grid keeps its "Load more" button and stays the default —
 *   see the toggle below the search row.
 * - **Filters live in the URL now (L18).** `search`/`sort`/`view` used to be
 *   `useState` here, which is the exact thing this file's own history section
 *   warns about not doing again for *sorting* — state that does not survive a
 *   navigation is a smaller version of the same bug. They are now
 *   `/slice-it/`'s validated search params (`lib/slice-it/library-filters.ts`),
 *   so a shared link, a refresh, or the back button all land on the same view.
 * - **A recently-played shelf (L17).** Reads the `SongPlay` rows that were
 *   already written on every play and never read back as a list.
 * - **A random/roulette pick (S9).** Constrained by duration range, unplayed,
 *   or liked-only; picked server-side via `random=1` on the same route.
 */
export function SongLibrary({
  onSelect,
  onHighlight,
  selectedSongId,
  onStopPreviewRef,
  readOnly = false,
}: SongLibraryProps) {
  const { t } = useTranslation('c-game');
  const { t: ts } = useTranslation('r-slice-it');
  const { data: session } = useSession();
  const volume = useSliceItStore((s) => s.volume);

  /* ── Filters (L18): URL search params, not component state ─────────────── */

  const navigate = useNavigate();
  const rawSearch = useSearch({ strict: false });
  const filters = React.useMemo(() => normalizeLibrarySearch(rawSearch), [rawSearch]);

  const setFilters = React.useCallback(
    (patch: Partial<LibrarySearch>) => {
      void navigate({
        to: '/slice-it',
        // A filter change is a refinement of the same view, not a new page —
        // `replace` keeps the back button one press per *navigation*, not one
        // press per sort click.
        replace: true,
        search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
      });
    },
    [navigate],
  );

  const [songs, setSongs] = React.useState<LibrarySong[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [packsOpen, setPacksOpen] = React.useState(false);
  const [likingId, setLikingId] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  /* ── Search box: local keystrokes, debounced into the URL ──────────────── */

  const [searchInput, setSearchInput] = React.useState(filters.q);
  const lastPushedQ = React.useRef(filters.q);

  // Back/forward or a pasted link changes `filters.q` without going through
  // this component's own debounce below — keep the box in sync with those.
  React.useEffect(() => {
    if (filters.q !== lastPushedQ.current) {
      setSearchInput(filters.q);
      lastPushedQ.current = filters.q;
    }
  }, [filters.q]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed === filters.q) return;
      lastPushedQ.current = trimmed;
      setFilters({ q: trimmed });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `filters.q`/`setFilters` intentionally excluded: this timer reacts to typing, not to the URL it itself writes.
  }, [searchInput]);

  /* ── Fetching ────────────────────────────────────────────────────────── */

  const load = React.useCallback(
    async (cursor: string | null, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ sort: filters.sort });
        if (filters.dir) params.set('dir', filters.dir);
        if (filters.q) params.set('q', filters.q);
        // L15 — the artist facet. A normalised key, never the display string:
        // the whole point of the key is that this is an indexed equality
        // filter rather than the substring search it replaces.
        if (filters.artist) params.set('artist', filters.artist);
        if (cursor) params.set('cursor', cursor);
        // The table is scanned, not paged — a bigger page means fewer
        // round-trips while scrolling instead of a "Load more" click.
        if (filters.view === 'table') params.set('limit', String(SONGS_PAGE_SIZE_MAX));

        const response = await fetch(`/api/slice-it/songs?${params}`);
        if (!response.ok) throw new Error(String(response.status));
        const page = (await response.json()) as LibrarySongPage;

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
    [filters.sort, filters.dir, filters.q, filters.artist, filters.view, t],
  );

  React.useEffect(() => {
    void load(null, false);
    // Re-fetches whenever the *server-relevant* filters change — `view` is
    // included because table view asks for a bigger page.
  }, [load]);

  /* ── Artist facet (L15) ─────────────────────────────────────────────────── */

  /**
   * The chips come from a grouped aggregate over the whole library
   * (`/api/slice-it/songs/artists`), NOT from the page of songs currently
   * loaded. Deriving them from `songs` would list the artists on page 1 rather
   * than the artists in the library, and would change every time you scrolled.
   *
   * Fetched once per mount: the facet is viewer-independent and changes only on
   * upload, and the response is cacheable for exactly that reason.
   */
  const [artistFacet, setArtistFacet] = React.useState<ArtistChip[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/slice-it/songs/artists?limit=12')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((data: { artists: ArtistChip[] }) => {
        if (!cancelled) setArtistFacet(data.artists);
      })
      .catch(() => {
        // A missing facet is a missing row of chips, not a broken library.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** The chip for the artist currently filtered on, when it is in the facet. */
  const activeArtist = React.useMemo(
    () => artistFacet.find((a) => a.key === filters.artist) ?? null,
    [artistFacet, filters.artist],
  );

  /* ── Recently played shelf (L17) ────────────────────────────────────────── */

  const [recentSongs, setRecentSongs] = React.useState<LibrarySong[]>([]);

  React.useEffect(() => {
    if (!session) {
      setRecentSongs([]);
      return;
    }
    let cancelled = false;
    fetch('/api/slice-it/songs?shelf=recent')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((data: { songs: LibrarySong[] }) => {
        if (!cancelled) setRecentSongs(data.songs);
      })
      .catch(() => {
        if (!cancelled) setRecentSongs([]);
      });
    return () => {
      cancelled = true;
    };
    // Session id, not the object — Better Auth returns a fresh session object
    // on unrelated refreshes and re-fetching a 12-row shelf on every one would
    // be wasted work.
  }, [session?.user?.id]);

  const showRecentShelf =
    !readOnly && session && filters.view === 'grid' && !filters.q && recentSongs.length > 0;

  /* ── Random / roulette (S9) ─────────────────────────────────────────────── */

  const [randomOpen, setRandomOpen] = React.useState(false);
  const [randomLoading, setRandomLoading] = React.useState(false);
  const [randomConstraints, setRandomConstraints] = React.useState<RandomConstraints>(
    DEFAULT_RANDOM_CONSTRAINTS,
  );

  const rollRandom = async () => {
    setRandomLoading(true);
    try {
      const params = new URLSearchParams({ random: '1' });
      if (randomConstraints.durationMin !== undefined) {
        params.set('durationMin', String(randomConstraints.durationMin));
      }
      if (randomConstraints.durationMax !== undefined) {
        params.set('durationMax', String(randomConstraints.durationMax));
      }
      if (randomConstraints.unplayedOnly) params.set('unplayedOnly', 'true');
      if (randomConstraints.likedOnly) params.set('likedOnly', 'true');

      const response = await fetch(`/api/slice-it/songs?${params}`);
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { song: LibrarySong | null };
      if (!body.song) {
        toast.error(
          ts('random-no-match', { defaultValue: 'No song matches those constraints.' }),
        );
        return;
      }
      setRandomOpen(false);
      onHighlight(body.song);
    } catch {
      toast.error(ts('random-failed', { defaultValue: 'Could not pick a random song.' }));
    } finally {
      setRandomLoading(false);
    }
  };

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

    // C7 — start at the song's preview point rather than at 0. Previewing the
    // first 20 seconds of a track is previewing its intro, which is the part
    // least likely to tell anyone whether they want to play it.
    //
    // The `#t=` media fragment rather than a `currentTime` seek: the fragment
    // is part of the URL, so the browser issues ONE range request for the bytes
    // it needs instead of fetching the head of the file and seeking into it.
    // That is what makes previewing a 6 MB track affordable at all.
    const start = song.previewStart ?? 0;
    const audio = new Audio(previewFragment(song.audioUrl, start));
    audio.volume = volume / 100;
    audio.onended = () => setPreviewId(null);
    // The fragment's END bound is honoured inconsistently across browsers, so
    // the stop is enforced here too. Without it a preview on an engine that
    // ignores it plays the rest of the song.
    audio.ontimeupdate = () => {
      if (audio.currentTime >= start + PREVIEW_SECONDS) {
        audio.pause();
        setPreviewId(null);
      }
    };
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

  /* ── View toggle + sort handling ────────────────────────────────────────── */

  const viewTabs: LiquidTab[] = [
    { id: 'grid', label: ts('view-grid', { defaultValue: 'Grid' }), icon: LayoutGrid },
    { id: 'table', label: ts('view-table', { defaultValue: 'Table' }), icon: Table2 },
  ];

  const handleViewChange = (next: string) => {
    if (next !== 'grid' && next !== 'table') return;
    // The grid's dropdown only ever offered the five base sorts — switching
    // back to it while a table-only column (e.g. `bpm`) is active would leave
    // the `<select>` with nothing matching, so land it back on `recent`.
    const gridCompatible = (SONG_SORTS as readonly string[]).includes(filters.sort);
    if (next === 'grid' && !gridCompatible) {
      setFilters({ view: next, sort: 'recent', dir: undefined });
    } else {
      setFilters({ view: next });
    }
  };

  const handleTableSort = (column: LibrarySort) => {
    if (filters.sort === column) {
      setFilters({ dir: filters.dir === 'asc' ? 'desc' : 'asc' });
      return;
    }
    const col = LIBRARY_TABLE_COLUMNS.find((c) => c.key === column);
    setFilters({ sort: column, dir: col?.defaultDir ?? 'asc' });
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="w-full h-full bg-slice-bg flex flex-col">
      <div className="flex flex-wrap gap-2 items-center shrink-0 p-3 border-b border-slice-shadow-dark/50">
        <div className="relative flex-1 min-w-[10rem]">
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={t('search-placeholder', { defaultValue: 'Search songs, artists...' })}
          />
        </div>

        {filters.view === 'grid' && (
          <select
            value={filters.sort}
            onChange={(e) => setFilters({ sort: e.target.value as SongSort, dir: undefined })}
            className="h-9 pointer-coarse:h-11 shrink-0 max-w-28 rounded-lg bg-slice-card-bg border border-slice-shadow-dark/50 text-xs font-bold text-slice-text px-2"
            aria-label={t('sort-by', { defaultValue: 'Sort by' })}
          >
            {SONG_SORTS.map((option) => (
              <option key={option} value={option}>
                {sortLabel(option, t)}
              </option>
            ))}
          </select>
        )}

        {/* L13 — grid/table view toggle. `LiquidTabs` (not a hand-rolled
            toggle group) sitting in a `.neumorphic-inset` well, the same
            neumorphic-treatment-around-a-sanctioned-primitive pattern
            `editor/DifficultyTabs.tsx` uses for its difficulty strip. */}
        <div className="neumorphic-inset shrink-0 w-[9.5rem] p-1">
          <LiquidTabs
            tabs={viewTabs}
            value={filters.view}
            onChange={handleViewChange}
            size="sm"
            sheet={false}
            aria-label={ts('view-toggle', { defaultValue: 'Library view' })}
          />
        </div>

        {!readOnly && (
          <Dialog open={randomOpen} onOpenChange={setRandomOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11 shrink-0 rounded-lg p-0 touch-target"
                aria-label={ts('random-button', { defaultValue: 'Pick a random song' })}
                title={ts('random-button', { defaultValue: 'Pick a random song' })}
              >
                <Shuffle className="w-4 h-4" aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slice-bg border-none shadow-2xl rounded-2xl max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-slice-text font-black">
                  {ts('random-title', { defaultValue: 'Surprise Me' })}
                </DialogTitle>
              </DialogHeader>
              <RandomForm
                constraints={randomConstraints}
                onChange={setRandomConstraints}
                onSubmit={() => void rollRandom()}
                loading={randomLoading}
                authed={Boolean(session)}
              />
            </DialogContent>
          </Dialog>
        )}

        {/* L16 — the pack builder's entry point. Without one, `ChartPack` is a
            model nothing can reach: two features shipped dormant on this branch
            already. */}
        {!readOnly && session && (
          <Dialog open={packsOpen} onOpenChange={setPacksOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 w-9 shrink-0 rounded-lg text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark/30 p-0 touch-target"
                aria-label={ts('packs-title', { defaultValue: 'Packs' })}
              >
                <Layers className="w-4 h-4" aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slice-bg border-none shadow-2xl rounded-2xl max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-slice-text font-black">
                  {ts('packs-title', { defaultValue: 'Packs' })}
                </DialogTitle>
              </DialogHeader>
              <PackPanel />
            </DialogContent>
          </Dialog>
        )}

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

      {showRecentShelf && (
        <div className="shrink-0 border-b border-slice-shadow-dark/50 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slice-text-light mb-2">
            <History className="w-3 h-3" aria-hidden />
            {ts('recently-played', { defaultValue: 'Recently played' })}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recentSongs.map((song) => (
              <button
                key={song.id}
                type="button"
                onClick={() => onHighlight(song)}
                className="neumorphic-sm shrink-0 w-24 p-1.5 text-left touch-target"
              >
                <div className="w-full aspect-square rounded-md bg-slice-shadow-dark overflow-hidden relative mb-1">
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
                <div className="text-[11px] font-bold text-slice-text truncate">{song.title}</div>
                {song.lastPlayedAt && (
                  <div className="text-[10px] text-slice-text-light truncate">
                    {timeAgoShort(song.lastPlayedAt)}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* L15 — the artist facet. Hidden while a search is running: chips are a
          way to browse, and a query is a statement that you already know what
          you want. */}
      {!filters.q && (filters.artist || artistFacet.length > 0) && (
        <div className="shrink-0 border-b border-slice-shadow-dark/50 px-3 py-2">
          {filters.artist ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slice-text-light">
                {ts('filtered-by-artist', { defaultValue: 'Artist' })}
              </span>
              <span className="text-xs font-black text-slice-text truncate max-w-48">
                {activeArtist?.display ?? filters.artist}
              </span>
              <a
                href={artistPath(filters.artist)}
                className="text-[11px] font-bold text-blue-500 hover:underline"
              >
                {ts('open-artist-page', { defaultValue: 'Artist page' })}
              </a>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] font-bold text-slice-text-muted hover:text-slice-text"
                onClick={() => setFilters({ artist: undefined })}
              >
                {ts('clear-artist-filter', { defaultValue: 'Clear' })}
              </Button>
            </div>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {artistFacet.map((artist) => (
                <button
                  key={artist.key}
                  type="button"
                  onClick={() => setFilters({ artist: artist.key })}
                  className="neumorphic-sm shrink-0 px-2.5 py-1 text-[11px] font-bold text-slice-text-muted hover:text-slice-text touch-target"
                >
                  <span className="truncate max-w-32 inline-block align-middle">
                    {artist.display}
                  </span>
                  <span className="ml-1.5 text-slice-text-light tabular-nums">
                    {artist.songCount}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {filters.view === 'table' ? (
        <>
          {songs.length === 0 && !loading && (
            <p className="text-center text-slice-text-light py-12 text-sm font-bold">
              {filters.q
                ? t('no-search-results', {
                    defaultValue: 'Nothing matches "{{query}}".',
                    query: filters.q,
                  })
                : t('library-empty', { defaultValue: 'No tracks yet — upload the first one.' })}
            </p>
          )}
          {(songs.length > 0 || loading) && (
            <SongTable
              songs={songs}
              sort={filters.sort}
              dir={filters.dir ?? 'desc'}
              onSortChange={handleTableSort}
              onSelect={(song) => {
                stopPreview();
                onSelect(song);
              }}
              onHighlight={onHighlight}
              selectedSongId={selectedSongId}
              authed={Boolean(session)}
              hasMore={Boolean(nextCursor)}
              loading={loading}
              onLoadMore={() => void load(nextCursor, true)}
              readOnly={readOnly}
              className="flex-1 min-h-0"
            />
          )}
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {songs.length === 0 && !loading && (
            <p className="text-center text-slice-text-light py-12 text-sm font-bold">
              {filters.q
                ? t('no-search-results', {
                    defaultValue: 'Nothing matches "{{query}}".',
                    query: filters.q,
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
                      <DensityStrip density={song.densityStrip} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slice-text text-sm leading-tight truncate">
                        {song.title}
                      </div>
                      <div className="text-xs text-slice-text-muted truncate">
                        {/* L15 — the first thing anyone tries after playing a
                            track they liked. `artistKey` comes off the row, so
                            the client never re-derives it and the two cannot
                            disagree about what a key is. `stopPropagation`
                            because the whole row is also a button. */}
                        {song.artistKey ? (
                          <a
                            href={artistPath(song.artistKey)}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-slice-text hover:underline"
                          >
                            {song.artist}
                          </a>
                        ) : (
                          song.artist
                        )}
                        {song.bpm > 0 ? ` • ${Math.round(song.bpm)} BPM` : ''} •{' '}
                        {formatSongDuration(song.duration)}
                        {song.chartRating !== null && ` • ★ ${song.chartRating.toFixed(1)}`}
                      </div>
                      {/* O3 — the row stays visible while the worker charts it.
                          Hiding a pending song would read as a failed upload,
                          and it is playable either way: with no stored chart
                          the client generates one locally and patches it back,
                          which is exactly what a `failed` state falls through
                          to as well. */}
                      {song.analysisState === 'pending' && (
                        <div className="text-[10px] text-slice-text-light">
                          {t('charting', { defaultValue: 'Charting…' })}
                        </div>
                      )}
                      {song.analysisState === 'failed' && (
                        <div className="text-[10px] text-slice-text-light">
                          {t('charting-failed', {
                            defaultValue: 'Charting failed — a chart is generated on play',
                          })}
                        </div>
                      )}
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
      )}

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

/* ─── Random / roulette form (S9) ───────────────────────────────────────────── */

function RandomForm({
  constraints,
  onChange,
  onSubmit,
  loading,
  authed,
}: {
  constraints: RandomConstraints;
  onChange: (next: RandomConstraints) => void;
  onSubmit: () => void;
  loading: boolean;
  authed: boolean;
}) {
  const { t: ts } = useTranslation('r-slice-it');

  const setDuration = (key: 'durationMin' | 'durationMax', raw: string) => {
    const value = raw === '' ? undefined : Math.max(0, Math.min(MAX_SONG_DURATION_SEC, Number(raw)));
    onChange({ ...constraints, [key]: Number.isFinite(value) ? value : undefined });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-bold text-slice-text-light uppercase">
            {ts('random-duration-min', { defaultValue: 'Min length (sec)' })}
          </span>
          <Input
            type="number"
            min={0}
            max={MAX_SONG_DURATION_SEC}
            value={constraints.durationMin ?? ''}
            onChange={(e) => setDuration('durationMin', e.target.value)}
            className="bg-slice-card-bg text-slice-text border border-slice-shadow-dark/30"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-slice-text-light uppercase">
            {ts('random-duration-max', { defaultValue: 'Max length (sec)' })}
          </span>
          <Input
            type="number"
            min={0}
            max={MAX_SONG_DURATION_SEC}
            value={constraints.durationMax ?? ''}
            onChange={(e) => setDuration('durationMax', e.target.value)}
            className="bg-slice-card-bg text-slice-text border border-slice-shadow-dark/30"
          />
        </label>
      </div>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-slice-text">
          {ts('random-unplayed-only', { defaultValue: 'Only songs I have not played' })}
        </span>
        <Switch
          checked={constraints.unplayedOnly ?? false}
          onCheckedChange={(checked) => onChange({ ...constraints, unplayedOnly: checked })}
          disabled={!authed}
          aria-label={ts('random-unplayed-only', { defaultValue: 'Only songs I have not played' })}
        />
      </label>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-slice-text">
          {ts('random-liked-only', { defaultValue: 'Only songs I have liked' })}
        </span>
        <Switch
          checked={constraints.likedOnly ?? false}
          onCheckedChange={(checked) => onChange({ ...constraints, likedOnly: checked })}
          disabled={!authed}
          aria-label={ts('random-liked-only', { defaultValue: 'Only songs I have liked' })}
        />
      </label>

      {!authed && (
        <p className="text-xs text-slice-text-light">
          {ts('random-signin-hint', {
            defaultValue: 'Sign in to constrain by unplayed or liked tracks.',
          })}
        </p>
      )}

      <Button
        onClick={onSubmit}
        loading={loading}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold h-12 rounded-xl"
      >
        {ts('random-submit', { defaultValue: 'Surprise Me' })}
      </Button>
    </div>
  );
}

/* ─── Upload ─────────────────────────────────────────────────────────────── */

function UploadForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('c-game');
  const { t: ts } = useTranslation('r-slice-it');
  const { data: session } = useSession();

  const [file, setFile] = React.useState<File | null>(null);
  /**
   * L16 — tracks 2..n of an album upload.
   *
   * A separate list rather than making `file` an array: `file` is the track
   * whose ID3 tags seed the title/artist/cover fields, and every existing
   * reference in this form means "the primary track". Keeping that meaning
   * intact is what let the album path be additive rather than a rewrite of the
   * one form on the site that is exercised on every single upload.
   */
  const [extraFiles, setExtraFiles] = React.useState<File[]>([]);
  const [album, setAlbum] = React.useState('');
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
    const chosen = Array.from(event.target.files ?? []);
    const picked = chosen[0];
    if (!picked) return;

    const oversize = chosen.find((f) => f.size > AUDIO_MAX_BYTES);
    if (oversize) {
      toast.error(
        t('audio-too-large', {
          defaultValue: 'Audio file too large ({{sizeMb}} MB). Maximum size is 50 MB.',
          sizeMb: (oversize.size / 1024 / 1024).toFixed(1),
        }),
      );
      event.target.value = '';
      return;
    }

    setFile(picked);
    // Sorted by name so the album's track order is the order the files are
    // named in, which is what a ripped or downloaded album already gives you.
    // Upload order becomes pack position, and "shuffled because the OS returned
    // them that way" would be a strange album.
    setExtraFiles(chosen.slice(1).sort((a, b) => a.name.localeCompare(b.name)));
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
      // The album tag is what makes a multi-file pick an album rather than a
      // batch — and it is already in the file, so nobody has to type it.
      if (tags.common.album) setAlbum(tags.common.album);
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

    // The pack this upload creates is titled with the album, so there has to be
    // one. Checked here as well as on the server so the answer arrives before
    // fifty megabytes do.
    if (extraFiles.length > 0 && !album.trim()) {
      toast.error(
        ts('album-title-required', { defaultValue: 'An album upload needs an album title.' }),
      );
      return;
    }

    setUploading(true);
    setProgress(0);
    setStatusText(t('status-uploading', { defaultValue: 'Uploading track…' }));

    const form = new FormData();
    form.append('file', file);
    // L16 — every extra track rides in the same request, so the songs and the
    // album pack they belong to are created in one transaction. Twelve
    // sequential uploads cannot be: the eighth failing leaves seven songs and
    // no album.
    for (const extra of extraFiles) form.append('file', extra);
    form.append('title', title);
    form.append('artist', artist);
    if (album.trim()) form.append('album', album.trim());
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
            // L16 — picking several files is what makes an album upload; the
            // one-file case is unchanged and is still what happens by default.
            multiple
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
          <span className="text-xs text-slice-text-light mt-1">
            {ts('select-album-hint', {
              defaultValue: 'Pick several files to upload a whole album at once.',
            })}
          </span>
        </label>
      ) : (
        <div className="space-y-4">
          <div className="p-3 bg-slice-card-bg rounded-xl border border-slice-shadow-dark/50 flex items-center justify-between gap-2">
            <span className="font-bold text-blue-600 truncate">
              {file.name}
              {extraFiles.length > 0 && (
                <span className="text-slice-text-light font-normal">
                  {' '}
                  {ts('plus-more-tracks', {
                    defaultValue: '+ {{count}} more',
                    count: extraFiles.length,
                  })}
                </span>
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFile(null);
                setExtraFiles([]);
              }}
            >
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
              {/* An album takes each track's title from its filename — there is
                  one title field and twelve tracks — so the field only appears
                  when there is exactly one of them. */}
              {extraFiles.length === 0 && (
                <Field
                  label={t('label-title', { defaultValue: 'Title' })}
                  value={title}
                  onChange={setTitle}
                />
              )}
              <Field
                label={t('label-artist', { defaultValue: 'Artist' })}
                value={artist}
                onChange={setArtist}
              />
              <Field
                label={
                  extraFiles.length > 0
                    ? ts('label-album-required', { defaultValue: 'Album' })
                    : ts('label-album', { defaultValue: 'Album (Optional)' })
                }
                value={album}
                onChange={setAlbum}
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
    case 'difficulty':
      // C3 — `Song.chartRating`, the hardest rated chart of the song. Populated
      // and, until now, unreachable: see `docs/_handoff/rating-requests.md` §1.
      return t('sort-difficulty', { defaultValue: 'Hardest' });
  }
}
