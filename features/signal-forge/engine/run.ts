/**
 * Signal Forge run (v2): the map, the nodes and the one reducer the UI drives.
 *
 * A run is three acts. Each act is a circuit board of 7 rows by 3 lanes plus the act boss; the player picks a
 * node in the next row along a trace. Combat, elites, events, shops, the Cooling Bay (rest) and treasure.
 * `dispatch(run, action)` returns a NEW run (it clones, then the engine mutates the clone), so React state
 * and the balance simulator use the same entry point.
 */
import { actMult, ascensionMods, ECONOMY, MAP, PLAYER, SCORE } from './balance';
import { cardDef, rewardPool, STARTER_DECK } from './data/cards';
import { ENCOUNTERS } from './data/enemies';
import { EVENTS, eventDef } from './data/events';
import { relicDef, RELICS } from './data/relics';
import { combatWon, effectiveCard, endTurn, fireRelics, playCard, relicPassive, startCombat, vent, withRng } from './combat';
import { int, next, pick, pickWeighted, sample } from './rng';
import type { CardInst, EventOutcome, MapNode, NodeKind, RelicDef, RhythmMode, RunPhase, RunState, Timing } from './types';

export type Action =
  | { t: 'play'; i: number; timing?: Timing; target?: number }
  | { t: 'vent' }
  | { t: 'end' }
  | { t: 'node'; lane: number }
  | { t: 'reward-card'; id: string | null }
  | { t: 'reward-gold' }
  | { t: 'reward-relic' }
  | { t: 'boss-relic'; id: string }
  | { t: 'leave' }
  | { t: 'buy-card'; i: number }
  | { t: 'buy-relic'; i: number }
  | { t: 'buy-remove' }
  | { t: 'rest'; choice: 'heal' | 'temper' }
  | { t: 'event'; choice: string }
  | { t: 'pick'; uid: number | null }
  | { t: 'treasure' };

// ── Creation ──────────────────────────────────────────────────────────────────

export interface NewRunOptions {
  seed: number;
  ascension?: number;
  mode?: RhythmMode;
}

export function newRun({ seed, ascension = 0, mode = 'steady' }: NewRunOptions): RunState {
  const mods = ascensionMods(ascension);
  const maxHp = PLAYER.maxHp;
  const run: RunState = {
    v: 2,
    seed,
    rng: seed | 0,
    ascension,
    mode,
    act: 1,
    row: -1,
    lane: 1,
    map: [],
    hp: Math.round(maxHp * mods.startHpMult),
    maxHp,
    gold: PLAYER.startGold,
    deck: [],
    relics: ['pilot_light'],
    nextUid: 1,
    phase: 'map',
    score: 0,
    stats: { perfects: 0, bursts: 0, combatsWon: 0, elitesWon: 0, bossesWon: 0, maxHit: 0, dmgDealt: 0, cardsPlayed: 0, vents: 0, steadyPlays: 0, timedPlays: 0 },
    playMs: 0,
    relicState: {},
  };
  for (const id of STARTER_DECK) run.deck.push({ uid: run.nextUid++, id });
  if (mods.startGlitch) run.deck.push({ uid: run.nextUid++, id: 'glitch' });
  run.map = generateMap(run);
  return run;
}

/** Floor number for the leaderboard: 1-based across the three acts (24 on a full run). */
export function floorOf(run: RunState): number {
  return (run.act - 1) * SCORE.nodesPerAct + Math.max(0, run.row + 1);
}

export function generateMap(run: RunState): MapNode[][] {
  return withRng(run, (r) => {
    const rows: MapNode[][] = [];
    for (let row = 0; row < MAP.rows; row++) {
      const nodes: MapNode[] = [];
      for (let lane = 0; lane < MAP.lanes; lane++) {
        let kind: NodeKind;
        if (row === 0) kind = 'combat';
        else if (row === MAP.rows - 1) kind = 'rest';
        else if (row === 3 && lane === 1) kind = 'treasure';
        else {
          const band = row <= 1 ? MAP.early : row <= 3 ? MAP.mid : MAP.late;
          kind = pickWeighted(r, ['combat', 'elite', 'event', 'shop', 'rest', 'treasure'] as NodeKind[], band);
        }
        // Every lane gets at least one shop chance mid-act.
        if (row === 4 && lane === 0 && kind !== 'shop') kind = 'shop';
        const nextLanes = [lane];
        if (row < MAP.rows - 1) {
          const side = lane === 0 ? 1 : lane === MAP.lanes - 1 ? lane - 1 : next(r) < 0.5 ? lane - 1 : lane + 1;
          if (next(r) < 0.6) nextLanes.push(side);
        }
        nodes.push({ row, lane, kind, next: nextLanes.sort() });
      }
      rows.push(nodes);
    }
    // The boss row: one node every lane leads to.
    rows.push([{ row: MAP.rows, lane: 1, kind: 'boss', next: [] }]);
    return rows;
  });
}

/** Lanes the player may pick in the next row. */
export function reachableLanes(run: RunState): number[] {
  const nextRow = run.row + 1;
  if (nextRow >= run.map.length) return [];
  if (nextRow === MAP.rows) return [1];
  if (run.row < 0) return [0, 1, 2];
  const node = run.map[run.row]?.[run.lane];
  return node ? node.next : [];
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export function dispatch(prev: RunState, action: Action): RunState {
  const run: RunState = structuredClone(prev);
  switch (action.t) {
    case 'play': {
      const res = playCard(run, action.i, action.timing ?? 'good', action.target);
      if (!res.ok) return prev;
      settleCombat(run);
      return run;
    }
    case 'vent':
      return vent(run) ? run : prev;
    case 'end':
      if (run.phase !== 'combat') return prev;
      endTurn(run);
      settleCombat(run);
      return run;
    case 'node':
      return enterNode(run, action.lane) ? run : prev;
    case 'reward-card': {
      const rw = run.reward;
      if (!rw || rw.cardTaken || (run.phase !== 'reward' && run.phase !== 'boss-reward')) return prev;
      if (action.id && rw.cards.includes(action.id)) run.deck.push({ uid: run.nextUid++, id: action.id });
      rw.cardTaken = true;
      return run;
    }
    case 'reward-gold': {
      const rw = run.reward;
      if (!rw || rw.goldTaken) return prev;
      run.gold += rw.gold;
      rw.goldTaken = true;
      return run;
    }
    case 'reward-relic': {
      const rw = run.reward;
      if (!rw?.relic || rw.relicTaken) return prev;
      gainRelic(run, rw.relic);
      rw.relicTaken = true;
      return run;
    }
    case 'boss-relic': {
      const rw = run.reward;
      if (run.phase !== 'boss-reward' || !rw?.relics?.includes(action.id) || rw.relicTaken) return prev;
      gainRelic(run, action.id);
      rw.relicTaken = true;
      return run;
    }
    case 'leave':
      return leave(run) ? run : prev;
    case 'buy-card': {
      const item = run.shop?.cards[action.i];
      if (run.phase !== 'shop' || !item || item.sold || run.gold < item.price) return prev;
      run.gold -= item.price;
      item.sold = true;
      run.deck.push({ uid: run.nextUid++, id: item.id });
      return run;
    }
    case 'buy-relic': {
      const item = run.shop?.relics[action.i];
      if (run.phase !== 'shop' || !item || item.sold || run.gold < item.price) return prev;
      run.gold -= item.price;
      item.sold = true;
      gainRelic(run, item.id);
      return run;
    }
    case 'buy-remove': {
      const shop = run.shop;
      if (run.phase !== 'shop' || !shop || shop.removed || run.gold < shop.removePrice) return prev;
      run.pick = { kind: 'remove', then: 'shop', price: shop.removePrice };
      run.phase = 'pick';
      return run;
    }
    case 'rest': {
      if (run.phase !== 'rest') return prev;
      if (action.choice === 'heal') {
        const share = Math.max(0, ascensionMods(run.ascension).restHeal + Math.min(0, relicPassive(run.relics).restHeal));
        run.hp = Math.min(run.maxHp, run.hp + Math.round(run.maxHp * share));
        run.phase = 'map';
      } else {
        if (!run.deck.some((c) => !c.up && !cardDef(c.id).unplayable)) return prev;
        run.pick = { kind: 'temper', then: 'map', cancel: 'rest' };
        run.phase = 'pick';
      }
      return run;
    }
    case 'event':
      return resolveEvent(run, action.choice) ? run : prev;
    case 'pick':
      return resolvePick(run, action.uid) ? run : prev;
    case 'treasure': {
      if (run.phase !== 'treasure') return prev;
      const id = randomRelic(run, ['common', 'uncommon', 'rare'], [50, 35, 15]);
      if (id) gainRelic(run, id);
      run.gold += withRng(run, (r) => int(r, 20, 40));
      run.phase = 'map';
      return run;
    }
    default:
      return prev;
  }
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

function enterNode(run: RunState, lane: number): boolean {
  if (run.phase !== 'map') return false;
  if (!reachableLanes(run).includes(lane)) return false;
  const row = run.row + 1;
  const node = row === MAP.rows ? run.map[row]?.[0] : run.map[row]?.[lane];
  if (!node) return false;
  run.row = row;
  run.lane = node.lane;
  run.trail = [...(run.trail ?? []).slice(0, row), node.lane];
  const enc = ENCOUNTERS[run.act];
  switch (node.kind) {
    case 'combat': {
      const pool = row <= 1 ? enc.easy : enc.normal;
      startCombat(run, withRng(run, (r) => pick(r, pool)), 'combat');
      break;
    }
    case 'elite':
      startCombat(run, withRng(run, (r) => pick(r, enc.elite)), 'elite');
      break;
    case 'boss':
      startCombat(run, [withRng(run, (r) => pick(r, enc.bosses))], 'boss');
      break;
    case 'event': {
      const pool = EVENTS.filter((e) => e.acts.includes(run.act));
      run.event = { id: withRng(run, (r) => pick(r, pool)).id };
      run.phase = 'event';
      break;
    }
    case 'shop':
      run.shop = makeShop(run);
      run.phase = 'shop';
      break;
    case 'rest':
      run.phase = 'rest';
      break;
    case 'treasure':
      run.phase = 'treasure';
      break;
  }
  return true;
}

/** After a combat action: defeat, or victory and its rewards. */
function settleCombat(run: RunState): void {
  if (run.phase !== 'combat') return;
  if (run.hp <= 0) {
    run.phase = 'defeat';
    return;
  }
  if (!combatWon(run)) return;
  const c = run.combat;
  if (!c) return;
  fireRelics(run, 'combatWin');
  const kind = c.kind;
  const passive = relicPassive(run.relics);
  const [lo, hi] = ECONOMY.gold[kind];
  const gold = Math.round(withRng(run, (r) => int(r, lo, hi)) * (1 + passive.goldBonus));
  run.score += SCORE[kind] * actMult(run.act);
  if (kind === 'combat') run.stats.combatsWon += 1;
  if (kind === 'elite') run.stats.elitesWon += 1;
  run.reward = { gold, cards: rewardCards(run, kind) };
  if (kind === 'elite') {
    const relic = randomRelic(run, ['common', 'uncommon', 'rare'], [45, 40, 15]);
    if (relic) run.reward.relic = relic;
  }
  run.combat = undefined;
  if (kind === 'boss') {
    run.stats.bossesWon += 1;
    run.hp = Math.min(run.maxHp, run.hp + Math.round((run.maxHp - run.hp) * ECONOMY.bossHeal));
    if (run.act === 3) {
      run.phase = 'victory';
      return;
    }
    run.reward.relics = withRng(run, (r) =>
      sample(r, RELICS.filter((d) => d.rarity === 'boss' && !run.relics.includes(d.id)).map((d) => d.id), 3),
    );
    run.phase = 'boss-reward';
    return;
  }
  run.phase = 'reward';
}

function leave(run: RunState): boolean {
  if (run.phase === 'boss-reward') {
    // Next act.
    run.act = (run.act + 1) as 2 | 3;
    run.row = -1;
    run.lane = 1;
    run.trail = [];
    run.map = generateMap(run);
    run.reward = undefined;
    run.phase = 'map';
    return true;
  }
  if (run.phase === 'reward' || run.phase === 'shop' || run.phase === 'event' || run.phase === 'treasure') {
    if (run.phase === 'event' && !run.event?.resolved) return false;
    run.reward = undefined;
    run.shop = undefined;
    run.event = undefined;
    run.phase = 'map';
    return true;
  }
  return false;
}

// ── Rewards, relics, shop ─────────────────────────────────────────────────────

function rewardCards(run: RunState, kind: 'combat' | 'elite' | 'boss'): string[] {
  const odds = ECONOMY.rewardOdds[kind];
  const n = Math.max(1, ascensionMods(run.ascension).rewardChoices + relicPassive(run.relics).rewardChoices);
  const out: string[] = [];
  withRng(run, (r) => {
    let guard = 0;
    while (out.length < n && guard++ < 50) {
      const rarity = pickWeighted(r, ['common', 'uncommon', 'rare'] as const, odds);
      const id = pick(r, rewardPool(rarity)).id;
      if (!out.includes(id)) out.push(id);
    }
  });
  return out;
}

function relicOffered(run: RunState, d: RelicDef): boolean {
  if (run.relics.includes(d.id)) return false;
  if (d.timedOnly && run.mode === 'steady') return false;
  return true;
}

export function randomRelic(run: RunState, rarities: RelicDef['rarity'][], weights: number[]): string | undefined {
  return withRng(run, (r) => {
    for (let tries = 0; tries < 6; tries++) {
      const rarity = pickWeighted(r, rarities, weights);
      const pool = RELICS.filter((d) => d.rarity === rarity && relicOffered(run, d));
      if (pool.length) return pick(r, pool).id;
    }
    return undefined;
  });
}

export function gainRelic(run: RunState, id: string): void {
  if (run.relics.includes(id)) return;
  run.relics.push(id);
  const d = relicDef(id);
  if (d.trigger === 'pickup' && d.effect?.maxHp) {
    run.maxHp += d.effect.maxHp;
    run.hp += d.effect.maxHp;
  }
}

function priceMult(run: RunState): number {
  return ascensionMods(run.ascension).priceMult * (1 - relicPassive(run.relics).shopDiscount);
}

function makeShop(run: RunState) {
  const m = priceMult(run);
  return withRng(run, (r) => {
    const cards: Array<{ id: string; price: number }> = [];
    const rarities: Array<'common' | 'uncommon' | 'rare'> = ['common', 'common', 'uncommon', 'uncommon', 'rare'];
    for (const rarity of rarities) {
      let id = pick(r, rewardPool(rarity)).id;
      for (let g = 0; g < 8 && cards.some((c) => c.id === id); g++) id = pick(r, rewardPool(rarity)).id;
      const jitter = 0.9 + next(r) * 0.2;
      cards.push({ id, price: Math.round(ECONOMY.cardPrice[rarity] * jitter * m) });
    }
    const relics: Array<{ id: string; price: number }> = [];
    for (const rarity of ['common', 'uncommon', 'rare'] as const) {
      const pool = RELICS.filter((d) => d.rarity === rarity && relicOffered(run, d) && !relics.some((x) => x.id === d.id));
      if (!pool.length) continue;
      const d = pick(r, pool);
      relics.push({ id: d.id, price: Math.round(ECONOMY.relicPrice[rarity] * (0.9 + next(r) * 0.2) * m) });
    }
    const removals = run.relicState.removals ?? 0;
    return { cards, relics, removePrice: Math.round((ECONOMY.removeBase + ECONOMY.removeStep * removals) * m) };
  });
}

// ── Events and picks ──────────────────────────────────────────────────────────

/** Whether the player can afford an event choice. */
export function canChoose(run: RunState, eventId: string, choiceId: string): boolean {
  const ch = eventDef(eventId).choices.find((c) => c.id === choiceId);
  if (!ch) return false;
  if (ch.costGold && run.gold < ch.costGold) return false;
  if (ch.costHp && run.hp <= ch.costHp) return false;
  if (ch.outcome.pick && !pickCandidates(run, ch.outcome.pick).length) return false;
  return true;
}

function resolveEvent(run: RunState, choiceId: string): boolean {
  if (run.phase !== 'event' || !run.event || run.event.resolved) return false;
  if (!canChoose(run, run.event.id, choiceId)) return false;
  const ch = eventDef(run.event.id).choices.find((c) => c.id === choiceId);
  if (!ch) return false;
  if (ch.costGold) run.gold -= ch.costGold;
  let out: EventOutcome = ch.outcome;
  if (out.risk && out.alt && withRng(run, (r) => next(r)) < out.risk) {
    out = out.alt;
    run.event.resolved = `${choiceId}:alt`;
  } else run.event.resolved = choiceId;
  applyOutcome(run, out);
  return true;
}

function applyOutcome(run: RunState, o: EventOutcome): void {
  if (o.maxHp) {
    run.maxHp = Math.max(1, run.maxHp + o.maxHp);
    run.hp = Math.min(run.maxHp, run.hp + Math.max(0, o.maxHp));
  }
  if (o.hp) run.hp = Math.max(1, Math.min(run.maxHp, run.hp + o.hp));
  if (o.healPct) run.hp = Math.min(run.maxHp, run.hp + Math.round(run.maxHp * o.healPct));
  if (o.gold) run.gold = Math.max(0, run.gold + o.gold);
  if (o.card) {
    const id = o.card.startsWith('random-')
      ? withRng(run, (r) => pick(r, rewardPool(o.card!.slice(7) as 'common' | 'uncommon' | 'rare')).id)
      : o.card;
    run.deck.push({ uid: run.nextUid++, id });
  }
  if (o.relic) {
    const id = o.relic === 'random' ? randomRelic(run, ['common', 'uncommon', 'rare'], [50, 35, 15]) : o.relic;
    if (id) gainRelic(run, id);
  }
  if (o.curse) run.deck.push({ uid: run.nextUid++, id: o.curse });
  if (o.temperRandom) {
    const cands = run.deck.filter((c) => !c.up && !cardDef(c.id).unplayable && cardDef(c.id).rarity !== 'glitch');
    for (const c of withRng(run, (r) => sample(r, cands, o.temperRandom ?? 0))) c.up = true;
  }
  if (o.fight) {
    startCombat(run, o.fight, 'combat');
    return;
  }
  if (o.pick) {
    run.pick = { kind: o.pick, then: 'event' };
    run.phase = 'pick';
  }
}

export function pickCandidates(run: RunState, kind: 'remove' | 'temper' | 'transform' | 'duplicate'): CardInst[] {
  if (kind === 'temper') return run.deck.filter((c) => !c.up && !cardDef(c.id).unplayable && cardDef(c.id).rarity !== 'glitch');
  if (kind === 'duplicate') return run.deck.filter((c) => cardDef(c.id).rarity !== 'glitch');
  return run.deck.slice();
}

function resolvePick(run: RunState, uid: number | null): boolean {
  const p = run.pick;
  if (run.phase !== 'pick' || !p) return false;
  const back = (): void => {
    run.phase = p.then as RunPhase;
    run.pick = undefined;
  };
  if (uid === null) {
    // Skipping is allowed: an event pick is optional, a shop removal is just not bought, a rest goes back to its choice.
    run.phase = p.cancel ?? p.then;
    run.pick = undefined;
    return true;
  }
  const idx = run.deck.findIndex((c) => c.uid === uid);
  const inst = run.deck[idx];
  if (!inst || !pickCandidates(run, p.kind).some((c) => c.uid === uid)) return false;
  switch (p.kind) {
    case 'remove':
      run.deck.splice(idx, 1);
      if (p.price !== undefined && run.shop) {
        run.gold -= p.price;
        run.shop.removed = true;
        run.relicState.removals = (run.relicState.removals ?? 0) + 1;
      }
      break;
    case 'temper':
      inst.up = true;
      break;
    case 'duplicate':
      run.deck.push({ uid: run.nextUid++, id: inst.id, ...(inst.up ? { up: true } : {}) });
      break;
    case 'transform': {
      const rarity = cardDef(inst.id).rarity;
      const poolRarity = rarity === 'rare' ? 'rare' : rarity === 'uncommon' ? 'uncommon' : 'common';
      const pool = rewardPool(poolRarity).filter((d) => d.id !== inst.id);
      run.deck[idx] = { uid: inst.uid, id: withRng(run, (r) => pick(r, pool)).id };
      break;
    }
  }
  back();
  return true;
}

// ── Score ─────────────────────────────────────────────────────────────────────

/** The score this run would submit now: node points, capped skill bonuses, victory, times the ascension. */
export function finalScore(run: RunState): number {
  const skill = Math.min(run.stats.perfects, SCORE.perfectCap) * SCORE.perPerfect + Math.min(run.stats.bursts, SCORE.burstCap) * SCORE.perBurst;
  const base = run.score + skill + (run.phase === 'victory' ? SCORE.victory : 0);
  return Math.round(base * (1 + SCORE.ascensionStep * run.ascension));
}

export function isOver(run: RunState): boolean {
  return run.phase === 'victory' || run.phase === 'defeat';
}

/** Re-export for the UI: a card's playable numbers. */
export { effectiveCard };
