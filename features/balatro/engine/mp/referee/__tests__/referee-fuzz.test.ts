/**
 * Seeded scenario fuzzer (WS4 tests; REF-09, REF-13, REF-14, REF-19).
 *
 * Random 1–16-player matches of every shape with random (but plausible)
 * event sequences, checking invariants after every step:
 * - every output and checkpoint validates against the frozen schemas;
 * - lives never increase except through the Manhunt ante voucher or a reseed;
 * - outside Teams, at most one life is lost per player per round;
 * - eliminated players are never part of a `start_blind`, and each is
 *   announced at most once;
 * - the match ends exactly once; after that only the same result is re-sent;
 * - the checkpoint is the whole persistent state: rebuilding a referee from
 *   any step's checkpoint (also through JSON) and replaying the same inputs
 *   gives byte-identical outputs, and a takeover `restore` gives identical
 *   outcomes (modulo the sequence number it bumps).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../rng';
import type { GameEvent, Id, QueueMode, RefInput, RefStep } from '../../types';
import { deserializeCheckpoint, serializeCheckpoint } from '../checkpoint';
import { refCreate, refFromCheckpoint, refStep, type RefState } from '../referee';
import { Sim, T0, ids, makeMatch } from './helpers';

const SCORES = [
  '0',
  '1',
  '7',
  '100',
  '100',
  '250',
  '1000',
  '1e+308',
  'inf',
  '-inf',
  '12345.5',
  '2e+20',
];

interface Scenario {
  queueMode: QueueMode;
  n: number;
  practice: boolean;
  seed: number;
}

function scenarios(): Scenario[] {
  const out: Scenario[] = [];
  const modes: QueueMode[] = [
    'pvp_nemesis',
    'pvp_royale',
    'pvp_manhunt',
    'pvp_teams',
    'pvp_smallworld',
  ];
  let seed = 1;
  for (const queueMode of modes) {
    for (const n of [2, 3, 4, 5, 8, 16]) {
      for (let k = 0; k < 4; k++) out.push({ queueMode, n, practice: false, seed: seed++ });
    }
  }
  for (let k = 0; k < 6; k++)
    out.push({ queueMode: 'pvp_nemesis', n: 1, practice: true, seed: seed++ });
  return out;
}

/** A random but plausible input, biased toward PvP progress. */
function randomInput(rng: Rng, sim: Sim, antes: Record<Id, number>, at: number): RefInput {
  const players = ids(sim.match.roster.length);
  const id = rng.pick(players) as Id;
  const ante = antes[id] as number;
  const r = rng.next();
  if (r < 0.03) return { t: 'tick', at };
  if (r < 0.05) {
    const status = rng.pick([
      'away',
      'back',
      'rejoined',
      'away',
      'back',
      'left',
      'grace_expired',
    ] as const)!;
    return { t: 'presence', at, id, status };
  }
  const slot = rng.pick(['Small', 'Big', 'Boss'] as const)!;
  const table: [number, () => GameEvent][] = [
    [6, () => ({ t: 'new_round' })],
    [10, () => ({ t: 'ready_blind', starting_hands: rng.range(1, 5) })],
    [1, () => ({ t: 'unready_blind' })],
    [
      22,
      () => ({
        t: 'play_hand',
        score: rng.pick(SCORES)!,
        hands_left: rng.range(0, 3),
        skips: rng.int(3),
        lives: rng.int(9),
      }),
    ],
    [1, () => ({ t: 'skip', skips: rng.int(4), score: '0', hands_left: 4 })],
    [
      5,
      () => {
        antes[id] = ante + 1;
        return { t: 'set_ante', ante: ante + 1 };
      },
    ],
    [
      5,
      () => ({ t: 'blind_result', ante: Math.max(1, ante), blind: slot, beaten: rng.next() < 0.6 }),
    ],
    [3, () => ({ t: 'fail_round' })],
    [1, () => ({ t: 'fail_timer' })],
    [3, () => ({ t: 'fail_pvp_timer' })],
    [1, () => ({ t: 'furthest_blind', value: ante * 10 + 1 })],
    [1, () => ({ t: 'redeem_ante_voucher' })],
    [0.4, () => ({ t: 'forfeit' })],
    [0.6, () => ({ t: 'seed_vote' })],
    [0.3, () => ({ t: 'draw_vote' })],
    [1, () => ({ t: 'result_request' })],
  ];
  const total = table.reduce((a, [w]) => a + w, 0);
  let x = rng.next() * total;
  for (const [w, make] of table) {
    if ((x -= w) <= 0) return { t: 'event', at, from: id, e: make() };
  }
  return { t: 'event', at, from: id, e: { t: 'new_round' } };
}

function runScenario(sc: Scenario, steps = 260) {
  const rng = new Rng(sc.seed * 7919);
  const sim = new Sim(
    makeMatch({ queueMode: sc.queueMode, n: sc.n, practice: sc.practice, runId: `fuzz${sc.seed}` }),
  );
  sim.reset(sc.seed);
  const antes: Record<Id, number> = Object.fromEntries(ids(sc.n).map((id) => [id, 0]));
  let at = T0;
  for (let i = 0; i < steps; i++) {
    at += rng.range(1, 4000);
    sim.input(randomInput(rng, sim, antes, at));
  }
  // Force a finish: everyone but the first leaves (one at a time).
  for (const id of ids(sc.n).slice(1)) {
    at += 100;
    sim.input({ t: 'presence', at, id, status: 'left' });
  }
  // A lone survivor may still owe a pending blind: progressing past every ante settles it.
  at += 100;
  sim.input({ t: 'event', at, from: 'p1', e: { t: 'set_ante', ante: 999 } });
  // Let the re-sends play out.
  at += 10_000;
  sim.input({ t: 'tick', at });
  return sim;
}

function checkInvariants(sc: Scenario, sim: Sim): void {
  const n = sc.n;
  const players = ids(n);
  let prevLives: Record<Id, number> | null = null;
  const lostThisRound: Record<Id, number> = Object.fromEntries(players.map((id) => [id, 0]));
  const announced = new Set<Id>();
  let overMsg: string | null = null;
  let finishes = 0;
  const teamsShape = sc.queueMode === 'pvp_teams';

  sim.steps.forEach((step, i) => {
    const input = sim.inputs[i] as RefInput;
    const reseeded = step.out.some((o) => o.msg.t === 'reseed') || input.t === 'reset';
    if (reseeded) {
      for (const id of players) lostThisRound[id] = 0;
      announced.clear();
    }
    if (input.t === 'event' && input.e.t === 'new_round') lostThisRound[input.from] = 0;
    const lives = Object.fromEntries(
      players.map((id) => [id, step.state.cp.players[id]?.lives ?? 0]),
    );
    if (prevLives && !reseeded) {
      const voucher = input.t === 'event' && input.e.t === 'redeem_ante_voucher';
      for (const id of players) {
        if ((lives[id] as number) > (prevLives[id] as number)) {
          expect(voucher && sc.queueMode === 'pvp_manhunt').toBe(true);
        }
      }
    }
    prevLives = lives;

    for (const { to, msg } of step.out) {
      if (msg.t === 'player_lives' && msg.lost === 1 && !teamsShape && msg.player_id !== '*all*') {
        lostThisRound[msg.player_id] = (lostThisRound[msg.player_id] ?? 0) + 1;
        expect(lostThisRound[msg.player_id]).toBeLessThanOrEqual(1);
      }
      if (msg.t === 'eliminated') {
        expect(announced.has(msg.player_id)).toBe(false);
        announced.add(msg.player_id);
      }
      if (msg.t === 'start_blind') {
        for (const pid of Object.keys(msg.starting_hands)) {
          expect(announced.has(pid)).toBe(false);
          const p = step.state.cp.players[pid];
          expect(p && p.forfeited === 0 && p.lives > 0).toBe(true);
        }
      }
      if (overMsg !== null && to === '*') expect(JSON.stringify(msg)).toBe(overMsg);
    }
    if (step.over && overMsg === null) {
      overMsg = JSON.stringify(step.over);
      finishes++;
      expect(
        step.out.filter((o) => o.to === '*' && (o.msg.t === 'win' || o.msg.t === 'player_won')),
      ).toHaveLength(1);
    }
    if (overMsg !== null) expect(JSON.stringify(step.over)).toBe(overMsg);
  });
  if (!sc.practice) expect(finishes).toBe(1);
  if (!sc.practice) expect(sim.cp.winSentAt).toHaveLength(3);
}

function comparable(r: RefStep<RefState>, ignoreSeq: boolean) {
  const cp = r.checkpoint ? { ...r.checkpoint, seq: ignoreSeq ? 0 : r.checkpoint.seq } : null;
  return JSON.stringify({ out: r.out, cp, wakeAt: r.wakeAt, over: r.over });
}

const coverage = { rebuilt: 0, restored: 0, restoreSettled: 0 };

function checkResume(sc: Scenario, sim: Sim, rng: Rng): void {
  const total = sim.steps.length;
  const picks = [
    1,
    Math.floor(total / 3),
    Math.floor(total / 2),
    total - 3,
    rng.range(1, total - 2),
  ];
  for (const k of picks) {
    if (k < 1 || k >= total) continue;
    const at = sim.steps[k - 1] as RefStep<RefState>;
    const present = ids(sc.n).filter((id) => !at.state.away.includes(id));
    // 1) rebuild from the checkpoint (through JSON) and replay: identical.
    const cp = deserializeCheckpoint(serializeCheckpoint(at.state.cp));
    expect(cp).not.toBeNull();
    let s: RefState = refFromCheckpoint(at.state.match, cp!, present);
    expect(s).toEqual(at.state);
    coverage.rebuilt++;
    for (let i = k; i < total; i++) {
      const r = refStep(s, sim.inputs[i] as RefInput);
      expect(comparable(r, false)).toBe(comparable(sim.steps[i] as RefStep<RefState>, false));
      s = r.state;
    }
    // 2) a takeover restore, then the same inputs: identical outcomes (seq shifted).
    const restored = refStep(refCreate(at.state.match), {
      t: 'restore',
      at: (sim.inputs[k] as RefInput).at,
      checkpoint: at.state.cp,
      present,
    });
    expect(restored.checkpoint).not.toBeNull();
    s = restored.state;
    const restoreChangedState =
      JSON.stringify({ ...restored.state.cp, seq: 0 }) !==
      JSON.stringify({ ...at.state.cp, seq: 0 });
    if (restoreChangedState) {
      // The restore itself settled something (a resolution or a pending death).
      coverage.restoreSettled++;
      continue;
    }
    coverage.restored++;
    for (let i = k; i < total; i++) {
      const r = refStep(s, sim.inputs[i] as RefInput);
      expect(comparable(r, true)).toBe(comparable(sim.steps[i] as RefStep<RefState>, true));
      s = r.state;
    }
  }
}

describe('referee fuzzer', () => {
  for (const sc of scenarios()) {
    it(`${sc.practice ? 'practice' : sc.queueMode} ×${sc.n} seed ${sc.seed}`, () => {
      const sim = runScenario(sc);
      checkInvariants(sc, sim);
      checkResume(sc, sim, new Rng(sc.seed));
    });
  }

  it('exercised the resume paths broadly', () => {
    expect(coverage.rebuilt).toBeGreaterThan(400);
    expect(coverage.restored).toBeGreaterThan(300);
  });

  it('the same inputs always give the same outputs (determinism)', () => {
    const sc = { queueMode: 'pvp_nemesis' as const, n: 7, practice: false, seed: 99 };
    const a = runScenario(sc);
    const b = runScenario(sc);
    expect(JSON.stringify(a.steps)).toBe(JSON.stringify(b.steps));
  });

  it('checkpoint seq is strictly increasing and bumps exactly when the checkpoint changes', () => {
    const sim = runScenario({ queueMode: 'pvp_royale', n: 5, practice: false, seed: 5 });
    let seq = 0;
    let body = '';
    for (const step of sim.steps) {
      const cur = JSON.stringify({ ...step.state.cp, seq: 0 });
      if (step.checkpoint) {
        expect(step.checkpoint.seq).toBe(seq + 1);
        seq = step.checkpoint.seq;
      } else expect(cur).toBe(body);
      body = cur;
    }
  });
});
