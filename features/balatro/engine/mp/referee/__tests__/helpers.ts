/**
 * Test helpers for the referee specs: build a StartedMatch for any shape and
 * player count, and drive `refStep` while keeping every step's result.
 */

import { expect } from 'vitest';
import { defaultOptionsFor, shapeFor } from '../../rulesets/options';
import { resolveRuleset } from '../../rulesets/resolve';
import {
  zRefCheckpoint,
  zRefMsg,
  type GameEvent,
  type Id,
  type LobbyOptions,
  type QueueMode,
  type RefInput,
  type RefMsg,
  type RefOutput,
  type RefStep,
  type StartedMatch,
  type Team,
} from '../../types';
import { refStep, type RefState } from '../referee';

export const T0 = 1_761_800_000_000;

export interface MatchSpec {
  queueMode?: QueueMode;
  n?: number;
  options?: Partial<LobbyOptions>;
  practice?: boolean;
  teams?: (Team | undefined)[];
  runId?: string;
}

export function ids(n: number): Id[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

export function makeMatch(spec: MatchSpec = {}): StartedMatch {
  const queueMode = spec.queueMode ?? 'pvp_nemesis';
  const n = spec.n ?? 2;
  const base = { ...defaultOptionsFor(queueMode), ...spec.options };
  const { resolved, options } = resolveRuleset({ options: base, practice: spec.practice });
  return {
    runId: spec.runId ?? 'run1',
    seed: 'ABCD1234',
    stake: 1,
    mpStake: null,
    deck: 'b_red',
    challenge: null,
    queueMode,
    shape: shapeFor(queueMode, spec.practice),
    ruleset: options.ruleset,
    layers: resolved.layers,
    options,
    resolved,
    roster: ids(n).map((id, i) => {
      const team = spec.teams?.[i];
      return {
        id,
        name: id.toUpperCase(),
        blindCol: 1 + (i % 25),
        avatarJoker: 'j_joker',
        ...(team ? { team } : {}),
      };
    }),
    startedAt: T0,
    hostId: 'p1',
    contentHash: '0123456789abcdef01234567-v1',
  };
}

/** Drives refStep and records everything; validates every output against the frozen schemas. */
export class Sim {
  state: RefState | null = null;
  steps: RefStep<RefState>[] = [];
  inputs: RefInput[] = [];
  at = T0;
  constructor(public match: StartedMatch) {}

  get last(): RefStep<RefState> {
    return this.steps[this.steps.length - 1] as RefStep<RefState>;
  }
  get cp() {
    return (this.state as RefState).cp;
  }
  p(id: Id) {
    return this.cp.players[id] as NonNullable<RefState['cp']['players'][string]>;
  }

  input(i: RefInput): RefOutput[] {
    const r = refStep(this.state, i);
    for (const o of r.out) {
      const parsed = zRefMsg.safeParse(o.msg);
      if (!parsed.success)
        throw new Error(`invalid RefMsg ${JSON.stringify(o.msg)}: ${parsed.error.message}`);
    }
    if (r.checkpoint) {
      const parsed = zRefCheckpoint.safeParse(r.checkpoint);
      if (!parsed.success) throw new Error(`invalid checkpoint: ${parsed.error.message}`);
    }
    this.state = r.state;
    this.steps.push(r);
    this.inputs.push(i);
    return r.out;
  }

  reset(rngSeed = 42): RefOutput[] {
    return this.input({ t: 'reset', at: this.at, match: this.match, rngSeed });
  }
  ev(from: Id, e: GameEvent, dt = 10): RefOutput[] {
    this.at += dt;
    return this.input({ t: 'event', at: this.at, from, e });
  }
  presence(id: Id, status: Extract<RefInput, { t: 'presence' }>['status'], dt = 10): RefOutput[] {
    this.at += dt;
    return this.input({ t: 'presence', at: this.at, id, status });
  }
  tick(at: number): RefOutput[] {
    this.at = at;
    return this.input({ t: 'tick', at });
  }

  /** Everyone alive readies (with `hands` starting hands) — returns all outputs. */
  readyAll(players: Id[], hands = 4): RefOutput[] {
    const out: RefOutput[] = [];
    for (const id of players) {
      out.push(...this.ev(id, { t: 'new_round' }));
      out.push(...this.ev(id, { t: 'ready_blind', starting_hands: hands }));
    }
    return out;
  }
  hand(id: Id, score: string, handsLeft: number): RefOutput[] {
    return this.ev(id, { t: 'play_hand', score, hands_left: handsLeft, skips: 0 });
  }
  /** Play a full PvP round: start it, then each player posts its final score with 0 hands. */
  pvpRound(scores: Record<Id, string>, hands = 4): RefOutput[] {
    const players = Object.keys(scores);
    const out = this.readyAll(players, hands);
    for (const id of players) out.push(...this.hand(id, scores[id] as string, 0));
    return out;
  }
  fail(
    id: Id,
    ante: number,
    blind: 'Small' | 'Big' | 'Boss' = 'Small',
    kind: 'fail_round' | 'fail_timer' = 'fail_round',
  ) {
    return [
      ...this.ev(id, { t: 'blind_result', ante, blind, beaten: false }),
      ...this.ev(id, { t: kind }),
    ];
  }
  beat(id: Id, ante: number, blind: 'Small' | 'Big' | 'Boss' = 'Small') {
    return this.ev(id, { t: 'blind_result', ante, blind, beaten: true });
  }

  allMsgs(): RefMsg[] {
    return this.steps.flatMap((s) => s.out.map((o) => o.msg));
  }
}

export function msgs<T extends RefMsg['t']>(out: RefOutput[], t: T): Extract<RefMsg, { t: T }>[] {
  return out.map((o) => o.msg).filter((m): m is Extract<RefMsg, { t: T }> => m.t === t);
}

export function lastOf<T extends RefMsg['t']>(
  out: RefOutput[],
  t: T,
): Extract<RefMsg, { t: T }> | undefined {
  const all = msgs(out, t);
  return all[all.length - 1];
}

export function expectWin(sim: Sim, expected: Partial<Extract<RefMsg, { t: 'win' }>>): void {
  const over = sim.last.over;
  expect(over?.t).toBe('win');
  expect(over).toMatchObject(expected);
  const wins = sim.allMsgs().filter((m) => m.t === 'win' || m.t === 'player_won');
  expect(wins.length).toBe(1);
}

/** χ² statistic for observed counts against a uniform (or given) expectation. */
export function chiSquare(counts: number[], expected?: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.reduce((acc, c, i) => {
    const e = expected ? (expected[i] as number) : total / counts.length;
    return acc + ((c - e) * (c - e)) / e;
  }, 0);
}
