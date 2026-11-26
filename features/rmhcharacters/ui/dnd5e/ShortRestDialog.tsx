/** Short Rest: spend and roll Hit Dice, then take what a short rest gives back. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { rollFree } from '@features/rmhcharacters/engine/rolls';
import * as R from '@features/rmhcharacters/engine/dnd5e/rules';
import { hitDiceLeft, hitDieHealing, spendable, type ShortRestInput } from '@features/rmhcharacters/engine/dnd5e/rest';
import type { Dnd5eCharacter, Dnd5eData } from '@features/rmhcharacters/engine/types';
import { Muted, Stepper } from '../controls';
import { useRollsContext } from '../useRolls';

interface Done {
  totals: number[];
  healing: number;
}

export function ShortRestDialog({
  open,
  onOpenChange,
  c,
  d,
  onRest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  c: Dnd5eCharacter;
  d: Dnd5eData;
  /** Applies the rest to the latest sheet. */
  onRest: (input: ShortRestInput) => void;
}) {
  const { t } = useTranslation('character-resources');
  const rolls = useRollsContext();
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const pools = hitDiceLeft(c, d);
  const conMod = R.abilityMod(R.abilityScores(c, d).con);
  const chosen = spendable(c, d, counts);
  const n = Object.values(chosen).reduce((a, b) => a + b, 0);
  const modifier = conMod === 0 ? '' : conMod > 0 ? `+${conMod}` : `${conMod}`;

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setCounts({});
      setDone(null);
    }
    onOpenChange(next);
  };

  const rollOne = async (die: number): Promise<number | null> => {
    const notation = `1d${die}${modifier}`;
    const label = t('rest.hitDie', { defaultValue: 'Hit Die' });
    if (rolls) return rolls.hitDie(label, notation);
    const r = rollFree(notation);
    return r.ok ? r.outcome.total : null;
  };

  const run = async () => {
    setBusy(true);
    const totals: number[] = [];
    const rolled: Record<number, number> = {};
    // Largest dice first, one roll each, so every die is its own line in the log. A die that fails to roll (the table
    // refused it) is not spent; when none rolled at all there is no rest yet.
    const queue = pools.flatMap((pool) => Array.from({ length: chosen[pool.die] ?? 0 }, () => pool.die));
    for (const die of queue) {
      const total = await rollOne(die);
      if (total === null) break;
      totals.push(hitDieHealing(total));
      rolled[die] = (rolled[die] ?? 0) + 1;
    }
    if (queue.length && !totals.length) {
      setBusy(false);
      return;
    }
    const healing = totals.reduce((a, b) => a + b, 0);
    onRest({ spent: rolled, healing });
    setDone({ totals, healing });
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('rest.title', { defaultValue: 'Short Rest' })}</DialogTitle>
          <DialogDescription>
            {t('rest.description', {
              defaultValue:
                'Spend Hit Dice to heal. Each die rolls with your Constitution modifier and gives at least 1. Short-rest resources and pact slots come back.',
            })}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div role="status" aria-live="polite" className="flex flex-col gap-1 text-sm text-app-text">
            {done.totals.length ? (
              <>
                <p>
                  {t('rest.healed', {
                    defaultValue: 'You healed {{hp}} hit points.',
                    hp: done.healing,
                  })}
                </p>
                <p className="font-mono text-xs text-app-text-muted">{done.totals.join(' + ')}</p>
              </>
            ) : (
              <p>{t('rest.rested', { defaultValue: 'You took a short rest.' })}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {pools.map((p) => (
              <div
                key={p.die}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-app-border py-2 last:border-b-0"
              >
                <span className="min-w-0 text-sm text-app-text">
                  {t('rest.pool', {
                    defaultValue: 'd{{die}}: {{left}} of {{total}} left',
                    die: p.die,
                    left: p.left,
                    total: p.count,
                  })}
                </span>
                <Stepper
                  label={t('rest.spend', { defaultValue: 'Spend d{{die}} Hit Dice', die: p.die })}
                  value={Math.min(counts[p.die] ?? 0, p.left)}
                  max={p.left}
                  onChange={(v) => setCounts((x) => ({ ...x, [p.die]: v }))}
                />
              </div>
            ))}
            <Muted className="mt-2">
              {t('rest.modifier', { defaultValue: 'Constitution modifier: {{mod}}', mod: R.signed(conMod) })}
            </Muted>
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button type="button" variant="primary" onClick={() => close(false)}>
              {t('rest.close', { defaultValue: 'Close' })}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => close(false)}>
                {t('rest.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button type="button" variant="primary" loading={busy} onClick={() => void run()}>
                {n > 0
                  ? t('rest.roll', { defaultValue: 'Roll {{n}} and rest', n })
                  : t('rest.take', { defaultValue: 'Rest without rolling' })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
