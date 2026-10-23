import { Volume2, VolumeX, Headphones } from 'lucide-react';
import { useTranslation } from "react-i18next";
import { useStudioStore } from '@/lib/studio/store';
import { KnobControl } from '@/components/studio/plugins/KnobControl';
import { FaderControl } from '@/components/studio/plugins/FaderControl';
import { VUMeter } from './VUMeter';
import type { Track } from '@/lib/studio/types';

interface ChannelStripProps {
  track: Track;
  isSelected: boolean;
  compact?: boolean;
}

export function ChannelStrip({ track, isSelected, compact = false }: ChannelStripProps) {
  const { t } = useTranslation("c-studio");
  const { selectTrack, toggleTrackMute, toggleTrackSolo, setTrackVolume, setTrackPan } = useStudioStore();

  return (
    <div
      className={`flex shrink-0 flex-col items-center gap-2 border-r border-(--app-border) px-2 py-2 ${
        isSelected ? 'bg-(--app-surface-hover)' : 'bg-(--app-surface)'
      }`}
      style={{ width: compact ? 56 : 72 }}
      onClick={() => selectTrack(track.id)}
    >
      {/* Track color + name */}
      <div className="flex w-full items-center gap-1">
        <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: track.color }} />
        <span className="truncate text-xs font-medium text-(--app-text)">
          {track.name}
        </span>
      </div>

      {/* Pan knob */}
      <KnobControl
        value={track.pan}
        min={-1}
        max={1}
        step={0.01}
        size={compact ? 28 : 32}
        label={t("pan", { defaultValue: "Pan" })}
        onChange={(v) => setTrackPan(track.id, v)}
        color="#a855f7"
      />

      {/* Fader + Meter row */}
      <div className="flex items-end gap-1">
        <FaderControl
          value={track.volume}
          onChange={(v) => setTrackVolume(track.id, v)}
          height={compact ? 80 : 110}
          width={compact ? 18 : 22}
          color={track.color}
        />
        <VUMeter
          level={track.muted ? 0 : track.volume * 0.7}
          width={6}
          height={compact ? 80 : 110}
        />
      </div>

      {/* Mute / Solo buttons */}
      <div className="flex gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.id); }}
          className={`rounded-(--app-radius-sm) p-1 text-xs font-bold ${
            track.muted ? 'bg-(--app-danger)/15 text-(--app-danger)' : 'text-(--app-text-muted) hover:bg-(--app-surface-hover)'
          }`}
          title={t("mute", { defaultValue: "Mute" })}
        >
          M
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleTrackSolo(track.id); }}
          className={`rounded-(--app-radius-sm) p-1 text-xs font-bold ${
            track.soloed ? 'bg-(--app-warning)/15 text-(--app-warning)' : 'text-(--app-text-muted) hover:bg-(--app-surface-hover)'
          }`}
          title={t("solo", { defaultValue: "Solo" })}
        >
          S
        </button>
      </div>
    </div>
  );
}
