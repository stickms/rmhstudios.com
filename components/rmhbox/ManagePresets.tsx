/**
 * ManagePresets — every saved preset, per minigame, with rename, default and delete, for
 * tidying up outside a lobby (RMHBox settings; full-screen app tier, `--app-*`).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { errorField } from '@/lib/http';
import { MINIGAME_REGISTRY } from '@/lib/rmhbox/minigame-registry';
import { deleteRmhboxPresetApi, updateRmhboxPresetApi } from '@/lib/rmhbox/presets.contract';
import { PRESET_NAME_MAX, type PresetErrorCode, type RmhboxPreset } from '@/lib/rmhbox/presets';
import { PRESETS_KEY, presetsQuery } from '@/lib/rmhbox/presets.queries';

const button =
  'rounded-app-sm bg-app-surface-hover px-2.5 py-1 text-xs font-semibold text-app-text transition-colors hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed';

// A finished rename or delete unmounts the control that had focus; keep it inside the section.
const focusHeading = () => setTimeout(() => document.getElementById('rmhbox-manage-presets')?.focus());

export default function ManagePresets() {
  const { t } = useTranslation('rmhbox-presets');
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery(presetsQuery(undefined, !!session));
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: PRESETS_KEY });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; isDefault?: boolean } }) =>
      api(updateRmhboxPresetApi, { params: { id }, body }),
    onSuccess: () => {
      setRenaming(null);
      focusHeading();
      void refresh();
    },
    onError: (error) =>
      toast.error(
        errorField<PresetErrorCode>(error, 'code') === 'name-taken'
          ? t('name-taken', { defaultValue: 'You already have a preset with that name' })
          : t('save-failed', { defaultValue: 'Could not save the preset' }),
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(deleteRmhboxPresetApi, { params: { id } }),
    onSuccess: () => {
      setDeleting(null);
      focusHeading();
      toast.success(t('deleted', { defaultValue: 'Preset deleted' }));
      void refresh();
    },
    onError: () => toast.error(t('save-failed', { defaultValue: 'Could not save the preset' })),
  });

  if (!session) return null;

  const groups = new Map<string, RmhboxPreset[]>();
  for (const p of data?.presets ?? []) groups.set(p.minigameId, [...(groups.get(p.minigameId) ?? []), p]);
  const busy = patch.isPending || remove.isPending;

  return (
    <section aria-labelledby="rmhbox-manage-presets" className="space-y-2">
      <h4 id="rmhbox-manage-presets" tabIndex={-1} className="text-xs font-semibold text-app-text-muted">
        {t('manage-title', { defaultValue: 'Manage presets' })}
      </h4>
      {isPending && <p className="text-xs text-app-text-muted">{t('loading', { defaultValue: 'Loading presets' })}</p>}
      {isError && (
        <p className="text-xs text-app-text-muted">
          {t('load-failed', { defaultValue: 'Presets could not be loaded' })}
        </p>
      )}
      {data && groups.size === 0 && (
        <p className="text-xs text-app-text-muted">
          {t('manage-empty', { defaultValue: 'No presets yet. Save one from a game’s settings.' })}
        </p>
      )}
      {[...groups].map(([minigameId, presets]) => (
        <div key={minigameId}>
          <p className="text-xs font-semibold text-app-text">
            {MINIGAME_REGISTRY[minigameId]?.displayName ?? minigameId}
          </p>
          <ul>
            {presets.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 border-b border-app-border py-1.5">
                {renaming?.id === p.id ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = renaming.name.trim();
                      if (name) patch.mutate({ id: p.id, body: { name } });
                    }}
                  >
                    <input
                      aria-label={t('name-label', { defaultValue: 'Preset name' })}
                      autoFocus
                      value={renaming.name}
                      maxLength={PRESET_NAME_MAX}
                      onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                      className="h-8 min-w-0 flex-1 rounded-app-sm border border-app-border bg-app-bg px-2 text-sm text-app-text"
                    />
                    <button type="submit" className={button} disabled={busy || !renaming.name.trim()}>
                      {t('save', { defaultValue: 'Save' })}
                    </button>
                    <button
                      type="button"
                      className={button}
                      onClick={() => {
                        setRenaming(null);
                        focusHeading();
                      }}
                    >
                      {t('cancel', { defaultValue: 'Cancel' })}
                    </button>
                  </form>
                ) : deleting === p.id ? (
                  <>
                    <span className="flex-1 text-xs text-app-text">
                      {t('delete-title', { defaultValue: 'Delete this preset?' })}
                    </span>
                    <button type="button" className={button} disabled={busy} onClick={() => remove.mutate(p.id)}>
                      {t('delete', { defaultValue: 'Delete' })}
                    </button>
                    <button
                      type="button"
                      className={button}
                      autoFocus
                      onClick={() => {
                        setDeleting(null);
                        focusHeading();
                      }}
                    >
                      {t('cancel', { defaultValue: 'Cancel' })}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm text-app-text">
                      {p.name}
                      {p.isDefault && (
                        <span className="ml-2 text-xs text-app-text-muted">
                          {t('default-badge', { defaultValue: 'Default' })}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() => setRenaming({ id: p.id, name: p.name })}
                    >
                      {t('rename', { defaultValue: 'Rename' })}
                    </button>
                    <button type="button" className={button} disabled={busy} onClick={() => setDeleting(p.id)}>
                      {t('delete', { defaultValue: 'Delete' })}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
