/**
 * Half-Life 2's and Portal's loading screen as GameUI draws it: the console background of the chapter
 * being loaded, and the loading dialog low on the right — its title, the level, vgui's block progress bar,
 * a Cancel button — in the same look as the main menu (SourceMainMenu.tsx; the `<game>-menu` channel,
 * source-gameui.ts), under the game's logo.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  backgroundFor,
  gameUiStyle,
  menuAssetUrl,
  menuText,
  type MenuChannel,
} from '@/lib/tf2-game/client/menus/source-gameui';
import type { SpGameId } from '@/lib/sp-game/client/sp-save';
import type { LoadingView } from '../tf2-game/GameCanvas';
import { SOURCE_LOGOS, SourceBackdrop, SourceGlyph } from './source-art';
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
  const [aspect, setAspect] = useState(16 / 9);
  useEffect(() => {
    setAspect(window.innerWidth / Math.max(1, window.innerHeight));
  }, []);
  const background = backgroundFor(channel, chapter, aspect);
  const stage = view.stages.find((s) => !s.done);
  return (
    <div className={`gui-root gui-${game}`} style={style.vars as CSSProperties}>
      <SourceBackdrop game={game} src={background ? menuAssetUrl(background, game) : null} />
      <div className="gui-loading-logo" aria-hidden>
        <img src={SOURCE_LOGOS[game]} alt="" />
      </div>
      <section
        className="gui-frame gui-loading"
        aria-label={menuText(
          channel,
          '#GameUI_Loading',
          t('play_loading', { defaultValue: 'Loading' }),
        )}
      >
        <header className="gui-frame-title">
          <SourceGlyph game={game} />
          <h2>
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
