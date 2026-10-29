/**
 * The TF2 in-game HUD: every always-on panel of the default HUD composed over
 * the view (the menus are GameHud's). Panels read the snapshot from the store
 * and place themselves from the layout table.
 *
 * With a custom HUD (`custom`), the panels its `.res` files define — health,
 * class, ammo, meters, buildings, disguise, the KOTH clocks, the freeze and
 * win panels — are drawn by its own canvas (custom-hud/CustomHudLayer); what
 * the game makes at run time (timer, points, flags, cart, kill feed,
 * messages, crosshair) stays here, placed by the HUD's hudlayout.res.
 */
'use client';

import type { ReactNode } from 'react';
import type { HudState } from '@/lib/tf2-game/client/hud-state';
import { AmmoPanel, ItemEffectMeter, MedicCharge, StickyCharge } from './AmmoPanel';
import { Crosshair, DamageNumbers, ScopeOverlay } from './Crosshair';
import EngineerStatus from './EngineerStatus';
import HealthPanel from './HealthPanel';
import KillFeed from './KillFeed';
import ObjectiveStatus from './ObjectiveStatus';
import { CenterMessages, DisguiseStatus, FreezeCam, RespawnPanel, WinPanel } from './RoundPanels';

export default function Tf2Hud({
  state,
  hideCrosshair,
  custom = false,
  customBuildings = false,
  customSpectator = false,
  customLayer = null,
}: {
  state: HudState;
  hideCrosshair: boolean;
  /** A custom HUD's canvas draws the `.res`-defined panels. */
  custom?: boolean;
  /** …including the Engineer's building panels. */
  customBuildings?: boolean;
  /** …and the spectator GUI (its respawn text): the game's own stays for screen readers only. */
  customSpectator?: boolean;
  /** The custom HUD's canvas: over the sniper scope, under everything the game draws itself. */
  customLayer?: ReactNode;
}) {
  const local = state.local;
  const zoomed = !!local?.alive && local.conditions.zoomed;
  const team = local?.team ?? 0;
  const dead = !!local && !local.alive && local.team >= 2;
  return (
    <>
      {zoomed ? <ScopeOverlay charge={local?.meters.sniperCharge ?? null} /> : null}
      {customLayer}
      <ObjectiveStatus match={state.match} team={team} koth={!custom} />
      <KillFeed entries={state.killfeed} />
      <CenterMessages messages={state.center} />
      {custom && !customBuildings && local?.engineer && local.alive && local.team >= 2 ? (
        <EngineerStatus engineer={local.engineer} team={local.team} />
      ) : null}
      {!custom && local && local.team >= 2 && local.cls > 0 ? (
        <>
          {local.alive ? <HealthPanel local={local} /> : null}
          <AmmoPanel local={local} />
          <StickyCharge local={local} />
          <MedicCharge local={local} />
          <ItemEffectMeter local={local} />
          <DisguiseStatus local={local} />
          {local.engineer && local.alive ? <EngineerStatus engineer={local.engineer} team={local.team} /> : null}
        </>
      ) : null}
      {local ? <RespawnPanel local={local} freeze={!!state.freezecam} srOnly={custom && customSpectator} /> : null}
      {!custom && dead && state.freezecam ? <FreezeCam freeze={state.freezecam} /> : null}
      {!custom && state.match.win ? <WinPanel win={state.match.win} /> : null}
      {local?.alive && !zoomed ? <DamageNumbers numbers={state.damageNumbers} /> : null}
      <Crosshair hidden={hideCrosshair || zoomed || !local?.alive || local.conditions.taunting} />
    </>
  );
}
