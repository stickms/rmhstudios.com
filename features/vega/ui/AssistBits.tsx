/**
 * Project Vega's assist surfaces (island-safe: no React Query, no router): the in-run banner, the strip that
 * replaces the pause dialog when a paused run can still be played on, the start-screen lines and the end-screen
 * line. The run's flags come from the server's claim (`useAssistRun`); the strings are `vega-assists`.
 */
import { useTranslation } from 'react-i18next';
import { AssistStartNotice } from '@/components/games/assist-run-island';
import { useGameStore } from '@features/vega/engine/GameState';

/** One line on the board while an assisted run is under way. */
export function RunAssistBanner() {
  const { t } = useTranslation('vega-assists');
  const active = useGameStore((s) => s.assist.active);
  if (!active) return null;
  return (
    <p
      className="vg-tag"
      role="status"
      data-testid="vega-assist-banner"
      style={{
        position: 'absolute',
        top: 14,
        left: 18,
        zIndex: 3,
        margin: 0,
        padding: '2px 8px',
        background: 'var(--vg-void)',
      }}
    >
      {t('banner', { defaultValue: 'Assists on: this run is not ranked' })}
    </p>
  );
}

/**
 * The pause with no scrim: the board stays in reach (place, sell, upgrade), and the way out of the run is
 * three buttons. Shown instead of the pause dialog when the run honours no-timed-input.
 */
export function PausedStrip({ onQuit, onAbandon }: { onQuit: () => void; onAbandon: () => void }) {
  const { t } = useTranslation('vega-assists');
  const setPaused = useGameStore((s) => s.setPaused);
  return (
    <div
      role="group"
      aria-label={t('paused-aria', { defaultValue: 'Paused. The board is still open.' })}
      data-testid="vega-paused-strip"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 14,
        transform: 'translateX(-50%)',
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        justifyContent: 'center',
        padding: '8px 12px',
        background: 'var(--vg-void)',
        border: '1px solid var(--vg-line)',
      }}
    >
      <span role="status" style={{ fontSize: 13, color: 'var(--vg-muted)' }}>
        {t('paused-open', { defaultValue: 'Paused. You can still place, sell and upgrade.' })}
      </span>
      <button type="button" className="vg-btn vg-btn-sm vg-btn-primary" onClick={() => setPaused(false)}>
        {t('resume', { defaultValue: 'Resume' })}
      </button>
      <button type="button" className="vg-btn vg-btn-sm" onClick={onQuit}>
        {t('quit-to-menu', { defaultValue: 'Quit to menu' })}
      </button>
      <button type="button" className="vg-btn vg-btn-sm vg-btn-danger" onClick={onAbandon}>
        {t('abandon', { defaultValue: 'Close the case' })}
      </button>
    </div>
  );
}

/** The start screen: the shared notice when assists are on, and the way to the one settings page. */
export function AssistMenuLines({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation('vega-assists');
  if (!signedIn) return null;
  return (
    <div style={{ marginTop: 10, fontSize: 13, color: 'var(--vg-faint)' }}>
      <AssistStartNotice signedIn={signedIn} className="" />
      <p style={{ margin: '4px 0 0' }}>
        <a href="/settings/game-assists" className="underline">
          {t('settings-link', { defaultValue: 'Game assists' })}
        </a>
      </p>
    </div>
  );
}

/** The end-screen line for a run the server kept off the board. */
export function EndNotRanked({ ranked }: { ranked: boolean | null }) {
  const { t } = useTranslation('vega-assists');
  if (ranked !== false) return null;
  return (
    <p
      className="vg-mono"
      role="status"
      data-testid="vega-not-ranked"
      style={{ fontSize: 13, color: 'var(--vg-muted)' }}
    >
      {t('end-not-ranked', { defaultValue: 'Not ranked: assists were on' })}
    </p>
  );
}
