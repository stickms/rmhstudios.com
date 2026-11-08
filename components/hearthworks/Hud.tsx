'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  CookingPot,
  Cog,
  Crosshair,
  Droplet,
  Droplets,
  Factory,
  Handshake,
  Landmark,
  Menu,
  Shirt,
  Users,
  Coins,
  House,
  MousePointer2,
  Route,
  Sprout,
  Store,
  Trash2,
  Trees,
  UsersRound,
  Waves,
  Wheat,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import {
  BUILDINGS,
  BUILDING_IDS,
  CROPS,
  CROP_IDS,
  ITEMS,
  MILESTONES,
  RECIPES,
  ROAD_COST,
  UTILITIES,
  UTILITY_IDS,
  ZONES,
  ZONE_IDS,
  isItemId,
  type BuildingId,
  type UnlockId,
  type UtilityId,
  type ZoneId,
} from '@/lib/hearthworks/content';
import { useLobbyInvite } from '@/hooks/useLobbyLink';
import { hearthworksStore, useHearthworks, type Tool } from '@/lib/hearthworks/store';
import type { RejectReason } from '@/lib/hearthworks/world';
import { HIRE_COST, utilityUnlocked, zoneUnlocked } from '@/lib/hearthworks/world';
import { Armory, Vitals } from './Armory';
import {
  CityPanel,
  CityReadout,
  cityEventText,
  milestoneText,
  unlockName,
  utilityName,
  zoneName,
} from './CityPanel';
import { Customers } from './Customers';
import { MultiplayerPanel } from './MultiplayerPanel';
import { ViewToggle, WalkControls } from './ViewControls';
import { Wardrobe } from './Wardrobe';

const BUILDING_ICON: Record<BuildingId, LucideIcon> = {
  road: Route,
  plot: Sprout,
  cottage: House,
  stall: Store,
  kitchen: CookingPot,
  park: Trees,
  harvester: Cog,
};

const ZONE_ICON: Record<ZoneId, LucideIcon> = { homes: House, market: Store, workshop: Factory };
const UTILITY_ICON: Record<UtilityId, LucideIcon> = { well: Droplet, windmill: Wind, pump: Droplets, waterwheel: Waves };

function sameTool(a: Tool, b: Tool): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'build' && b.kind === 'build') return a.building === b.building;
  if (a.kind === 'plant' && b.kind === 'plant') return a.crop === b.crop;
  if (a.kind === 'zone' && b.kind === 'zone') return a.zone === b.zone;
  if (a.kind === 'utility' && b.kind === 'utility') return a.utility === b.utility;
  return true;
}

function ToolButton({
  tool,
  label,
  Icon,
  hint,
  lockedBy,
}: {
  tool: Tool;
  label: string;
  Icon: LucideIcon;
  hint?: string;
  /** Why this tool cannot be used yet (a milestone to reach), or undefined when it can. */
  lockedBy?: string;
}) {
  const current = useHearthworks((s) => s.tool);
  const active = sameTool(current, tool);
  return (
    <button
      type="button"
      className="hw-tool"
      aria-pressed={active}
      disabled={lockedBy !== undefined}
      title={lockedBy ?? (hint ? `${label} · ${hint}` : label)}
      onClick={() => hearthworksStore.getState().setTool(active ? { kind: 'inspect' } : tool)}
    >
      <Icon aria-hidden size={20} />
      <span>{label}</span>
      {hint && <span className="hw-tool__hint">{hint}</span>}
    </button>
  );
}

/**
 * `onMainMenu` returns to the main menu (progress persists); `togetherSignal` opens the multiplayer panel each time the
 * menu's "Play together" bumps it.
 */
export function Hud({ onMainMenu, togetherSignal = 0 }: { onMainMenu: () => void; togetherSignal?: number }) {
  const { t } = useTranslation('c-hearthworks');
  const money = useHearthworks((s) => s.world.players[s.playerId]?.money ?? 0);
  const inventory = useHearthworks((s) => s.world.players[s.playerId]?.inventory);
  const lastEvents = useHearthworks((s) => s.lastEvents);
  const [panel, setPanel] = useState<'pantry' | 'wardrobe' | 'customers' | 'armory' | 'multiplayer' | 'city' | null>(null);
  // The dock shows either the farm and kitchen tools or the town tools; picking a town tool anywhere switches it.
  const [dock, setDock] = useState<'farm' | 'city'>('farm');
  const toolKind = useHearthworks((s) => s.tool.kind);
  useEffect(() => {
    if (toolKind === 'road' || toolKind === 'zone' || toolKind === 'utility') setDock('city');
  }, [toolKind]);
  const world = useHearthworks((s) => s.world);
  const cityRev = useHearthworks((s) => s.rev);
  // An invite link (?lobby=CODE) opens the multiplayer panel, which joins it.
  const invite = useLobbyInvite();
  useEffect(() => {
    if (invite) setPanel('multiplayer');
  }, [invite]);
  useEffect(() => {
    if (togetherSignal > 0) setPanel('multiplayer');
  }, [togetherSignal]);
  const customers = useHearthworks((s) => s.world.npcs.filter((n) => n.mode !== 'leaving').length);
  const pantry = panel === 'pantry';

  // Refusals are the game's most common feedback; say them where the player is looking.
  useEffect(() => {
    for (const e of lastEvents) {
      if (e.type === 'skinBought')
        toast(t('skin-bought', { defaultValue: 'New look unlocked!' }), { id: 'hw-skin' });
      if (e.type === 'milestoneReached')
        toast(
          t('toast-milestone', {
            defaultValue: 'Milestone reached: {{name}}. Claim the reward in Town.',
            name: milestoneText(t, e.id).name,
          }),
          { id: `hw-ms-${e.id}` },
        );
      if (e.type === 'milestoneClaimed' && e.playerId === hearthworksStore.getState().playerId)
        toast(
          t('toast-claimed', {
            defaultValue: '{{name}} reward: +{{reward}}',
            name: milestoneText(t, e.id).name,
            reward: e.reward,
          }),
          { id: `hw-claim-${e.id}` },
        );
      if (e.type === 'cityEventStarted') {
        const text = cityEventText(t, e.id);
        toast(
          t('toast-event-start', {
            defaultValue: '{{name}}: {{effect}}',
            name: text.name,
            effect: text.effect,
          }),
          { id: `hw-event-${e.id}-${e.day}` },
        );
      }
      if (e.type === 'cityEventEnded')
        toast(
          t('toast-event-end', {
            defaultValue: '{{name}} is over.',
            name: cityEventText(t, e.id).name,
          }),
          { id: `hw-event-end-${e.id}-${e.day}` },
        );
      // Your own change is on the slider under your hand; someone else's is worth a line.
      if (e.type === 'taxRateSet' && e.playerId !== hearthworksStore.getState().playerId)
        toast(t('toast-tax-set', { defaultValue: 'Tax rate set to {{rate}}%.', rate: e.rate }), {
          id: 'hw-tax',
        });
      if (e.type === 'officerSpawned') toast(t('police-coming', { defaultValue: 'Police are on the island.' }), { id: 'hw-police' });
      if (e.type === 'arrested')
        toast(t('arrested', { defaultValue: 'Arrested. Fined {{fine}} and your contraband was taken.', fine: e.fine }), { id: 'hw-arrest' });
      if (e.type === 'respawned')
        toast(t('respawned', { defaultValue: 'You came to at the meadow. Fined {{fine}}.', fine: e.fine }), { id: 'hw-respawn' });
      if (e.type === 'officerDown')
        toast(t('officer-down', { defaultValue: 'Officer down. Heat is way up. +{{drop}}', drop: e.drop }), { id: 'hw-kill' });
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
        <div
          className="hw-chip"
          role="status"
          aria-label={t('money-label', { defaultValue: 'Money' })}
        >
          <Coins aria-hidden size={18} />
          <span className="hw-chip__value">{money.toLocaleString()}</span>
        </div>
        <ViewToggle />
        <button
          type="button"
          className="hw-chip hw-chip--button"
          aria-expanded={panel === 'multiplayer'}
          onClick={() => setPanel((p) => (p === 'multiplayer' ? null : 'multiplayer'))}
        >
          <UsersRound aria-hidden size={18} />
          <span>{t('mp-title', { defaultValue: 'Play together' })}</span>
        </button>
        <button
          type="button"
          className="hw-chip hw-chip--button"
          aria-expanded={panel === 'city'}
          onClick={() => setPanel((p) => (p === 'city' ? null : 'city'))}
        >
          <Landmark aria-hidden size={18} />
          <span>{t('city-title', { defaultValue: 'Town' })}</span>
          {world.city.reached.length > world.city.claimed.length && (
            <b className="hw-badge">{world.city.reached.length - world.city.claimed.length}</b>
          )}
        </button>
        <button
          type="button"
          className="hw-chip hw-chip--button"
          aria-expanded={panel === 'customers'}
          onClick={() => setPanel((p) => (p === 'customers' ? null : 'customers'))}
        >
          <Users aria-hidden size={18} />
          <span>{t('customers-title', { defaultValue: 'Customers' })}</span>
          {customers > 0 && <b className="hw-badge">{customers}</b>}
        </button>
        <button
          type="button"
          className="hw-chip hw-chip--button"
          aria-expanded={panel === 'armory'}
          onClick={() => setPanel((p) => (p === 'armory' ? null : 'armory'))}
        >
          <Crosshair aria-hidden size={18} />
          <span>{t('armory-title', { defaultValue: 'Back alley' })}</span>
        </button>
        <button
          type="button"
          className="hw-chip hw-chip--button"
          aria-expanded={panel === 'wardrobe'}
          onClick={() => setPanel((p) => (p === 'wardrobe' ? null : 'wardrobe'))}
        >
          <Shirt aria-hidden size={18} />
          <span>{t('wardrobe-title', { defaultValue: 'Wardrobe' })}</span>
        </button>
        <button
          type="button"
          className="hw-chip hw-chip--button"
          aria-expanded={pantry}
          onClick={() => setPanel((p) => (p === 'pantry' ? null : 'pantry'))}
        >
          <Wheat aria-hidden size={18} />
          <span>{t('pantry-title', { defaultValue: 'Pantry' })}</span>
        </button>
        <button type="button" className="hw-chip hw-chip--button" onClick={onMainMenu}>
          <Menu aria-hidden size={18} />
          <span>{t('main-menu', { defaultValue: 'Main menu' })}</span>
        </button>
      </header>

      {panel === 'wardrobe' && <Wardrobe />}
      {panel === 'customers' && <Customers />}
      {panel === 'city' && <CityPanel />}
      {panel === 'armory' && <Armory />}
      <Vitals />
      {panel === 'multiplayer' && <MultiplayerPanel />}
      {pantry && (
        <section className="hw-panel" aria-label={t('pantry-title', { defaultValue: 'Pantry' })}>
          <h2 className="hw-panel__title">{t('pantry-title', { defaultValue: 'Pantry' })}</h2>
          {held.length === 0 ? (
            <p className="hw-muted">
              {t('pantry-empty', {
                defaultValue: 'Nothing yet — plant something and wait for it to ripen.',
              })}
            </p>
          ) : (
            <ul className="hw-list">
              {held.map(([id, n]) =>
                isItemId(id) ? (
                  <li key={id} className="hw-row">
                    <span>
                      {ITEMS[id].name} <b>×{n}</b>
                    </span>
                    {ITEMS[id].contraband ? (
                      <span className="hw-muted">{t('street-only', { defaultValue: 'Street only' })}</span>
                    ) : (
                      <button
                        type="button"
                        className="hw-small"
                        onClick={() =>
                          hearthworksStore.getState().dispatch({ type: 'sell', item: id, qty: n ?? 0 })
                        }
                      >
                        {t('sell-all', { defaultValue: 'Sell all' })} · {(ITEMS[id].price * (n ?? 0)).toLocaleString()}
                      </button>
                    )}
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
                  onClick={() =>
                    hearthworksStore.getState().dispatch({ type: 'cook', recipe: key })
                  }
                >
                  {t('cook', { defaultValue: 'Cook' })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <WalkControls />
      <nav className="hw-dock" aria-label={t('tools-label', { defaultValue: 'Tools' })} data-mode={dock}>
        <div className="hw-dock__modes" role="group" aria-label={t('dock-modes', { defaultValue: 'Tool set' })}>
          <button type="button" className="hw-mode" aria-pressed={dock === 'farm'} onClick={() => setDock('farm')}>
            <Sprout aria-hidden size={16} />
            <span>{t('dock-farm', { defaultValue: 'Farm' })}</span>
          </button>
          <button type="button" className="hw-mode" aria-pressed={dock === 'city'} onClick={() => setDock('city')}>
            <Landmark aria-hidden size={16} />
            <span>{t('dock-city', { defaultValue: 'Town' })}</span>
          </button>
        </div>
        <ToolButton
          tool={{ kind: 'inspect' }}
          label={t('tool-look', { defaultValue: 'Look' })}
          Icon={MousePointer2}
        />
        {dock === 'farm' ? (
          <>
            {BUILDING_IDS.filter((b) => b !== 'road').map((b) => (
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
              tool={{ kind: 'hire' }}
              label={t('tool-hire', { defaultValue: 'Hire' })}
              Icon={Handshake}
              hint={String(HIRE_COST)}
            />
          </>
        ) : (
          <>
            <ToolButton
              tool={{ kind: 'road' }}
              label={t('tool-road', { defaultValue: 'Road' })}
              Icon={Route}
              hint={String(ROAD_COST)}
            />
            {ZONE_IDS.map((z) => (
              <ToolButton
                key={z}
                tool={{ kind: 'zone', zone: z }}
                label={zoneName(t, z)}
                Icon={ZONE_ICON[z]}
                hint={String(ZONES[z].cost)}
                lockedBy={cityRev >= 0 && !zoneUnlocked(world, z) ? lockHint(t, `zone:${z}` as UnlockId) : undefined}
              />
            ))}
            {UTILITY_IDS.map((u) => (
              <ToolButton
                key={u}
                tool={{ kind: 'utility', utility: u }}
                label={utilityName(t, u)}
                Icon={UTILITY_ICON[u]}
                hint={String(UTILITIES[u].cost)}
                lockedBy={cityRev >= 0 && !utilityUnlocked(world, u) ? lockHint(t, `utility:${u}` as UnlockId) : undefined}
              />
            ))}
          </>
        )}
        <ToolButton
          tool={{ kind: 'remove' }}
          label={t('tool-clear', { defaultValue: 'Clear' })}
          Icon={Trash2}
        />
      </nav>
      {dock === 'city' && <CityReadout />}
    </>
  );
}

/** Why a town tool is greyed out: the milestone that opens it. */
function lockHint(t: ReturnType<typeof useTranslation>['t'], unlock: UnlockId): string {
  const by = MILESTONES.find((m) => m.unlocks.includes(unlock));
  return t('locked-until', {
    defaultValue: 'Reach {{milestone}} to unlock {{what}}.',
    milestone: by ? milestoneText(t, by.id).name : '',
    what: unlockName(t, unlock),
  });
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
    case 'too-far':
      return t('err-too-far', { defaultValue: 'Get closer first.' });
    case 'depleted':
      return t('err-depleted', { defaultValue: 'Nothing left there for now.' });
    case 'no-such-npc':
      return t('err-no-such-npc', { defaultValue: 'They have already gone.' });
    case 'no-cottage':
      return t('err-no-cottage', { defaultValue: 'Hire people at a cottage.' });
    case 'too-many-workers':
      return t('err-too-many-workers', { defaultValue: 'That cottage is full.' });
    case 'unknown-skin':
      return t('err-unknown-skin', { defaultValue: 'That look does not exist.' });
    case 'already-owned':
      return t('err-already-owned', { defaultValue: 'You already own that look.' });
    case 'not-owned':
      return t('err-not-owned', { defaultValue: 'Buy that look first.' });
    case 'contraband':
      return t('err-contraband', { defaultValue: 'No stall will buy that. Hustle it on the street.' });
    case 'unknown-weapon':
      return t('err-unknown-weapon', { defaultValue: 'There is no such gun.' });
    case 'no-weapon':
      return t('err-no-weapon', { defaultValue: 'Buy that gun and equip it first.' });
    case 'no-ammo':
      return t('err-no-ammo', { defaultValue: 'Out of ammo.' });
    case 'bad-aim':
      return t('err-bad-aim', { defaultValue: 'Aim somewhere else.' });
    case 'downed':
      return t('err-downed', { defaultValue: 'You are down.' });
    case 'bad-shape':
      return t('err-bad-shape', { defaultValue: 'Roads run in straight lines. Drag out an L if you need a corner.' });
    case 'locked':
      return t('err-locked', { defaultValue: 'Not unlocked yet. Reach the next milestone.' });
    case 'no-shore':
      return t('err-no-shore', { defaultValue: 'That needs open water right beside it.' });
    case 'unknown-milestone':
      return t('err-unknown-milestone', { defaultValue: 'There is no such milestone.' });
    case 'not-reached':
      return t('err-not-reached', { defaultValue: 'You have not reached that milestone yet.' });
    case 'already-claimed':
      return t('err-already-claimed', { defaultValue: 'That reward has already been claimed.' });
    default:
      // A refusal this build has no wording for (a newer host's rule): say something rather than an empty toast.
      return t('err-generic', { defaultValue: 'That did not work.' });
  }
}
