'use client';

import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Play,
  Settings,
  X,
  Check,
  ImagePlus,
  Heart,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { artistKeyOf, artistPath } from '@/lib/slice-it/artist';
import { PackPanel } from './packs/PackPanel';
import { Leaderboard } from './Leaderboard';
import { SongComments } from './SongComments';
import { useSliceItStore } from '@/lib/slice-it/store';
import type { Difficulty, SliceSong } from '@/lib/slice-it/types';
import { Slider } from '@/components/ui/slider';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { calculateScoreMultiplier } from '@/lib/slice-it/scoring';
import { ChartPicker, type ChartOption } from './ChartPicker';
import { useTranslation } from 'react-i18next';
import { whenIdle } from '@/lib/shared/platform';

/**
 * Holds a deferred section's height while it is still deferred.
 *
 * Not decoration: without it the leaderboard and the comments would land into a
 * zero-height box and push everything under them down — trading a stutter
 * during the open for a layout shift after it.
 */
function FoldPlaceholder({ rows }: { rows: number }) {
  return (
    <div className="space-y-2" role="status" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="slice-skeleton h-8 rounded-lg" />
      ))}
    </div>
  );
}

interface SongDetailsPanelProps {
  song: SliceSong | null;
  onPlay: (song: SliceSong) => void;
  onSongUpdated?: (updates: Partial<SliceSong>) => void;
  readOnly?: boolean;
}

const ModifierToggle = ({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
}) => (
  <div
    className="flex justify-between items-center bg-slice-shadow-dark/20 hover:bg-slice-shadow-dark/50 p-2 rounded-lg border border-slice-shadow-dark/50 cursor-pointer transition-colors"
    onClick={onClick}
  >
    <span className="text-xs text-slice-text font-bold uppercase select-none">{label}</span>
    <div
      className={`w-10 h-5 rounded-full transition-colors relative ${active ? '' : 'bg-slice-shadow-dark'}`}
      style={{ backgroundColor: active ? color : undefined }}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${active ? 'translate-x-[18px]' : ''}`}
      />
    </div>
  </div>
);

export function SongDetailsPanel({
  song,
  onPlay,
  onSongUpdated,
  readOnly = false,
}: SongDetailsPanelProps) {
  const { t } = useTranslation('c-game');
  const { modifiers, setModifiers } = useSliceItStore();
  const session = authClient.useSession();
  // `isOwner` is decided by the server and shipped on the DTO. Comparing a
  // session id against a `uploadedBy` field here meant the API had to leak a
  // user id to every anonymous visitor just so the owner could see an edit
  // button.
  const isOwner = Boolean(session.data?.user?.id) && Boolean(song?.isOwner);
  // The chart editor's own authorisation (POST /api/slice-it/charts) allows the
  // song's uploader *and* admins, so the entry point matches it rather than
  // being narrower — an admin who can save a chart but cannot reach the editor
  // is a worse bug than a stray link.
  const canEditChart =
    isOwner || Boolean((session.data?.user as { isAdmin?: boolean } | undefined)?.isAdmin);

  /**
   * Whether the two below-the-fold sections have been allowed to mount yet.
   *
   * Measured: opening this panel ran a **290 ms** long task on the main thread,
   * starting one frame after the click. The panel's entrance is a spring, and a
   * spring driven across a blocked main thread does not slow down — it jumps
   * when the thread comes back. The slide covered 636px→106px in a single
   * 120 ms gap, which is what reads as the fade "playing and then restarting":
   * nothing remounts, the animation simply loses the middle of itself.
   *
   * The leaderboard and the comments are the expensive half of this subtree and
   * both are below the fold — you scroll to reach either — so neither needs to
   * exist during the ~400 ms the panel takes to arrive. `whenIdle` mounts them
   * on the first idle gap after that, with its own timeout as the backstop, and
   * a layout-matched placeholder holds their height so nothing below moves when
   * they land.
   *
   * Keyed on the song so switching tracks re-defers rather than paying the same
   * cost inside the next open.
   */
  const [belowFold, setBelowFold] = React.useState(false);

  /** L15 — the artist page link target, or null for an unkeyable artist tag. */
  const artistLinkKey = React.useMemo(() => artistKeyOf(song?.artist), [song?.artist]);
  /** L16 — the add-to-pack dialog. */
  const [packOpen, setPackOpen] = React.useState(false);

  /* ── C2 — which chart of this song ─────────────────────────────────────── */

  // Fetched separately from the song, and lazily: the picker is opened by a
  // fraction of the people who open a song, and folding it into the song read
  // would put a second query and an author join on the critical path to
  // starting a run.
  const [charts, setCharts] = React.useState<ChartOption[]>([]);
  const selectedChartId = useSliceItStore((state) => state.selectedChartId);
  const setSelectedChartId = useSliceItStore((state) => state.setSelectedChartId);
  const songId = song?.id ?? null;

  React.useEffect(() => {
    if (!songId) return;
    setBelowFold(false);
    return whenIdle(() => setBelowFold(true), 900);
  }, [songId]);

  React.useEffect(() => {
    if (!songId) {
      setCharts([]);
      return;
    }
    let cancelled = false;
    // Reset on song change rather than leaving the previous song's charts on
    // screen while this resolves — a picker showing another song's charts for
    // 200 ms is worse than no picker.
    setCharts([]);
    setSelectedChartId(null);
    void fetch(`/api/slice-it/songs/${songId}/charts`)
      .then((res) => (res.ok ? res.json() : { charts: [] }))
      .then((data: { charts?: ChartOption[] }) => {
        if (cancelled) return;
        const list = data.charts ?? [];
        setCharts(list);
        // Default to the first, which `chartsForSong` has already sorted to
        // ranked-then-public-then-hardest.
        if (list.length > 0) setSelectedChartId(list[0].id);
      })
      .catch(() => {
        // A failed chart list is not a failed song: the generated fallback is
        // still playable, and that is what an empty picker means.
      });
    return () => {
      cancelled = true;
    };
  }, [songId, setSelectedChartId]);

  // Edit state
  const [showEdit, setShowEdit] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState('');
  const [editArtist, setEditArtist] = React.useState('');
  const [editBpm, setEditBpm] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const [editCoverFile, setEditCoverFile] = React.useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const { run: runLike, pending: isLiking } = useOptimisticAction();

  const handleLike = () => {
    if (!song) return;
    const wasLiked = !!song.isLiked;
    const baseCount = song.likeCount || 0;
    runLike({
      apply: () =>
        onSongUpdated?.({ isLiked: !wasLiked, likeCount: baseCount + (wasLiked ? -1 : 1) }),
      rollback: () => onSongUpdated?.({ isLiked: wasLiked, likeCount: baseCount }),
      commit: () => fetch(`/api/slice-it/songs/${song.id}/like`, { method: 'POST' }),
      reconcile: async (res) => {
        const data = await res.json().catch(() => ({}));
        onSongUpdated?.({
          isLiked: data.liked,
          // The server returns the resulting count; deriving it from a
          // stale local base drifts as soon as anyone else likes it.
          likeCount: typeof data.likeCount === 'number' ? data.likeCount : baseCount,
        });
      },
    });
  };

  const openEdit = () => {
    if (!song) return;
    setEditTitle(song.title);
    setEditArtist(song.artist);
    setEditBpm(String(Math.round(song.bpm)));
    setEditDescription(song.description ?? '');
    setEditCoverFile(null);
    setEditCoverPreview(null);
    setShowEdit(true);
  };

  const MAX_COVER_SIZE = 10 * 1024 * 1024; // 10 MB

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_COVER_SIZE) {
      toast.error(
        t('cover-too-large', {
          defaultValue: 'Cover image too large ({{size}} MB). Maximum size is 10 MB.',
          size: (file.size / 1024 / 1024).toFixed(1),
        }),
      );
      e.target.value = '';
      return;
    }
    setEditCoverFile(file);
    const url = URL.createObjectURL(file);
    setEditCoverPreview(url);
  };

  const handleSave = async () => {
    if (!song) return;
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append('title', editTitle);
      formData.append('artist', editArtist);
      formData.append('bpm', editBpm);
      formData.append('description', editDescription);
      if (editCoverFile) formData.append('cover', editCoverFile);

      const res = await fetch(`/api/slice-it/songs/${song.id}`, {
        method: 'PATCH',
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const newCoverUrl = data.song?.coverUrl ?? song.coverUrl;
      const newBpm = parseFloat(editBpm) || song.bpm;
      onSongUpdated?.({
        title: editTitle,
        artist: editArtist,
        bpm: newBpm,
        description: editDescription,
        coverUrl: newCoverUrl,
      });
      setShowEdit(false);
      if (editCoverPreview) URL.revokeObjectURL(editCoverPreview);
      setEditCoverFile(null);
      setEditCoverPreview(null);
      toast.success(t('track-updated', { defaultValue: 'Track updated' }));
    } catch (e: any) {
      toast.error(
        t('save-failed', {
          defaultValue: 'Failed to save: {{message}}',
          message: e.message ?? t('unknown-error', { defaultValue: 'Unknown error' }),
        }),
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!song) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slice-text-light opacity-50 space-y-4">
        <div className="w-32 h-32 rounded-lg bg-slice-shadow-dark animate-pulse" />
        <div className="font-bold text-lg text-center">
          {t('select-track', { defaultValue: 'Select a track to begin' })}
        </div>
      </div>
    );
  }

  const getScoreMultiplier = () => {
    return calculateScoreMultiplier(modifiers);
  };

  return (
    <>
      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-200 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowEdit(false)}
          />
          <div className="relative bg-slice-bg rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slice-text uppercase tracking-tight">
                {t('edit-track', { defaultValue: 'Edit Track' })}
              </h3>
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-slice-text-light hover:text-slice-text-darker hover:bg-slice-shadow-dark/50 transition-colors"
                onClick={() => setShowEdit(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {/* Cover Image */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slice-text-light uppercase tracking-wider">
                  {t('cover-image', { defaultValue: 'Cover Image' })}
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-slice-shadow-dark/50 border-2 border-dashed border-slice-shadow-dark/50 group-hover:border-blue-400 transition-colors shrink-0 relative">
                    {editCoverPreview || song?.coverUrl ? (
                      <img
                        src={editCoverPreview ?? song?.coverUrl ?? undefined}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-slice-text-light">
                        <ImagePlus className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-bold text-blue-500 group-hover:text-blue-600">
                      {editCoverFile
                        ? editCoverFile.name
                        : t('click-to-change-cover', { defaultValue: 'Click to change cover' })}
                    </span>
                    <span className="text-xs text-slice-text-light">PNG, JPG, WebP</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleCoverSelect}
                  />
                </label>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slice-text-light uppercase tracking-wider">
                  {t('title-label', { defaultValue: 'Title' })}
                </label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="bg-(--slice-input-bg) text-slice-text border-(--slice-input-border) shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slice-text-light uppercase tracking-wider">
                  {t('artist-label', { defaultValue: 'Artist' })}
                </label>
                <Input
                  value={editArtist}
                  onChange={(e) => setEditArtist(e.target.value)}
                  className="bg-(--slice-input-bg) text-slice-text border-(--slice-input-border) shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slice-text-light uppercase tracking-wider">
                  {t('bpm-label', { defaultValue: 'BPM' })}
                </label>
                <Input
                  type="number"
                  value={editBpm}
                  onChange={(e) => setEditBpm(e.target.value)}
                  className="bg-(--slice-input-bg) text-slice-text border-(--slice-input-border) shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]"
                  placeholder={t('bpm-placeholder', { defaultValue: 'e.g. 120' })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slice-text-light uppercase tracking-wider">
                  {t('description-label', { defaultValue: 'Description' })}
                </label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="bg-(--slice-input-bg) text-slice-text border-(--slice-input-border) shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]"
                  placeholder={t('description-placeholder', {
                    defaultValue: 'Optional description...',
                  })}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="ghost"
                className="flex-1 text-slice-text-muted"
                onClick={() => setShowEdit(false)}
                disabled={isSaving}
              >
                {t('cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold gap-2"
                onClick={handleSave}
                disabled={isSaving}
              >
                <Check className="w-4 h-4" />
                {isSaving
                  ? t('saving', { defaultValue: 'Saving...' })
                  : t('save', { defaultValue: 'Save' })}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col">
        {/* Header / Info */}
        <div className="p-4 bg-slice-bg border-b border-slice-shadow-dark/30">
          <div className="flex gap-4 items-start">
            {/* Cover Art */}
            <div className="w-32 h-32 rounded-lg bg-slice-shadow-dark shrink-0 overflow-hidden relative shadow-lg">
              {song.coverUrl ? (
                <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full text-slice-text-light font-black text-5xl select-none">
                  {song.title.charAt(0)}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-2xl font-black text-slice-text leading-tight mb-1">
                  {song.title}
                </h2>
                {isOwner && (
                  <button
                    className="shrink-0 w-8 h-8 rounded-full bg-slice-shadow-dark/50 hover:bg-slice-shadow-dark border border-slice-shadow-dark/30 flex items-center justify-center text-slice-text-light hover:text-slice-text-darker transition-colors mt-0.5"
                    onClick={openEdit}
                    title={t('edit-track-info', { defaultValue: 'Edit track info' })}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                )}
              </div>
              {/* L15 — "everything by this artist" from the panel you are
                  already looking at. The key is derived here rather than read
                  off the row because `SliceSong` (in `types.ts`) has no
                  `artistKey` field; `artistKeyOf` is the same function the
                  server writes the column with, which is the point of it being
                  client-safe. */}
              <div className="text-blue-500 font-bold text-lg mb-3">
                {artistLinkKey ? (
                  <a href={artistPath(artistLinkKey)} className="hover:underline">
                    {song.artist}
                  </a>
                ) : (
                  song.artist
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slice-text-light uppercase">
                    {t('tempo', { defaultValue: 'Tempo' })}
                  </span>
                  <span className="font-mono text-slice-text font-bold text-sm">
                    {Math.round(song.bpm)} BPM
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slice-text-light uppercase">
                    {t('duration', { defaultValue: 'Duration' })}
                  </span>
                  <span className="font-mono text-slice-text font-bold text-sm">
                    {Math.floor(song.duration / 60)}:
                    {Math.round(song.duration % 60)
                      .toString()
                      .padStart(2, '0')}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slice-text-light uppercase">
                    {t('difficulty', { defaultValue: 'Difficulty' })}
                  </span>
                  <span
                    className={`font-mono font-bold text-sm ${
                      modifiers.difficulty === 'easy'
                        ? 'text-green-500'
                        : modifiers.difficulty === 'normal'
                          ? 'text-blue-500'
                          : modifiers.difficulty === 'hard'
                            ? 'text-orange-500'
                            : 'text-red-500'
                    }`}
                  >
                    {modifiers.difficulty.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <div
                  className="flex items-center gap-1.5 bg-slice-shadow-dark/20 px-2 py-1 rounded-md border border-slice-shadow-dark/30"
                  title={t('total-plays', { defaultValue: 'Total plays' })}
                >
                  <Play className="w-3 h-3 text-blue-500 fill-current" />
                  <span className="text-xs font-bold text-slice-text">{song.plays || 0}</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${song.isLiked ? 'bg-red-500/10 border-red-500/30' : 'bg-slice-shadow-dark/20 border-slice-shadow-dark/30'}`}
                  title={t('likes', { defaultValue: 'Likes' })}
                >
                  <Heart
                    className={`w-3 h-3 ${song.isLiked ? 'text-red-500 fill-current' : 'text-slice-text-light'}`}
                  />
                  <AnimatedCount
                    value={song.likeCount || 0}
                    className={`text-xs font-bold ${song.isLiked ? 'text-red-500' : 'text-slice-text'}`}
                  />
                </div>
                {song.userPlays !== undefined && (
                  <div
                    className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-1 rounded-md border border-blue-500/30"
                    title={t('your-plays', { defaultValue: 'Your plays' })}
                  >
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide">
                      YOU
                    </span>
                    <span className="text-xs font-bold text-blue-500">{song.userPlays}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Play Button & Multiplier.
              The row WRAPS. Four items — a button that will not shrink below
              its label, two 56px squares and the multiplier chip — need ~300px
              of fixed width plus gaps, which a 393px phone does not have once
              the panel's padding is off. It overflowed instead, and the overflow
              ran off the right edge of a panel that is `w-full` at that width:
              the chip read "MULTIPL… x1.0". Below `sm` the play button takes the
              whole first line (`basis-full`) so the wrap lands somewhere
              deliberate — the two icon buttons and the chip on one row — rather
              than leaving the chip stranded alone under a half-empty line. */}
          {!readOnly && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                className="basis-full sm:flex-1 min-w-48 h-14 bg-blue-500 hover:bg-blue-600 text-white font-bold text-base rounded-lg active:scale-95 transition-colors flex items-center justify-center gap-3 group"
                onClick={() => onPlay(song)}
              >
                <Play className="w-6 h-6 fill-current group-hover:scale-110 transition-transform" />
                <span className="uppercase tracking-wide">
                  {t('start-game', { defaultValue: 'Start Game' })}
                </span>
              </Button>
              <Button
                variant="ghost"
                className={`h-14 w-14 rounded-lg border flex items-center justify-center transition-colors ${
                  song.isLiked
                    ? 'bg-red-500/10 border-red-500/50 text-red-500 shadow-[inset_2px_2px_4px_rgba(239,68,68,0.2)]'
                    : 'bg-slice-card-bg border-slice-shadow-dark/50 text-slice-text-light hover:text-red-400 hover:border-red-400/50'
                }`}
                onClick={handleLike}
                disabled={isLiking}
              >
                <Heart
                  className={`w-6 h-6 transition-transform ${song.isLiked ? 'fill-current scale-110' : 'group-hover:scale-110'}`}
                />
              </Button>
              {/* L16 — the add-to-pack entry point. A pack builder reachable
                  only from the library toolbar can create packs and never fill
                  them; this is the half that puts a track into one. */}
              {session.data?.user && (
                <Dialog open={packOpen} onOpenChange={setPackOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-14 w-14 rounded-lg border bg-slice-card-bg border-slice-shadow-dark/50 text-slice-text-light hover:text-blue-400 hover:border-blue-400/50 flex items-center justify-center transition-colors"
                      aria-label={t('add-to-pack', { defaultValue: 'Add to pack' })}
                    >
                      <Layers className="w-6 h-6" aria-hidden />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="slice-tokens bg-slice-bg text-slice-text border-none shadow-2xl rounded-2xl max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="text-slice-text font-black">
                        {t('add-to-pack', { defaultValue: 'Add to pack' })}
                      </DialogTitle>
                    </DialogHeader>
                    <PackPanel addSongId={song.id} onAdded={() => setPackOpen(false)} />
                  </DialogContent>
                </Dialog>
              )}
              <div className="ml-auto shrink-0 flex flex-col items-center px-4 py-2 bg-slice-card-bg rounded-lg border border-slice-shadow-dark/50">
                <div className="text-[10px] font-bold text-slice-text-light uppercase">
                  {t('multiplier', { defaultValue: 'Multiplier' })}
                </div>
                <div className="text-xl font-black text-blue-500 tabular-nums">
                  x{getScoreMultiplier().toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {!readOnly && canEditChart && (
            <Link
              to="/slice-it/edit/$songId"
              params={{ songId: song.id }}
              className="mt-3 flex items-center justify-center gap-2 h-10 rounded-lg border border-slice-shadow-dark/50 bg-slice-card-bg text-slice-text-light hover:text-slice-text text-xs font-bold uppercase tracking-wide transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" aria-hidden />
              {t('edit-chart', { defaultValue: 'Edit chart' })}
            </Link>
          )}
        </div>

        {/* C2 — renders nothing when there is one chart, which is every song
            today. A picker with one option teaches a concept nobody needs. */}
        <ChartPicker charts={charts} selectedId={selectedChartId} onSelect={setSelectedChartId} />

        {/* Modifiers Section */}
        <div className="p-4 border-b border-slice-shadow-dark/30">
          <h3 className="text-sm font-bold text-slice-text uppercase mb-3">
            {t('difficulty', { defaultValue: 'Difficulty' })}
          </h3>
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {(['easy', 'normal', 'hard', 'expert'] as Difficulty[]).map((d) => {
              const isActive = modifiers.difficulty === d;
              const colorMap: Record<Difficulty, string> = {
                easy: '#22c55e',
                normal: '#3b82f6',
                hard: '#f97316',
                expert: '#ef4444',
              };
              const noteMap: Record<Difficulty, string> = {
                easy: '70%',
                normal: '100%',
                hard: '150%',
                expert: '200%',
              };
              return (
                <button
                  key={d}
                  onClick={() => setModifiers({ ...modifiers, difficulty: d })}
                  className={`px-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors border ${
                    isActive
                      ? 'text-white shadow-md scale-[1.02]'
                      : 'bg-slice-shadow-dark/20 text-slice-text-light border-slice-shadow-dark/30 hover:bg-slice-shadow-dark/50'
                  }`}
                  style={
                    isActive
                      ? { backgroundColor: colorMap[d], borderColor: colorMap[d] }
                      : undefined
                  }
                >
                  <div>{d}</div>
                  <div
                    className={`text-[10px] font-normal mt-0.5 ${isActive ? 'text-white/80' : 'text-slice-text-muted'}`}
                  >
                    {t('notes-pct', { defaultValue: '{{pct}} notes', pct: noteMap[d] })}
                  </div>
                </button>
              );
            })}
          </div>

          <h3 className="text-sm font-bold text-slice-text uppercase mb-3">
            {t('game-modifiers', { defaultValue: 'Game Modifiers' })}
          </h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <ModifierToggle
              label={t('mod-invisible', { defaultValue: 'Invisible' })}
              active={modifiers.invisible}
              onClick={() => setModifiers({ ...modifiers, invisible: !modifiers.invisible })}
              color="#a855f7"
            />
            <ModifierToggle
              label={t('mod-bombs', { defaultValue: 'Bombs' })}
              active={modifiers.bombs}
              onClick={() => setModifiers({ ...modifiers, bombs: !modifiers.bombs })}
              color="#f97316"
            />
            <ModifierToggle
              label={t('mod-switching', { defaultValue: 'Switching' })}
              active={modifiers.switching}
              onClick={() =>
                setModifiers({
                  ...modifiers,
                  switching: !modifiers.switching,
                  oneTrack: !modifiers.switching ? false : modifiers.oneTrack,
                })
              }
              color="#3b82f6"
            />
            <ModifierToggle
              label={t('mod-spin', { defaultValue: 'Spin' })}
              active={modifiers.spin}
              onClick={() => setModifiers({ ...modifiers, spin: !modifiers.spin })}
              color="#06b6d4"
            />
            <ModifierToggle
              label={t('mod-strict-timing', { defaultValue: 'Strict Timing' })}
              active={modifiers.strictTiming}
              onClick={() => setModifiers({ ...modifiers, strictTiming: !modifiers.strictTiming })}
              color="#dc2626"
            />
            <ModifierToggle
              label={t('mod-one-track', { defaultValue: 'One Track' })}
              active={modifiers.oneTrack}
              onClick={() =>
                setModifiers({
                  ...modifiers,
                  oneTrack: !modifiers.oneTrack,
                  switching: !modifiers.oneTrack ? false : modifiers.switching,
                })
              }
              color="#8b5cf6"
            />
            {/* Sudden Death and S-Random (`M2`) were in `Modifiers`, priced in
                `MODIFIER_BONUSES` and honoured by the engine with no toggle
                anywhere — the only way to set either was to hand-edit local
                storage. `setModifiers` runs `applyExclusions`, so Perfectionist
                or No Fail winning over Sudden Death is resolved by the store
                rather than by this grid. */}
            <ModifierToggle
              label={t('mod-sudden-death', { defaultValue: 'Sudden Death' })}
              active={!!modifiers.suddenDeath}
              onClick={() => setModifiers({ ...modifiers, suddenDeath: !modifiers.suddenDeath })}
              color="#e11d48"
            />
            <ModifierToggle
              label={t('mod-s-random', { defaultValue: 'S-Random' })}
              active={!!modifiers.sRandom}
              onClick={() => setModifiers({ ...modifiers, sRandom: !modifiers.sRandom })}
              color="#0ea5e9"
            />
          </div>

          {/* A1 / M5 — the assist family, kept apart from the grid above and
              named for what it is. These earn no score bonus and make the run
              unranked, and both of those are deliberate: unranked because a run
              with no fail state is not comparable to one with it, and no penalty
              because charging a player for needing an assist is the design
              mistake `ASSIST_MODIFIERS` exists to avoid. */}
          <h3 className="text-sm font-bold text-slice-text uppercase mb-1">
            {t('assists', { defaultValue: 'Assists' })}
          </h3>
          <p className="text-[10px] text-slice-text-light font-bold leading-snug mb-3">
            {t('assists-hint', {
              defaultValue:
                'Free, and unranked. No score penalty — these keep a run off the board rather than costing you points on it.',
            })}
          </p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <ModifierToggle
              label={t('mod-no-fail', { defaultValue: 'No Fail' })}
              active={!!modifiers.noFail}
              onClick={() => setModifiers({ ...modifiers, noFail: !modifiers.noFail })}
              color="#22c55e"
            />
            <ModifierToggle
              label={t('mod-assist', { defaultValue: 'Assist (0.75x)' })}
              active={!!modifiers.assist}
              onClick={() => setModifiers({ ...modifiers, assist: !modifiers.assist })}
              color="#14b8a6"
            />
            <ModifierToggle
              label={t('mod-tap-holds', { defaultValue: 'Taps Only' })}
              active={!!modifiers.tapHolds}
              onClick={() => setModifiers({ ...modifiers, tapHolds: !modifiers.tapHolds })}
              color="#84cc16"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slice-text-muted uppercase">
                {t('playback-speed', { defaultValue: 'Playback Speed' })}
              </h3>
              <div className="flex items-center gap-2">
                {modifiers.speed < 1.0 && (
                  <span className="text-[9px] font-bold uppercase tracking-wide bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full">
                    {t('unranked', { defaultValue: 'Unranked' })}
                  </span>
                )}
                <span className="text-blue-500 font-mono font-bold text-sm">
                  x{modifiers.speed.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="bg-slice-shadow-dark/50 p-3 rounded-lg border border-slice-shadow-dark/50">
              <Slider
                value={[modifiers.speed]}
                min={0.5}
                max={2.0}
                step={0.1}
                onValueChange={(vals) => setModifiers({ ...modifiers, speed: vals[0] })}
                className="cursor-pointer mb-2"
              />
              <div className="flex justify-between px-1 text-[9px] text-slice-text-light font-mono select-none">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>1.5x</span>
                <span>2.0x</span>
              </div>
            </div>
          </div>
        </div>

        {/* Leaderboard Section */}
        <div className="p-4 border-b border-slice-shadow-dark/30">
          <h3 className="text-sm font-bold text-slice-text uppercase mb-3">
            {t('leaderboard', { defaultValue: 'Leaderboard' })}
          </h3>
          <div className="bg-slice-shadow-dark/20 rounded-lg border border-slice-shadow-dark/50 p-3 max-h-[300px] overflow-y-auto">
            {belowFold ? <Leaderboard songId={song.id} /> : <FoldPlaceholder rows={5} />}
          </div>
        </div>

        {/* Comments Section */}
        <div className="p-4">
          <h3 className="text-sm font-bold text-slice-text uppercase mb-3">
            {t('comments', { defaultValue: 'Comments' })}
          </h3>
          <div className="bg-slice-shadow-dark/20 rounded-lg border border-slice-shadow-dark/50 p-3 min-h-[200px]">
            {belowFold ? <SongComments songId={song.id} /> : <FoldPlaceholder rows={3} />}
          </div>
        </div>
      </div>
    </>
  );
}
