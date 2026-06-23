import { useTranslation } from "react-i18next";
import { useStudioStore } from '@/lib/studio/store';
import { ChannelStrip } from './ChannelStrip';
import { MasterStrip } from './MasterStrip';
import { SlidersHorizontal } from 'lucide-react';

interface MixerViewProps {
  compact?: boolean;
}

export function MixerView({ compact = false }: MixerViewProps) {
  const { t } = useTranslation("c-studio");
  const { tracks, selectedTrackId } = useStudioStore();

  if (tracks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--site-muted)]">
        <div className="text-center">
          <SlidersHorizontal className="mx-auto h-10 w-10 opacity-20" />
          <p className="mt-2 text-xs">{t("add-tracks-to-see-mixer", { defaultValue: "Add tracks to see the mixer" })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Channel strips (scrollable) */}
      <div className="flex flex-1 overflow-x-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {tracks.map((track) => (
          <ChannelStrip
            key={track.id}
            track={track}
            isSelected={track.id === selectedTrackId}
            compact={compact}
          />
        ))}
      </div>

      {/* Master strip (fixed right) */}
      <MasterStrip compact={compact} />
    </div>
  );
}
