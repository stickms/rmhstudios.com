/**
 * Half-Life 2's and Portal's loading screen as GameUI draws it: the console background of the chapter
 * being loaded, and the loading dialog low on the right — its title, the level, vgui's block progress bar,
 * a Cancel button — in the game's scheme colours and type (the `<game>-menu` channel, source-gameui.ts).
 */
'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  backgroundFor,
  gameUiStyle,
  menuAssetUrl,
  menuText,
  type MenuChannel,
} from '@/lib/tf2-game/client/menus/source-gameui';
import type { SpGameId } from '@/lib/tf2-game/client/sp-save';
import type { LoadingView } from '../tf2-game/GameCanvas';
import { useSchemeFonts } from './SourceMainMenu';
import './source-menu.css';

export interface SourceLoadingScreenProps {
  game: SpGameId;
  channel: MenuChannel;
  /** The chapter being loaded (its background). */
  chapter: number;
  view: LoadingView;
}

export default function SourceLoadingScreen({
  game,
  channel,
  chapter,
  view,
}: SourceLoadingScreenProps) {
  const { t } = useTranslation('c-tf2-game');
  const style = useMemo(() => gameUiStyle(channel), [channel]);
  useSchemeFonts(channel, style.fontFiles);
  const [aspect, setAspect] = useState(16 / 9);
  useEffect(() => {
    setAspect(window.innerWidth / Math.max(1, window.innerHeight));
  }, []);
  const background = backgroundFor(channel, chapter, aspect);
  const font = style.menuFont
    ? { fontFamily: `'${style.menuFont.family}', Tahoma, Verdana, sans-serif` }
    : undefined;
  const stage = view.stages.find((s) => !s.done);
  return (
    <div className={`gui-root gui-${game}`} style={style.vars as CSSProperties}>
      {background ? (
        <img className="gui-background" src={menuAssetUrl(background, game)} alt="" aria-hidden />
      ) : null}
      <section
        className="gui-frame gui-loading"
        aria-label={menuText(
          channel,
          '#GameUI_Loading',
          t('play_loading', { defaultValue: 'Loading' }),
        )}
      >
        <header className="gui-frame-title">
          <h2 style={font}>
            {menuText(channel, '#GameUI_Loading', t('play_loading', { defaultValue: 'Loading' }))}
          </h2>
        </header>
        <div className="gui-frame-body">
          <p className="gui-loading-map">{view.title}</p>
          <span
            className="gui-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(view.fraction * 100)}
            aria-valuetext={stage?.label}
          >
            <span style={{ width: `${Math.round(view.fraction * 100)}%` }} />
          </span>
          <div className="gui-frame-buttons">
            <button type="button" className="gui-button" onClick={view.onCancel}>
              {menuText(channel, '#GameUI_Cancel', t('play_cancel', { defaultValue: 'Cancel' }))}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
