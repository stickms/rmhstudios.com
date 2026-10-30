/**
 * CS:GO's loading screen in Panorama's shape: the map's screenshot full bleed under a dark fade, the
 * map's name large in Stratum2 with the mode beneath, and a thin bar along the bottom with the stage under
 * way (the `csgo-menu` channel: lib/tf2-game/client/menus/source-gameui.ts).
 */
'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MenuChannel } from '@/lib/tf2-game/client/menus/source-gameui';
import type { LoadingView } from '../tf2-game/GameCanvas';
import { mapScreenshot, usePanoramaFonts } from './CsMainMenu';
import './cs-menu.css';

export interface CsLoadingScreenProps {
  channel: MenuChannel | null;
  mapName: string;
  mapTitle: string;
  modeLabel: string;
  view: LoadingView;
}

export default function CsLoadingScreen({
  channel,
  mapName,
  mapTitle,
  modeLabel,
  view,
}: CsLoadingScreenProps) {
  const { t } = useTranslation('c-tf2-game');
  usePanoramaFonts(channel);
  const shot = useMemo(() => mapScreenshot(channel, mapName), [channel, mapName]);
  const stage = view.stages.find((s) => !s.done);
  const pct = Math.round(view.fraction * 100);
  return (
    <div className="pano-root pano-load">
      {shot ? <img className="pano-bg" src={shot} alt="" aria-hidden /> : null}
      <div className="pano-load-shade" aria-hidden />
      <div className="pano-load-info">
        <p className="pano-load-mode">{modeLabel}</p>
        <h2 className="pano-load-map">{mapTitle}</h2>
      </div>
      <div className="pano-load-foot">
        <div className="pano-load-row">
          <span className="pano-load-label">
            {t('play_loading', { defaultValue: 'Loading' })}
            {stage ? <span className="pano-load-stage"> · {stage.label}</span> : null}
          </span>
          <button type="button" className="pano-link" onClick={view.onCancel}>
            {t('play_cancel', { defaultValue: 'Cancel' })}
          </button>
        </div>
        <span
          className="pano-load-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={stage?.label}
        >
          <span style={{ width: `${pct}%` }} />
        </span>
      </div>
    </div>
  );
}
