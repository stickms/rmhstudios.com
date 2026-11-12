import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { toast } from '@/lib/toast';

import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/contract/client';
import { MIN_SPEED_FLOOR, type AssistSettings } from '@/lib/game/assist';
import { setAssistsApi } from '@/lib/game/assist.contract';
import { gameAssistsQuery } from '@/lib/settings/prefs.queries';
import { SettingsSection } from '@/components/settings/SettingsSection';

/**
 * Cross-game assists (P7), in Settings → Appearance.
 *
 * ## The panel says what is true
 *
 * `honouredBy` comes back from the server and is empty today, because no game
 * reads an assist profile yet. The panel prints that rather than hiding it.
 *
 * That is not self-deprecation, it is the only honest thing to render: a
 * settings page offering five switches that change nothing, with no indication
 * that they change nothing, teaches a member that the site's accessibility
 * controls are decorative. Saying "no games yet" costs a line and keeps the
 * switches meaningful for the day one is listed.
 *
 * The leaderboard consequence is stated above the switches, not below them.
 * It is the thing somebody most needs to know BEFORE flipping one.
 */

export function GameAssistPanel() {
  const { t } = useTranslation('site');
  const queryClient = useQueryClient();
  const query = gameAssistsQuery();
  // A failed read leaves `state` undefined: the panel simply does not render, and that is not a toast.
  const { data: state } = useQuery(query);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (patch: Partial<AssistSettings>) => {
      setSaving(true);
      try {
        queryClient.setQueryData(query.queryKey, await api(setAssistsApi, { body: patch }));
      } catch {
        toast.error(t('assists-error', { defaultValue: 'Could not save that.' }));
      } finally {
        setSaving(false);
      }
    },
    [t, queryClient, query.queryKey],
  );

  if (!state) return null;
  const a = state.assists;

  const SWITCHES: { key: keyof AssistSettings; label: string; hint: string }[] = [
    {
      key: 'holdToPress',
      label: t('assists-hold-label', { defaultValue: 'Hold instead of mash' }),
      hint: t('assists-hold-hint', {
        defaultValue: 'A held button stands in for repeated presses.',
      }),
    },
    {
      key: 'calmVisuals',
      label: t('assists-calm-label', { defaultValue: 'Calm visuals' }),
      hint: t('assists-calm-hint', {
        defaultValue: 'Suppress flashing, strobing and screen shake inside games.',
      }),
    },
    {
      key: 'colorSafe',
      label: t('assists-color-label', { defaultValue: 'Never colour alone' }),
      hint: t('assists-color-hint', {
        defaultValue: 'Games mark state with shape or text as well as hue.',
      }),
    },
    {
      key: 'noTimedInput',
      label: t('assists-timing-label', { defaultValue: 'Remove reaction timers' }),
      hint: t('assists-timing-hint', {
        defaultValue: 'Reaction-time windows are extended or removed where a game has them.',
      }),
    },
  ];

  return (
    <SettingsSection
      title={t('assists-title', { defaultValue: 'Game assists' })}
      description={t('assists-subtitle', {
        defaultValue: 'Settings games apply so they stay playable.',
      })}
    >
      <p className="surface-field rounded-site p-4 text-sm text-site-text">
        {t('assists-ranked-warning', {
          defaultValue:
            'A run with any assist on does not count towards leaderboards or ranked play. A board that mixed assisted and unassisted runs would measure nothing.',
        })}
      </p>

      <div className="space-y-3">
        {/* A `div`, not a `label`: Radix's Switch renders a `button`, which a
            wrapping label does not associate with — the control is named by
            `aria-labelledby` pointing at the text instead, which is what a
            screen reader actually reads. */}
        {SWITCHES.map((s) => (
          <div key={s.key} className="chrome-row flex items-start justify-between gap-4">
            <span>
              <span id={`assist-${s.key}`} className="block text-sm font-medium text-site-text">
                {s.label}
              </span>
              <span id={`assist-${s.key}-hint`} className="block text-xs text-site-text-muted">
                {s.hint}
              </span>
            </span>
            <Switch
              checked={Boolean(a[s.key])}
              disabled={saving}
              onCheckedChange={(next) => void save({ [s.key]: next })}
              aria-labelledby={`assist-${s.key}`}
              aria-describedby={`assist-${s.key}-hint`}
            />
          </div>
        ))}

        <div>
          <label htmlFor="assist-speed" className="block text-sm font-medium text-site-text">
            {t('assists-speed-label', { defaultValue: 'Slow games down' })}
          </label>
          <p className="text-xs text-site-text-muted">
            {t('assists-speed-hint', {
              defaultValue: 'Runs the game clock slower where a game supports it.',
            })}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="assist-speed"
              type="range"
              min={MIN_SPEED_FLOOR * 100}
              max={100}
              step={5}
              value={Math.round(a.speedFloor * 100)}
              disabled={saving}
              onChange={(e) => void save({ speedFloor: Number(e.target.value) / 100 })}
              className="w-full max-w-xs accent-site-accent"
            />
            <span className="font-mono text-sm tabular-nums text-site-text">
              {Math.round(a.speedFloor * 100)}%
            </span>
          </div>
        </div>
      </div>

      <p className="border-t border-site-border pt-3 text-xs text-site-text-muted">
        {state.honouredBy.length === 0
          ? t('assists-none-yet-2', {
              defaultValue:
                'No game reads these yet — the layer landed before the games did. Your choices are saved and apply the moment one does. Slice It has its own assist settings, in its own options.',
            })
          : t('assists-honoured-by', {
              defaultValue: 'Applied by: {{games}}.',
              games: state.honouredBy.join(', '),
            })}
      </p>
    </SettingsSection>
  );
}
