/**
 * TF2's loading screen: the menu's own backdrop (a console background from chapterbackgrounds.txt and
 * the logo, painted from the HUD files like the main menu) with the loading dialog over it in TF2's
 * colours and type — the map, the progress bar, the stage under way, and one of the game's tips
 * (`#Tip_<class>_<n>` from its localisation).
 */
'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LoadingView } from '../GameCanvas';
import GameMenu from './GameMenu';
import { useMenuSource } from './use-menu-source';

const NO_ENTRIES: never[] = [];
const noop = () => {};
/** One tip per page, like the game's one per load. */
const tipPick = Math.random();

export default function Tf2LoadingScreen({ view }: { view: LoadingView }) {
  const { t } = useTranslation('c-tf2-game');
  const source = useMenuSource('tf2');
  const tip = useMemo(() => {
    const strings = source?.source.strings;
    if (!strings) return null;
    // Class tips only; a tip that names a key binding (%+attack%) would print the placeholder.
    const tips = [...strings.entries()]
      .filter(([k, v]) => /^tip_[1-9]_\d+$/.test(k) && !v.includes('%'))
      .map(([, v]) => v);
    return tips.length ? tips[Math.floor(tipPick * tips.length) % tips.length] : null;
  }, [source]);
  const stage = view.stages.find((s) => !s.done);
  const pct = Math.round(view.fraction * 100);
  return (
    <div className="tf2-load">
      <div className="tf2-load-backdrop" aria-hidden inert>
        <GameMenu source={source} inGame={false} entries={NO_ENTRIES} onCommand={noop} title="" />
      </div>
      <section
        className="tf2-load-dialog"
        aria-label={t('play_loading', { defaultValue: 'Loading' })}
      >
        <p className="tf2-load-eyebrow">{t('play_loading', { defaultValue: 'Loading' })}</p>
        <h2 className="tf2hud-title tf2-load-map">{view.title}</h2>
        <span
          className="tf2g-play-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={stage?.label}
        >
          <span style={{ width: `${pct}%` }} />
        </span>
        <p className="tf2-load-stage">{stage?.label ?? ''}</p>
        {tip ? (
          <p className="tf2-load-tip">
            <span className="tf2-load-tip-label">{t('play_tip', { defaultValue: 'Tip' })}</span>{' '}
            {tip}
          </p>
        ) : null}
        <button
          type="button"
          className="tf2g-play-button tf2g-play-button-quiet"
          onClick={view.onCancel}
        >
          {t('play_cancel', { defaultValue: 'Cancel' })}
        </button>
      </section>
    </div>
  );
}
