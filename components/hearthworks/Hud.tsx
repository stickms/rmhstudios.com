'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  CookingPot,
  Coins,
  House,
  MousePointer2,
  Route,
  Sprout,
  Store,
  Trash2,
  Trees,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import {
  BUILDINGS,
  BUILDING_IDS,
  CROPS,
  CROP_IDS,
  ITEMS,
  RECIPES,
  isItemId,
  type BuildingId,
} from '@/lib/hearthworks/content';
import { hearthworksStore, useHearthworks, type Tool } from '@/lib/hearthworks/store';
import type { RejectReason } from '@/lib/hearthworks/world';

const BUILDING_ICON: Record<BuildingId, LucideIcon> = {
  road: Route,
  plot: Sprout,
  cottage: House,
  stall: Store,
  kitchen: CookingPot,
  park: Trees,
};

function sameTool(a: Tool, b: Tool): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'build' && b.kind === 'build') return a.building === b.building;
  if (a.kind === 'plant' && b.kind === 'plant') return a.crop === b.crop;
  return true;
}

function ToolButton({
  tool,
  label,
  Icon,
  hint,
}: {
  tool: Tool;
  label: string;
  Icon: LucideIcon;
  hint?: string;
}) {
  const current = useHearthworks((s) => s.tool);
  const active = sameTool(current, tool);
  return (
    <button
      type="button"
      className="hw-tool"
      aria-pressed={active}
      title={hint ? `${label} · ${hint}` : label}
      onClick={() => hearthworksStore.getState().setTool(active ? { kind: 'inspect' } : tool)}
    >
      <Icon aria-hidden size={20} />
      <span>{label}</span>
      {hint && <span className="hw-tool__hint">{hint}</span>}
    </button>
  );
}

export function Hud() {
  const { t } = useTranslation('c-hearthworks');
  const money = useHearthworks((s) => s.world.players[s.playerId]?.money ?? 0);
  const inventory = useHearthworks((s) => s.world.players[s.playerId]?.inventory);
  const lastEvents = useHearthworks((s) => s.lastEvents);
  const [pantry, setPantry] = useState(false);

  // Refusals are the game's most common feedback; say them where the player is looking.
  useEffect(() => {
    for (const e of lastEvents) {
      if (e.type !== 'rejected') continue;
      toast(reasonText(t, e.reason), { id: `hw-${e.reason}` });
    }
  }, [lastEvents, t]);

  // Re-render the pantry when counts change (the inventory object is mutated in place).
  useHearthworks((s) => s.rev);
  const held = Object.entries(inventory ?? {}).filter(([, n]) => (n ?? 0) > 0);

  return (
    <>
      <header className="hw-top">
        <img className="hw-logo" src="/images/hearthworks/logo.png" alt="Hearthworks" height={40} />
        <div className="hw-chip" role="status" aria-label={t('money-label', { defaultValue: 'Money' })}>
          <Coins aria-hidden size={18} />
          <span className="hw-chip__value">{money.toLocaleString()}</span>
        </div>
        <button
          type="button"
          className="hw-chip hw-chip--button"
          aria-expanded={pantry}
          onClick={() => setPantry((v) => !v)}
        >
          <Wheat aria-hidden size={18} />
          <span>{t('pantry-title', { defaultValue: 'Pantry' })}</span>
        </button>
      </header>

      {pantry && (
        <section className="hw-panel" aria-label={t('pantry-title', { defaultValue: 'Pantry' })}>
          <h2 className="hw-panel__title">{t('pantry-title', { defaultValue: 'Pantry' })}</h2>
          {held.length === 0 ? (
            <p className="hw-muted">
              {t('pantry-empty', { defaultValue: 'Nothing yet — plant something and wait for it to ripen.' })}
            </p>
          ) : (
            <ul className="hw-list">
              {held.map(([id, n]) =>
                isItemId(id) ? (
                  <li key={id} className="hw-row">
                    <span>
                      {ITEMS[id].name} <b>×{n}</b>
                    </span>
                    <button
                      type="button"
                      className="hw-small"
                      onClick={() =>
                        hearthworksStore.getState().dispatch({ type: 'sell', item: id, qty: n ?? 0 })
                      }
                    >
                      {t('sell-all', { defaultValue: 'Sell all' })} · {(ITEMS[id].price * (n ?? 0)).toLocaleString()}
                    </button>
                  </li>
                ) : null,
              )}
            </ul>
          )}
          <h3 className="hw-panel__sub">{t('kitchen-title', { defaultValue: 'Kitchen' })}</h3>
          <ul className="hw-list">
            {Object.entries(RECIPES).map(([key, r]) => (
              <li key={key} className="hw-row">
                <span>{r.name}</span>
                <button
                  type="button"
                  className="hw-small"
                  onClick={() => hearthworksStore.getState().dispatch({ type: 'cook', recipe: key })}
                >
                  {t('cook', { defaultValue: 'Cook' })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="hw-dock" aria-label={t('tools-label', { defaultValue: 'Tools' })}>
        <ToolButton
          tool={{ kind: 'inspect' }}
          label={t('tool-look', { defaultValue: 'Look' })}
          Icon={MousePointer2}
        />
        {BUILDING_IDS.map((b) => (
          <ToolButton
            key={b}
            tool={{ kind: 'build', building: b }}
            label={BUILDINGS[b].name}
            Icon={BUILDING_ICON[b]}
            hint={String(BUILDINGS[b].cost)}
          />
        ))}
        {CROP_IDS.map((c) => (
          <ToolButton
            key={c}
            tool={{ kind: 'plant', crop: c }}
            label={CROPS[c].name}
            Icon={Sprout}
            hint={String(CROPS[c].seedPrice)}
          />
        ))}
        <ToolButton
          tool={{ kind: 'harvest' }}
          label={t('tool-harvest', { defaultValue: 'Harvest' })}
          Icon={Wheat}
        />
        <ToolButton
          tool={{ kind: 'remove' }}
          label={t('tool-clear', { defaultValue: 'Clear' })}
          Icon={Trash2}
        />
      </nav>
    </>
  );
}

function reasonText(t: ReturnType<typeof useTranslation>['t'], reason: RejectReason): string {
  switch (reason) {
    case 'unknown-player':
      return t('err-unknown-player', { defaultValue: 'You are not in this world yet.' });
    case 'out-of-bounds':
      return t('err-out-of-bounds', { defaultValue: 'That is off the map.' });
    case 'bad-terrain':
      return t('err-bad-terrain', { defaultValue: 'You can only build on open grass.' });
    case 'occupied':
      return t('err-occupied', { defaultValue: 'That spot is already taken.' });
    case 'nothing-there':
      return t('err-nothing-there', { defaultValue: 'There is nothing there.' });
    case 'no-plot':
      return t('err-no-plot', { defaultValue: 'Seeds need a farm plot first.' });
    case 'not-ripe':
      return t('err-not-ripe', { defaultValue: 'It is not ripe yet.' });
    case 'cannot-afford':
      return t('err-cannot-afford', { defaultValue: 'Not enough money.' });
    case 'missing-ingredients':
      return t('err-missing', { defaultValue: 'You do not have enough of that.' });
    case 'no-kitchen':
      return t('err-no-kitchen', { defaultValue: 'Build a kitchen first.' });
    case 'no-stall':
      return t('err-no-stall', { defaultValue: 'Build a market stall to sell things.' });
    case 'unknown-recipe':
      return t('err-unknown-recipe', { defaultValue: 'You do not know that recipe.' });
    case 'bad-amount':
      return t('err-bad-amount', { defaultValue: 'That is not a valid amount.' });
  }
}
