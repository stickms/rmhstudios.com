'use client';

/**
 * S8 — setlists, and S2 — courses, in one panel.
 *
 * They share a screen because they share their data: a course IS a setlist,
 * played with the health gauge forced on and carried between songs. Splitting
 * them into two screens would mean two ways to build the same ordered list of
 * songs.
 *
 * ## What lives where
 *
 * - The order is an array column (`SliceSetlist.songIds`) and the editor sends
 *   the whole array. There is no move/insert endpoint, because for an array the
 *   new array IS the move — see `app/routes/api/slice-it/setlists/$id.ts`.
 * - "Liked Songs" is virtual, assembled from `SongLike` server-side. It is not
 *   editable here, and there is nothing to save: liking a song is how you edit
 *   it.
 * - The course reducer is `lib/slice-it/course.ts` — pure, and the only place
 *   that decides whether a course continues, completes or fails.
 *
 * ## Playing through
 *
 * Sequential playback survives `MainMenu` unmounting the same way the daily
 * does: the "what happens when this run ends" handler is armed on `runTracker`,
 * outside React, and re-arms itself for the next song. See that module.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronDown,
  ChevronUp,
  Heart,
  ListMusic,
  Loader2,
  Play,
  Plus,
  Search,
  Swords,
  Trash2,
} from 'lucide-react';
import { useSliceItStore } from '@/lib/slice-it/store';
import {
  MAX_COURSE_SONGS,
  MIN_COURSE_SONGS,
  advance,
  courseModifiers,
  courseFromSongs,
  coursePosition,
  currentSongId,
  type CourseState,
} from '@/lib/slice-it/course';
import type { GameEngine } from '@/lib/slice-it/engine';
import type { SliceSong } from '@/lib/slice-it/types';
import type { ResolvedSetlist, SetlistSummary } from '@/lib/slice-it/setlist.server';
import { armRunFinish, disarmRunFinish } from './runTracker';

const LIKED_ID = 'liked';

interface SetlistPanelProps {
  engine: GameEngine | null;
  onPlay: (songId: string) => Promise<void>;
  onBack: () => void;
}

interface SetlistIndex {
  mine: SetlistSummary[];
  public: SetlistSummary[];
  liked: { id: string; songCount: number } | null;
}

/** The banner shown while a set or a course is running. */
interface RunProgress {
  kind: 'setlist' | 'course';
  label: string;
  position: string;
  health?: number;
  score: number;
}

export function SetlistPanel({ engine, onPlay, onBack }: SetlistPanelProps) {
  const { t } = useTranslation('r-slice-it');
  const [index, setIndex] = React.useState<SetlistIndex | null>(null);
  const [open, setOpen] = React.useState<ResolvedSetlist | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SliceSong[]>([]);
  const [progress, setProgress] = React.useState<RunProgress | null>(null);

  const loadIndex = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/slice-it/setlists');
      if (!res.ok) throw new Error(String(res.status));
      setIndex((await res.json()) as SetlistIndex);
      setError(null);
    } catch {
      setError(t('setlist-load-failed', { defaultValue: 'Could not load setlists.' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  const openSetlist = React.useCallback(async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/slice-it/setlists/${id}`);
      if (!res.ok) throw new Error(String(res.status));
      setOpen((await res.json()) as ResolvedSetlist);
    } catch {
      setOpen(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const create = React.useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch('/api/slice-it/setlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, songIds: [] }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setNewName('');
      setOpen((await res.json()) as ResolvedSetlist);
      await loadIndex();
    } catch {
      setError(t('setlist-create-failed', { defaultValue: 'Could not create that setlist.' }));
    } finally {
      setBusy(false);
    }
  }, [newName, loadIndex, t]);

  /** Persist the whole array. The order is the data; there is nothing else to send. */
  const save = React.useCallback(
    async (setlist: ResolvedSetlist, songIds: string[], patch: Record<string, unknown> = {}) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/slice-it/setlists/${setlist.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songIds, ...patch }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setOpen((await res.json()) as ResolvedSetlist);
        await loadIndex();
      } catch {
        setError(t('setlist-save-failed', { defaultValue: 'Could not save that setlist.' }));
      } finally {
        setBusy(false);
      }
    },
    [loadIndex, t],
  );

  const remove = React.useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await fetch(`/api/slice-it/setlists/${id}`, { method: 'DELETE' });
        setOpen(null);
        await loadIndex();
      } finally {
        setBusy(false);
      }
    },
    [loadIndex],
  );

  const search = React.useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/slice-it/songs?q=${encodeURIComponent(q)}&limit=10`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { songs: SliceSong[] };
      setResults(data.songs ?? []);
    } catch {
      setResults([]);
    }
  }, [query]);

  /* ── Playback ─────────────────────────────────────────────────────── */

  /**
   * Play a list straight through, one song after the next.
   *
   * Each run re-arms the tracker for the following song, so the chain is driven
   * by run completions rather than by a timer or by this component staying
   * mounted — it will not be.
   */
  const playThrough = React.useCallback(
    (label: string, songIds: string[]) => {
      if (!engine || songIds.length === 0) return;
      let total = 0;

      const step = (i: number) => {
        setProgress({
          kind: 'setlist',
          label,
          position: `${i + 1} / ${songIds.length}`,
          score: total,
        });
        armRunFinish(engine, (stats) => {
          total += stats.score;
          const next = i + 1;
          if (next >= songIds.length) {
            setProgress(null);
            return;
          }
          step(next);
          void onPlay(songIds[next]).catch(() => {
            disarmRunFinish();
            setProgress(null);
          });
        });
      };

      step(0);
      void onPlay(songIds[0]).catch(() => {
        disarmRunFinish();
        setProgress(null);
      });
    },
    [engine, onPlay],
  );

  /**
   * Play a list as a course: one health gauge across every song.
   *
   * The gauge is forced on regardless of the player's modifier settings —
   * starting a course is opting in — and their settings are restored when the
   * course ends however it ends. `advance()` owns the decision to continue,
   * complete or fail; nothing about that lives here.
   *
   * Known gap: the engine resets health to full at the start of every song and
   * takes no starting value, so the carried gauge decides whether the course
   * continues but does not yet handicap the next song. See `course.ts`'s header
   * and `docs/_handoff/solo-modes-requests.md` §1 — the fix is one argument at
   * the `onPlay` call below, and this reducer already produces the number.
   */
  const playCourse = React.useCallback(
    (label: string, songIds: string[]) => {
      if (!engine) return;
      const initial = courseFromSongs(songIds);
      if (!initial) return;

      const restore = useSliceItStore.getState().modifiers;
      useSliceItStore.getState().setModifiers(courseModifiers(restore));

      const finish = () => {
        useSliceItStore.getState().setModifiers(restore);
        setProgress(null);
      };

      const step = (state: CourseState) => {
        const songId = currentSongId(state);
        if (!songId) return finish();
        setProgress({
          kind: 'course',
          label,
          position: coursePosition(state),
          health: state.health,
          score: state.cumulativeScore,
        });
        armRunFinish(engine, (stats) => {
          const outcome = advance(state, {
            score: stats.score,
            health: stats.health,
            maxCombo: stats.maxCombo,
          });
          if (outcome.status !== 'continue') return finish();
          step(outcome.state);
          void onPlay(currentSongId(outcome.state) ?? '').catch(() => {
            disarmRunFinish();
            finish();
          });
        });
      };

      step(initial);
      void onPlay(songIds[0]).catch(() => {
        disarmRunFinish();
        finish();
      });
    },
    [engine, onPlay],
  );

  const playLiked = React.useCallback(async () => {
    const res = await fetch(`/api/slice-it/setlists/${LIKED_ID}`);
    if (!res.ok) return;
    const liked = (await res.json()) as ResolvedSetlist;
    if (liked.songs.length === 0) return;
    playThrough(
      t('setlist-liked', { defaultValue: 'Liked Songs' }),
      liked.songs.map((s) => s.id),
    );
  }, [playThrough, t]);

  /* ── Render ───────────────────────────────────────────────────────── */

  const move = (setlist: ResolvedSetlist, from: number, to: number) => {
    if (to < 0 || to >= setlist.songs.length) return;
    const ids = setlist.songs.map((s) => s.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    void save(setlist, ids);
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto p-4 sm:p-6 gap-5">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={open ? () => setOpen(null) : onBack}
          className="text-slice-text-muted hover:text-slice-text rounded-lg font-black uppercase tracking-wide text-xs"
        >
          {t('back', { defaultValue: 'Back' })}
        </Button>
        <h2 className="flex items-center gap-2 text-lg sm:text-xl font-black uppercase tracking-tight text-slice-text">
          <ListMusic className="w-5 h-5" />
          {open ? open.name : t('setlists', { defaultValue: 'Setlists' })}
        </h2>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-slice-text-muted" />}
      </div>

      {progress && (
        <div className="neumorphic rounded-2xl p-4 flex flex-wrap items-center gap-4">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slice-text-muted">
            {progress.kind === 'course'
              ? t('course-running', { defaultValue: 'Course in progress' })
              : t('setlist-running', { defaultValue: 'Setlist in progress' })}
          </span>
          <span className="text-sm font-black text-slice-text truncate">{progress.label}</span>
          <span className="text-sm font-black tabular-nums text-slice-text-muted">
            {progress.position}
          </span>
          {progress.health !== undefined && (
            <span className="text-sm font-black tabular-nums text-slice-text-muted">
              {t('course-health', { defaultValue: 'Gauge' })} {Math.round(progress.health)}
            </span>
          )}
          <span className="ml-auto text-sm font-black tabular-nums text-slice-text">
            {progress.score.toLocaleString()}
          </span>
        </div>
      )}

      {error && <p className="neumorphic-inset rounded-2xl p-4 text-sm font-bold">{error}</p>}

      {loading && (
        <div className="flex items-center gap-2 text-slice-text-muted font-bold uppercase text-xs tracking-widest">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('loading', { defaultValue: 'Loading' })}
        </div>
      )}

      {/* ── Index ── */}
      {!open && !loading && (
        <>
          <div className="neumorphic rounded-3xl p-4 flex flex-wrap items-center gap-3">
            <Heart className="w-5 h-5 text-slice-text-muted" />
            <div className="min-w-0">
              <div className="text-sm font-black uppercase tracking-wide text-slice-text">
                {t('setlist-liked', { defaultValue: 'Liked Songs' })}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slice-text-muted">
                {index?.liked
                  ? t('setlist-liked-count', {
                      defaultValue: '{{count}} tracks',
                      count: index.liked.songCount,
                    })
                  : t('setlist-liked-hint', { defaultValue: 'Like songs to fill this' })}
              </div>
            </div>
            <Button
              onClick={() => void playLiked()}
              disabled={!engine || !index?.liked || index.liked.songCount === 0}
              className="ml-auto neumorphic rounded-2xl px-5 font-black uppercase tracking-widest text-slice-text disabled:opacity-50"
            >
              <Play className="w-4 h-4 mr-1.5" />
              {t('play', { defaultValue: 'Play' })}
            </Button>
          </div>

          <div className="neumorphic rounded-3xl p-4 flex flex-wrap items-center gap-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={80}
              placeholder={t('setlist-new-name', { defaultValue: 'New setlist name' })}
              className="neumorphic-inset flex-1 min-w-[12rem] rounded-2xl border-none px-4 py-2 text-sm font-bold text-slice-text"
            />
            <Button
              onClick={() => void create()}
              disabled={busy || newName.trim().length === 0}
              className="neumorphic rounded-2xl px-5 font-black uppercase tracking-widest text-slice-text disabled:opacity-50"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {t('setlist-create', { defaultValue: 'Create' })}
            </Button>
          </div>

          <SummaryList
            heading={t('setlist-mine', { defaultValue: 'My setlists' })}
            rows={index?.mine ?? []}
            emptyLabel={t('setlist-mine-empty', {
              defaultValue: 'None yet. Make one above.',
            })}
            onOpen={(id) => void openSetlist(id)}
          />
          <SummaryList
            heading={t('setlist-public', { defaultValue: 'Shared by others' })}
            rows={index?.public ?? []}
            emptyLabel={t('setlist-public-empty', { defaultValue: 'Nothing shared yet.' })}
            onOpen={(id) => void openSetlist(id)}
          />
        </>
      )}

      {/* ── One setlist ── */}
      {open && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() =>
                playThrough(
                  open.name,
                  open.songs.map((s) => s.id),
                )
              }
              disabled={!engine || open.songs.length === 0}
              className="neumorphic rounded-2xl px-5 font-black uppercase tracking-widest text-slice-text disabled:opacity-50"
            >
              <Play className="w-4 h-4 mr-1.5" />
              {t('setlist-play-all', { defaultValue: 'Play all' })}
            </Button>
            <Button
              onClick={() =>
                playCourse(
                  open.name,
                  open.songs.slice(0, MAX_COURSE_SONGS).map((s) => s.id),
                )
              }
              disabled={!engine || open.songs.length < MIN_COURSE_SONGS}
              className="neumorphic rounded-2xl px-5 font-black uppercase tracking-widest text-slice-text disabled:opacity-50"
              title={t('course-hint', {
                defaultValue:
                  'Songs back to back on the health gauge. Finish a song with the gauge gone and the course ends there. No retries.',
              })}
            >
              <Swords className="w-4 h-4 mr-1.5" />
              {t('course-play', { defaultValue: 'Play as course' })}
            </Button>
            {open.isOwner && (
              <>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void save(
                      open,
                      open.songs.map((s) => s.id),
                      { isPublic: !open.isPublic },
                    )
                  }
                  className="rounded-2xl px-4 font-black uppercase tracking-widest text-xs text-slice-text-muted hover:text-slice-text"
                >
                  {open.isPublic
                    ? t('setlist-make-private', { defaultValue: 'Make private' })
                    : t('setlist-share', { defaultValue: 'Share' })}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void remove(open.id)}
                  className="rounded-2xl px-4 font-black uppercase tracking-widest text-xs text-slice-text-muted hover:text-slice-text"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  {t('delete', { defaultValue: 'Delete' })}
                </Button>
              </>
            )}
            <span className="text-[10px] font-black uppercase tracking-widest text-slice-text-muted">
              {t('course-requires', {
                defaultValue: 'Course: {{min}}–{{max}} songs, one shared gauge',
                min: MIN_COURSE_SONGS,
                max: MAX_COURSE_SONGS,
              })}
            </span>
          </div>

          {open.missingCount > 0 && (
            <p className="neumorphic-inset rounded-2xl p-3 text-[11px] font-bold uppercase tracking-widest text-slice-text-muted">
              {t('setlist-missing', {
                defaultValue: '{{count}} track(s) in this setlist no longer exist.',
                count: open.missingCount,
              })}
            </p>
          )}

          <ol className="flex flex-col gap-2">
            {open.songs.map((song, i) => (
              <li
                key={`${song.id}-${i}`}
                className="neumorphic-inset rounded-2xl px-3 py-2 flex items-center gap-3"
              >
                <span className="w-6 text-xs font-black tabular-nums text-slice-text-muted">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-slice-text">{song.title}</div>
                  <div className="truncate text-[11px] font-bold text-slice-text-muted">
                    {song.artist}
                  </div>
                </div>
                {open.isOwner && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-slice-text-muted hover:text-slice-text"
                      onClick={() => move(open, i, i - 1)}
                    >
                      <span className="sr-only">{t('move-up', { defaultValue: 'Move up' })}</span>
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-slice-text-muted hover:text-slice-text"
                      onClick={() => move(open, i, i + 1)}
                    >
                      <span className="sr-only">
                        {t('move-down', { defaultValue: 'Move down' })}
                      </span>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-slice-text-muted hover:text-slice-text"
                      onClick={() =>
                        void save(
                          open,
                          open.songs.filter((_, j) => j !== i).map((s) => s.id),
                        )
                      }
                    >
                      <span className="sr-only">{t('remove', { defaultValue: 'Remove' })}</span>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ol>

          {open.isOwner && (
            <div className="neumorphic rounded-3xl p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void search();
                  }}
                  maxLength={120}
                  placeholder={t('setlist-search', { defaultValue: 'Search tracks to add' })}
                  className="neumorphic-inset flex-1 min-w-[12rem] rounded-2xl border-none px-4 py-2 text-sm font-bold text-slice-text"
                />
                <Button
                  onClick={() => void search()}
                  className="neumorphic rounded-2xl px-5 font-black uppercase tracking-widest text-slice-text"
                >
                  <Search className="w-4 h-4 mr-1.5" />
                  {t('search', { defaultValue: 'Search' })}
                </Button>
              </div>
              {results.map((song) => (
                <button
                  key={song.id}
                  type="button"
                  className="neumorphic-inset rounded-2xl px-3 py-2 flex items-center gap-3 text-left"
                  onClick={() => void save(open, [...open.songs.map((s) => s.id), song.id])}
                >
                  <Plus className="w-4 h-4 text-slice-text-muted shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slice-text">
                    {song.title}
                  </span>
                  <span className="min-w-0 truncate text-[11px] font-bold text-slice-text-muted">
                    {song.artist}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryList({
  heading,
  rows,
  emptyLabel,
  onOpen,
}: {
  heading: string;
  rows: SetlistSummary[];
  emptyLabel: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="neumorphic rounded-3xl p-4">
      <h3 className="text-sm font-black uppercase tracking-widest text-slice-text mb-3">
        {heading}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs font-bold uppercase tracking-widest text-slice-text-muted">
          {emptyLabel}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className="neumorphic-inset w-full rounded-2xl px-3 py-2 flex items-center gap-3 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-black text-slice-text">
                  {row.name}
                </span>
                <span className="text-[11px] font-bold text-slice-text-muted truncate">
                  {row.ownerName}
                </span>
                <span className="text-[11px] font-black tabular-nums text-slice-text-muted">
                  {row.songCount}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
