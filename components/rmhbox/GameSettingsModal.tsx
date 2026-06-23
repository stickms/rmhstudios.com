/**
 * GameSettingsModal — Modal overlay for viewing / editing per-minigame settings.
 *
 * Used in lobby (WAITING state) for host pre-configuration and
 * non-host read-only viewing. The actual settings controls are
 * rendered by the shared GameSettingsForm component.
 *
 * Uses createPortal (like GamePickerModal) so the panel escapes any
 * `overflow:hidden` ancestor.
 *
 * Reference: docs/rmhbox/design-spec/core.md §12A.7
 */
'use client';

import { createPortal } from 'react-dom';
import { X, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GameSettingsSchema, GameSettingValues } from '@/lib/rmhbox/types';
import GameSettingsForm from './GameSettingsForm';

// ─── Props ───────────────────────────────────────────────────────

interface GameSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  displayName: string;
  schema: GameSettingsSchema;
  values: GameSettingValues;
  /** If true the host can edit; otherwise all controls are disabled. */
  editable: boolean;
  /** Called when the host changes a single setting. */
  onSettingChange?: (key: string, value: boolean | number | string) => void;
  /** Called when the host resets all settings to defaults. */
  onReset?: () => void;
}

// ─── Modal Component ─────────────────────────────────────────────

export default function GameSettingsModal({
  isOpen,
  onClose,
  displayName,
  schema,
  values,
  editable,
  onSettingChange,
  onReset,
}: GameSettingsModalProps) {
  const { t } = useTranslation("c-rmhbox");

  if (!isOpen || schema.length === 0) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="rmhbox-overlay fixed inset-0 z-60 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="rmhbox-modal fixed inset-x-4 top-1/2 z-70 mx-auto max-w-md -translate-y-1/2 rounded-xl border p-5 shadow-2xl"
        style={{
          backgroundColor: 'var(--rmhbox-surface)',
          borderColor: 'var(--rmhbox-border)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-(--rmhbox-text)">
            <Settings className="h-5 w-5 text-(--rmhbox-accent)" />
            {t("game-settings-title", { defaultValue: "{{displayName}} Settings", displayName })}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-(--rmhbox-text-muted) hover:text-(--rmhbox-text)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Subtitle for non-host */}
        {!editable && (
          <p className="mb-3 text-xs text-(--rmhbox-text-muted)">
            {t("host-only-settings", { defaultValue: "Only the host can change game settings." })}
          </p>
        )}

        {/* Settings form — scrollable */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          <GameSettingsForm
            schema={schema}
            values={values}
            editable={editable}
            onSettingChange={onSettingChange}
            onReset={onReset}
          />
        </div>
      </div>
    </>,
    document.querySelector('.rmhbox-theme') ?? document.body,
  );
}
