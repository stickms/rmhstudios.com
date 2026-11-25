/** The last 50 rolls of this character, on this device only, with copy and clear. */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import type { RollsApi } from './useRolls';

export function RollLog({ rolls }: { rolls: RollsApi }) {
  const { t } = useTranslation('character-rolls');
  const { entries } = rolls;
  return (
    <details className="text-sm">
      <summary className="min-h-9 cursor-pointer py-1.5 font-medium text-app-text-muted pointer-coarse:min-h-11">
        {t('log.title', { defaultValue: 'Roll log ({{n}})', n: entries.length })}
      </summary>
      {entries.length === 0 ? (
        <p className="py-2 text-app-text-muted">{t('log.empty', { defaultValue: 'No rolls yet.' })}</p>
      ) : (
        <>
          <p className="py-1 text-xs text-app-text-muted">
            {t('log.private', { defaultValue: 'Kept on this device only. Nobody else sees it.' })}
          </p>
          <ul>
            {entries.map((e) => (
              <li
                key={`${e.at}-${e.text}`}
                className="flex flex-wrap items-baseline gap-x-3 border-b border-app-border py-1.5"
              >
                <span className="font-medium text-app-text">{e.label}</span>
                <span className="font-mono text-xs tabular-nums text-app-text-muted">{e.text}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-2">
            <CopyButton
              value={entries.map((e) => `${e.label}: ${e.text}`).join('\n')}
              label={t('log.copy', { defaultValue: 'Copy log' })}
              variant="ghost"
            >
              {t('log.copy', { defaultValue: 'Copy log' })}
            </CopyButton>
            <Button type="button" variant="ghost" onClick={rolls.clear}>
              {t('log.clear', { defaultValue: 'Clear log' })}
            </Button>
          </div>
        </>
      )}
    </details>
  );
}
