/**
 * Between duels: the short intermission after a win, and after a sector's last duel the milestone (one free
 * upgrade of two) followed by the shop, where the run's fragments buy patches, plates and scripts.
 */
import { useTranslation } from 'react-i18next';
import { PLAYER, SHOP_PRICES } from '@features/cursed-logic/engine/data';
import { canBuy } from '@features/cursed-logic/engine/shopState';
import type { RunState } from '@features/cursed-logic/engine/run';
import type { CursedLogicStore } from '@features/cursed-logic/engine/gameState';
import type { ShopItemId } from '@features/cursed-logic/engine/types';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { Portrait } from './portraits';
import type { Copy } from './copy';

function RunStatus({ run, copy }: { run: RunState; copy: Copy }) {
  const { t } = useTranslation('c-cursed-logic');
  const fmt = useLocaleFormat();
  return (
    <div className="flex flex-wrap gap-2 text-[0.72rem]">
      <span className="cl-chip cl-chip-acid">
        {t('status-integrity', { defaultValue: 'Integrity {{n}}/{{max}}', n: run.integrity, max: run.maxIntegrity })}
      </span>
      <span className="cl-chip cl-chip-violet">
        {t('status-fragments', { defaultValue: '{{n}} fragments', n: run.fragments })}
      </span>
      <span className="cl-chip">{t('status-score', { defaultValue: 'Score {{n}}', n: fmt.number(run.score) })}</span>
      {run.upgrades.map((u) => (
        <span key={u} className="cl-chip">
          {copy.itemName(u)}
        </span>
      ))}
    </div>
  );
}

export function BetweenDuels({ run, store, copy }: { run: RunState; store: CursedLogicStore; copy: Copy }) {
  const { t } = useTranslation('c-cursed-logic');
  const fmt = useLocaleFormat();
  const last = run.records[run.records.length - 1];

  if (run.stage === 'milestone' && run.milestoneChoices) {
    return (
      <div className="w-full max-w-[640px] mx-auto px-4 pt-3 pb-8 flex flex-col gap-4 cl-arrive">
        <h2 className="cl-display text-xl cl-acid cl-chroma">
          {t('milestone-title', { defaultValue: 'SECTOR {{n}} CLEARED', n: run.sector })}
        </h2>
        <p className="text-[0.8rem] cl-muted">
          {t('milestone-body', { defaultValue: 'Pick one script to keep for the rest of the run.' })}
        </p>
        <RunStatus run={run} copy={copy} />
        <div className="grid sm:grid-cols-2 gap-3">
          {run.milestoneChoices.map((u) => (
            <button
              key={u}
              type="button"
              className="cl-card !min-h-[110px] !items-start !text-left px-3"
              onClick={() => store.pickMilestone(u)}
            >
              <span className="cl-card-name cl-acid">{copy.itemName(u)}</span>
              <span className="cl-card-rule !text-[0.75rem]">{copy.itemRule(u)}</span>
              <span className="cl-key mt-auto">{t('free', { defaultValue: 'free' })}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (run.stage === 'shop') {
    return (
      <div className="w-full max-w-[720px] mx-auto px-4 pt-3 pb-8 flex flex-col gap-4 cl-arrive">
        <h2 className="cl-display text-xl cl-violet cl-chroma">{t('shop-title', { defaultValue: 'BLACK MARKET' })}</h2>
        <p className="text-[0.8rem] cl-muted">
          {t('shop-body', { defaultValue: 'Fragments are spent here or lost when the run ends.' })}
        </p>
        <RunStatus run={run} copy={copy} />
        <ul className="flex flex-col">
          {run.shelf.map((item: ShopItemId) => {
            const can = canBuy(run, item);
            const atCeiling = item === 'hull' && run.maxIntegrity >= PLAYER.integrityCeiling;
            return (
              <li key={item} className="flex items-center gap-3 py-3 border-b border-dashed border-[#3b2a5c]">
                <div className="min-w-0 flex-1">
                  <div className="cl-display text-[0.85rem] cl-acid">{copy.itemName(item)}</div>
                  <div className="text-[0.72rem] cl-muted">{copy.itemRule(item)}</div>
                </div>
                <button
                  type="button"
                  className="cl-cmd !min-h-11 !px-3 !text-[0.75rem]"
                  disabled={!can || atCeiling}
                  onClick={() => store.buy(item)}
                >
                  {t('buy', { defaultValue: 'Buy {{n}}', n: SHOP_PRICES[item] })}
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="cl-cmd cl-cmd-primary self-start" onClick={store.continueRun}>
          {t('next-sector', { defaultValue: 'Enter sector {{n}}', n: run.sector + 1 })}
        </button>
      </div>
    );
  }

  // Intermission after a won duel.
  return (
    <div className="w-full max-w-[640px] mx-auto px-4 pt-3 pb-8 flex flex-col gap-4 cl-arrive">
      {last && (
        <div className="flex items-center gap-4">
          <Portrait id={last.protocolId} size={72} ring={false} className="opacity-40" />
          <div>
            <h2 className="cl-display text-lg cl-acid cl-chroma">
              {t('duel-won', { defaultValue: '{{name}} TERMINATED', name: copy.protocolName(last.protocolId) })}
            </h2>
            <p className="text-[0.75rem] cl-muted">
              {t('duel-won-body', {
                defaultValue: '{{rounds}} rounds · +{{points}} points',
                rounds: last.rounds,
                points: fmt.number(last.points),
              })}
              {last.flawless ? ` · ${t('flawless', { defaultValue: 'flawless' })}` : ''}
            </p>
          </div>
        </div>
      )}
      <RunStatus run={run} copy={copy} />
      <p className="text-[0.75rem] cl-muted cl-prompt">
        {t('patch-note', {
          defaultValue: 'Field patch: +{{n}} Integrity before the next duel.',
          n: PLAYER.patchBetweenDuels,
        })}
      </p>
      <button type="button" className="cl-cmd cl-cmd-primary self-start" onClick={store.continueRun}>
        {t('next-duel', { defaultValue: 'Next duel' })}
      </button>
    </div>
  );
}
