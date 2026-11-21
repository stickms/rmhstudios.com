/**
 * PresetBar — the host's saved settings for the minigame being configured (full-screen app
 * tier, `--app-*`). Pick one to fill the form, save the current values under a name, update,
 * rename, delete (with an inline confirmation) or mark one as the default for this minigame.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { Select } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { errorField } from '@/lib/http';
import {
  createRmhboxPresetApi,
  deleteRmhboxPresetApi,
  updateRmhboxPresetApi,
} from '@/lib/rmhbox/presets.contract';
import { PRESET_NAME_MAX, PRESETS_PER_GAME, type PresetErrorCode } from '@/lib/rmhbox/presets';
import { PRESETS_KEY, presetsQuery } from '@/lib/rmhbox/presets.queries';
import type { GameSettingValues } from '@/lib/rmhbox/types';
import { useApplyPreset, usePresetSelection } from './use-presets';

interface PresetBarProps {
  lobbyId: string;
  minigameId: string;
  /** The form's current values (what "Save as preset" and "Update" store). */
  values: GameSettingValues;
}

type Mode = 'save' | 'rename' | 'delete' | null;

const button =
  'rounded-app-sm bg-app-surface-hover px-3 py-1.5 text-xs font-semibold text-app-text transition-colors hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed';

export default function PresetBar({ lobbyId, minigameId, values }: PresetBarProps) {
  const { t } = useTranslation('rmhbox-presets');
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery(presetsQuery(minigameId, !!session));
  const apply = useApplyPreset(lobbyId, minigameId);
  const selectedId = usePresetSelection((s) => s.selected[minigameId]);
  const setSelection = usePresetSelection((s) => s.set);
  const notice = usePresetSelection((s) => !!s.notice[minigameId]);
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState('');

  const presets = data?.presets ?? [];
  const selected = presets.find((p) => p.id === selectedId);

  const refresh = () => queryClient.invalidateQueries({ queryKey: PRESETS_KEY });

  const failure = (error: unknown) => {
    const code = errorField<PresetErrorCode>(error, 'code');
    if (code === 'name-taken') {
      toast.error(t('name-taken', { defaultValue: 'You already have a preset with that name' }));
    } else if (code === 'game-limit') {
      toast.error(t('game-limit', { defaultValue: 'You can keep 10 presets per game' }));
    } else if (code === 'total-limit') {
      toast.error(t('total-limit', { defaultValue: 'You can keep 100 presets in total' }));
    } else {
      toast.error(t('save-failed', { defaultValue: 'Could not save the preset' }));
    }
  };

  const create = useMutation({
    mutationFn: (presetName: string) => api(createRmhboxPresetApi, { body: { minigameId, name: presetName, values } }),
    onSuccess: ({ preset }) => {
      setSelection(minigameId, preset.id, false);
      close();
      toast.success(t('saved', { defaultValue: 'Preset saved' }));
      void refresh();
    },
    onError: failure,
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; values?: GameSettingValues; isDefault?: boolean } }) =>
      api(updateRmhboxPresetApi, { params: { id }, body }),
    onSuccess: () => {
      close();
      void refresh();
    },
    onError: failure,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(deleteRmhboxPresetApi, { params: { id } }),
    onSuccess: () => {
      setSelection(minigameId, undefined, false);
      close();
      toast.success(t('deleted', { defaultValue: 'Preset deleted' }));
      void refresh();
    },
    onError: failure,
  });

  if (!session) return null;

  const busy = create.isPending || patch.isPending || remove.isPending;
  const full = presets.length >= PRESETS_PER_GAME;

  // Closing an inline form or confirmation unmounts the control that opened it; focus goes back
  // to the preset select so a keyboard user is not dropped onto the page.
  const close = () => {
    setMode(null);
    setTimeout(() => document.getElementById('rmhbox-preset-select')?.focus());
  };
  const onEscape = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  const open = (next: Mode) => {
    setName(next === 'rename' ? (selected?.name ?? '') : '');
    setMode(next);
  };

  const submitName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (mode === 'save') create.mutate(trimmed);
    else if (mode === 'rename' && selected) patch.mutate({ id: selected.id, body: { name: trimmed } });
  };

  return (
    <div className="mb-3 space-y-2 border-b border-app-border pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="rmhbox-preset-select" className="text-xs font-semibold text-app-text-muted">
          {t('preset', { defaultValue: 'Preset' })}
        </label>
        <Select
          id="rmhbox-preset-select"
          tier="app"
          controlSize="sm"
          containerClassName="inline-block"
          className="w-auto min-w-36"
          value={selected?.id ?? ''}
          disabled={isPending || isError || busy}
          onChange={(e) => apply(presets.find((p) => p.id === e.target.value) ?? null)}
        >
          <option value="">{t('game-defaults', { defaultValue: 'Game defaults' })}</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.isDefault ? t('default-option', { defaultValue: '{{name}} (default)', name: p.name }) : p.name}
            </option>
          ))}
        </Select>
        {isError && (
          <span className="text-xs text-app-text-muted">
            {t('load-failed', { defaultValue: 'Presets could not be loaded' })}
          </span>
        )}
      </div>

      {mode === null && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy || isPending || full} onClick={() => open('save')}>
            {t('save-as', { defaultValue: 'Save as preset' })}
          </button>
          {selected && (
            <>
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() => {
                  patch.mutate(
                    { id: selected.id, body: { values } },
                    { onSuccess: () => toast.success(t('updated', { defaultValue: 'Preset updated' })) },
                  );
                  setSelection(minigameId, selected.id, false);
                }}
              >
                {t('update', { defaultValue: 'Update' })}
              </button>
              <button type="button" className={button} disabled={busy} onClick={() => open('rename')}>
                {t('rename', { defaultValue: 'Rename' })}
              </button>
              <button
                type="button"
                className={button}
                disabled={busy}
                aria-pressed={selected.isDefault}
                onClick={() => patch.mutate({ id: selected.id, body: { isDefault: !selected.isDefault } })}
              >
                {selected.isDefault
                  ? t('clear-default', { defaultValue: 'Stop using by default' })
                  : t('use-default', { defaultValue: 'Use by default' })}
              </button>
              <button type="button" className={button} disabled={busy} onClick={() => setMode('delete')}>
                {t('delete', { defaultValue: 'Delete' })}
              </button>
            </>
          )}
        </div>
      )}
      {mode === null && full && (
        <p className="text-xs text-app-text-muted">{t('game-limit', { defaultValue: 'You can keep 10 presets per game' })}</p>
      )}

      {(mode === 'save' || mode === 'rename') && (
        <form
          className="flex flex-wrap items-center gap-2"
          onKeyDown={onEscape}
          onSubmit={(e) => {
            e.preventDefault();
            submitName();
          }}
        >
          <label htmlFor="rmhbox-preset-name" className="sr-only">
            {t('name-label', { defaultValue: 'Preset name' })}
          </label>
          <input
            id="rmhbox-preset-name"
            autoFocus
            value={name}
            maxLength={PRESET_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('name-placeholder', { defaultValue: 'Quick round' })}
            className="h-9 min-w-40 flex-1 rounded-app-sm border border-app-border bg-app-bg px-2 text-sm text-app-text"
          />
          <button type="submit" className={button} disabled={busy || !name.trim()}>
            {mode === 'save' ? t('save', { defaultValue: 'Save' }) : t('rename', { defaultValue: 'Rename' })}
          </button>
          <button type="button" className={button} onClick={close}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </button>
        </form>
      )}

      {mode === 'delete' && selected && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t('delete-title', { defaultValue: 'Delete this preset?' })}
          onKeyDown={onEscape}
        >
          <span className="text-xs text-app-text">{t('delete-title', { defaultValue: 'Delete this preset?' })}</span>
          <button type="button" className={button} disabled={busy} onClick={() => remove.mutate(selected.id)}>
            {t('delete', { defaultValue: 'Delete' })}
          </button>
          <button type="button" className={button} autoFocus onClick={close}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </button>
        </div>
      )}

      <p role="status" aria-live="polite" className="text-xs text-app-text-muted">
        {notice ? t('reset-notice', { defaultValue: 'Some settings were reset because the game changed' }) : ''}
      </p>
    </div>
  );
}
