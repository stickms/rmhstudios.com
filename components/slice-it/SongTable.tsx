'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  LIBRARY_TABLE_COLUMNS,
  formatSongDuration,
  type LibrarySong,
  type LibrarySort,
  type SortDirection,
} from '@/lib/slice-it/library-filters';
import type { SliceSong } from '@/lib/slice-it/types';

interface SongTableProps {
  songs: LibrarySong[];
  sort: LibrarySort;
  dir: SortDirection;
  /** Column header was clicked — `SongLibrary` owns the toggle-direction logic. */
  onSortChange: (column: LibrarySort) => void;
  onSelect: (song: SliceSong) => void;
  onHighlight: (song: SliceSong) => void;
  selectedSongId: string | null;
  /** Whether "Your best" is meaningful — false disables that column's sort. */
  authed: boolean;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** Hides the per-row Play action, mirroring the grid's `readOnly` behaviour. */
  readOnly?: boolean;
  /** Scroll container height class — the parent owns layout, this owns rows. */
  className?: string;
}

/** Fixed row height. Every cell is a single truncated line, so rows never
 *  reflow and a measured (ResizeObserver-driven) virtualizer buys nothing. */
const ROW_HEIGHT = 52;
const OVERSCAN = 10;

/**
 * The song library, as a table.
 *
 * L13 — sortable columns for title, artist, BPM, duration, the viewer's best
 * score, and play count. Rows are virtualized (`@tanstack/react-virtual`, the
 * same library `components/feed/FeedList.tsx` uses for the timeline) rather
 * than paged, because a table exists to be scanned — see the module doc on
 * `app/routes/api/slice-it/songs.ts` for why sorting itself still happens on
 * the server and never touches the loaded page.
 *
 * Virtualization keeps real `<table>`/`<tr>`/`<td>` markup — no `display:
 * grid` override, which some browser/AT combinations treat as discarding the
 * element's implicit table semantics — and instead windows the *rows*: two
 * spacer `<tr>`s (above and below the rendered slice) stand in for the rows
 * that are not mounted, sized to match `getTotalSize()`. This is the same
 * "windowed rows in a real table" technique TanStack's own virtualized-table
 * examples use, just without `measureElement` (see `ROW_HEIGHT` above).
 */
export function SongTable({
  songs,
  sort,
  dir,
  onSortChange,
  onSelect,
  onHighlight,
  selectedSongId,
  authed,
  hasMore,
  loading,
  onLoadMore,
  readOnly = false,
  className,
}: SongTableProps) {
  const { t } = useTranslation('r-slice-it');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const sentinelRef = React.useRef<HTMLTableRowElement>(null);

  const virtualizer = useVirtualizer({
    count: songs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    getItemKey: (index) => songs[index]?.id ?? index,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  // Auto-fetch the next page as the scroll nears the bottom — no "Load more"
  // button. A table exists to be scanned, and a button every N rows defeats
  // that the same way pagination would.
  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) onLoadMore();
      },
      { root, rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  const ariaSortFor = (key: LibrarySort): 'ascending' | 'descending' | 'none' => {
    if (sort !== key) return 'none';
    return dir === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <div ref={scrollRef} className={cn('overflow-y-auto overflow-x-auto', className)}>
      <table className="w-full text-sm border-collapse">
        <thead className="neumorphic-inset sticky top-0 z-10">
          <tr>
            {LIBRARY_TABLE_COLUMNS.map((col) => {
              const disabled = col.requiresAuth && !authed;
              const active = sort === col.key;
              const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSortFor(col.key)}
                  className={cn(
                    'p-0 font-bold text-slice-text-muted whitespace-nowrap',
                    col.numeric ? 'text-right' : 'text-left',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSortChange(col.key)}
                    disabled={disabled}
                    title={
                      disabled
                        ? t('table-sort-signin-required', {
                            defaultValue: 'Sign in to sort by this column',
                          })
                        : undefined
                    }
                    className={cn(
                      'flex w-full items-center gap-1 px-3 py-2.5 text-xs uppercase tracking-wide transition-colors touch-target',
                      col.numeric && 'justify-end',
                      disabled
                        ? 'cursor-not-allowed opacity-40'
                        : 'hover:text-slice-text active:text-blue-500',
                      active && 'text-slice-text',
                    )}
                  >
                    {col.numeric && <Icon className="w-3 h-3 shrink-0" aria-hidden />}
                    <span className="truncate">{t(col.labelKey, { defaultValue: col.defaultLabel })}</span>
                    {!col.numeric && <Icon className="w-3 h-3 shrink-0" aria-hidden />}
                  </button>
                </th>
              );
            })}
            <th scope="col" className="p-0">
              <span className="sr-only">{t('table-col-actions', { defaultValue: 'Actions' })}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden style={{ height: paddingTop }}>
              <td colSpan={LIBRARY_TABLE_COLUMNS.length + 1} style={{ padding: 0, border: 0 }} />
            </tr>
          )}

          {virtualRows.map((virtualRow) => {
            const song = songs[virtualRow.index];
            if (!song) return null;
            const selected = selectedSongId === song.id;
            return (
              <tr
                key={song.id}
                data-index={virtualRow.index}
                // `aria-current` is the right attribute here: this is a plain
                // <table>, and the selection attribute it replaces is only
                // meaningful on a row inside a `grid`/`treegrid`. "The row whose
                // details are open" is exactly what `aria-current` means.
                //
                // It also keeps the row divider below from reading as an
                // active-tab underline to `design-consistency.test.ts` §16.2,
                // which greps source text: every row here carries `border-b`, so
                // it is a separator, not a state marker.
                aria-current={selected}
                onClick={() => onHighlight(song)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onHighlight(song);
                }}
                tabIndex={0}
                style={{ height: ROW_HEIGHT }}
                className={cn(
                  'cursor-pointer border-b border-slice-shadow-dark/30 transition-colors hover:bg-slice-shadow-dark/20',
                  selected && 'bg-blue-500/10',
                )}
              >
                <td className="px-3 py-2 min-w-0 max-w-0 w-[32%]">
                  <span className="block truncate font-bold text-slice-text">{song.title}</span>
                </td>
                <td className="px-3 py-2 min-w-0 max-w-0 w-[22%]">
                  <span className="block truncate text-slice-text-muted">{song.artist}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slice-text-muted whitespace-nowrap">
                  {song.bpm > 0 ? Math.round(song.bpm) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slice-text-muted whitespace-nowrap">
                  {formatSongDuration(song.duration)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slice-text-muted whitespace-nowrap">
                  {song.bestScore !== null ? song.bestScore.toLocaleString() : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slice-text-muted whitespace-nowrap">
                  {song.plays.toLocaleString()}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {!readOnly && (
                    <Button
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(song);
                      }}
                      className="h-8 w-8 rounded-lg bg-blue-500 text-white hover:bg-blue-600 touch-target"
                      aria-label={t('play-song', {
                        defaultValue: 'Play {{title}}',
                        title: song.title,
                      })}
                    >
                      <Play className="w-3.5 h-3.5" aria-hidden />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}

          {paddingBottom > 0 && (
            <tr aria-hidden style={{ height: paddingBottom }}>
              <td colSpan={LIBRARY_TABLE_COLUMNS.length + 1} style={{ padding: 0, border: 0 }} />
            </tr>
          )}

          <tr ref={sentinelRef} aria-hidden>
            <td colSpan={LIBRARY_TABLE_COLUMNS.length + 1} style={{ padding: 0, height: 1, border: 0 }} />
          </tr>
        </tbody>
      </table>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-slice-text-light" aria-hidden />
        </div>
      )}
    </div>
  );
}
