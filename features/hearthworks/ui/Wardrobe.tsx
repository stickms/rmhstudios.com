import { Suspense, lazy, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_SKIN, SKINS, SKIN_IDS, SKIN_TIERS, canAfford, type SkinId, type SkinTier } from '@features/hearthworks/engine/skins';
import { hearthworksStore, useHearthworks } from '@features/hearthworks/engine/store';

// The turntable brings a second WebGL canvas: fetched only when the wardrobe opens.
const SkinPreview = lazy(() => import('./SkinPreview'));

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

/**
 * Skins are bought with in-game money only; the dearest tier is the most influential characters. A turntable at the
 * top shows the skin as it will move in the world (its model with real animation where it has one); choose a name to
 * preview it before buying.
 */
export function Wardrobe() {
  const { t } = useTranslation('c-hearthworks');
  const money = useHearthworks((s) => s.world.players[s.playerId]?.money ?? 0);
  const worn = useHearthworks((s) => s.world.players[s.playerId]?.skin);
  const owned = useHearthworks((s) => s.world.players[s.playerId]?.ownedSkins);
  const [picked, setPicked] = useState<SkinId | null>(null);
  const shown: SkinId = picked ?? worn ?? DEFAULT_SKIN;
  useHearthworks((s) => s.rev);
  const dispatch = hearthworksStore.getState().dispatch;

  return (
    <section className="hw-panel hw-panel--tall" aria-label={t('wardrobe-title', { defaultValue: 'Wardrobe' })}>
      <h2 className="hw-panel__title">{t('wardrobe-title', { defaultValue: 'Wardrobe' })}</h2>
      <div
        className="hw-preview"
        role="img"
        aria-label={t('wardrobe-preview', { defaultValue: 'Preview of {{name}}', name: SKINS[shown].name })}
      >
        <Suspense fallback={null}>
          <SkinPreview skin={shown} />
        </Suspense>
      </div>
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
                    <button
                      type="button"
                      className="hw-name"
                      aria-pressed={shown === id}
                      onClick={() => setPicked(id)}
                    >
                      {def.name}
                    </button>
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
