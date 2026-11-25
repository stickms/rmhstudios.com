/**
 * RMHType "race your best": the switch in the solo settings, the ahead/behind line on the
 * finish screen and the "Clear my ghosts" control on the progress page. Strings live here
 * (namespace `type-ghost`); the pure logic is `lib/rmhtype/ghost.ts`.
 */
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { aheadByMs, formatGapSeconds } from '@/lib/rmhtype/ghost';
import { isolate, resultFor } from '@/lib/rmhtype/challenges';
import type { SoloChallengeResult } from '@/lib/rmhtype/types';
import { RMHTYPE_GHOST_KEY, clearRmhTypeGhosts } from '@/lib/rmhtype/rmhtype.queries';

/** The "Race my best" switch in the solo settings. */
export function GhostSwitch({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation('type-ghost');
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label id="rmhtype-ghost-label" className="block text-sm font-medium text-app-text-muted">
          {t('switch-label', { defaultValue: 'Race my best' })}
        </label>
        <p id="rmhtype-ghost-hint" className="mt-1 text-xs text-app-text-muted">
          {t('switch-hint', {
            defaultValue: 'Show a second caret that types at the pace of your best run on the passage.',
          })}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-labelledby="rmhtype-ghost-label"
        aria-describedby="rmhtype-ghost-hint"
      />
    </div>
  );
}

/** While typing: which best the second caret is racing. */
export function GhostRacingNote({ wpm }: { wpm: number }) {
  const { t } = useTranslation('type-ghost');
  return (
    <p className="text-center text-xs text-app-text-muted">
      {t('racing-note', { wpm: Math.round(wpm), defaultValue: 'Racing your best of {{wpm}} WPM' })}
    </p>
  );
}

/**
 * While typing a challenge (s11-12): whose run the second caret is. The name is member text, so it sits in a `<bdi>`
 * and the line carries `dir="auto"`; the gap to the caret is the same ahead/behind line as for a best of your own.
 */
export function ChallengeRacingNote({ name, wpm }: { name: string; wpm: number }) {
  const { t } = useTranslation('type-challenges');
  return (
    <p dir="auto" className="text-center text-xs text-app-text-muted">
      <bdi className="font-medium">{name}</bdi>{' '}
      {t('caret-note', {
        ns: 'type-challenges',
        wpm: Math.round(wpm),
        defaultValue: 'is the second caret, best of {{wpm}} WPM',
      })}
    </p>
  );
}

/** On the finish screen of a challenge race: how the server settled it, once it has. Announced when it appears. */
export function ChallengeRaceResult({ result, name }: { result: SoloChallengeResult | null; name: string }) {
  const { t } = useTranslation('type-challenges');
  if (!result) {
    return (
      <p role="status" className="mb-4 text-sm text-app-text-muted">
        {t('race-settling', { ns: 'type-challenges', defaultValue: 'Settling the race…' })}
      </p>
    );
  }
  const side = resultFor('opponent', result.outcome, result.finished);
  const who = isolate(name);
  const wpm = Math.round(result.challengerWpm);
  return (
    <p role="status" dir="auto" className="mb-4 text-sm">
      {side === 'won'
        ? t('race-won', { ns: 'type-challenges', defaultValue: "You beat {{name}}'s {{wpm}} WPM", name: who, wpm })
        : side === 'lost'
          ? t('race-lost', {
              ns: 'type-challenges',
              defaultValue: "You lost to {{name}}'s {{wpm}} WPM",
              name: who,
              wpm,
            })
          : side === 'drew'
            ? t('race-drew', {
                ns: 'type-challenges',
                defaultValue: 'You drew with {{name}} at {{wpm}} WPM',
                name: who,
                wpm,
              })
            : t('race-unfinished', {
                ns: 'type-challenges',
                defaultValue: 'Did not finish. {{name}} wins with {{wpm}} WPM',
                name: who,
                wpm,
              })}
    </p>
  );
}

/** On the finish screen: ahead of or behind the ghost. Announced once, when the result appears. */
export function GhostResultLine({ ghostTimeMs, runTimeMs }: { ghostTimeMs: number; runTimeMs: number }) {
  const { t } = useTranslation('type-ghost');
  const gap = aheadByMs(ghostTimeMs, runTimeMs);
  const seconds = formatGapSeconds(gap);
  return (
    <p role="status" className="mb-4 text-sm text-app-text-muted">
      {gap >= 0
        ? t('ahead-of-best', { seconds, defaultValue: 'Ahead of your best by {{seconds}} s' })
        : t('behind-best', { seconds, defaultValue: 'Behind by {{seconds}} s' })}
    </p>
  );
}

/** On the progress page: delete every ghost the member has. */
export function GhostClear() {
  const { t } = useTranslation('type-ghost');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const clear = useMutation({
    mutationFn: clearRmhTypeGhosts,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RMHTYPE_GHOST_KEY });
      toast.success(t('cleared', { defaultValue: 'Ghosts cleared' }));
    },
    onError: () => toast.error(t('clear-failed', { defaultValue: 'Could not clear your ghosts' })),
  });

  const onClick = async () => {
    const ok = await confirm({
      title: t('clear-title', { defaultValue: 'Clear all your ghosts?' }),
      description: t('clear-description', {
        defaultValue:
          'Your runs and best scores stay. The next attempt on a passage has no second caret until you set a new best.',
      }),
      confirmLabel: t('clear-confirm', { defaultValue: 'Clear ghosts' }),
      danger: true,
    });
    if (ok) clear.mutate();
  };

  return (
    <section className="mt-10 border-t border-app-border pt-6" aria-labelledby="ghosts-heading">
      <h2 id="ghosts-heading" className="t-heading mb-1">
        {t('section-title', { defaultValue: 'Ghosts' })}
      </h2>
      <p className="mb-3 max-w-xl text-sm text-app-text-muted">
        {t('section-body', {
          defaultValue:
            'Your best run on each passage is kept as a pace curve so you can race it. It holds positions only, not what you typed.',
        })}
      </p>
      <Button onClick={onClick} disabled={clear.isPending}>
        {t('clear-button', { defaultValue: 'Clear my ghosts' })}
      </Button>
    </section>
  );
}
