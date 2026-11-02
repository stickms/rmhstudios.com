/**
 * MultiplayerGameScreen — what a player sees once a multiplayer match starts.
 *
 * The lobby, class select, ready-up and the host's snapshot relay all work, but
 * the match itself is not built yet: nothing runs the shared simulation and
 * nothing draws it (the host loop and the snapshot renderer, "Phase 3F").
 * Until they exist this screen says so plainly and offers the way out. It used
 * to be an empty canvas under a "Tick N | players | enemies" debug line with no
 * exit, so pressing Start left every player stuck on a blank screen.
 *
 * When the match is implemented: the host runs the full simulation and
 * broadcasts state; clients receive snapshots, interpolate and render; both
 * send local input at 20 Hz and handle the level-up overlay.
 */

'use client';

import { useTranslation } from 'react-i18next';

interface MultiplayerGameScreenProps {
  lobbyId: string;
  /** Leave the lobby and return to the lobby browser. */
  onLeave: () => void;
}

export default function MultiplayerGameScreen({ lobbyId, onLeave }: MultiplayerGameScreenProps) {
  const { t } = useTranslation('c-altair');

  return (
    <div className="app-safe-pad fixed inset-0 flex items-center-safe justify-center-safe overflow-y-auto bg-(--altair-bg) px-6">
      <div role="alert" className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-bold text-(--altair-text)">
          {t('match-not-ready-title', { defaultValue: 'Multiplayer matches are not playable yet' })}
        </h1>
        <p className="text-(--altair-text-muted)">
          {t('match-not-ready-body', {
            defaultValue:
              'The lobby works, but the match screen is still being built. Leave the lobby and check back after the next update.',
          })}
        </p>
        <p className="font-mono text-xs text-(--altair-text-muted)">
          {t('lobby-label', { defaultValue: 'Lobby' })} {lobbyId}
        </p>
        <button
          type="button"
          onClick={onLeave}
          className="min-h-11 rounded-(--altair-radius) bg-(--altair-accent) px-6 py-2 font-semibold text-(--altair-accent-fg) transition-colors hover:bg-(--altair-accent-hover)"
        >
          {t('leave-lobby', { defaultValue: 'Leave Lobby' })}
        </button>
      </div>
    </div>
  );
}
