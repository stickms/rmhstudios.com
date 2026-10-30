/**
 * The quick AI's live preview: the proposed HUD drawn by the game's own renderer (the same one that
 * draws the HUD in the match) from the live state — or a sample before a class is picked — at
 * 1280×720, scaled into a small 16:9 box. Prepared after a short pause (a burst of proposals prepares
 * once) and drawn once per proposal: no frame loop.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HudMeta, Overlay } from '@/lib/tf2-hud/project/types';
import {
  CustomHudRenderer,
  prepareHud,
  type PreparedHud,
} from '@/lib/tf2-game/client/custom-hud/renderer';
import type { HudState } from '@/lib/tf2-game/client/hud-state';
import { hudTokens } from '../custom-hud/CustomHudLayer';
import { soldierCp } from '../preview/sample-states';
import { useHudContext } from '../use-hud';

const PREPARE_DELAY_MS = 200;

export default function HudAiPreview({
  overlay,
  meta,
  draftId,
}: {
  overlay: Overlay;
  meta: HudMeta;
  draftId: string;
}) {
  const { t } = useTranslation('c-tf2-game');
  const { store } = useHudContext();
  const ref = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<PreparedHud | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    const timer = setTimeout(() => {
      prepareHud({ selection: { kind: 'draft', id: draftId }, meta, overlay }).then(
        (p) => live && setHud(p),
        () => live && setFailed(true),
      );
    }, PREPARE_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [overlay, meta, draftId]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !hud) return;
    const r = new CustomHudRenderer(canvas);
    r.setFallbackTokens(hudTokens(t));
    r.resize(1280, 720);
    r.setHud(hud);
    const now = store.getSnapshot();
    const state: HudState =
      now.local && now.local.cls > 0 && now.local.team >= 2
        ? now
        : { ...soldierCp(), match: now.local ? now.match : soldierCp().match };
    r.update(state, true);
    return () => r.dispose();
  }, [hud, store, t]);

  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <div className="tf2hud-backdrop-game relative aspect-video w-full overflow-hidden rounded-(--app-radius-sm) border border-(--app-border)">
        <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden="true" />
        {!hud ? (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] text-(--app-text-muted)">
            {failed
              ? t('ai_preview_failed', { defaultValue: 'No preview' })
              : t('ai_preview_loading', { defaultValue: 'Preparing the preview…' })}
          </span>
        ) : null}
      </div>
      <figcaption className="text-[11px] text-(--app-text-dim)">
        {t('ai_preview_caption', { defaultValue: 'Preview with your match' })}
      </figcaption>
    </figure>
  );
}
