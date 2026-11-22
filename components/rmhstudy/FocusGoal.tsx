import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { GOAL_MAX_MINUTES, GOAL_MIN_MINUTES, formatMinutes, goalProgress } from '@/lib/rmhstudy/history';
import { getFocusHistoryApi, setWeeklyGoalApi, type FocusHistory } from '@/lib/rmhstudy/history.contract';

/**
 * The weekly goal: progress toward it, and a labelled field to set, change or clear it. The
 * bar is capped at 100 %; the text says the true number.
 */
export default function FocusGoal({
  goalMinutes,
  thisWeekMinutes,
}: {
  goalMinutes: number | null;
  thisWeekMinutes: number;
}) {
  const { t, i18n } = useTranslation('rmhstudy-focus');
  const locale = i18n.language;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(goalMinutes === null ? '' : String(goalMinutes));
  const [editing, setEditing] = useState(goalMinutes === null);

  const parsed = draft.trim() === '' ? null : Number(draft);
  const valid = parsed !== null && Number.isInteger(parsed) && parsed >= GOAL_MIN_MINUTES && parsed <= GOAL_MAX_MINUTES;

  const save = useMutation({
    mutationFn: (minutes: number | null) =>
      api(setWeeklyGoalApi, {
        body: {
          minutes,
        },
      }),
    onSuccess: ({ goalMinutes: saved }) => {
      queryClient.setQueriesData<FocusHistory>(
        {
          queryKey: [getFocusHistoryApi.path],
        },
        (old) =>
          old
            ? {
                ...old,
                goalMinutes: saved,
              }
            : old,
      );
      void queryClient.invalidateQueries({
        queryKey: [getFocusHistoryApi.path],
      });
      setDraft(saved === null ? '' : String(saved));
      setEditing(saved === null);
      toast.success(
        saved === null
          ? t('goal-cleared', {
              defaultValue: 'Weekly goal cleared',
            })
          : t('goal-saved', {
              defaultValue: 'Weekly goal saved',
            }),
      );
    },
    onError: () =>
      toast.error(
        t('goal-error', {
          defaultValue: 'Could not save your goal',
        }),
      ),
  });

  const progress = goalProgress(thisWeekMinutes, goalMinutes);

  return (
    <section className="space-y-3" aria-labelledby="focus-goal">
      <h2 id="focus-goal" className="text-lg font-semibold">
        {t('goal-heading', {
          defaultValue: 'Weekly goal',
        })}
      </h2>

      {progress && goalMinutes !== null ? (
        <div className="space-y-2">
          <p className="text-sm">
            {t('goal-progress', {
              defaultValue: '{{done}} of {{goal}} ({{percent}}%)',
              done: formatMinutes(thisWeekMinutes, locale),
              goal: formatMinutes(goalMinutes, locale),
              percent: progress.percent,
            })}
          </p>
          <div
            role="progressbar"
            aria-label={t('goal-bar', {
              defaultValue: 'Progress toward your weekly goal',
            })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.barPercent}
            className="h-2 w-full overflow-hidden rounded-app-sm bg-app-bg-subtle"
          >
            <div
              className="h-full bg-app-accent"
              style={{
                width: `${progress.barPercent}%`,
              }}
            />
          </div>
          <p className="text-sm text-app-text-muted">
            {progress.reached
              ? t('goal-reached', {
                  defaultValue: 'Goal reached for this week.',
                })
              : t('goal-remaining', {
                  defaultValue: '{{left}} to go this week.',
                  left: formatMinutes(progress.remaining, locale),
                })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-app-text-muted">
          {t('goal-none', {
            defaultValue: 'No weekly goal set. Pick a target to track your progress.',
          })}
        </p>
      )}

      {editing ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate(parsed);
          }}
        >
          <div className="space-y-1">
            <label htmlFor="focus-goal-input" className="text-sm font-medium">
              {t('goal-label', {
                defaultValue: 'Goal in minutes per week',
              })}
            </label>
            <input
              id="focus-goal-input"
              type="number"
              inputMode="numeric"
              min={GOAL_MIN_MINUTES}
              max={GOAL_MAX_MINUTES}
              step={1}
              value={draft}
              aria-describedby="focus-goal-hint"
              aria-invalid={draft !== '' && !valid}
              onChange={(e) => setDraft(e.target.value)}
              className="surface-field block h-10 w-36 rounded-app-sm px-3 text-sm text-app-text"
            />
          </div>
          <Button type="submit" variant="primary" disabled={!valid || save.isPending}>
            {t('goal-save', {
              defaultValue: 'Save goal',
            })}
          </Button>
          {goalMinutes !== null ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(String(goalMinutes));
                setEditing(false);
              }}
            >
              {t('goal-cancel', {
                defaultValue: 'Cancel',
              })}
            </Button>
          ) : null}
          <p id="focus-goal-hint" className="w-full text-sm text-app-text-muted">
            {valid && parsed !== null
              ? t('goal-hint-value', {
                  defaultValue: 'That is {{duration}} a week.',
                  duration: formatMinutes(parsed, locale),
                })
              : t('goal-hint', {
                  defaultValue: 'From {{min}} minutes to {{max}} minutes (50 hours).',
                  min: GOAL_MIN_MINUTES,
                  max: GOAL_MAX_MINUTES,
                })}
          </p>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="default" onClick={() => setEditing(true)}>
            {t('goal-change', {
              defaultValue: 'Change goal',
            })}
          </Button>
          <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
            {t('goal-clear', {
              defaultValue: 'Clear goal',
            })}
          </Button>
        </div>
      )}
    </section>
  );
}
