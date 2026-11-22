/**
 * The "Record key statistics" switch in the solo settings (on by default, kept on the device with the other solo
 * settings). Off means no run, solo, daily or lesson, sends key statistics.
 */
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';

export function RecordKeyStatsSwitch({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation('weak-keys');
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label id="rmhtype-keystats-label" className="block text-sm font-medium text-app-text-muted">
          {t('switch-label', { defaultValue: 'Record key statistics' })}
        </label>
        <p id="rmhtype-keystats-hint" className="mt-1 text-xs text-app-text-muted">
          {t('switch-hint', {
            defaultValue:
              'Counts per key: how often you pressed it, how often it was wrong, and how long it took. The order of what you typed is never stored.',
          })}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-labelledby="rmhtype-keystats-label"
        aria-describedby="rmhtype-keystats-hint"
      />
    </div>
  );
}
