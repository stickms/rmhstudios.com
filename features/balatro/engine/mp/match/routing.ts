/**
 * Peer-message routing (§3.b): who a peer kind goes to, from the targets the
 * referee's outcomes set (the same rules Lua's report.lua applies to its own
 * `MP.state.target`, so both sides agree on "my current opponent"):
 *
 * - `nemesis_pairing` → target = my partner ('' = bye) and ante nemesis;
 * - `royale_target`   → target = the neighbour the referee assigned me;
 * - `manhunt_target`  → target = the id the referee names;
 * - `team_card_target`→ card target (traps, Magnet) = my card partner.
 *
 * Kinds (`P>H>T`) go to the target(s); `P>H>A` to everyone; `trap_fired` to
 * the trap's owner; a Manhunt Runner's `trap_plant` to every Hunter still in
 * the match (A1 §5.3); `deck_res`/`stats_res` back to whoever asked; `sync` to
 * its own `to`, else everyone for a phantom, else the target. Receivers keep
 * what concerns them (Lua filters display sync by its target). Browser-free.
 */

import type { PeerKind } from '../wire';
import { WIRE_META } from '../wire-codec';
import type { Id, RefMsg, Team } from '../types';

export type Route = '*' | Id[];

export class Routing {
  target: Id | null = null;
  cardTarget: Id | null = null;
  teams: Record<Id, Team> = {};
  lives: Record<Id, number> = {};
  teamLives: { A?: number; B?: number } = {};
  pairing: { ante: number; pairing: Record<Id, Id | ''> } | null = null;
  /** Who asked us for our deck / stats (answered once, then forgotten). */
  private readonly askers: Record<'deck' | 'stats', Set<Id>> = { deck: new Set(), stats: new Set() };

  constructor(readonly me: Id, readonly roster: readonly Id[]) {}

  /** Fold one referee outcome. */
  apply(o: RefMsg): void {
    switch (o.t) {
      case 'nemesis_pairing': {
        this.pairing = { ante: o.ante, pairing: { ...o.pairing } };
        const p = o.pairing[this.me];
        this.target = p ? p : null;
        break;
      }
      case 'royale_target': {
        const t = o.targets[this.me];
        if (t !== undefined) this.target = t || null;
        break;
      }
      case 'manhunt_target':
        this.target = o.target_id || null;
        break;
      case 'team_card_target': {
        const t = o.pairing[this.me];
        this.cardTarget = t ? t : null;
        break;
      }
      case 'team_roster':
        this.teams = { ...o.roster };
        break;
      case 'player_lives':
        if (o.player_id === '*all*') for (const id of this.roster) this.lives[id] = o.lives;
        else this.lives[o.player_id] = o.lives;
        break;
      case 'team_lives':
        this.teamLives[o.team_id] = o.lives;
        break;
      default:
        break;
    }
  }

  /** Every Hunter (roster order) not known to be out of lives. */
  private hunters(): Id[] {
    return this.roster.filter((id) => this.teams[id] === 'HUNTER' && (this.lives[id] ?? 1) > 0);
  }

  /** A received request: remember who to answer. */
  noteRequest(kind: 'deck_req' | 'stats_req', from: Id): void {
    this.askers[kind === 'deck_req' ? 'deck' : 'stats'].add(from);
  }

  /** Where one of my outgoing peer messages goes. */
  route(kind: PeerKind, d: Record<string, unknown>): Route {
    if (WIRE_META[kind].dir === 'P>H>A') return '*';
    const tgt = this.target ? [this.target] : [];
    switch (kind) {
      case 'trap_fired':
        return typeof d.owner === 'string' && d.owner !== this.me ? [d.owner] : [];
      case 'trap_plant':
        if (this.teams[this.me] === 'RUNNER') return this.hunters();
        return this.cardTarget ? [this.cardTarget] : tgt;
      case 'deck_res':
      case 'stats_res': {
        const set = this.askers[kind === 'deck_res' ? 'deck' : 'stats'];
        const out = [...set];
        set.clear();
        return out.length > 0 ? out : tgt;
      }
      case 'sync': {
        if (typeof d.to === 'string' && d.to) return [d.to];
        if (d.kind === 'phantom') return '*';
        return tgt;
      }
      default:
        return tgt;
    }
  }
}
