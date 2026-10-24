import { useTranslation } from "react-i18next";
import { useStudioStore } from '@/lib/studio/store';
import { FaderControl } from '@/components/studio/plugins/FaderControl';
import { VUMeter } from './VUMeter';

interface MasterStripProps {
  compact?: boolean;
}

export function MasterStrip({ compact = false }: MasterStripProps) {
  const { t } = useTranslation("c-studio");
  const { masterVolume, setMasterVolume } = useStudioStore();

  return (
    <div className="flex shrink-0 flex-col items-center gap-2 border-l border-(--app-border) bg-(--app-surface) px-3 py-2">
      <span className="text-xs font-bold uppercase text-(--app-text-muted)">{t("master", { defaultValue: "Master" })}</span>

      {/* Fader + Stereo meters */}
      <div className="flex items-end gap-1">
        <VUMeter level={masterVolume * 0.7} width={6} height={compact ? 80 : 110} />
        <FaderControl
          value={masterVolume}
          onChange={setMasterVolume}
          height={compact ? 80 : 110}
          width={compact ? 22 : 26}
          color="#22d3ee"
        />
        <VUMeter level={masterVolume * 0.65} width={6} height={compact ? 80 : 110} />
      </div>

      <span className="text-xs tabular-nums text-(--app-text-muted)">
        {masterVolume > 0 ? (20 * Math.log10(masterVolume)).toFixed(1) : '-∞'} dB
      </span>
    </div>
  );
}
