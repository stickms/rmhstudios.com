"use client";
import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';
import { useCookgameStore } from '@/lib/cookgame/store';
import { PROPERTY_TIERS, propertyEffects } from '@/lib/cookgame/property';
import { rankForXp } from '@/lib/cookgame/progression';

export function PropertyOverlay() {
  // All selectors unconditionally before any early return.
  const activeOverlay = useCookgameStore((s) => s.activeOverlay);
  const cash = useCookgameStore((s) => s.cash);
  const xp = useCookgameStore((s) => s.xp);
  const ownedPropertyTier = useCookgameStore((s) => s.ownedPropertyTier);

  if (activeOverlay !== 'property') return null;

  const currentTier = PROPERTY_TIERS[ownedPropertyTier];
  const currentEffects = propertyEffects(ownedPropertyTier);
  const nextTier = PROPERTY_TIERS[ownedPropertyTier + 1];
  const currentRank = rankForXp(xp).rank;
  const speedBonus = Math.round((1 - currentEffects.cooldownMult) * 100);

  return (
    <OverlayFrame title="Property">
      <div className="mb-4 font-mono text-2xl text-lime-400">${Math.floor(cash)}</div>
      <div className="space-y-5">

        {/* Current tier */}
        <section>
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">Current</h3>
          <div className="rounded bg-neutral-800 px-3 py-3 space-y-1">
            <div className="font-mono text-sm font-medium text-lime-400">{currentTier.name}</div>
            <div className="font-mono text-xs text-neutral-300">Plots: {currentEffects.plots}</div>
            <div className="font-mono text-xs text-neutral-300">Stash cap: {currentEffects.stashCap}</div>
            <div className="font-mono text-xs text-neutral-300">
              Income: ${currentEffects.passiveIncomePerSec}/sec
            </div>
            <div className="font-mono text-xs text-neutral-300">
              Cooldown speed: {speedBonus > 0 ? `+${speedBonus}%` : 'base'}
            </div>
          </div>
        </section>

        {/* Next tier or max-tier message */}
        {nextTier ? (
          <section>
            <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">Upgrade</h3>
            <div className="rounded bg-neutral-800 px-3 py-3 space-y-1">
              <div className="font-mono text-sm font-medium text-white">{nextTier.name}</div>
              {(() => {
                const ne = propertyEffects(ownedPropertyTier + 1);
                const nSpeed = Math.round((1 - ne.cooldownMult) * 100);
                return (
                  <>
                    <div className="font-mono text-xs text-neutral-300">
                      Plots: {ne.plots}{' '}
                      <span className="text-lime-400">(+{ne.plots - currentEffects.plots})</span>
                    </div>
                    <div className="font-mono text-xs text-neutral-300">
                      Stash cap: {ne.stashCap}{' '}
                      <span className="text-lime-400">(+{ne.stashCap - currentEffects.stashCap})</span>
                    </div>
                    <div className="font-mono text-xs text-neutral-300">
                      Income: ${ne.passiveIncomePerSec}/sec{' '}
                      <span className="text-lime-400">
                        (+{ne.passiveIncomePerSec - currentEffects.passiveIncomePerSec})
                      </span>
                    </div>
                    <div className="font-mono text-xs text-neutral-300">
                      Cooldown speed: +{nSpeed}%
                    </div>
                  </>
                );
              })()}
              <div className="mt-2 pt-2 border-t border-neutral-700 font-mono text-xs text-neutral-400">
                Cost: <span className="text-white">${nextTier.cost}</span>
                {' · '}Rank req: <span className="text-white">{nextTier.rankReq}</span>
              </div>
            </div>
            {(() => {
              const rankLocked = currentRank < nextTier.rankReq;
              const cashLocked = cash < nextTier.cost;
              return (
                <button
                  onClick={() => useCookgameStore.getState().buyProperty(ownedPropertyTier + 1)}
                  disabled={rankLocked || cashLocked}
                  className="mt-3 w-full rounded bg-lime-600 px-3 py-2 text-sm font-medium hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {rankLocked ? `Reach rank ${nextTier.rankReq} to unlock` : 'Buy / Upgrade'}
                </button>
              );
            })()}
          </section>
        ) : (
          <p className="font-mono text-xs text-neutral-500 italic">Fully upgraded.</p>
        )}

      </div>
    </OverlayFrame>
  );
}
