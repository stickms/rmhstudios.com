/**
 * Signal Forge combat (v2). Functions here MUTATE the run they are given; `run.ts` `dispatch` clones the run
 * once per player action and hands the clone in, so callers outside the engine only ever see a new object.
 *
 * Turn shape: draw a hand, read the phrase (a short row of waveforms) and the enemy intents, play cards. A card
 * whose waveform matches the next slot of the phrase lands "on the phrase": its numbers are multiplied by the
 * timing (Perfect / Good / Late in timed mode, always Good in Steady mode) and it earns Heat. Completing the
 * phrase fires a Forge Burst at every enemy, scaled by the Heat held, and spends it. A card played off the
 * phrase adds Static; enough Static overloads into a Glitch card. Heat can instead be Vented once a turn for
 * Block. End the turn and the enemies act on the intents they showed.
 */
import { ascensionMods, PLAYER, RHYTHM, STATUS, upgradeNumber } from './balance';
import { cardDef } from './data/cards';
import { enemyDef } from './data/enemies';
import { relicDef } from './data/relics';
import { int, next, shuffled, type Rng } from './rng';
import type {
  CardDef,
  CardInst,
  CombatState,
  EnemyDef,
  EnemyMove,
  EnemyPassives,
  EnemyState,
  LogEntry,
  RelicEffect,
  RelicPassive,
  RelicTrigger,
  RunState,
  Statuses,
  Timing,
  Waveform,
} from './types';
import { WAVEFORMS } from './types';

// ── Small helpers ─────────────────────────────────────────────────────────────

export function withRng<T>(run: RunState, fn: (r: Rng) => T): T {
  const r: Rng = { s: run.rng };
  const out = fn(r);
  run.rng = r.s;
  return out;
}

const NUMERIC_UPGRADE_KEYS = [
  'dmg', 'block', 'heal', 'bleed', 'weak', 'vuln', 'heat', 'dmgPerHeat', 'blockPerHeat', 'dmgPerPlayed', 'dmgPerStatic', 'burstBonus',
] as const;

/** The card as it plays: its def, with the tempered numbers when upgraded. */
export function effectiveCard(inst: CardInst): CardDef {
  const d = cardDef(inst.id);
  if (!inst.up) return d;
  const u: CardDef = { ...d };
  for (const k of NUMERIC_UPGRADE_KEYS) {
    const v = d[k];
    if (typeof v === 'number' && v > 0) u[k] = upgradeNumber(k, v);
  }
  if (d.upCost !== undefined) u.cost = d.upCost;
  else if (d.draw && !d.dmg && !d.block) u.draw = d.draw + 1;
  return u;
}

/** Every relic passive the player holds, summed. */
export function relicPassive(relics: readonly string[]): Required<Omit<RelicPassive, 'firstSlotWild'>> & { firstSlotWild: boolean } {
  const out = {
    maxEnergy: 0, handSize: 0, burstDmg: 0, burstPerHeat: 0, staticThreshold: 0, ventPerHeat: 0, heatCap: 0,
    windowScale: 1, shopDiscount: 0, restHeal: 0, rewardChoices: 0, blockCarry: 0, phraseDmg: 0, firstSlotWild: false, goldBonus: 0,
  };
  for (const id of relics) {
    const p = relicDef(id).passive;
    if (!p) continue;
    for (const [k, v] of Object.entries(p) as Array<[keyof RelicPassive, number | boolean]>) {
      if (k === 'firstSlotWild') out.firstSlotWild = out.firstSlotWild || Boolean(v);
      else if (k === 'windowScale') out.windowScale *= v as number;
      else (out as unknown as Record<string, number>)[k] = ((out as unknown as Record<string, number>)[k] ?? 0) + (v as number);
    }
  }
  return out;
}

function log(c: CombatState, k: string, n?: number, s?: string): void {
  const e: LogEntry = { k };
  if (n !== undefined) e.n = n;
  if (s !== undefined) e.s = s;
  c.log.push(e);
  if (c.log.length > 40) c.log.splice(0, c.log.length - 40);
}

function addStatus(st: Statuses, key: keyof Statuses, n: number): void {
  if (n <= 0) return;
  st[key] = (st[key] ?? 0) + n;
}

function tickStatuses(st: Statuses): void {
  for (const k of ['weak', 'vuln', 'frail'] as const) {
    const v = st[k];
    if (v) st[k] = v - 1 > 0 ? v - 1 : undefined;
    if (!st[k]) delete st[k];
  }
}

export function enemyPassives(e: EnemyState): EnemyPassives {
  const d = enemyDef(e.id);
  if (e.phase === 2 && d.phase2?.passives) return { ...d.passives, ...d.phase2.passives };
  return d.passives ?? {};
}

function patternOf(e: EnemyState, d: EnemyDef): number[] {
  return e.phase === 2 && d.phase2 ? d.phase2.pattern : d.pattern;
}

/** The move the enemy will make next (its shown intent). */
export function intentMove(e: EnemyState): EnemyMove {
  const d = enemyDef(e.id);
  return d.moves[e.intent] as EnemyMove;
}

function setIntent(e: EnemyState): void {
  const d = enemyDef(e.id);
  const pat = patternOf(e, d);
  e.intent = pat[e.step % pat.length] as number;
}

function advanceStep(e: EnemyState): void {
  const d = enemyDef(e.id);
  const pat = patternOf(e, d);
  e.step += 1;
  if (e.step >= pat.length) e.step = e.phase === 1 ? (d.loopFrom ?? 0) : 0;
  setIntent(e);
}

/** Damage multiplier an enemy deals with, from the ascension level. */
function enemyDmgMult(run: RunState, e: EnemyState): number {
  const m = ascensionMods(run.ascension);
  const d = enemyDef(e.id);
  return m.allDmg * (d.tier === 'elite' ? m.eliteDmg : 1);
}

/** What the player sees on an attack intent: damage per hit after strength, weak and the ascension. */
export function intentDamage(run: RunState, e: EnemyState): { dmg: number; hits: number } | null {
  const mv = intentMove(e);
  if (!mv.dmg) return null;
  const c = run.combat;
  let dmg = (mv.dmg + (e.statuses.strength ?? 0)) * enemyDmgMult(run, e);
  if (e.statuses.weak) dmg *= STATUS.weakMult;
  if (c?.statuses.vuln) dmg *= STATUS.vulnMult;
  return { dmg: Math.max(0, Math.floor(dmg)), hits: mv.hits ?? 1 };
}

export function newEnemy(run: RunState, id: string): EnemyState {
  const d = enemyDef(id);
  const m = ascensionMods(run.ascension);
  let hp = withRng(run, (r) => int(r, d.hp[0], d.hp[1]));
  if (d.tier === 'normal' || d.tier === 'minion') hp = Math.round(hp * m.normalHp);
  if (d.tier === 'boss') hp = Math.round(hp * m.bossHp);
  const e: EnemyState = {
    uid: run.nextUid++,
    id,
    hp,
    maxHp: hp,
    block: d.passives?.startBlock ?? 0,
    statuses: {},
    step: 0,
    phase: 1,
    intent: 0,
  };
  setIntent(e);
  return e;
}

// ── Relics ────────────────────────────────────────────────────────────────────

export function fireRelics(run: RunState, trigger: RelicTrigger): void {
  for (const id of run.relics) {
    const d = relicDef(id);
    if (d.trigger !== trigger || !d.effect) continue;
    if (d.timedOnly && run.mode === 'steady') continue;
    if (d.every) {
      const store = run.combat ? run.combat.counters : run.relicState;
      store[id] = (store[id] ?? 0) + 1;
      if ((store[id] as number) % d.every !== 0) continue;
    }
    applyRelicEffect(run, d.effect, id);
  }
}

function applyRelicEffect(run: RunState, fx: RelicEffect, id: string): void {
  if (fx.maxHp) {
    run.maxHp += fx.maxHp;
    run.hp += fx.maxHp;
  }
  if (fx.gold) run.gold += fx.gold;
  if (fx.heal) run.hp = Math.min(run.maxHp, run.hp + fx.heal);
  const c = run.combat;
  if (!c) return;
  if (fx.block) c.block += fx.block;
  if (fx.heat) addHeat(run, fx.heat);
  if (fx.energy) c.energy += fx.energy;
  if (fx.draw) drawCards(run, fx.draw);
  if (fx.strength) addStatus(c.statuses, 'strength', fx.strength);
  if (fx.cool) c.static = Math.max(0, c.static - fx.cool);
  if (fx.static) addStatic(run, fx.static);
  for (const e of living(c)) {
    if (fx.weakAll) addStatus(e.statuses, 'weak', fx.weakAll);
    if (fx.vulnAll) addStatus(e.statuses, 'vuln', fx.vulnAll);
    if (fx.bleedAll) addStatus(e.statuses, 'bleed', fx.bleedAll);
  }
  if (fx.dmgAll) {
    for (const e of living(c)) damageEnemy(run, e, fx.dmgAll, { raw: true });
  }
  log(c, 'log.relic', undefined, id);
}

// ── Piles ─────────────────────────────────────────────────────────────────────

export function living(c: CombatState): EnemyState[] {
  return c.enemies.filter((e) => e.hp > 0);
}

export function drawCards(run: RunState, n: number): void {
  const c = run.combat;
  if (!c) return;
  for (let i = 0; i < n; i++) {
    if (c.hand.length >= PLAYER.handCap) return;
    if (c.draw.length === 0) {
      if (c.discard.length === 0) return;
      c.draw = withRng(run, (r) => shuffled(r, c.discard));
      c.discard = [];
    }
    const card = c.draw.pop() as CardInst;
    c.hand.push(card);
  }
}

function addGlitch(run: RunState, n: number): void {
  const c = run.combat;
  if (!c) return;
  for (let i = 0; i < n; i++) {
    c.discard.push({ uid: run.nextUid++, id: 'glitch' });
    fireRelics(run, 'glitchAdded');
  }
  log(c, 'log.glitch', n);
}

function heatCap(run: RunState): number {
  return RHYTHM.heatCap + relicPassive(run.relics).heatCap;
}

function addHeat(run: RunState, n: number): void {
  const c = run.combat;
  if (!c) return;
  c.heat = Math.max(0, Math.min(heatCap(run), c.heat + n));
}

export function staticThreshold(run: RunState): number {
  return Math.max(2, ascensionMods(run.ascension).staticThreshold + relicPassive(run.relics).staticThreshold);
}

function addStatic(run: RunState, n: number): void {
  const c = run.combat;
  if (!c || n <= 0) return;
  c.static += n;
  const th = staticThreshold(run);
  while (c.static >= th) {
    c.static -= th;
    log(c, 'log.overload');
    addGlitch(run, 1);
  }
}

// ── Phrase ────────────────────────────────────────────────────────────────────

/** A new phrase, weighted toward the waveforms the deck actually holds so it can be completed. */
export function newPhrase(run: RunState): Waveform[] {
  const c = run.combat;
  if (!c) return [];
  const len = RHYTHM.phraseLen[run.act];
  const counts: Record<Waveform, number> = { pulse: 1, sine: 1, saw: 1, noise: 1 };
  for (const inst of [...c.hand, ...c.draw, ...c.discard]) {
    const d = cardDef(inst.id);
    if (d.unplayable) continue;
    if (d.wave === 'any') continue;
    counts[d.wave] += 2;
  }
  const total = WAVEFORMS.reduce((s, w) => s + counts[w], 0);
  const out: Waveform[] = [];
  withRng(run, (r) => {
    for (let i = 0; i < len; i++) {
      let roll = next(r) * total;
      let pickW: Waveform = 'pulse';
      for (const w of WAVEFORMS) {
        roll -= counts[w];
        if (roll < 0) {
          pickW = w;
          break;
        }
      }
      out.push(pickW);
    }
    if (c.scrambleNext) {
      // An enemy detuned the signal: one slot becomes the waveform least present in the hand.
      const inHand: Record<Waveform, number> = { pulse: 0, sine: 0, saw: 0, noise: 0 };
      for (const inst of c.hand) {
        const d = cardDef(inst.id);
        if (d.wave !== 'any') inHand[d.wave] += 1;
      }
      const least = [...WAVEFORMS].sort((a, b) => inHand[a] - inHand[b])[0] as Waveform;
      out[int(r, 0, len - 1)] = least;
    }
  });
  c.scrambleNext = false;
  return out;
}

/** Whether a card lands on the phrase's next slot. */
export function isOnPhrase(run: RunState, def: CardDef): boolean {
  const c = run.combat;
  if (!c || c.phraseAt >= c.phrase.length) return false;
  if (def.wave === 'any') return true;
  if (c.phraseAt === 0 && relicPassive(run.relics).firstSlotWild) return true;
  return c.phrase[c.phraseAt] === def.wave;
}

export function burstDamage(run: RunState): number {
  const c = run.combat;
  if (!c) return 0;
  const p = relicPassive(run.relics);
  return RHYTHM.burstBase + p.burstDmg + c.burstBonus + c.heat * (RHYTHM.burstPerHeat + p.burstPerHeat);
}

function forgeBurst(run: RunState): void {
  const c = run.combat as CombatState;
  const dmg = burstDamage(run);
  for (const e of living(c)) {
    damageEnemy(run, e, dmg, { raw: true, onPhrase: true });
    const hard = enemyPassives(e).burstHardened;
    if (hard && e.hp > 0) addStatus(e.statuses, 'strength', hard);
  }
  c.stats.bursts += 1;
  run.stats.bursts += 1;
  c.burstBonus = 0;
  c.heat = 0;
  log(c, 'log.burst', dmg);
  fireRelics(run, 'burst');
  // A fresh phrase lets a long turn chain a second Burst.
  c.phrase = newPhrase(run);
  c.phraseAt = 0;
}

// ── Damage ────────────────────────────────────────────────────────────────────

interface HitOpts {
  /** Skip the player's strength/weak (relic and burst damage). */
  raw?: boolean;
  onPhrase?: boolean;
}

/** Deal damage to an enemy through its vulnerability, armor and block. Returns HP lost. */
export function damageEnemy(run: RunState, e: EnemyState, amount: number, opts: HitOpts = {}): number {
  const c = run.combat as CombatState;
  if (e.hp <= 0) return 0;
  let dmg = amount;
  const p = enemyPassives(e);
  if (e.statuses.vuln) dmg *= STATUS.vulnMult;
  if (p.phased && !opts.onPhrase) dmg *= 0.5;
  dmg = Math.floor(dmg);
  if (p.armor) dmg = Math.max(0, dmg - p.armor);
  const absorbed = Math.min(e.block, dmg);
  e.block -= absorbed;
  dmg -= absorbed;
  const lost = Math.min(e.hp, dmg);
  e.hp -= lost;
  c.stats.dmgDealt += lost;
  run.stats.dmgDealt += lost;
  if (lost > c.stats.maxHit) c.stats.maxHit = lost;
  if (lost > run.stats.maxHit) run.stats.maxHit = lost;
  const d = enemyDef(e.id);
  if (e.hp > 0 && e.hp <= e.maxHp / 2) {
    if (d.phase2 && e.phase === 1) {
      e.phase = 2;
      e.step = 0;
      setIntent(e);
      log(c, 'log.phase2', undefined, e.id);
    }
    if (p.enrage && !e.enraged) {
      e.enraged = true;
      addStatus(e.statuses, 'strength', p.enrage);
      log(c, 'log.enrage', undefined, e.id);
    }
  }
  if (e.hp <= 0) {
    log(c, 'log.kill', undefined, e.id);
  }
  return lost;
}

/** Deal enemy damage to the player through block. Returns HP lost. */
function damagePlayer(run: RunState, amount: number): number {
  const c = run.combat as CombatState;
  let dmg = Math.max(0, Math.floor(amount));
  const absorbed = Math.min(c.block, dmg);
  c.block -= absorbed;
  dmg -= absorbed;
  run.hp = Math.max(0, run.hp - dmg);
  c.hurtLastTurn += dmg;
  return dmg;
}

function handleKills(run: RunState, before: Set<number>): void {
  const c = run.combat as CombatState;
  for (const e of c.enemies) {
    if (e.hp <= 0 && before.has(e.uid)) {
      before.delete(e.uid);
      fireRelics(run, 'kill');
    }
  }
}

// ── Combat lifecycle ──────────────────────────────────────────────────────────

export function startCombat(run: RunState, enemyIds: string[], kind: CombatState['kind']): void {
  const deck = withRng(run, (r) => shuffled(r, run.deck));
  const c: CombatState = {
    enemies: [],
    hand: [],
    draw: deck,
    discard: [],
    exhausted: [],
    energy: 0,
    block: 0,
    statuses: {},
    heat: 0,
    static: 0,
    phrase: [],
    phraseAt: 0,
    turn: 0,
    playedThisTurn: 0,
    hurtLastTurn: 0,
    burstBonus: 0,
    ventedThisTurn: false,
    scrambleNext: false,
    counters: {},
    kind,
    stats: { perfects: 0, bursts: 0, dmgDealt: 0, maxHit: 0 },
    log: [],
  };
  run.combat = c;
  run.phase = 'combat';
  c.enemies = enemyIds.map((id) => newEnemy(run, id));
  // Innate cards go on top of the draw pile.
  const innate = c.draw.filter((i) => cardDef(i.id).innate);
  c.draw = [...c.draw.filter((i) => !cardDef(i.id).innate), ...innate];
  fireRelics(run, 'combatStart');
  startPlayerTurn(run, true);
}

function startPlayerTurn(run: RunState, first = false): void {
  const c = run.combat as CombatState;
  const p = relicPassive(run.relics);
  c.turn += 1;
  c.block = first ? c.block : Math.min(c.block, p.blockCarry);
  c.energy = PLAYER.energy + p.maxEnergy;
  c.playedThisTurn = 0;
  c.ventedThisTurn = false;
  drawCards(run, Math.max(1, PLAYER.handSize + p.handSize));
  c.phrase = newPhrase(run);
  c.phraseAt = 0;
  if (first) fireRelics(run, 'firstTurn');
  fireRelics(run, 'turnStart');
}

export interface PlayResult {
  ok: boolean;
  onPhrase?: boolean;
  burst?: boolean;
}

/** Play the card at `handIndex`. `timing` is read only when the card lands on the phrase. */
export function playCard(run: RunState, handIndex: number, timing: Timing, targetUid?: number): PlayResult {
  const c = run.combat;
  if (!c || run.phase !== 'combat') return { ok: false };
  const inst = c.hand[handIndex];
  if (!inst) return { ok: false };
  const def = effectiveCard(inst);
  if (def.unplayable || def.cost > c.energy) return { ok: false };
  const alive = living(c);
  if (alive.length === 0) return { ok: false };
  const target = alive.find((e) => e.uid === targetUid) ?? alive[0] as EnemyState;
  const before = new Set(alive.map((e) => e.uid));

  c.energy -= def.cost;
  c.hand.splice(handIndex, 1);

  const onPhrase = isOnPhrase(run, def);
  const t: Timing = run.mode === 'steady' ? 'steady' : timing;
  const mult = onPhrase ? RHYTHM.mult[t] : 1;
  const passive = relicPassive(run.relics);
  const heatBefore = c.heat;

  run.stats.cardsPlayed += 1;
  if (onPhrase) {
    if (t === 'steady') run.stats.steadyPlays += 1;
    else run.stats.timedPlays += 1;
  }

  // Damage.
  const targets = def.aoe ? living(c) : [target];
  const strength = c.statuses.strength ?? 0;
  if (def.dmg || def.dmgPerHeat || def.dmgPerStatic || def.dmgPerPlayed) {
    let per = (def.dmg ?? 0) + (def.dmgPerHeat ?? 0) * heatBefore + (def.dmgPerStatic ?? 0) * c.static + (def.dmgPerPlayed ?? 0) * c.playedThisTurn;
    per += strength;
    if (onPhrase) per += passive.phraseDmg;
    per *= mult;
    if (c.statuses.weak) per *= STATUS.weakMult;
    const hits = def.hits ?? 1;
    for (let h = 0; h < hits; h++) {
      for (const e of def.aoe ? living(c) : [target]) {
        if (e.hp <= 0) continue;
        damageEnemy(run, e, per, { onPhrase });
        const thorns = enemyPassives(e).thorns;
        if (thorns) damagePlayer(run, thorns);
      }
    }
  }
  if (def.blockAsDmg && c.block > 0) {
    for (const e of def.aoe ? living(c) : [target]) damageEnemy(run, e, c.block, { onPhrase });
  }

  // Statuses on the target(s).
  for (const e of targets) {
    if (e.hp <= 0) continue;
    if (def.bleed) addStatus(e.statuses, 'bleed', def.bleed);
    if (def.doubleBleed && e.statuses.bleed) e.statuses.bleed *= 2;
    if (def.weak) addStatus(e.statuses, 'weak', def.weak);
    if (def.vuln) addStatus(e.statuses, 'vuln', def.vuln);
    if (def.jam) e.statuses.jam = 1;
  }

  // Block.
  let block = (def.block ?? 0) + (def.blockPerHeat ?? 0) * heatBefore;
  if (def.blockFromHurt) block = Math.max(block, c.hurtLastTurn);
  if (block > 0) {
    block *= mult;
    if (c.statuses.frail) block *= STATUS.frailMult;
    c.block += Math.floor(block);
  }

  if (def.energy) c.energy += def.energy;
  if (def.strength) addStatus(c.statuses, 'strength', def.strength);
  if (def.cool) c.static = Math.max(0, c.static - def.cool);
  if (def.heal) run.hp = Math.min(run.maxHp, run.hp + def.heal);
  if (def.selfDmg) run.hp = Math.max(0, run.hp - def.selfDmg);
  if (def.burstBonus) c.burstBonus += def.burstBonus;
  if (def.purge) {
    let left = def.purge;
    for (const pile of [c.hand, c.discard, c.draw]) {
      for (let i = pile.length - 1; i >= 0 && left > 0; i--) {
        if (pile[i]?.id === 'glitch') {
          pile.splice(i, 1);
          left--;
        }
      }
    }
  }
  if (def.spendHeat) c.heat = 0;
  if (def.heat) addHeat(run, def.heat);
  if (def.draw) drawCards(run, def.draw);
  if (def.glitch) addGlitch(run, def.glitch);
  if (def.static) addStatic(run, def.static);

  // Where the card goes.
  if (def.exhaust) {
    c.exhausted.push(inst);
    fireRelics(run, 'exhaust');
  } else c.discard.push(inst);
  c.playedThisTurn += 1;

  // The rhythm layer.
  let burst = false;
  if (onPhrase) {
    addHeat(run, RHYTHM.heat[t]);
    if (t === 'perfect') {
      c.stats.perfects += 1;
      run.stats.perfects += 1;
      fireRelics(run, 'perfect');
    }
    fireRelics(run, 'phraseHit');
    c.phraseAt += def.skipSlot ? 2 : 1;
    if (c.phraseAt >= c.phrase.length && living(c).length > 0) {
      forgeBurst(run);
      burst = true;
    }
  } else {
    addStatic(run, 1);
    fireRelics(run, 'offPhrase');
  }
  log(c, onPhrase ? `log.play.${t}` : 'log.play.off', undefined, inst.id);

  handleKills(run, before);
  return { ok: true, onPhrase, burst };
}

/** Vent: spend all Heat for Block, once per turn. */
export function vent(run: RunState): boolean {
  const c = run.combat;
  if (!c || run.phase !== 'combat' || c.ventedThisTurn || c.heat <= 0) return false;
  const per = RHYTHM.ventPerHeat + relicPassive(run.relics).ventPerHeat;
  let block = c.heat * per;
  if (c.statuses.frail) block *= STATUS.frailMult;
  c.block += Math.floor(block);
  log(c, 'log.vent', Math.floor(block));
  c.heat = 0;
  c.ventedThisTurn = true;
  run.stats.vents += 1;
  fireRelics(run, 'vent');
  return true;
}

/** End the player's turn: discard, enemies act, a new turn starts (unless someone died). */
export function endTurn(run: RunState): void {
  const c = run.combat;
  if (!c || run.phase !== 'combat') return;
  fireRelics(run, 'turnEnd');
  // Hand to discard (retain stays, ethereal exhausts).
  const keep: CardInst[] = [];
  for (const inst of c.hand) {
    const d = cardDef(inst.id);
    if (d.retain) keep.push(inst);
    else if (d.ethereal) {
      c.exhausted.push(inst);
      fireRelics(run, 'exhaust');
    } else c.discard.push(inst);
  }
  c.hand = keep;
  tickStatuses(c.statuses);
  c.hurtLastTurn = 0;

  const before = new Set(living(c).map((e) => e.uid));
  for (const e of c.enemies.slice()) {
    if (e.hp <= 0) continue;
    // Bleed ticks at the start of the enemy's turn and fades by one.
    const bleed = e.statuses.bleed ?? 0;
    if (bleed > 0) {
      damageEnemy(run, e, bleed, { raw: true, onPhrase: true });
      e.statuses.bleed = bleed - 1;
      if (!e.statuses.bleed) delete e.statuses.bleed;
      if (e.hp <= 0) continue;
    }
    e.block = 0;
    enemyAct(run, e);
    if (run.hp <= 0) break;
    const regen = enemyPassives(e).regen;
    if (regen && e.hp > 0) e.hp = Math.min(e.maxHp, e.hp + regen);
    tickStatuses(e.statuses);
    advanceStep(e);
  }
  handleKills(run, before);
  if (run.hp <= 0) return;
  if (living(c).length === 0) return;
  startPlayerTurn(run);
}

function enemyAct(run: RunState, e: EnemyState): void {
  const c = run.combat as CombatState;
  const mv = intentMove(e);
  const d = enemyDef(e.id);
  const jammed = Boolean(e.statuses.jam);
  delete e.statuses.jam;
  if (jammed && d.tier !== 'boss') {
    log(c, 'log.jammed', undefined, e.id);
    return;
  }
  const attackOnly = jammed; // A jammed boss keeps its attack but loses everything else.
  if (mv.dmg) {
    const hits = mv.hits ?? 1;
    for (let h = 0; h < hits; h++) {
      const info = intentDamage(run, e);
      if (!info) break;
      damagePlayer(run, info.dmg);
      if (run.hp <= 0) return;
    }
  }
  if (attackOnly) return;
  if (mv.block) e.block += mv.block;
  if (mv.blockAll) for (const o of living(c)) if (o !== e) o.block += mv.blockAll;
  if (mv.strength) addStatus(e.statuses, 'strength', mv.strength);
  if (mv.strengthAll) for (const o of living(c)) if (o !== e) addStatus(o.statuses, 'strength', mv.strengthAll);
  if (mv.heal) e.hp = Math.min(e.maxHp, e.hp + mv.heal);
  if (mv.weak) addStatus(c.statuses, 'weak', mv.weak);
  if (mv.vuln) addStatus(c.statuses, 'vuln', mv.vuln);
  if (mv.frail) addStatus(c.statuses, 'frail', mv.frail);
  if (mv.glitch) addGlitch(run, mv.glitch);
  if (mv.static) addStatic(run, mv.static);
  if (mv.scramble) c.scrambleNext = true;
  if (mv.summon) {
    for (const id of mv.summon) {
      if (living(c).length >= 4) break;
      c.enemies.push(newEnemy(run, id));
    }
  }
}

export function combatWon(run: RunState): boolean {
  return Boolean(run.combat && living(run.combat).length === 0);
}
