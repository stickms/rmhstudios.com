/**
 * The opponent. A Protocol picks its action at the START of the round (before you commit) from a probability
 * distribution its personality shapes, then shows a tell: the action it chose, or — with probability
 * `1 - honesty` — a bluff. A glitch can still replace the action after the tell. Reading a Protocol is learning
 * how far to trust its tells and what its habits are.
 *
 * `protocolDistribution` is exported so the balance simulation's player can reason with the same model a skilled
 * human builds up (`sim.ts`).
 */
import { pick, randInt, type Rng } from './rng';
import type { ProtocolDef } from './data';
import { PROTOCOL_ACTIONS, type PlayerAction, type ProtocolAction } from './types';

/** The action that answers each of yours. */
export const COUNTER: Record<PlayerAction, ProtocolAction> = {
  Strike: 'Block',
  Block: 'Prepare',
  Prepare: 'Strike',
  Probe: 'Strike',
};

/** What a Mimic plays to copy you. */
const MIRROR: Record<PlayerAction, ProtocolAction> = {
  Strike: 'Strike',
  Block: 'Block',
  Prepare: 'Prepare',
  Probe: 'Idle',
};

export type Distribution = Record<ProtocolAction, number>;

export interface ProtocolView {
  def: ProtocolDef;
  health: number;
  maxHealth: number;
  primed: boolean;
  /** Your recent actions, newest first. */
  history: readonly PlayerAction[];
}

function normalise(w: Distribution): Distribution {
  const total = PROTOCOL_ACTIONS.reduce((s, a) => s + Math.max(0, w[a]), 0) || 1;
  return {
    Strike: Math.max(0, w.Strike) / total,
    Block: Math.max(0, w.Block) / total,
    Prepare: Math.max(0, w.Prepare) / total,
    Idle: Math.max(0, w.Idle) / total,
  };
}

function mix(d: Distribution, action: ProtocolAction, p: number): Distribution {
  const out = { ...d };
  for (const a of PROTOCOL_ACTIONS) out[a] = d[a] * (1 - p) + (a === action ? p : 0);
  return out;
}

/** True when NULL//ROOT has dropped into its second phase. */
export function inSecondPhase(view: Pick<ProtocolView, 'def' | 'health' | 'maxHealth'>): boolean {
  return view.def.trait === 'corrupt' && view.health * 2 <= view.maxHealth;
}

/** The probability of each action this round, before the glitch. */
export function protocolDistribution(view: ProtocolView): Distribution {
  const { def } = view;
  const w: Distribution = { ...def.weights };
  const last = view.history[0];
  const phase2 = inSecondPhase(view);

  if (last && def.adapt > 0) w[COUNTER[last]] += phase2 ? def.adapt * 2 : def.adapt;
  if (view.health * 3 <= view.maxHealth) w.Strike += 10;
  if (phase2) w.Strike += 15;

  let d = normalise(w);

  if (view.primed) {
    // Primed: it mostly cashes the Prepare in.
    d = mix(d, 'Strike', def.primedStrike);
  }
  if (def.trait === 'mirror' && last) d = mix(d, MIRROR[last], def.traitPower);
  if ((def.trait === 'predict' || (def.trait === 'corrupt' && !phase2)) && view.history.length > 0) {
    const habit = mostCommon(view.history.slice(0, 3));
    d = mix(d, COUNTER[habit], def.traitPower);
  }
  return d;
}

function mostCommon(list: readonly PlayerAction[]): PlayerAction {
  const counts = new Map<PlayerAction, number>();
  for (const a of list) counts.set(a, (counts.get(a) ?? 0) + 1);
  let best = list[0] as PlayerAction;
  for (const a of list) if ((counts.get(a) ?? 0) > (counts.get(best) ?? 0)) best = a;
  return best;
}

function sample(rng: Rng, d: Distribution): ProtocolAction {
  let r = rng.next();
  for (const a of PROTOCOL_ACTIONS) {
    r -= d[a];
    if (r < 0) return a;
  }
  return 'Idle';
}

/** The action the Protocol intends this round. */
export function chooseProtocolAction(view: ProtocolView, rng: Rng): ProtocolAction {
  return sample(rng, protocolDistribution(view));
}

/** The tell it shows for `intended`: the truth with probability `honesty`, otherwise one of the other three. */
export function makeTell(def: ProtocolDef, intended: ProtocolAction, rng: Rng): ProtocolAction {
  if (rng.next() < def.honesty) return intended;
  const others = PROTOCOL_ACTIONS.filter((a) => a !== intended);
  return pick(rng, others);
}

/** A glitch: with probability `def.glitch * mult` the action is replaced by a random one. */
export function applyGlitch(def: ProtocolDef, intended: ProtocolAction, rng: Rng, mult = 1): ProtocolAction {
  if (rng.next() < def.glitch * mult) return PROTOCOL_ACTIONS[randInt(rng, PROTOCOL_ACTIONS.length)] as ProtocolAction;
  return intended;
}

/**
 * What a player who knows this Protocol should believe about its action, given its tell (or no tell) — Bayes over
 * the distribution, the tell's honesty and the glitch. Used by the simulation and by the Decoder ware's readout.
 */
export function belief(
  view: ProtocolView,
  tell: ProtocolAction | null,
  opts: { truthful?: boolean; glitchMult?: number } = {},
): Distribution {
  const prior = protocolDistribution(view);
  let post: Distribution = prior;
  if (tell && opts.truthful) {
    post = { Strike: 0, Block: 0, Prepare: 0, Idle: 0, [tell]: 1 } as Distribution;
  } else if (tell) {
    const h = view.def.honesty;
    const w = {} as Distribution;
    for (const a of PROTOCOL_ACTIONS) w[a] = prior[a] * (a === tell ? h : (1 - h) / 3);
    post = normalise(w);
  }
  const g = Math.min(1, view.def.glitch * (opts.glitchMult ?? 1));
  const out = {} as Distribution;
  for (const a of PROTOCOL_ACTIONS) out[a] = post[a] * (1 - g) + g / 4;
  return out;
}
