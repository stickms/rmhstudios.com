import { useTranslation } from 'react-i18next';
import { ITEMS } from '@features/hearthworks/engine/content';
import { hearthworksStore, useHearthworks } from '@features/hearthworks/engine/store';
import { customerPremium } from '@features/hearthworks/engine/world';

/** Who is waiting at your stalls, what they want, and what they will pay. Serving needs you close by. */
export function Customers() {
  const { t } = useTranslation('c-hearthworks');
  const world = useHearthworks((s) => s.world);
  const inventory = useHearthworks((s) => s.world.players[s.playerId]?.inventory);
  useHearthworks((s) => s.rev);
  // Someone already walking off has had their turn.
  const npcs = world.npcs.filter((n) => n.mode !== 'leaving');
  return (
    <section className="hw-panel" aria-label={t('customers-title', { defaultValue: 'Customers' })}>
      <h2 className="hw-panel__title">{t('customers-title', { defaultValue: 'Customers' })}</h2>
      {npcs.length === 0 ? (
        <p className="hw-muted">
          {t('customers-empty', {
            defaultValue: 'No one is waiting. Customers come by once you have a market stall.',
          })}
        </p>
      ) : (
        <ul className="hw-list">
          {npcs.map((n) => {
            const pay = Math.floor(ITEMS[n.want].price * n.qty * customerPremium(world));
            const have = (inventory?.[n.want] ?? 0) >= n.qty;
            return (
              <li key={n.id} className="hw-row">
                <span>
                  {ITEMS[n.want].name} <b>×{n.qty}</b>
                </span>
                <button
                  type="button"
                  className="hw-small"
                  disabled={!have}
                  onClick={() =>
                    hearthworksStore.getState().dispatch({ type: 'serve', npcId: n.id })
                  }
                >
                  {t('serve', { defaultValue: 'Serve' })} · +{pay.toLocaleString()}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
