/**
 * The HUD — what the temple is worth, at a glance.
 *
 * Joy and its rate are `<LiveValue>`s, so they tick every frame without
 * re-rendering anything. The chips only appear once the player has met the
 * mechanic behind them; a first-time player should not be looking at four
 * counters reading zero that the game has not explained yet.
 */
'use client';

import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';
import { saveNow } from '@/lib/temple-of-joy/persistence';
import {
  computeDevotion,
  computeRateModifiers,
  computeSinnerDrain,
} from '@/lib/temple-of-joy/engine';
import { MANNA_KIND_MAP, ripenDuration } from '@/lib/temple-of-joy/minigames/manna';
import { useTempleSnapshot } from './hooks';
import { LiveValue, TempleButton, Glyph } from './ui';

export function TempleHud() {
  const { t } = useTranslation('c-temple-of-joy');

  // Which chips exist at all is a slow-changing question; the values inside
  // them are `<LiveValue>`s anyway.
  const shown = useTempleSnapshot(
    (s) => ({
      grace: s.grace > 0 || s.ascensions > 0,
      manna: s.manna.revealed || s.manna.held > 0,
      mannaReady: s.manna.held > 0,
      devotion: s.trophies.size >= 5,
      drained: computeSinnerDrain(s) > 0,
    }),
    600,
  );

  return (
    <header className="toj-hud">
      <div className="toj-hud-main">
        <LiveValue className="toj-joy" read={(s) => fmt(s.joy, s.numberFormat)} />
        <LiveValue
          className="toj-rate"
          style={undefined}
          read={(s) => {
            const drain = computeSinnerDrain(s);
            const rate = t('per-second', {
              rate: fmt(s.getJps(), s.numberFormat),
              defaultValue: '{{rate}} joy per second',
            });
            return drain > 0
              ? `${rate} · ${t('drained', {
                  percent: Math.round(drain * 100),
                  defaultValue: '{{percent}}% held by Sinners',
                })}`
              : rate;
          }}
        />
      </div>

      <div className="toj-chips">
        {shown.devotion && (
          <span className="toj-chip" data-kind="devotion">
            <Glyph label={t('devotion', { defaultValue: 'Devotion' })}>🏆</Glyph>
            <LiveValue read={(s) => `+${Math.round(computeDevotion(s) * 100)}%`} />
          </span>
        )}

        {shown.grace && (
          <button
            type="button"
            className="toj-chip"
            data-kind="grace"
            onClick={() => useTempleStore.getState().setTab('legacy')}
          >
            <Glyph label={t('grace', { defaultValue: 'Grace' })}>☁️</Glyph>
            <LiveValue read={(s) => fmt(s.grace, s.numberFormat)} />
          </button>
        )}

        {shown.manna && (
          <button
            type="button"
            className="toj-chip"
            data-kind="manna"
            data-ready={shown.mannaReady ? 'true' : undefined}
            onClick={() => useTempleStore.getState().setShowMannaDialog(true)}
            title={t('manna-hint', {
              defaultValue: 'Manna ripens on its own. Spend it raising a source.',
            })}
          >
            <Glyph label={t('manna', { defaultValue: 'Manna' })}>🍞</Glyph>
            <LiveValue
              read={(s) => {
                if (s.manna.held > 0) return String(s.manna.held);
                const speed = computeRateModifiers(s).mannaSpeed;
                const total = ripenDuration(s.manna.kind, speed);
                return formatDuration(Math.max(0, (total - s.manna.ripening) / 1000));
              }}
            />
          </button>
        )}
      </div>

      <div className="toj-hud-actions">
        <TempleButton
          variant="quiet"
          size="sm"
          onClick={() => {
            // Best-effort: leaving should not be blocked on the network. The
            // local half of this write is synchronous and always lands, so the
            // save is safe even if the request never completes.
            saveNow().catch(() => {});
            window.location.href = '/builds';
          }}
        >
          ← {t('back-to-builds', { defaultValue: 'Builds' })}
        </TempleButton>
      </div>
    </header>
  );
}

/** Re-exported for the manna dialog, which describes the same thing. */
export { MANNA_KIND_MAP };
