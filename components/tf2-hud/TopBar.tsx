/**
 * The editor's top bar: back, HUD name, save status, history, and the three
 * big actions — import, download, save & share.
 */
'use client';

import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Command,
  Download,
  FileDiff,
  FolderUp,
  Redo2,
  Save,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTf2HudPrefs } from '@/lib/tf2-hud/prefs';
import { changedFiles } from '@/lib/tf2-hud/project/model';
import { useEditor, type SaveState } from '@/lib/tf2-hud/store';
import { Btn, IconBtn, Pill } from './ui';

export default function TopBar({
  onImport,
  onExport,
  onSave,
  onPalette,
  onAssistant,
}: {
  onImport: () => void;
  onExport: () => void;
  onSave: () => void;
  onPalette: () => void;
  onAssistant: () => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const meta = useEditor((s) => s.meta);
  const setMeta = useEditor((s) => s.setMeta);
  const saveState = useEditor((s) => s.saveState);
  const lastAutosaveAt = useEditor((s) => s.lastAutosaveAt);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const overlay = useEditor((s) => s.overlay);
  const baseIndex = useEditor((s) => s.baseIndex);
  const setPref = useTf2HudPrefs((s) => s.set);

  const changed = changedFiles(overlay, baseIndex).length;

  const status: Record<
    SaveState,
    { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info' }
  > = {
    local: {
      label: lastAutosaveAt
        ? t('status-local-at', {
            defaultValue: 'Autosaved {{time}}',
            time: new Date(lastAutosaveAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          })
        : t('status-local', { defaultValue: 'Saved on this device' }),
      tone: 'neutral',
    },
    dirty: { label: t('status-dirty', { defaultValue: 'Unsaved changes' }), tone: 'warning' },
    saving: { label: t('status-saving', { defaultValue: 'Saving…' }), tone: 'info' },
    saved: { label: t('status-saved', { defaultValue: 'Saved to account' }), tone: 'success' },
    error: { label: t('status-error', { defaultValue: 'Save failed' }), tone: 'danger' },
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-(--app-border) bg-(--app-bg-subtle) px-2 sm:px-3">
      <Link
        to="/tf2/hud-editor"
        className="flex shrink-0 items-center gap-1.5 rounded-(--app-radius-sm) px-2 py-1 text-sm font-medium text-(--app-text-muted) hover:text-(--app-text)"
      >
        <ArrowLeft className="size-4 rtl-flip" aria-hidden />
        <span className="hidden sm:inline">{t('back', { defaultValue: 'Back' })}</span>
      </Link>

      <input
        value={meta.name}
        maxLength={80}
        onChange={(e) => setMeta({ name: e.target.value })}
        aria-label={t('hud-name', { defaultValue: 'HUD name' })}
        className="tf2hud-title h-9 min-w-0 max-w-64 flex-1 rounded-(--app-radius-sm) border border-transparent bg-transparent px-2 text-xl text-(--app-text) hover:border-(--app-border-bright) focus-visible:border-(--app-accent)"
      />
      <span className="hidden md:inline">
        <Pill tone={status[saveState].tone}>{status[saveState].label}</Pill>
      </span>

      <div className="ms-auto flex items-center gap-1">
        <IconBtn
          icon={Undo2}
          label={`${t('undo', { defaultValue: 'Undo' })} (Ctrl+Z)`}
          disabled={!canUndo}
          onClick={undo}
        />
        <IconBtn
          icon={Redo2}
          label={`${t('redo', { defaultValue: 'Redo' })} (Ctrl+Shift+Z)`}
          disabled={!canRedo}
          onClick={redo}
        />
        <button
          type="button"
          onClick={() => {
            setPref('rightOpen', true);
            setPref('rightTab', 'diff');
          }}
          className="hidden h-8 items-center gap-1.5 rounded-(--app-radius-sm) px-2 text-xs font-semibold text-(--app-text-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text) sm:inline-flex"
          aria-label={t('changed-count', {
            defaultValue: '{{count}} changed files',
            count: changed,
          })}
        >
          <FileDiff className="size-4" aria-hidden />
          {changed}
        </button>
        <IconBtn
          icon={Sparkles}
          label={t('hud-ai-open', { defaultValue: 'Ask AI to change the HUD' })}
          onClick={onAssistant}
        />
        <IconBtn
          icon={Command}
          label={t('command-palette', { defaultValue: 'Command palette' })}
          onClick={onPalette}
        />
        <Btn variant="ghost" icon={FolderUp} onClick={onImport} className="hidden lg:inline-flex">
          {t('import-zip', { defaultValue: 'Import zip' })}
        </Btn>
        <Btn variant="secondary" icon={Download} onClick={onExport}>
          <span className="hidden sm:inline">{t('download', { defaultValue: 'Download' })}</span>
        </Btn>
        <Btn variant="primary" icon={Save} onClick={onSave}>
          <span className="hidden sm:inline">
            {t('save-share', { defaultValue: 'Save & share' })}
          </span>
        </Btn>
      </div>
    </header>
  );
}
