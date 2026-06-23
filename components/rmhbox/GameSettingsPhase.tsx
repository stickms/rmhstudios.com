/**
 * GameSettingsPhase — Full-screen phase displayed after a game vote.
 *
 * The host can tweak per-game settings before the game launches.
 * Non-host players see the same settings in real time (read-only).
 * A 30-second countdown timer auto-confirms when it runs out.
 *
 * The host may press "Confirm & Start" to skip the countdown,
 * or "Reset to Defaults" to revert changes.
 *
 * Reference: docs/rmhbox/design-spec/core.md §12A.4.4
 */
'use client';

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Settings } from 'lucide-react';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';
import GameSettingsForm from './GameSettingsForm';

export default function GameSettingsPhase() {
  const { t } = useTranslation('c-rmhbox');
  const lobby = useRMHboxStore((s) => s.lobby);
  const settingsState = useRMHboxStore((s) => s.gameSettingsState);
  const timerInfo = useRMHboxStore((s) => s.timerInfo);

  const isHost = lobby?.hostUserId === lobby?.myUserId;
  const lobbyId = lobby?.lobbyId ?? '';

  const handleSettingChange = useCallback(
    (key: string, value: boolean | number | string) => {
      if (!lobbyId) return;
      emit(C2S.GAME_UPDATE_SETTINGS, { lobbyId, settings: { [key]: value } });
    },
    [lobbyId],
  );

  const handleReset = useCallback(() => {
    if (!lobbyId) return;
    emit(C2S.GAME_RESET_SETTINGS, { lobbyId });
  }, [lobbyId]);

  const handleConfirm = useCallback(() => {
    if (!lobbyId) return;
    emit(C2S.GAME_CONFIRM_SETTINGS, { lobbyId });
  }, [lobbyId]);

  // Fallback: no settings state yet (server event in-flight)
  if (!settingsState || !lobby) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-xl mb-3 text-(--rmhbox-text)">{t("loading-settings", { defaultValue: "Loading settings…" })}</div>
          <div
            className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto"
            style={{ borderColor: 'var(--rmhbox-accent)', borderTopColor: 'transparent' }}
          />
        </div>
      </div>
    );
  }

  const remaining = timerInfo?.remaining ?? null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 p-6 h-full justify-center">
      {/* Title */}
      <div className="text-center">
        <h1
          className="text-3xl font-bold text-(--rmhbox-text)"
          style={{ fontFamily: 'var(--rmhbox-font-display)' }}
        >
          <Settings className="mr-2 inline h-7 w-7 text-(--rmhbox-accent)" />
          {settingsState.displayName}
        </h1>
        <p className="mt-2 text-sm text-(--rmhbox-text-muted)">
          {isHost
            ? t("host-adjust-settings", { defaultValue: "Adjust settings before the game starts." })
            : t("guest-host-configuring", { defaultValue: "The host is configuring game settings." })}
        </p>
      </div>

      {/* Timer badge */}
      {remaining !== null && remaining > 0 && (
        <div
          className="rounded-full px-4 py-1.5 text-sm font-bold"
          style={{
            backgroundColor: remaining <= 5 ? 'var(--rmhbox-danger)' : 'var(--rmhbox-surface)',
            color: remaining <= 5 ? '#fff' : 'var(--rmhbox-text)',
            border: '1px solid var(--rmhbox-border)',
          }}
        >
          {t("starting-in", { remaining, defaultValue: "Starting in {{remaining}}s" })}
        </div>
      )}

      {/* Settings card */}
      <div className="w-full rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4">
        <GameSettingsForm
          schema={settingsState.schema}
          values={settingsState.currentValues}
          editable={isHost}
          onSettingChange={handleSettingChange}
          onReset={handleReset}
        />
      </div>

      {/* Host confirm button */}
      {isHost && (
        <button
          onClick={handleConfirm}
          className="flex items-center gap-2 rounded-lg bg-(--rmhbox-accent) px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-(--rmhbox-accent-hover)"
        >
          <Play className="h-4 w-4" />
          {t("confirm-and-start", { defaultValue: "Confirm & Start" })}
        </button>
      )}
    </div>
  );
}
