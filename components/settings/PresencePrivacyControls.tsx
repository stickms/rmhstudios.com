import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Radio } from 'lucide-react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import {
  PRESENCE_VISIBILITIES,
  DEFAULT_PRESENCE_VISIBILITY,
  type PresenceVisibility,
} from '@/lib/presence-types';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { setPresencePrefsApi } from '@/lib/preferences/preferences.contract';
import { presencePrefsQuery } from '@/lib/settings/prefs.queries';
import { api } from '@/lib/contract/client';

/**
 * PresencePrivacyControls (§9) — who may see the user in the Friends rail /
 * activity line, and whether they see activity detail or only online/offline.
 * Sits in Settings → Privacy near DM privacy. Saves to
 * /api/preferences/presence.
 */
export function PresencePrivacyControls() {
  const { t } = useTranslation('site');
  const queryClient = useQueryClient();
  const query = presencePrefsQuery();
  const { data, isPending } = useQuery(query);
  const visibility: PresenceVisibility = data?.presenceVisibility ?? DEFAULT_PRESENCE_VISIBILITY;
  const detail = data?.presenceDetail ?? true;
  const loaded = !isPending;

  function persist(body: { presenceVisibility?: PresenceVisibility; presenceDetail?: boolean }) {
    // Shown at once; a failed save toasts and leaves the choice on screen, as it always did.
    queryClient.setQueryData(query.queryKey, {
      presenceVisibility: visibility,
      presenceDetail: detail,
      ...body,
    });
    api(setPresencePrefsApi, { body }).catch(() =>
      toast.error(t('presence-save-error', { defaultValue: 'Could not save' })),
    );
  }

  const VIS_LABEL: Record<PresenceVisibility, string> = {
    mutuals: t('presence-vis-mutuals', { defaultValue: 'Friends (mutuals)' }),
    followers: t('presence-vis-followers', { defaultValue: 'People I follow back' }),
    nobody: t('presence-vis-nobody', { defaultValue: 'Nobody' }),
  };

  return (
    <SettingsSection
      icon={Radio}
      title={t('presence-title', { defaultValue: 'Activity & presence' })}
      description={t('presence-subtitle', {
        defaultValue: 'Control who sees when you are online and what you are doing.',
      })}
    >
      <fieldset disabled={!loaded}>
        <legend className="mb-2 text-sm font-medium text-site-text">
          {t('presence-who', { defaultValue: 'Who can see my presence' })}
        </legend>
        <div className="flex flex-col gap-1">
          {PRESENCE_VISIBILITIES.map((v) => (
            <label
              key={v}
              className="flex cursor-pointer items-center gap-3 rounded-site-sm px-3 py-2 hover:bg-site-surface-hover"
            >
              <input
                type="radio"
                name="presence-visibility"
                value={v}
                checked={visibility === v}
                onChange={() => {
                  persist({ presenceVisibility: v });
                }}
                className="accent-site-accent"
              />
              <span className="text-sm text-site-text">{VIS_LABEL[v]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3 border-t border-site-border pt-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-site-text">
            {t('presence-detail', { defaultValue: 'Show activity detail' })}
          </p>
          <p className="text-xs text-site-text-muted">
            {t('presence-detail-hint', {
              defaultValue: 'Off shows only that you are online — never what you are playing.',
            })}
          </p>
        </div>
        <Switch
          checked={detail}
          disabled={!loaded || visibility === 'nobody'}
          onCheckedChange={(v) => {
            persist({ presenceDetail: v });
          }}
          aria-label={t('presence-detail', { defaultValue: 'Show activity detail' })}
        />
      </div>
    </SettingsSection>
  );
}
