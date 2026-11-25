/**
 * Try it: the author plays their own grid as a player would, in the browser. The groups are the author's own (they
 * already see the solution), a guess is checked by `practiceGuess` (the same rules the server applies) and nothing is
 * written. Results are announced in a polite live region, as on the real grid.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/rules';
import { MAX_MISTAKES, type GridGroup } from '@/lib/party/connections';
import { freshProgress, practiceBoard, practiceGuess, type PlayProgress } from '@/lib/party/connections-practice';
import { cn } from '@/lib/utils';

/** The four group bands, in the order a group is found. Shared with the real grid page. */
export const GROUP_BANDS = ['bg-site-warning/25', 'bg-site-success/25', 'bg-site-accent/25', 'bg-site-danger/25'];

interface Props {
  /** Seeds the shuffle: the grid id once it is saved, so the order matches what players see. */
  seed: string;
  groups: GridGroup[];
  /** Leave practice and go back to what the author was doing. */
  onExit: () => void;
}

export function ConnectionsPractice({ seed, groups, onExit }: Props) {
  const { t } = useTranslation('connections-maker');
  const [progress, setProgress] = useState<PlayProgress>(freshProgress);
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const done = progress.status !== 'active';
  const board = practiceBoard(seed, groups, progress);

  const toggle = (item: string) =>
    setPicked((p) => (p.includes(item) ? p.filter((x) => x !== item) : p.length < 4 ? [...p, item] : p));

  function submit() {
    const r = practiceGuess(groups, progress, picked);
    if (!r.ok) {
      setMsg(t('practice-bad-pick', { defaultValue: 'Pick four different items.' }));
      return;
    }
    setProgress(r.progress);
    setPicked([]);
    if (r.correct) {
      setMsg(
        r.progress.status === 'solved'
          ? t('practice-solved-msg', { defaultValue: 'Solved. Nothing was saved.' })
          : t('practice-found', { defaultValue: 'You found a group.' }),
      );
    } else if (r.progress.status === 'failed') {
      setMsg(t('practice-failed-msg', { defaultValue: 'Out of mistakes. Nothing was saved.' }));
    } else {
      setMsg(
        r.oneAway
          ? t('practice-one-away', { defaultValue: 'One away.' })
          : t('practice-not-group', { defaultValue: 'Not a group.' }),
      );
    }
  }

  function restart() {
    setProgress(freshProgress());
    setPicked([]);
    setMsg(null);
  }

  const reveal = done ? groups.filter((_, idx) => !progress.found.includes(idx)) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-[var(--site-section-gap)] px-4 pt-4 pb-12">
      <p className="t-body text-site-text-muted">
        {t('practice-note', {
          defaultValue: 'You are trying your own grid. Guesses are checked here and nothing is saved.',
        })}
      </p>
      <div className="space-y-2">
        {progress.found.map((idx) => (
          <div key={idx} className={cn('rounded-site px-4 py-3 text-center', GROUP_BANDS[idx % 4])}>
            <p className="t-label text-site-text" dir="auto">
              {groups[idx]?.label}
            </p>
            <p className="t-body text-site-text" dir="auto">
              {groups[idx]?.items.join(', ')}
            </p>
          </div>
        ))}
        {reveal.map((g, i) => (
          <div
            key={g.label}
            className={cn(
              'rounded-site px-4 py-3 text-center opacity-70',
              GROUP_BANDS[(progress.found.length + i) % 4],
            )}
          >
            <p className="t-label text-site-text" dir="auto">
              {g.label}
            </p>
            <p className="t-body text-site-text" dir="auto">
              {g.items.join(', ')}
            </p>
          </div>
        ))}
      </div>

      {!done ? (
        <div className="grid grid-cols-4 gap-2">
          {board.map((item) => (
            <button
              key={item}
              type="button"
              dir="auto"
              aria-pressed={picked.includes(item)}
              onClick={() => toggle(item)}
              className={cn(
                'min-h-14 break-words rounded-site border border-site-border px-2 py-2 text-xs font-semibold text-site-text transition-colors sm:text-sm',
                picked.includes(item) && 'bg-site-accent text-site-accent-fg',
              )}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      <p className="text-center text-sm text-site-text-muted" aria-live="polite">
        {done
          ? (msg ?? '')
          : t('practice-mistakes-left', {
              defaultValue: 'Mistakes left: {{n}}',
              n: MAX_MISTAKES - progress.mistakes,
            }) + (msg ? ` · ${msg}` : '')}
      </p>

      <Section className="flex flex-wrap justify-center gap-2 pt-4">
        {!done ? (
          <>
            <Button disabled={!picked.length} onClick={() => setPicked([])}>
              {t('practice-deselect', { defaultValue: 'Deselect' })}
            </Button>
            <Button disabled={picked.length !== 4} onClick={submit}>
              {t('practice-submit', { defaultValue: 'Submit' })}
            </Button>
          </>
        ) : (
          <Button onClick={restart}>{t('practice-again', { defaultValue: 'Try again' })}</Button>
        )}
        <Button variant="ghost" onClick={onExit}>
          {t('practice-exit', { defaultValue: 'Stop trying it' })}
        </Button>
      </Section>
    </div>
  );
}
