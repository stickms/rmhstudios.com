/**
 * The "Roll for the table" controls on a sheet's dice bar: the switch (off each time the sheet opens), who sees the
 * roll, the server's result, and the critical-damage follow-up. Present only while the sheet is opened from a party.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { parseLabel } from '@features/rmhcharacters/engine/party-rolls';
import { useAnnouncement } from './TableRolls';
import type { RollsApi, TableApi } from './useRolls';

export function TableRollControls({ rolls, table }: { rolls: RollsApi; table: TableApi }) {
  const { t } = useTranslation('party-rolls');
  const sentence = useAnnouncement();
  const last = table.last;
  // The kept d20 of a 5e attack the server rolled: a natural 20 offers the critical damage for the table.
  const natural =
    last && last.kind === 'attack' && rolls.system === '5e'
      ? last.mode === 'advantage'
        ? Math.max(...last.dice)
        : last.mode === 'disadvantage'
          ? Math.min(...last.dice)
          : (last.dice[0] ?? 0)
      : 0;
  const attack = last ? parseLabel(last.label) : null;

  return (
    <div className="rmhc-noprint flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={table.on}
            onCheckedChange={table.setOn}
            aria-label={t('switch', { defaultValue: 'Roll for the table' })}
          />
          <span className="text-sm font-medium text-app-text">
            {t('switch', { defaultValue: 'Roll for the table' })}
          </span>
        </div>
        {table.on ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-app-text-muted">{t('sees', { defaultValue: 'Who sees it' })}</span>
            <Select
              value={table.visibility}
              onChange={(e) =>
                table.setVisibility(
                  table.role === 'gm'
                    ? e.target.value === 'secret'
                      ? 'secret'
                      : 'table'
                    : e.target.value === 'gm'
                      ? 'gm'
                      : 'table',
                )
              }
            >
              <option value="table">{t('visibility.table', { defaultValue: 'The table' })}</option>
              {table.role === 'gm' ? (
                <option value="secret">{t('visibility.secret', { defaultValue: 'Only me' })}</option>
              ) : (
                <option value="gm">{t('visibility.gm', { defaultValue: 'Me and the game master' })}</option>
              )}
            </Select>
          </label>
        ) : null}
      </div>
      {table.on ? (
        <p className="max-w-2xl text-xs text-app-text-muted">
          {t('hint', {
            defaultValue:
              'The site rolls from your sheet and shows the result to the people you chose. Your device log is unchanged.',
          })}
        </p>
      ) : null}
      <div role="status" aria-live="polite" className="min-h-6 text-sm text-app-text">
        {last ? sentence(last) : null}
      </div>
      {table.on && natural === 20 && attack ? (
        <div>
          <Button
            type="button"
            disabled={table.pending}
            onClick={() => table.send({ kind: 'damage', index: attack.index, critical: true })}
          >
            {t('critical', { defaultValue: 'Roll critical damage for the table' })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
