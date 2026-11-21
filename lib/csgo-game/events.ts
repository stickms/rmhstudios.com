/**
 * CS:GO's game events beside the shared ones (sim/events.ts: sounds, effects, deaths, damage, chat,
 * the round state). The shared event codec (net/event-codec.ts) is self-describing, so these travel as
 * they are; recipients (`to`, `notTo`, `team`) work as for every event. The HUD's round panel, the
 * bomb indicator, the money ticker and the buy menu's replies read them.
 */

import type { Recipients } from '../tf2-game/sim/events';
import type { Vec3 } from '../tf2-game/core/vec';
import type { GameWorld } from '../tf2-game/sim/world';
import { registerTeamFilteredEvent } from '../tf2-game/net/event-codec';

export interface CsRoundEvent {
  type: 'cs_round';
  kind: 'match_start' | 'freeze' | 'live' | 'end' | 'halftime';
  round: number;
  winner?: number;
  /** CS_WIN_* (constants.ts). */
  reason?: number;
  gameOver?: boolean;
  tScore?: number;
  ctScore?: number;
}

export interface CsBombEvent extends Recipients {
  type: 'cs_bomb';
  kind: 'pickup' | 'dropped' | 'planted' | 'defused' | 'exploded' | 'defuse_start' | 'defuse_abort';
  player: number;
  entity?: number;
  /** 'A' / 'B' (the bomb target the plant was in). */
  site?: string;
  pos?: Vec3;
}

export interface CsMoneyEvent extends Recipients {
  type: 'cs_money';
  player: number;
  amount: number;
  total: number;
  reason: string;
}

export interface CsBuyEvent extends Recipients {
  type: 'cs_buy';
  player: number;
  item: string;
  ok: boolean;
  reason?: string;
  price?: number;
}

export type CsEvent = CsRoundEvent | CsBombEvent | CsMoneyEvent | CsBuyEvent;

/** The bomb's pickups and drops are for the Terrorists only (CS:GO shows them to the carrier's team). */
registerTeamFilteredEvent('cs_bomb');

/** Pushes a CS event onto the world's outgoing events. */
export function csEvent(world: GameWorld, ev: CsEvent): void {
  (world.events as unknown as CsEvent[]).push(ev);
}
