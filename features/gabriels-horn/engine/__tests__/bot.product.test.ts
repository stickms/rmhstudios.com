/**
 * Gabriel's Horn bots — the decision module, over thousands of seeded views.
 *
 * `decideBotAction` is pure: its whole input is one seat's `GameView`, the house
 * rules, a level and a random source. These tests build views the way the
 * server would hand them to a seat and hold the properties the feature promises:
 * every level always has a legal move in every phase, a bot that cannot see its
 * own dice still acts, Steady never names a total the dice cannot make, and the
 * horn is only ever sounded from the lowest hand.
 */

import { describe, expect, it } from 'vitest';
import { decideBotAction, effectFor, isLegalBotAction, totalOdds, type BotAction } from '../bot';
import { BOT_LEVELS, COLORS, DIE_FACES, RANKS, type BotLevel, type Card, type Phase } from '../constants';
import { DEFAULT_HOUSE_RULES, type HouseRules } from '../house-rules';
import type { GameView, LogEntry, TablePlayer } from '../net/events';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function randomRules(rng: () => number): HouseRules {
  return {
    ...DEFAULT_HOUSE_RULES,
    diceCount: int(rng, 2, 4),
    swapEnabled: rng() < 0.8,
    hornMustBeStrictlyLowest: rng() < 0.7,
    effects: {
      azure: rng() < 0.85,
      crimson: rng() < 0.85,
      verdant: rng() < 0.85,
      amber: rng() < 0.85,
    },
  };
}

function randomHand(rng: () => number, size: number): Card[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `c${i}`,
    color: COLORS[int(rng, 0, COLORS.length - 1)] as Card['color'],
    rank: RANKS[int(rng, 0, RANKS.length - 1)] as Card['rank'],
  }));
}

interface Spec {
  phase: Extract<Phase, 'action' | 'claim' | 'call' | 'final'>;
  /** Hide the dice from this seat even where a person would see them. */
  hideDice?: boolean;
}

/** A view of one seat, as `viewFor` would build it. The bot is always `bot:1`. */
function randomView(rng: () => number, rules: HouseRules, spec: Spec): GameView {
  const count = int(rng, 2, 6);
  const players: TablePlayer[] = Array.from({ length: count }, (_, i) => ({
    socketId: i === 0 ? 'bot:1' : i % 2 ? `s${i}` : `bot:${i + 1}`,
    seatNo: i + 1,
    userId: '',
    name: '',
    bot: null,
    avatarUrl: null,
    handCount: int(rng, 1, 9),
    warded: rng() < 0.15,
    finalDone: false,
    connected: true,
  }));
  const self = 'bot:1';
  const others = players.filter((p) => p.socketId !== self);
  const faces = Array.from({ length: rules.diceCount }, () => int(rng, 1, DIE_FACES));
  const total = faces.reduce((a, b) => a + b, 0);
  const selfActive = spec.phase !== 'claim';
  const active = selfActive ? self : (others[int(rng, 0, others.length - 1)] as TablePlayer).socketId;
  const selfPlayer = players[0] as TablePlayer;
  selfPlayer.handCount = int(rng, 1, 9);
  const hand = randomHand(rng, selfPlayer.handCount);

  const log: LogEntry[] = [];
  for (let i = 0; i < int(rng, 0, 12); i++) {
    const target = others[int(rng, 0, others.length - 1)] as TablePlayer;
    const verdict = rng() < 0.5 ? 'lie' : 'truth';
    log.push({
      id: i + 1,
      kind: 'call',
      at: 0,
      targetSeat: target.seatNo,
      verdict,
      correct: rng() < 0.5,
      total: int(rng, rules.diceCount, rules.diceCount * DIE_FACES),
    });
  }

  const claims = players
    .filter((p) => p.socketId !== active)
    .map((p) => ({
      socketId: p.socketId,
      total:
        spec.phase === 'call' || (p.socketId !== self && rng() < 0.4)
          ? int(rng, rules.diceCount, rules.diceCount * DIE_FACES)
          : null,
      lie: null,
    }));

  const seesDice = spec.phase === 'claim' || spec.phase === 'final' ? !spec.hideDice : false;
  const glimpsed = spec.phase !== 'claim' && rng() < 0.2 && !spec.hideDice;
  const visible = (seesDice || glimpsed) && spec.phase !== 'action';

  return {
    code: 'ABCD',
    phase: spec.phase,
    round: int(rng, 1, 6),
    activeSocketId: active,
    selfSocketId: self,
    players,
    hand,
    dice: {
      faces: visible ? faces : null,
      total: visible ? total : null,
      glimpsed: glimpsed && spec.phase !== 'claim',
    },
    claims: spec.phase === 'claim' || spec.phase === 'call' ? claims : [],
    deckCount: 20,
    phaseEndsAt: 1,
    endCalledBy: spec.phase === 'final' ? (others[0] as TablePlayer).socketId : null,
    outcome: null,
    scry:
      spec.phase === 'action' && rng() < 0.3
        ? { socketId: (others[0] as TablePlayer).socketId, name: '', bot: null, cards: randomHand(rng, 3) }
        : null,
    practice: true,
    rules,
    log,
  };
}

const PHASES: Spec['phase'][] = ['action', 'claim', 'call', 'final'];
const N = 1000;

describe('decideBotAction legality', () => {
  for (const level of BOT_LEVELS) {
    for (const phase of PHASES) {
      it(`${level} returns a legal action in ${phase} over ${N} random views`, () => {
        const rng = seeded(level.length * 97 + phase.length);
        for (let i = 0; i < N; i++) {
          const rules = randomRules(rng);
          const view = randomView(rng, rules, { phase });
          const action = decideBotAction(view, rules, level as BotLevel, rng);
          expect(action, `${level}/${phase}/#${i}`).not.toBeNull();
          expect(isLegalBotAction(view, rules, action as BotAction), JSON.stringify(action)).toBe(true);
        }
      });
    }
  }

  it('returns null when it is not the bot’s turn, or the phase has nothing to do', () => {
    const rng = seeded(7);
    const rules = randomRules(rng);
    const action = randomView(rng, rules, { phase: 'action' });
    expect(decideBotAction({ ...action, activeSocketId: 's1' }, rules, 'sharp', rng)).toBeNull();
    expect(decideBotAction({ ...action, phase: 'reveal' }, rules, 'sharp', rng)).toBeNull();
    expect(decideBotAction({ ...action, phase: 'over' }, rules, 'easy', rng)).toBeNull();
    const claim = randomView(rng, rules, { phase: 'claim' });
    const spoken = {
      ...claim,
      claims: claim.claims.map((c) => (c.socketId === 'bot:1' ? { ...c, total: rules.diceCount } : c)),
    };
    expect(decideBotAction(spoken, rules, 'steady', rng)).toBeNull();
  });
});

describe('a bot that cannot see its own dice', () => {
  for (const level of BOT_LEVELS) {
    it(`${level} still rolls or calls with the faces null`, () => {
      const rng = seeded(99 + level.length);
      for (let i = 0; i < 300; i++) {
        const rules = randomRules(rng);
        const call = randomView(rng, rules, { phase: 'call', hideDice: true });
        expect(call.dice.faces).toBeNull();
        const made = decideBotAction(call, rules, level as BotLevel, rng);
        expect(made?.type).toBe('call');
        expect(isLegalBotAction(call, rules, made as BotAction)).toBe(true);

        const roll = randomView(rng, rules, { phase: 'action' });
        expect(roll.dice.faces).toBeNull();
        expect(decideBotAction(roll, rules, level as BotLevel, rng)).not.toBeNull();

        const claim = randomView(rng, rules, { phase: 'claim', hideDice: true });
        const spoke = decideBotAction(claim, rules, level as BotLevel, rng);
        expect(spoke?.type).toBe('claim');
        expect(isLegalBotAction(claim, rules, spoke as BotAction)).toBe(true);
      }
    });
  }
});

describe('claims', () => {
  it('Steady never claims a total the dice cannot make', () => {
    const rng = seeded(31);
    for (let i = 0; i < N; i++) {
      const rules = randomRules(rng);
      const view = randomView(rng, rules, { phase: 'claim' });
      const action = decideBotAction(view, rules, 'steady', rng);
      expect(action?.type).toBe('claim');
      const total = (action as Extract<BotAction, { type: 'claim' }>).total;
      expect(Number.isInteger(total)).toBe(true);
      expect(total).toBeGreaterThanOrEqual(rules.diceCount);
      expect(total).toBeLessThanOrEqual(rules.diceCount * DIE_FACES);
      expect(totalOdds(rules.diceCount)[total]).toBeGreaterThan(0);
    }
  });

  it('Easy tells the truth about 70% of the time', () => {
    const rng = seeded(5);
    let truthful = 0;
    const runs = 4000;
    for (let i = 0; i < runs; i++) {
      const view = randomView(rng, DEFAULT_HOUSE_RULES, { phase: 'claim' });
      const action = decideBotAction(view, DEFAULT_HOUSE_RULES, 'easy', rng) as Extract<BotAction, { type: 'claim' }>;
      if (action.total === view.dice.total) truthful++;
    }
    // 70% on purpose plus the share of random totals that land on the truth.
    expect(truthful / runs).toBeGreaterThan(0.68);
    expect(truthful / runs).toBeLessThan(0.78);
  });
});

describe('calls', () => {
  it('Steady calls a lie on the claim least likely to be true', () => {
    const rules = DEFAULT_HOUSE_RULES;
    const view = randomView(seeded(2), rules, { phase: 'call', hideDice: true });
    const claims = view.claims.map((c, i) => ({ ...c, total: [10, 3, 11, 9, 12][i % 5] as number }));
    const noWard = view.players.map((p) => ({ ...p, warded: false }));
    const action = decideBotAction({ ...view, claims, players: noWard }, rules, 'steady', seeded(1));
    const odds = totalOdds(rules.diceCount);
    const rarest = [...claims].sort((a, b) => (odds[a.total as number] ?? 0) - (odds[b.total as number] ?? 0))[0];
    expect(action).toEqual({ type: 'call', targetSocketId: rarest?.socketId, verdict: 'lie' });
  });

  it('with the dice in view every level catches a lie when there is one', () => {
    const rules = DEFAULT_HOUSE_RULES;
    const base = randomView(seeded(3), rules, { phase: 'call' });
    const players = base.players.map((p) => ({ ...p, warded: false }));
    const other = base.claims[0]?.socketId as string;
    const view: GameView = {
      ...base,
      players,
      dice: { faces: [3, 3, 3], total: 9, glimpsed: true },
      claims: base.claims.map((c) => ({ ...c, total: c.socketId === other ? 14 : 9 })),
    };
    for (const level of BOT_LEVELS) {
      expect(decideBotAction(view, rules, level, seeded(8))).toEqual({
        type: 'call',
        targetSocketId: other,
        verdict: 'lie',
      });
    }
  });

  it('Sharp reads the log: it does not trust a seat it has seen lying, and trusts one it has not', () => {
    const rules = DEFAULT_HOUSE_RULES;
    const base = randomView(seeded(4), rules, { phase: 'call', hideDice: true });
    const players = base.players.map((p) => ({ ...p, warded: false }));
    const [a, b] = base.claims as [(typeof base.claims)[number], (typeof base.claims)[number]];
    // Two different claims on the table. `a` has been caught lying every time, `b` never.
    const claims = [
      { ...a, total: 10 },
      { ...b, total: 12 },
    ];
    const history = (id: number, verdict: 'lie' | 'truth', offset: number): LogEntry[] =>
      Array.from({ length: 8 }, (_, i) => ({
        id: offset + i,
        kind: 'call',
        at: 0,
        targetSeat: id,
        verdict,
        correct: true,
        total: 9,
      }));
    const log = [
      ...history(base.players.find((p) => p.socketId === a.socketId)!.seatNo, 'lie', 1),
      ...history(base.players.find((p) => p.socketId === b.socketId)!.seatNo, 'truth', 20),
    ];
    const action = decideBotAction({ ...base, players, claims, log }, rules, 'sharp', seeded(1)) as Extract<
      BotAction,
      { type: 'call' }
    >;
    const backsLiar = action.targetSocketId === a.socketId && action.verdict === 'truth';
    const doubtsHonest = action.targetSocketId === b.socketId && action.verdict === 'lie';
    expect(backsLiar || doubtsHonest).toBe(false);
  });
});

describe('the horn', () => {
  for (const level of BOT_LEVELS) {
    it(`${level} sounds it only when it holds no more cards than any other seat`, () => {
      const rng = seeded(1234 + level.length);
      let sounded = 0;
      for (let i = 0; i < 3000; i++) {
        const rules = randomRules(rng);
        const view = randomView(rng, rules, { phase: 'action' });
        const action = decideBotAction({ ...view, round: 9 }, rules, level, rng);
        if (action?.type !== 'end') continue;
        sounded++;
        const me = view.players.find((p) => p.socketId === view.selfSocketId) as TablePlayer;
        const lowest = Math.min(...view.players.filter((p) => p !== me).map((p) => p.handCount));
        expect(me.handCount).toBeLessThanOrEqual(lowest);
        if (rules.hornMustBeStrictlyLowest) expect(me.handCount).toBeLessThan(lowest);
      }
      expect(sounded).toBeGreaterThan(0);
    });
  }

  it('never sounds it before everybody has had a turn', () => {
    const rules = { ...DEFAULT_HOUSE_RULES, minTurnsBeforeEnd: 2 };
    const base = randomView(seeded(6), rules, { phase: 'action' });
    const view: GameView = {
      ...base,
      round: 1,
      players: base.players.map((p, i) => ({ ...p, handCount: i === 0 ? 1 : 8 })),
    };
    // Lap one, and the bot is first to move: nobody else has played.
    expect(decideBotAction(view, rules, 'steady', seeded(1))).toEqual({ type: 'roll' });
  });
});

describe('cards', () => {
  it('Steady plays Verdant when its hand is the smallest and the horn is out of reach', () => {
    const rules = { ...DEFAULT_HOUSE_RULES, hornMustBeStrictlyLowest: true };
    const base = randomView(seeded(10), rules, { phase: 'action' });
    const view: GameView = {
      ...base,
      round: 1,
      endCalledBy: null,
      hand: [{ id: 'g1', color: 'verdant', rank: 4 }],
      players: base.players.map((p) => ({ ...p, handCount: 4, warded: false })),
    };
    expect(decideBotAction(view, rules, 'steady', seeded(1))).toEqual({ type: 'play', cardId: 'g1' });
  });

  it('a card a house rule switched off is never played', () => {
    const rules: HouseRules = {
      ...DEFAULT_HOUSE_RULES,
      effects: { azure: false, crimson: false, verdant: false, amber: false },
      swapEnabled: false,
    };
    const rng = seeded(11);
    for (let i = 0; i < 500; i++) {
      const view = randomView(rng, rules, { phase: 'action' });
      for (const level of BOT_LEVELS) {
        expect(decideBotAction(view, rules, level, rng)?.type).not.toBe('play');
      }
      for (const card of view.hand) expect(effectFor(card, rules)).toBeNull();
    }
  });

  it('Sharp swaps a big hand for a small one with a seven', () => {
    const rules = DEFAULT_HOUSE_RULES;
    const base = randomView(seeded(12), rules, { phase: 'action' });
    const players = base.players.map((p, i) => ({ ...p, handCount: i === 0 ? 8 : 4 + i, warded: false }));
    const view: GameView = {
      ...base,
      round: 1,
      endCalledBy: null,
      scry: null,
      hand: [{ id: 'sv', color: 'amber', rank: 7 }],
      players,
    };
    const lowest = players.filter((p) => p.socketId !== 'bot:1').sort((a, b) => a.handCount - b.handCount)[0];
    expect(decideBotAction(view, rules, 'sharp', seeded(1))).toEqual({
      type: 'play',
      cardId: 'sv',
      targetSocketId: lowest?.socketId,
    });
  });
});

describe('the last turn', () => {
  it('Easy and Steady pass', () => {
    const rng = seeded(21);
    for (let i = 0; i < 200; i++) {
      const rules = randomRules(rng);
      const view = randomView(rng, rules, { phase: 'final' });
      expect(decideBotAction(view, rules, 'easy', rng)).toEqual({ type: 'pass' });
      expect(decideBotAction(view, rules, 'steady', rng)).toEqual({ type: 'pass' });
    }
  });

  it('Sharp swaps into a horn-caller’s small hand with a seven', () => {
    const rules = DEFAULT_HOUSE_RULES;
    const base = randomView(seeded(22), rules, { phase: 'final' });
    const caller = base.endCalledBy as string;
    const view: GameView = {
      ...base,
      hand: [{ id: 'sv', color: 'azure', rank: 7 }],
      players: base.players.map((p) => ({
        ...p,
        warded: false,
        handCount: p.socketId === caller ? 2 : p.socketId === 'bot:1' ? 6 : 5,
      })),
    };
    expect(decideBotAction(view, rules, 'sharp', seeded(1))).toEqual({
      type: 'play',
      cardId: 'sv',
      targetSocketId: caller,
    });
  });
});
