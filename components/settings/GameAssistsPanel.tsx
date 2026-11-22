import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { api, apiQuery } from '@/lib/contract/client';
import { getAssistsApi, setAssistsApi, type AssistView } from '@/lib/game/assist.contract';
import { MIN_SPEED_FLOOR, type AssistSettings } from '@/lib/game/assist';
import { games } from '@/lib/catalog';
import { useArrival } from '@/components/ui/arrive';

/**
 * Settings > Game assists: the five switches every adopting game honours, saved on
 * change. Assisted runs are kept off the public boards but still count for progress;
 * the page says so, and names the games that honour the settings today.
 */

/** Whole percent for the slider (50 to 100) and back. */
const toPercent = (floor: number) => Math.round(floor * 100);
const MIN_PERCENT = Math.round(MIN_SPEED_FLOOR * 100);

export function GameAssistsPanel() {
  const { t } = useTranslation('game-assists');
  const queryClient = useQueryClient();
  const query = apiQuery(getAssistsApi);
  const { data, isPending, isError } = useQuery(query);
  const [saved, setSaved] = useState(false);
  const [draftPercent, setDraftPercent] = useState<number | null>(null);
  // The settings replace the skeleton once loaded: they fade in (M9).
  const arrival = useArrival(!isPending && !isError && !!data);
  const speedId = useId();
  const speedHintId = useId();

  const save = useMutation({
    mutationFn: (patch: Partial<AssistSettings>) =>
      api(setAssistsApi, {
        body: patch,
      }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({
        queryKey: query.queryKey,
      });
      const previous = queryClient.getQueryData<AssistView>(query.queryKey);
      if (previous) {
        queryClient.setQueryData<AssistView>(query.queryKey, {
          ...previous,
          assists: {
            ...previous.assists,
            ...patch,
          },
        });
      }
      setSaved(false);
      return {
        previous,
      };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(query.queryKey, context.previous);
      setDraftPercent(null);
      toast.error(
        t('save-failed', {
          defaultValue: 'Could not save that setting',
        }),
      );
    },
    onSuccess: (view) => {
      queryClient.setQueryData(query.queryKey, view);
      setDraftPercent(null);
      setSaved(true);
    },
  });

  if (isPending) {
    return (
      <SettingsSection
        title={t('section-title', {
          defaultValue: 'Assists',
        })}
      >
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </SettingsSection>
    );
  }
  if (isError || !data) {
    return (
      <SettingsSection
        title={t('section-title', {
          defaultValue: 'Assists',
        })}
      >
        <p className="t-body text-site-text-muted" role="alert">
          {t('load-failed', {
            defaultValue: 'Could not load your assists. Reload the page to try again.',
          })}
        </p>
      </SettingsSection>
    );
  }

  const { assists, honouredBy } = data;
  const percent = draftPercent ?? toPercent(assists.speedFloor);
  const titles = honouredBy.map((id) => games.find((g) => g.id === id)?.title ?? id);

  return (
    <>
      <SettingsSection
        className={arrival}
        title={t('section-title', {
          defaultValue: 'Assists',
        })}
        description={t('lede', {
          defaultValue:
            'Assisted runs are kept off the public boards but still count for progress, quests and coins. A run is assisted from the moment it starts, so switching these off mid-run does not put it on a board.',
        })}
      >
        <Row
          name={t('calm-name', {
            defaultValue: 'Calm visuals',
          })}
          hint={t('calm-hint', {
            defaultValue: 'No flashing, strobing or screen shake. Full-screen colour changes stay steady.',
          })}
          control={(labelId, hintId) => (
            <Switch
              checked={assists.calmVisuals}
              onCheckedChange={(v) =>
                save.mutate({
                  calmVisuals: v,
                })
              }
              aria-labelledby={labelId}
              aria-describedby={hintId}
            />
          )}
        />
        <Row
          name={t('color-name', {
            defaultValue: 'Colour-safe markers',
          })}
          hint={t('color-hint', {
            defaultValue:
              'Adds an outline, a shape or a letter wherever a game uses colour alone to tell things apart.',
          })}
          control={(labelId, hintId) => (
            <Switch
              checked={assists.colorSafe}
              onCheckedChange={(v) =>
                save.mutate({
                  colorSafe: v,
                })
              }
              aria-labelledby={labelId}
              aria-describedby={hintId}
            />
          )}
        />
        <Row
          name={t('hold-name', {
            defaultValue: 'Hold to press',
          })}
          hint={t('hold-hint', {
            defaultValue: 'Holding a key or button repeats the action, so you do not have to press it again and again.',
          })}
          control={(labelId, hintId) => (
            <Switch
              checked={assists.holdToPress}
              onCheckedChange={(v) =>
                save.mutate({
                  holdToPress: v,
                })
              }
              aria-labelledby={labelId}
              aria-describedby={hintId}
            />
          )}
        />
        <Row
          name={t('untimed-name', {
            defaultValue: 'No timed input',
          })}
          hint={t('untimed-hint', {
            defaultValue: 'Removes or extends reaction-time windows and timers. You decide when to go on.',
          })}
          control={(labelId, hintId) => (
            <Switch
              checked={assists.noTimedInput}
              onCheckedChange={(v) =>
                save.mutate({
                  noTimedInput: v,
                })
              }
              aria-labelledby={labelId}
              aria-describedby={hintId}
            />
          )}
        />
        <div className="settings-row">
          <span className="settings-row__text">
            <span id={speedId} className="settings-row__name block">
              {t('speed-name', {
                defaultValue: 'Slowest game speed',
              })}
            </span>
            <span id={speedHintId} className="settings-row__hint block">
              {t('speed-hint', {
                defaultValue: 'Slows the game clock. 100% is normal speed; 50% is half speed.',
              })}
            </span>
          </span>
          <span className="flex w-48 shrink-0 items-center gap-3">
            <Slider
              min={MIN_PERCENT}
              max={100}
              step={5}
              value={[percent]}
              onValueChange={([v]) => setDraftPercent(v ?? 100)}
              onValueCommit={([v]) =>
                save.mutate({
                  speedFloor: (v ?? 100) / 100,
                })
              }
              aria-labelledby={speedId}
              aria-describedby={speedHintId}
            />
            <span className="t-meta w-10 shrink-0 text-end">
              {t('speed-value', {
                defaultValue: '{{percent}}%',
                percent,
              })}
            </span>
          </span>
        </div>
        <p className="t-meta text-site-text-muted" role="status" aria-live="polite">
          {saved
            ? t('saved', {
                defaultValue: 'Saved',
              })
            : ''}
        </p>
      </SettingsSection>

      <SettingsSection
        className={arrival}
        title={t('games-title', {
          defaultValue: 'Games that honour these',
        })}
      >
        {titles.length > 0 ? (
          <ul className="t-body">
            {titles.map((title) => (
              <li key={title} className="border-b border-site-border py-3">
                {title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-body text-site-text-muted">
            {t('games-none', {
              defaultValue: 'No game honours these settings yet.',
            })}
          </p>
        )}
        <p className="t-meta text-site-text-muted">
          {t('games-note', {
            defaultValue: 'Other games play as usual and their runs stay ranked.',
          })}
        </p>
      </SettingsSection>
    </>
  );
}

function Row({
  name,
  hint,
  control,
}: {
  name: string;
  hint: string;
  control: (labelId: string, hintId: string) => React.ReactNode;
}) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="settings-row">
      <span className="settings-row__text">
        <span id={labelId} className="settings-row__name block">
          {name}
        </span>
        <span id={hintId} className="settings-row__hint block">
          {hint}
        </span>
      </span>
      {control(labelId, hintId)}
    </div>
  );
}
