import {
  Volume2, VolumeX, Headphones, Mic,
  GripVertical,
} from 'lucide-react';
import { useStudioStore } from '@/lib/studio/store';
import { TRACK_COLORS, DEFAULT_TRACK_HEIGHT } from '@/lib/studio/constants';
import type { Track } from '@/lib/studio/types';

interface TrackHeaderProps {
  track: Track;
  isSelected: boolean;
  width: number;
}

export function TrackHeader({ track, isSelected, width }: TrackHeaderProps) {
  const { selectTrack, toggleTrackMute, toggleTrackSolo, toggleTrackArm } = useStudioStore();

  return (
    <div
      className={`flex shrink-0 items-center border-b border-r border-[var(--site-border)] ${
        isSelected ? 'bg-white/5' : 'bg-[var(--site-surface)]'
      }`}
      style={{ width, height: track.height }}
      onClick={() => selectTrack(track.id)}
    >
      {/* Drag handle */}
      <div className="flex h-full w-5 cursor-grab items-center justify-center text-[var(--site-muted)] opacity-40 hover:opacity-100 active:cursor-grabbing">
        <GripVertical className="h-3 w-3" />
      </div>

      {/* Color indicator */}
      <div
        className="h-full w-1 shrink-0"
        style={{ backgroundColor: track.color }}
      />

      {/* Track info */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-xs font-medium text-[var(--site-text)]">
            {track.name}
          </span>
          <span className="shrink-0 text-[9px] uppercase text-[var(--site-muted)]">
            {track.type}
          </span>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-0.5">
          {/* Mute */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.id); }}
            className={`rounded p-0.5 ${
              track.muted
                ? 'bg-red-500/20 text-red-400'
                : 'text-[var(--site-muted)] hover:text-[var(--site-text)]'
            }`}
            title="Mute"
          >
            {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </button>

          {/* Solo */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleTrackSolo(track.id); }}
            className={`rounded p-0.5 ${
              track.soloed
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'text-[var(--site-muted)] hover:text-[var(--site-text)]'
            }`}
            title="Solo"
          >
            <Headphones className="h-3 w-3" />
          </button>

          {/* Record arm (audio/midi tracks only) */}
          {(track.type === 'audio' || track.type === 'midi') && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleTrackArm(track.id); }}
              className={`rounded p-0.5 ${
                track.armed
                  ? 'bg-red-500/20 text-red-400'
                  : 'text-[var(--site-muted)] hover:text-[var(--site-text)]'
              }`}
              title="Record Arm"
            >
              <Mic className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Track Button ─────────────────────────────────────────────────────

interface AddTrackButtonProps {
  width: number;
}

export function AddTrackButton({ width }: AddTrackButtonProps) {
  const { addTrack, tracks } = useStudioStore();
  const handleAddTrack = (type: 'audio' | 'midi') => {
    const id = crypto.randomUUID();
    const colorIdx = tracks.length % TRACK_COLORS.length;
    addTrack({
      id,
      name: type === 'midi' ? `MIDI ${tracks.length + 1}` : `Audio ${tracks.length + 1}`,
      type,
      color: TRACK_COLORS[colorIdx],
      volume: 0.8,
      pan: 0,
      muted: false,
      soloed: false,
      armed: false,
      clipIds: [],
      pluginChain: [],
      sends: [],
      height: DEFAULT_TRACK_HEIGHT,
    });
  };

  return (
    <div
      className="flex shrink-0 items-center gap-1 border-b border-r border-[var(--site-border)] bg-[var(--site-surface)] px-2 py-1"
      style={{ width }}
    >
      <button
        onClick={() => handleAddTrack('midi')}
        className="flex-1 rounded bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-400 hover:bg-cyan-500/20"
      >
        + MIDI
      </button>
      <button
        onClick={() => handleAddTrack('audio')}
        className="flex-1 rounded bg-purple-500/10 px-2 py-1 text-[10px] text-purple-400 hover:bg-purple-500/20"
      >
        + Audio
      </button>
    </div>
  );
}
