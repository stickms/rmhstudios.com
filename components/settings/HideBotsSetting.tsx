'use client';

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { setHideBots, useHideBots } from '@/lib/devplatform/hide-bots';

/** D4 — "Hide automated accounts" in Settings → Content preferences. */
export function HideBotsSetting() {
  const { t } = useTranslation('f-devplatform');
  const labelId = useId();
  const hintId = useId();
  const on = useHideBots();
  return (
    <section className="glass-fill mb-6 flex items-start gap-3 rounded-site p-4">
      <Bot className="mt-0.5 h-5 w-5 shrink-0 text-site-text-dim" aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 id={labelId} className="text-sm font-semibold text-site-text">
          {t('hideBots-title', { defaultValue: 'Hide automated accounts' })}
        </h2>
        <p id={hintId} className="mt-0.5 text-sm text-site-text-muted">
          {t('hideBots-hint', {
            defaultValue:
              'Leave posts from bot accounts out of your feed on this device. They stay labelled Automated wherever you do see them.',
          })}
        </p>
      </div>
      <Switch
        checked={on}
        onCheckedChange={setHideBots}
        aria-labelledby={labelId}
        aria-describedby={hintId}
      />
    </section>
  );
}
