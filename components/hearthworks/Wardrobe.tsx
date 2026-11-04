'use client';

import { useTranslation } from 'react-i18next';
import { SKINS, SKIN_IDS, SKIN_TIERS, canAfford, type SkinId, type SkinTier } from '@/lib/hearthworks/skins';
import { hearthworksStore, useHearthworks } from '@/lib/hearthworks/store';

type TFn = ReturnType<typeof useTranslation>['t'];

function tierName(t: TFn, tier: SkinTier): string {
  switch (tier) {
    case 'common':
      return t('tier-common', { defaultValue: 'Common' });
    case 'uncommon':
      return t('tier-uncommon', { defaultValue: 'Uncommon' });
    case 'rare':
      return t('tier-rare', { defaultValue: 'Rare' });
    case 'epic':
      return t('tier-epic', { defaultValue: 'Epic' });
    case 'legendary':
      return t('tier-legendary', { defaultValue: 'Legendary' });
  }
}

/** Skins are bought with in-game money only; the dearest tier is the most influential characters. */
export function Wardrobe() {
  const { t } = useTranslation('c-hearthworks');
  const money = useHearthworks((s) => s.world.players[s.playerId]?.money ?? 0);
  const worn = useHearthworks((s) => s.world.players[s.playerId]?.skin);
  const owned = useHearthworks((s) => s.world.players[s.playerId]?.ownedSkins);
  useHearthworks((s) => s.rev);
  const dispatch = hearthworksStore.getState().dispatch;

  return (
    <section className="hw-panel hw-panel--tall" aria-label={t('wardrobe-title', { defaultValue: 'Wardrobe' })}>
      <h2 className="hw-panel__title">{t('wardrobe-title', { defaultValue: 'Wardrobe' })}</h2>
      {SKIN_TIERS.map((tier) => {
        const ids = SKIN_IDS.filter((id) => SKINS[id].tier === tier);
        return (
          <div key={tier}>
            <h3 className={`hw-panel__sub hw-tier hw-tier--${tier}`}>{tierName(t, tier)}</h3>
            <ul className="hw-list">
              {ids.map((id: SkinId) => {
                const def = SKINS[id];
                const have = owned?.includes(id) ?? false;
                const wearing = worn === id;
                return (
                  <li key={id} className="hw-row">
                    <span>{def.name}</span>
                    {wearing ? (
                      <span className="hw-muted">{t('skin-worn', { defaultValue: 'Wearing' })}</span>
                    ) : have ? (
                      <button type="button" className="hw-small" onClick={() => dispatch({ type: 'setSkin', skin: id })}>
                        {t('skin-wear', { defaultValue: 'Wear' })}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="hw-small"
                        disabled={!canAfford(money, id)}
                        onClick={() => dispatch({ type: 'buySkin', skin: id })}
                      >
                        {t('skin-buy', { defaultValue: 'Buy' })} · {def.price.toLocaleString()}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
