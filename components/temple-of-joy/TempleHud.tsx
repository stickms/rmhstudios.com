/**
 * The HUD — what the player is worth, at a glance.
 *
 * Happiness and its rate are `<LiveValue>`s, so they tick every frame without
 * re-rendering anything. The currency chips only appear once the player has
 * met the mechanic behind them; a first-time player should not be looking at
 * three counters reading zero that the game has not explained yet.
 */
'use client';

import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { saveToServer } from '@/lib/temple-of-joy/persistence';
import { useTempleSnapshot } from './hooks';
import { LiveValue, TempleButton, Glyph } from './ui';

export function TempleHud() {
  const { t } = useTranslation('c-temple-of-joy');

  // Which chips exist at all is a slow-changing question — 500ms is plenty,
  // and the values inside them are `<LiveValue>`s anyway.
  const shown = useTempleSnapshot(
    (s) => ({
      karma: s.peakKarma > 0,
      shards: s.blissShards > 0 || s.prestigeCount > 0,
      radiance: s.lifetimeRadiance > 0,
    }),
    500,
  );

  return (
    <header className="toj-hud">
      <div className="toj-hud-main">
        <LiveValue className="toj-happiness" read={(s) => fmt(s.happiness, s.numberFormat)} />
        <LiveValue
          className="toj-rate"
          read={(s) =>
            t('per-second', {
              rate: fmt(s.getHPS(), s.numberFormat),
              defaultValue: '{{rate}} joy per second',
            })
          }
        />
      </div>

      <div className="toj-currencies">
        {shown.karma && (
          <span className="toj-chip" data-kind="karma">
            <Glyph label={t('karma', { defaultValue: 'Karma' })}>☯️</Glyph>
            <LiveValue read={(s) => fmt(Math.floor(s.karma), s.numberFormat)} />
          </span>
        )}
        {shown.shards && (
          <span className="toj-chip" data-kind="shard">
            <Glyph label={t('bliss-shards', { defaultValue: 'Bliss Shards' })}>💎</Glyph>
            <LiveValue read={(s) => fmt(s.blissShards, s.numberFormat)} />
          </span>
        )}
        {shown.radiance && (
          <span className="toj-chip" data-kind="radiance">
            <Glyph label={t('radiance', { defaultValue: 'Radiance' })}>☀️</Glyph>
            <LiveValue read={(s) => fmt(s.radiance, s.numberFormat)} />
          </span>
        )}
      </div>

      <div className="toj-hud-actions">
        <TempleButton
          variant="quiet"
          size="sm"
          onClick={() => {
            // Best-effort: leaving shouldn't be blocked on the network, and the
            // autosave loop has almost certainly already covered this.
            saveToServer(useTempleStore.getState()).catch(() => {});
            window.location.href = '/builds';
          }}
        >
          ← {t('back-to-builds', { defaultValue: 'Builds' })}
        </TempleButton>
      </div>
    </header>
  );
}
