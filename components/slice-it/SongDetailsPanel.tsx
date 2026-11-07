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
import { Pressings } from './Pressings';
import { SongComments } from './SongComments';
import { useSliceItStore } from '@/lib/slice-it/store';
import type { SliceSong } from '@/lib/slice-it/types';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useSession } from '@/components/Providers';
import { toast } from 'sonner';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { calculateScoreMultiplier } from '@/lib/slice-it/scoring';
import { ChartPicker, type ChartOption } from './ChartPicker';
import { useTranslation } from 'react-i18next';
import { isHeicCover, normalizeCover } from '@/lib/slice-it/cover-image';
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

/**
 * A modifier: its name and the shared `Switch`, which the game's theme draws as
 * a hairline slide with a square knob. A `label`, so the name is a click target
 * as well and the switch is read out with it. The state is the cyan fill, never
 * motion.
 */
const ModifierToggle = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => {
  const id = React.useId();
  return (
    <label className="slice-mod">
      <span id={id} className="slice-mod__label">
        {label}
      </span>
      <Switch checked={active} onCheckedChange={() => onClick()} aria-labelledby={id} />
    </label>
  );
};

export function SongDetailsPanel({
  song,
  onPlay,
  onSongUpdated,
  readOnly = false,
}: SongDetailsPanelProps) {
  const { t } = useTranslation('c-game');
  const { modifiers, setModifiers } = useSliceItStore();
  const session = useSession();
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

  const handleCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_COVER_SIZE) {
      toast.error(
        t('cover-too-large-song-details-panel', {
          defaultValue: 'Cover image too large ({{size}} MB). Maximum size is 10 MB.',
          size: (file.size / 1024 / 1024).toFixed(1),
        }),
      );
      e.target.value = '';
      return;
    }
    const normalized = await normalizeCover(file);
    if (!normalized) {
      toast.error(
        isHeicCover(file)
          ? t('cover-heic-unsupported-panel', {
              defaultValue:
                "This browser can't open HEIC photos. Export it as JPEG or PNG, or pick it from Safari.",
            })
          : t('cover-format-unsupported-panel', {
              defaultValue: 'That image format is not supported. Use JPEG, PNG or WebP.',
            }),
      );
      input.value = '';
      return;
    }
    setEditCoverFile(normalized);
    setEditCoverPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(normalized);
    });
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
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
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
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowEdit(false)} />
          <div className="relative bg-slice-bg rounded-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-4">
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
                    onChange={(e) => void handleCoverSelect(e)}
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
                  className="bg-(--slice-input-bg) text-slice-text border-(--slice-input-border) border border-slice-border"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slice-text-light uppercase tracking-wider">
                  {t('artist-label', { defaultValue: 'Artist' })}
                </label>
                <Input
                  value={editArtist}
                  onChange={(e) => setEditArtist(e.target.value)}
                  className="bg-(--slice-input-bg) text-slice-text border-(--slice-input-border) border border-slice-border"
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
                  className="bg-(--slice-input-bg) text-slice-text border-(--slice-input-border) border border-slice-border"
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
                  className="bg-(--slice-input-bg) text-slice-text border-(--slice-input-border) border border-slice-border"
                  placeholder={t('description-placeholder-song-details-panel', {
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
                {t('cancel-neumorphic-modal', { defaultValue: 'Cancel' })}
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
        {/* The record: cover, title, artist, the pressings, START. The sleeve
            column's one job is to answer "what will I be playing?". */}
        <div className="slice-rec">
          <div className="slice-rec__cover slice-duotone">
            {song.coverUrl ? (
              <img src={song.coverUrl} alt={song.title} />
            ) : (
              <span className="slice-rec__ph slice-dots-cyan" aria-hidden />
            )}
            <span className="slice-rec__tag">{t('side-a', { defaultValue: 'Side A' })}</span>
          </div>

          <div className="slice-rec__head">
            <h2 className="slice-rec__title">{song.title}</h2>
            {isOwner && (
              <button
                type="button"
                className="slice-bar__icon"
                onClick={openEdit}
                title={t('edit-track-info', { defaultValue: 'Edit track info' })}
                aria-label={t('edit-track-info', { defaultValue: 'Edit track info' })}
              >
                <Settings className="size-4" aria-hidden />
              </button>
            )}
          </div>
          {/* L15 — "everything by this artist" from the panel you are already
              looking at. The key is derived here rather than read off the row
              because `SliceSong` has no `artistKey` field; `artistKeyOf` is the
              same function the server writes the column with. */}
          <div className="slice-rec__meta">
            <span className="slice-rec__artist">
              {artistLinkKey ? (
                <a href={artistPath(artistLinkKey)} className="hover:underline">
                  {song.artist}
                </a>
              ) : (
                song.artist
              )}
            </span>
            <span className="slice-label">
              <b>{Math.round(song.bpm)}</b> {t('bpm-label', { defaultValue: 'BPM' })} ·{' '}
              <b>
                {Math.floor(song.duration / 60)}:
                {Math.round(song.duration % 60)
                  .toString()
                  .padStart(2, '0')}
              </b>{' '}
              · <b>{song.plays || 0}</b> {t('plays-short', { defaultValue: 'plays' })}
            </span>
          </div>

          <div className="slice-label mt-4">{t('pressings', { defaultValue: 'Pressings' })}</div>
          <Pressings />

          {/* The START row WRAPS below `sm`: START, two 48px squares and the
              multiplier need more than a phone has beside each other. */}
          {!readOnly && (
            <div className="slice-rec__go">
              <Button className="slice-btn-primary" onClick={() => onPlay(song)}>
                <Play className="size-4 fill-current" aria-hidden />
                {t('start-game', { defaultValue: 'Start Game' })}
              </Button>
              <button
                type="button"
                className="slice-sq"
                data-on={song.isLiked || undefined}
                onClick={handleLike}
                disabled={isLiking}
                aria-pressed={Boolean(song.isLiked)}
                aria-label={
                  song.isLiked
                    ? t('unlike', { defaultValue: 'Unlike' })
                    : t('like', { defaultValue: 'Like' })
                }
              >
                <Heart className={`size-5 ${song.isLiked ? 'fill-current' : ''}`} aria-hidden />
                <AnimatedCount value={song.likeCount || 0} className="slice-sq__n" />
              </button>
              {/* L16 — the add-to-pack entry point. A pack builder reachable
                  only from the library toolbar can create packs and never fill
                  them; this is the half that puts a track into one. */}
              {session.data?.user && (
                <Dialog open={packOpen} onOpenChange={setPackOpen}>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="slice-sq"
                      aria-label={t('add-to-pack', { defaultValue: 'Add to pack' })}
                    >
                      <Layers className="size-5" aria-hidden />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="slice-tokens bg-slice-bg text-slice-text border-none rounded-2xl max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="text-slice-text font-black">
                        {t('add-to-pack', { defaultValue: 'Add to pack' })}
                      </DialogTitle>
                    </DialogHeader>
                    <PackPanel addSongId={song.id} onAdded={() => setPackOpen(false)} />
                  </DialogContent>
                </Dialog>
              )}
              <div className="slice-rec__mult">
                <span className="slice-label">
                  {t('multiplier', { defaultValue: 'Multiplier' })}
                </span>
                <b>×{getScoreMultiplier().toFixed(2)}</b>
              </div>
            </div>
          )}

          {!readOnly && canEditChart && (
            <Link
              to="/slice-it/edit/$songId"
              params={{ songId: song.id }}
              className="slice-rec__edit"
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              {t('edit-chart', { defaultValue: 'Edit chart' })}
            </Link>
          )}
        </div>

        {/* C2 — renders nothing when there is one chart, which is every song
            today. A picker with one option teaches a concept nobody needs. */}
        <ChartPicker charts={charts} selectedId={selectedChartId} onSelect={setSelectedChartId} />

        {/* Modifiers Section */}
        <div className="slice-sec">
          <h3 className="slice-section-title">
            {t('game-modifiers', { defaultValue: 'Game Modifiers' })}
          </h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <ModifierToggle
              label={t('mod-invisible', { defaultValue: 'Invisible' })}
              active={modifiers.invisible}
              onClick={() => setModifiers({ ...modifiers, invisible: !modifiers.invisible })}
            />
            <ModifierToggle
              label={t('mod-bombs', { defaultValue: 'Bombs' })}
              active={modifiers.bombs}
              onClick={() => setModifiers({ ...modifiers, bombs: !modifiers.bombs })}
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
            />
            <ModifierToggle
              label={t('mod-spin', { defaultValue: 'Spin' })}
              active={modifiers.spin}
              onClick={() => setModifiers({ ...modifiers, spin: !modifiers.spin })}
            />
            <ModifierToggle
              label={t('mod-strict-timing', { defaultValue: 'Strict Timing' })}
              active={modifiers.strictTiming}
              onClick={() => setModifiers({ ...modifiers, strictTiming: !modifiers.strictTiming })}
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
            />
            <ModifierToggle
              label={t('mod-s-random', { defaultValue: 'S-Random' })}
              active={!!modifiers.sRandom}
              onClick={() => setModifiers({ ...modifiers, sRandom: !modifiers.sRandom })}
            />
          </div>

          {/* A1 / M5 — the assist family, kept apart from the grid above and
              named for what it is. These earn no score bonus and make the run
              unranked, and both of those are deliberate: unranked because a run
              with no fail state is not comparable to one with it, and no penalty
              because charging a player for needing an assist is the design
              mistake `ASSIST_MODIFIERS` exists to avoid. */}
          <h3 className="slice-section-title">{t('assists', { defaultValue: 'Assists' })}</h3>
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
            />
            <ModifierToggle
              label={t('mod-assist', { defaultValue: 'Assist (0.75x)' })}
              active={!!modifiers.assist}
              onClick={() => setModifiers({ ...modifiers, assist: !modifiers.assist })}
            />
            <ModifierToggle
              label={t('mod-tap-holds', { defaultValue: 'Taps Only' })}
              active={!!modifiers.tapHolds}
              onClick={() => setModifiers({ ...modifiers, tapHolds: !modifiers.tapHolds })}
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
        <div className="slice-sec">
          <h3 className="slice-section-title">
            {t('leaderboard', { defaultValue: 'Leaderboard' })}
          </h3>
          <div className="bg-slice-shadow-dark/20 rounded-lg border border-slice-shadow-dark/50 p-3 max-h-[300px] overflow-y-auto">
            {belowFold ? <Leaderboard songId={song.id} /> : <FoldPlaceholder rows={5} />}
          </div>
        </div>

        {/* Comments Section */}
        <div className="slice-sec">
          <h3 className="slice-section-title">{t('comments', { defaultValue: 'Comments' })}</h3>
          <div className="bg-slice-shadow-dark/20 rounded-lg border border-slice-shadow-dark/50 p-3 min-h-[200px]">
            {belowFold ? <SongComments songId={song.id} /> : <FoldPlaceholder rows={3} />}
          </div>
        </div>
      </div>
    </>
  );
}
