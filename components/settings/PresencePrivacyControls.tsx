'use client';

import { useEffect, useState } from 'react';
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

/**
 * PresencePrivacyControls (§9) — who may see the user in the Friends rail /
 * activity line, and whether they see activity detail or only online/offline.
 * Sits in Settings → Privacy near DM privacy. Saves to
 * /api/preferences/presence.
 */
export function PresencePrivacyControls() {
  const { t } = useTranslation('site');
  const [visibility, setVisibility] = useState<PresenceVisibility>(DEFAULT_PRESENCE_VISIBILITY);
  const [detail, setDetail] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/preferences/presence', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { presenceVisibility?: PresenceVisibility; presenceDetail?: boolean } | null) => {
        if (d) {
          if (d.presenceVisibility) setVisibility(d.presenceVisibility);
          if (typeof d.presenceDetail === 'boolean') setDetail(d.presenceDetail);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function persist(body: { presenceVisibility?: PresenceVisibility; presenceDetail?: boolean }) {
    fetch('/api/preferences/presence', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    }).catch(() => toast.error(t('presence-save-error', { defaultValue: 'Could not save' })));
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
                  setVisibility(v);
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
            setDetail(v);
            persist({ presenceDetail: v });
          }}
          aria-label={t('presence-detail', { defaultValue: 'Show activity detail' })}
        />
      </div>
    </SettingsSection>
  );
}
