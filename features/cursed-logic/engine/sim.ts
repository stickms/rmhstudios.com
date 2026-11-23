/**
 * The balance harness: scripted players that drive the real run code (`run.ts`) with a seeded RNG. Used only by
 * `__tests__/balance.test.ts` and `scripts`-style exploration; the game never imports it.
 *
 * - `reader`: what a good human converges on. Knows each Protocol's habits and how far its tells can be trusted
 *   (Bayes over `belief()`), picks the stance and action with the best expected value for the round.
 * - `believer`: the same, but takes every tell at face value (the player who has not learned who lies).
 * - `random`, `striker`, `turtle`: a random button-presser, always-Strike and always-Block.
 */
import { DAMAGE, PROTOCOLS, REINFORCE_COST, SHOP_PRICES, SIM_MINIGAME_SUCCESS } from './data';
import { belief, type Distribution } from './protocol';
import { resolveClash } from './resolution';
import { createRng, pick, type Rng } from './rng';
import {
  actionCost,
  chooseStance,
  commitAction,
  continueRun,
  finishRound,
  newRun,
  pickMilestone,
  protocolView,
  sectorDef,
  startDuel,
  applyDecoder,
  type RunState,
} from './run';
import { buyItem, canBuy } from './shopState';
import { PLAYER_ACTIONS, PROTOCOL_ACTIONS, type PactId, type PlayerAction, type ProtocolId, type Stance } from './types';

export type Strategy = 'reader' | 'believer' | 'random' | 'striker' | 'turtle';

export interface AgentOptions {
  strategy: Strategy;
  /** Use only this stance every round (stance balance tests). */
  forceStance?: Stance;
  /** Alternate between these two stances (pair tests). */
  stancePair?: [Stance, Stance];
  /** Play minigames (success at SIM_MINIGAME_SUCCESS) or leave them off. */
  minigames?: boolean;
}

interface Choice {
  stance: Stance;
  action: PlayerAction;
  reinforce: boolean;
  value: number;
}

const W_DEAL = 1;
const W_TAKE = 1.15;
const PRIME_VALUE = 1.6;
const CHARGE_VALUE = 0.35;
const PROBE_VALUE = 1.1;

function beliefFor(run: RunState, strategy: Strategy): Distribution {
  const duel = run.duel!;
  const view = protocolView(duel);
  const glitchMult = run.pacts.includes('chaosRun') ? 2 : 1;
  if (duel.decoderVerdict === true || duel.tellTrue) return belief(view, duel.tell, { truthful: true, glitchMult });
  if (strategy === 'believer' && duel.tell) return belief(view, duel.tell, { truthful: true, glitchMult });
  const b = belief(view, duel.tell, { glitchMult });
  if (duel.decoderVerdict === false && duel.tell) {
    const out = { ...b, [duel.tell]: 0 } as Distribution;
    const total = PROTOCOL_ACTIONS.reduce((s, a) => s + out[a], 0) || 1;
    for (const a of PROTOCOL_ACTIONS) out[a] /= total;
    return out;
  }
  return b;
}

function evaluate(run: RunState, stance: Stance, action: PlayerAction, reinforce: boolean, b: Distribution): number {
  const duel = run.duel!;
  const def = PROTOCOLS[duel.protocolId];
  const cost = actionCost({ stance }, run, action) + (reinforce ? REINFORCE_COST : 0);
  if (reinforce && duel.charge < cost) return -Infinity;
  const overdraw = duel.charge < cost;
  const doubleDown = run.pacts.includes('doubleDown') ? 1 : 0;
  const overclock = def.trait === 'overclock' && duel.protocolHealth * 2 <= duel.protocolMax ? def.traitPower : 0;
  let ev = 0;
  for (const q of PROTOCOL_ACTIONS) {
    const p = b[q];
    if (p <= 0) continue;
    const c = resolveClash({
      player: action,
      protocol: q,
      playerPrimed: duel.playerPrimed,
      protocolPrimed: duel.protocolPrimed,
      stance,
      reinforced: reinforce,
      overdraw,
      modifier: duel.modifier === 'Chaos' ? null : duel.modifier,
      playerCondition: duel.playerCondition,
      protocolCondition: duel.protocolCondition,
      upgrades: run.upgrades,
      playerStrikeBonus: (run.pacts.includes('glassCannon') ? 1 : 0) + doubleDown,
      protocolStrikeBonus: (run.mode === 'tutorial' ? 0 : sectorDef(run.sector).strikeBonus) + doubleDown + overclock,
      trait: def.trait,
      traitPower: def.traitPower,
    });
    let v = c.protocolDamage * W_DEAL - c.playerDamage * W_TAKE + c.playerHeal * W_TAKE * 0.9;
    v -= c.protocolHeal * W_DEAL;
    if (c.playerPrimed) v += PRIME_VALUE;
    if (c.protocolPrimed) v -= PRIME_VALUE * 0.8;
    if (c.nextPlayerCondition) v -= 0.5;
    if (c.nextProtocolCondition) v += 0.5;
    v += c.chargeGain * CHARGE_VALUE;
    if (c.protocolDamage >= duel.protocolHealth) v += 4;
    if (c.playerDamage - c.playerHeal >= run.integrity) v -= 12;
    ev += p * v;
  }
  if (action === 'Probe') ev += PROBE_VALUE * (stance === 'Scan' || run.upgrades.includes('probeReveals2') ? 1.6 : 1);
  ev -= Math.min(cost, duel.charge) * CHARGE_VALUE;
  return ev;
}

function decide(run: RunState, rng: Rng, opts: AgentOptions): Choice {
  const duel = run.duel!;
  const offer: Stance[] = opts.forceStance
    ? [opts.forceStance]
    : opts.stancePair
      ? [opts.stancePair[duel.round % 2]]
      : duel.stanceOffer;
  if (opts.strategy === 'random' || opts.strategy === 'striker' || opts.strategy === 'turtle') {
    const action: PlayerAction =
      opts.strategy === 'striker' ? 'Strike' : opts.strategy === 'turtle' ? 'Block' : pick(rng, PLAYER_ACTIONS);
    return { stance: pick(rng, offer), action, reinforce: false, value: 0 };
  }
  const b = beliefFor(run, opts.strategy);
  let best: Choice | null = null;
  for (const stance of offer) {
    for (const action of PLAYER_ACTIONS) {
      for (const reinforce of [false, true]) {
        const value = evaluate(run, stance, action, reinforce, b) + rng.next() * 1e-6;
        if (!best || value > best.value) best = { stance, action, reinforce, value };
      }
    }
  }
  return best!;
}

/** Play one round of the current duel. */
export function playRound(run: RunState, rng: Rng, opts: AgentOptions): RunState {
  let r = run;
  const duel = r.duel!;
  if (opts.strategy === 'reader' && duel.decoderLeft > 0 && duel.tell && !duel.tellTrue) r = applyDecoder(r);
  const choice = decide(r, rng, opts);
  if (opts.forceStance || opts.stancePair) {
    r = { ...r, duel: { ...r.duel!, stanceOffer: [choice.stance] } };
  }
  r = chooseStance(r, choice.stance);
  const pending = commitAction(r, rng, choice.action, choice.reinforce);
  if (!pending) throw new Error('sim: commit refused');
  const minigame = pending.minigame && opts.minigames !== false ? rng.next() < SIM_MINIGAME_SUCCESS : null;
  return finishRound(r, rng, pending, minigame);
}

/** Between duels: take the first milestone pick; patch when hurt, otherwise buy the best affordable ware. */
function shop(run: RunState, rng: Rng): RunState {
  let r = run;
  if (r.stage === 'milestone') r = pickMilestone(r, rng, r.milestoneChoices?.[0] ?? null);
  if (r.stage === 'shop') {
    const priority = ['hull', 'strikePlus1', 'blockReflect', 'capacitor', 'chargeOnHit', 'prepareHeal', 'decoder', 'probeReveals2'] as const;
    for (let guard = 0; guard < 10; guard++) {
      if (r.integrity * 3 < r.maxIntegrity * 2 && canBuy(r, 'patch')) {
        r = buyItem(r, 'patch');
        continue;
      }
      const ware = priority.find((w) => canBuy(r, w));
      if (!ware) break;
      r = buyItem(r, ware);
    }
  }
  return continueRun(r, rng);
}

export interface RunOutcome {
  duelsWon: number;
  victory: boolean;
  score: number;
  sectorReached: number;
  rounds: number;
}

export function simulateRun(seed: number, opts: AgentOptions, pacts: PactId[] = []): RunOutcome {
  const rng = createRng(seed);
  let run = newRun(seed, pacts, rng);
  let rounds = 0;
  for (let guard = 0; guard < 2000 && run.stage !== 'over'; guard++) {
    if (run.stage === 'duel') {
      run = playRound(run, rng, opts);
      rounds++;
    } else {
      run = shop(run, rng);
    }
  }
  return { duelsWon: run.duelsWon, victory: run.victory, score: run.score, sectorReached: run.sector, rounds };
}

export interface DuelOutcome {
  won: boolean;
  rounds: number;
  integrityLost: number;
}

/** One duel against `protocol` in `sector`, starting at `integrity`: the unit the stance tests measure. */
export function simulateDuel(
  seed: number,
  protocol: ProtocolId,
  sector: number,
  integrity: number,
  opts: AgentOptions,
): DuelOutcome {
  const rng = createRng(seed);
  const base = newRun(seed, [], rng);
  let run: RunState = startDuel({ ...base, sector, integrity, maxIntegrity: Math.max(integrity, base.maxIntegrity), usedProtocols: [] }, rng, protocol);
  const start = run.integrity;
  for (let guard = 0; guard < 200 && run.stage === 'duel' && !run.duel?.result; guard++) {
    run = playRound(run, rng, opts);
  }
  const duel = run.duel!;
  return { won: duel.result === 'win', rounds: duel.round, integrityLost: Math.max(0, start - run.integrity) };
}

/** Exposed for the tests' sanity checks. */
export const SIM_CONSTANTS = { W_DEAL, W_TAKE, PRIME_VALUE, CHARGE_VALUE, PROBE_VALUE, DAMAGE, SHOP_PRICES };
