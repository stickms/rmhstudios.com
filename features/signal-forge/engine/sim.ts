/**
 * Signal Forge run simulator: scripted agents that play whole runs through the same `dispatch` the UI uses.
 * Used by __tests__/balance.test.ts to hold the win-rate bands recorded in docs/signal-forge/balance.md.
 * Never imported by the UI.
 */
import { cardBudget, cardPower } from './balance';
import { cardDef } from './data/cards';
import { eventDef } from './data/events';
import { effectiveCard, intentDamage, isOnPhrase, living } from './combat';
import { canChoose, dispatch, finalScore, isOver, newRun, pickCandidates, reachableLanes, type Action } from './run';
import { next, type Rng } from './rng';
import type { RhythmMode, RunState, Timing } from './types';

export type AgentKind = 'random' | 'greedy';

export interface SimOptions {
  seed: number;
  ascension: number;
  agent: AgentKind;
  mode?: RhythmMode;
  /** Timed mode only: share of on-phrase plays that land Perfect / Good (the rest are Late). */
  perfectRate?: number;
  goodRate?: number;
}

export interface SimResult {
  won: boolean;
  floor: number;
  act: number;
  score: number;
  turns: number;
  bursts: number;
  perfects: number;
  /** On a defeat: the fight that ended the run (kind and enemy ids). */
  diedTo?: string;
}

function timingFor(r: Rng, o: SimOptions): Timing {
  if ((o.mode ?? 'steady') === 'steady') return 'steady';
  const x = next(r);
  if (x < (o.perfectRate ?? 0.5)) return 'perfect';
  if (x < (o.perfectRate ?? 0.5) + (o.goodRate ?? 0.35)) return 'good';
  return 'late';
}

/** A card's value for picking: its power per energy, with a small premium for rarity. */
function pickValue(id: string): number {
  const d = cardDef(id);
  return cardPower(d) / Math.max(1, cardBudget(d)) + (d.rarity === 'rare' ? 0.15 : d.rarity === 'uncommon' ? 0.07 : 0);
}

function randomAgent(run: RunState, r: Rng, o: SimOptions): Action {
  const choose = <T>(xs: T[]): T => xs[Math.floor(next(r) * xs.length)] as T;
  switch (run.phase) {
    case 'combat': {
      const c = run.combat!;
      const playable = c.hand.map((h, i) => ({ h, i })).filter(({ h }) => {
        const d = effectiveCard(h);
        return !d.unplayable && d.cost <= c.energy;
      });
      if (playable.length && next(r) < 0.85) {
        const { i } = choose(playable);
        const t = choose(living(c));
        return { t: 'play', i, timing: timingFor(r, o), target: t.uid };
      }
      return { t: 'end' };
    }
    case 'map':
      return { t: 'node', lane: choose(reachableLanes(run)) };
    case 'reward':
    case 'boss-reward': {
      const rw = run.reward!;
      if (!rw.goldTaken) return { t: 'reward-gold' };
      if (rw.relic && !rw.relicTaken) return { t: 'reward-relic' };
      if (rw.relics && !rw.relicTaken) return { t: 'boss-relic', id: choose(rw.relics) };
      if (!rw.cardTaken) return { t: 'reward-card', id: next(r) < 0.8 ? choose(rw.cards) : null };
      return { t: 'leave' };
    }
    case 'shop':
      return { t: 'leave' };
    case 'rest':
      return { t: 'rest', choice: next(r) < 0.5 ? 'heal' : 'temper' };
    case 'event': {
      if (run.event?.resolved) return { t: 'leave' };
      const ok = eventDef(run.event!.id).choices.filter((ch) => canChoose(run, run.event!.id, ch.id));
      return { t: 'event', choice: choose(ok).id };
    }
    case 'pick': {
      const cands = pickCandidates(run, run.pick!.kind);
      return { t: 'pick', uid: cands.length ? choose(cands).uid : null };
    }
    case 'treasure':
      return { t: 'treasure' };
    default:
      return { t: 'leave' };
  }
}

function greedyAgent(run: RunState, r: Rng, o: SimOptions): Action {
  switch (run.phase) {
    case 'combat': {
      const c = run.combat!;
      const enemies = living(c);
      const incoming = enemies.reduce((s, e) => {
        const d = intentDamage(run, e);
        return s + (d ? d.dmg * d.hits : 0);
      }, 0);
      const needBlock = Math.max(0, incoming - c.block);
      // Target: the enemy closest to death that can be killed, else the lowest HP.
      const target = enemies.slice().sort((a, b) => a.hp + a.block - (b.hp + b.block))[0]!;
      let best = -Infinity;
      let bestI = -1;
      c.hand.forEach((h, i) => {
        const d = effectiveCard(h);
        if (d.unplayable || d.cost > c.energy) return;
        const on = isOnPhrase(run, d);
        let v = cardPower(d) / (d.cost + 0.6);
        if (on) v *= 1.6;
        if (on && c.phraseAt === c.phrase.length - 1) v += 4 + c.heat; // finishing the phrase fires the Burst
        const blocky = (d.block ?? 0) + (d.blockPerHeat ?? 0) * c.heat;
        if (needBlock > 0 && blocky > 0) v += Math.min(blocky, needBlock) / 3;
        if (needBlock <= 0 && blocky > 0 && !(d.dmg ?? 0)) v *= 0.4;
        if (d.cost === 0) v += 1;
        if (v > best) {
          best = v;
          bestI = i;
        }
      });
      if (bestI >= 0) return { t: 'play', i: bestI, timing: timingFor(r, o), target: target.uid };
      if (!c.ventedThisTurn && c.heat > 0 && needBlock > 0 && (needBlock >= 8 || c.heat < 3)) return { t: 'vent' };
      return { t: 'end' };
    }
    case 'map': {
      const lanes = reachableLanes(run);
      const row = run.map[run.row + 1];
      const hpShare = run.hp / run.maxHp;
      const score = (lane: number): number => {
        const k = row?.[lane]?.kind ?? 'boss';
        if (k === 'rest') return hpShare < 0.6 ? 5 : 1;
        if (k === 'elite') return hpShare > 0.7 ? 4 : -2;
        if (k === 'shop') return run.gold >= 120 ? 3 : 0;
        if (k === 'treasure') return 4;
        if (k === 'event') return 2;
        return 2.5;
      };
      return { t: 'node', lane: lanes.slice().sort((a, b) => score(b) - score(a))[0]! };
    }
    case 'reward':
    case 'boss-reward': {
      const rw = run.reward!;
      if (!rw.goldTaken) return { t: 'reward-gold' };
      if (rw.relic && !rw.relicTaken) return { t: 'reward-relic' };
      if (rw.relics && !rw.relicTaken) return { t: 'boss-relic', id: rw.relics[0]! };
      if (!rw.cardTaken) {
        const bestCard = rw.cards.slice().sort((a, b) => pickValue(b) - pickValue(a))[0];
        const deckSize = run.deck.length;
        return { t: 'reward-card', id: bestCard && (deckSize < 22 || pickValue(bestCard) > 1.05) ? bestCard : null };
      }
      return { t: 'leave' };
    }
    case 'shop': {
      const s = run.shop!;
      const ri = s.relics.findIndex((x) => !x.sold && x.price <= run.gold);
      if (ri >= 0) return { t: 'buy-relic', i: ri };
      if (!s.removed && run.gold >= s.removePrice && run.deck.some((c) => c.id === 'hammer_strike' || c.id === 'glitch' || c.id === 'rust' || c.id === 'slag')) return { t: 'buy-remove' };
      const ci = s.cards.findIndex((x) => !x.sold && x.price <= run.gold && pickValue(x.id) > 1);
      if (ci >= 0) return { t: 'buy-card', i: ci };
      return { t: 'leave' };
    }
    case 'rest':
      return { t: 'rest', choice: run.hp / run.maxHp < 0.65 ? 'heal' : 'temper' };
    case 'event': {
      if (run.event?.resolved) return { t: 'leave' };
      const ev = eventDef(run.event!.id);
      const ok = ev.choices.filter((ch) => canChoose(run, ev.id, ch.id));
      // Prefer the first affordable choice that does not start a fight or cost much HP.
      const safe = ok.find((ch) => !(ch.outcome.risk ?? 0) && (ch.costHp ?? 0) < run.hp * 0.25) ?? ok[0]!;
      return { t: 'event', choice: safe.id };
    }
    case 'pick': {
      const kind = run.pick!.kind;
      const cands = pickCandidates(run, kind);
      if (!cands.length) return { t: 'pick', uid: null };
      const order = cands.slice().sort((a, b) => pickValue(a.id) - pickValue(b.id));
      const junk = (id: string) => cardDef(id).rarity === 'glitch';
      if (kind === 'remove') return { t: 'pick', uid: (cands.find((c) => junk(c.id)) ?? order[0]!).uid };
      if (kind === 'transform') return { t: 'pick', uid: order[0]!.uid };
      return { t: 'pick', uid: order[order.length - 1]!.uid };
    }
    case 'treasure':
      return { t: 'treasure' };
    default:
      return { t: 'leave' };
  }
}

export function simulateRun(o: SimOptions): SimResult {
  let run = newRun({ seed: o.seed, ascension: o.ascension, mode: o.mode ?? 'steady' });
  const r: Rng = { s: (o.seed * 7919 + 13) | 0 };
  let turns = 0;
  for (let step = 0; step < 6000 && !isOver(run); step++) {
    const a = o.agent === 'random' ? randomAgent(run, r, o) : greedyAgent(run, r, o);
    const nextRun = dispatch(run, a);
    if (a.t === 'end') turns++;
    if (nextRun === run) {
      // An illegal choice: fall back to the safest exit for the phase.
      const fallback: Action = run.phase === 'combat' ? { t: 'end' } : run.phase === 'pick' ? { t: 'pick', uid: null } : { t: 'leave' };
      const f = dispatch(run, fallback);
      if (f === run) break;
      run = f;
      continue;
    }
    run = nextRun;
  }
  return {
    won: run.phase === 'victory',
    floor: (run.act - 1) * 8 + Math.max(0, run.row + 1),
    act: run.act,
    score: finalScore(run),
    turns,
    bursts: run.stats.bursts,
    perfects: run.stats.perfects,
    ...(run.phase === 'defeat' && run.combat ? { diedTo: `${run.combat.kind}:${run.combat.enemies.map((e) => e.id).join('+')}` } : {}),
  };
}
