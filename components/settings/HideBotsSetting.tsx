'use client';

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { setHideBots, useHideBots } from '@/lib/devplatform/hide-bots';
import { SettingsSection } from '@/components/settings/SettingsSection';

/** D4 — "Hide automated accounts" in Settings → Content preferences. */
export function HideBotsSetting() {
  const { t } = useTranslation('f-devplatform');
  const labelId = useId();
  const hintId = useId();
  const on = useHideBots();
  return (
    <SettingsSection
      surface="fill"
      icon={Bot}
      title={t('hideBots-title', { defaultValue: 'Hide automated accounts' })}
      titleId={labelId}
      description={t('hideBots-hint', {
        defaultValue:
          'Leave posts from bot accounts out of your feed on this device. They stay labelled Automated wherever you do see them.',
      })}
      descriptionId={hintId}
      action={
        <Switch
          checked={on}
          onCheckedChange={setHideBots}
          aria-labelledby={labelId}
          aria-describedby={hintId}
        />
      }
    />
  );
}
