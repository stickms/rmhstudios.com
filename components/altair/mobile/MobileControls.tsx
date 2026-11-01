/**
 * MobileControls — Pause button for mobile.
 */
'use client';

import { Pause } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MobileControlsProps {
  onPause: () => void;
}

export default function MobileControls({ onPause }: MobileControlsProps) {
  const { t } = useTranslation('c-altair');
  return (
    <div
      className="absolute z-40 pointer-events-auto"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 96px)',
        right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
      }}
    >
      <button
        onClick={onPause}
        aria-label={t("pause", { defaultValue: "Pause" })}
        className="w-11 h-11 rounded-full bg-(--altair-hud-scrim)/40 border border-(--altair-hud-ink)/20 flex items-center justify-center text-(--altair-hud-ink)/60 hover:text-(--altair-hud-ink) transition-colors"
      >
        <Pause size={18} />
      </button>
    </div>
  );
}
