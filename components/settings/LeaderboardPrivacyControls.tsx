import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';

import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { api } from '@/lib/contract/client';
import { setLeaderboardPrivacyApi } from '@/lib/game/leaderboard-privacy.contract';
import { leaderboardPrivacyQuery } from '@/lib/game/leaderboard-privacy.queries';

/**
 * Sprint 05 #01 — "Show me on game leaderboards", in Settings > Privacy. On by default. Turning it off
 * leaves the account off every public game board on the next board read (within a minute); the member
 * still sees their own best and where it would rank. The boards enforce it on the server, this only
 * saves the preference. The switch takes effect at once (the query cache is updated before the server
 * answers) and goes back if the save fails.
 */
export function LeaderboardPrivacyControls() {
  const { t } = useTranslation('leaderboard-privacy');
  const nameId = useId();
  const hintId = useId();
  const queryClient = useQueryClient();
  const query = leaderboardPrivacyQuery();
  const { data, isPending, isError } = useQuery(query);
  const [saving, setSaving] = useState(false);

  const listed = !(data?.hidden ?? false);
  const ready = !isPending && !isError && !!data;

  const change = async (nextListed: boolean) => {
    setSaving(true);
    const previous = data;
    queryClient.setQueryData(query.queryKey, { hidden: !nextListed });
    try {
      const saved = await api(setLeaderboardPrivacyApi, { body: { hidden: !nextListed } });
      queryClient.setQueryData(query.queryKey, saved);
    } catch {
      queryClient.setQueryData(query.queryKey, previous);
      toast.error(t('save-failed', { defaultValue: 'Could not save that setting' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection title={t('title', { defaultValue: 'Leaderboards' })}>
      <div className="settings-row">
        <span className="settings-row__text">
          <span id={nameId} className="settings-row__name block">
            {t('show-me', { defaultValue: 'Show me on game leaderboards' })}
          </span>
          <span id={hintId} className="settings-row__hint block">
            {isError
              ? t('load-failed', {
                  defaultValue: 'Could not load this setting. Reload the page to try again.',
                })
              : t('show-me-hint', {
                  defaultValue:
                    'When this is off, your scores stay yours but you are left off every public board. You still see your own best and where it would rank.',
                })}
          </span>
        </span>
        <Switch
          checked={listed}
          onCheckedChange={(v) => void change(v)}
          disabled={!ready || saving}
          aria-labelledby={nameId}
          aria-describedby={hintId}
        />
      </div>
    </SettingsSection>
  );
}
