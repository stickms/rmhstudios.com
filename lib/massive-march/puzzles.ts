/**
 * Massive March — the puzzle engine.
 *
 * Every installation on the island runs through this module, on the server,
 * against positions the server already has. That placement is deliberate and
 * worth stating plainly: **occupancy is derived, never reported.** A pressure
 * pad is not "a client said I am standing on it", it is "the authoritative
 * position of that player is inside this circle". The same goes for who is in a
 * booth, who is on the lookout and who is close enough to a buried marker to dig
 * it up. There is no message a client can send that asserts a fact about where
 * anybody is.
 *
 * What clients *do* send are intentions — press this button, turn that totem,
 * put the bucket on, dig here — and each is checked against the position the
 * server holds before it counts.
 *
 * The module is pure and synchronous, which is what makes the whole design
 * testable: `evaluate()` takes a runtime and a world and returns what changed.
 * `lib/massive-march/__tests__/puzzles.test.ts` plays entire installations
 * through it without a socket in sight.
 */

import type { WorldVariant } from './constants';
import type { PuzzleStatus, Reveal, WorldEvent } from './net/events';
import { makeRng } from './world/regions';
import { groundY, isWater } from './world/terrain';
import {
  PUZZLE_SITES,
  SYMBOLS,
  type KeyId,
  type PuzzleSite,
  type Spot,
  type SymbolId,
} from './world/sites';

// ─── Inputs ─────────────────────────────────────────────────────────────────

export interface PuzzlePlayer {
  slot: number;
  x: number;
  z: number;
  /** Wearing the bucket — cannot be a guide, can be the walker. */
  blinded: boolean;
  /** Holding the finder, which is the only way to read a hunt. */
  hasFinder: boolean;
}

export interface PuzzleContext {
  now: number;
  variant: WorldVariant;
  keys: ReadonlySet<KeyId>;
  night: boolean;
  players: readonly PuzzlePlayer[];
}

export interface PuzzleOutcome {
  changed: boolean;
  /** Set on the tick a site is completed, exactly once. */
  solved: boolean;
  events: WorldEvent[];
}

const NOTHING: PuzzleOutcome = { changed: false, solved: false, events: [] };

// ─── Runtime state ──────────────────────────────────────────────────────────

export interface PuzzleRuntime {
  id: string;
  solved: boolean;
  skipped: boolean;
  /** Whether anybody has ever stood at the site — drives the map sheet. */
  discovered: boolean;

  // pads
  padHoldSince: number | null;

  // booth / final stage 0
  sequence: SymbolId[];
  buttons: SymbolId[];
  pressed: SymbolId[];

  // totems / final stage 1
  facings: number[];
  target: number[];

  // blind
  order: number[];
  plateIndex: number;
  wearer: number | null;

  // hoop
  throws: number;

  // hunt
  markers: { x: number; z: number; found: boolean }[];

  // final
  stage: number;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Fisher–Yates against a seeded generator, so a campaign shuffles once. */
function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** How many of a site's elements this world variant lights up. */
export function activeCount(site: PuzzleSite, variant: WorldVariant): number {
  return site.crew[variant];
}

export function activePads(site: PuzzleSite, variant: WorldVariant): Spot[] {
  if (!site.pads) return [];
  return site.pads.slice(0, Math.min(site.pads.length, activeCount(site, variant)));
}

export function activeTotems(site: PuzzleSite, variant: WorldVariant): Spot[] {
  if (!site.totems) return [];
  return site.totems.slice(0, Math.min(site.totems.length, activeCount(site, variant)));
}

/**
 * Build a site's starting state.
 *
 * Seeded from the campaign and the site id together, so the Sealed Booth in one
 * group's campaign is not the Sealed Booth in another's — but is the same one
 * every session that campaign is resumed.
 */
export function createRuntime(site: PuzzleSite, campaignSeed: number, variant: WorldVariant): PuzzleRuntime {
  const rng = makeRng((campaignSeed ^ hash(site.id)) >>> 0);

  const runtime: PuzzleRuntime = {
    id: site.id,
    solved: false,
    skipped: false,
    discovered: false,
    padHoldSince: null,
    sequence: [],
    buttons: [],
    pressed: [],
    facings: [],
    target: [],
    order: [],
    plateIndex: 0,
    wearer: null,
    throws: 0,
    markers: [],
    stage: 0,
  };

  if (site.console) {
    const length = site.kind === 'final' ? 5 : site.booths && site.booths.length > 1 ? 4 : 4;
    const pool = shuffle([...SYMBOLS], rng);
    runtime.buttons = pool.slice(0, Math.min(site.console.buttons, SYMBOLS.length));
    runtime.sequence = Array.from(
      { length },
      () => runtime.buttons[Math.floor(rng() * runtime.buttons.length)],
    );
  }

  if (site.totems) {
    runtime.facings = site.totems.map(() => Math.floor(rng() * 8));
    runtime.target = site.totems.map(() => Math.floor(rng() * 8));
    // A totem that starts on its answer is a totem nobody learns anything from.
    for (let i = 0; i < runtime.facings.length; i++) {
      if (runtime.facings[i] === runtime.target[i]) runtime.facings[i] = (runtime.facings[i] + 3) % 8;
    }
  }

  if (site.plates) {
    runtime.order = shuffle(
      site.plates.map((_, i) => i),
      rng,
    );
  }

  if (site.hunt) {
    const count = activeCount(site, variant);
    const markers: { x: number; z: number; found: boolean }[] = [];
    let guard = 0;
    while (markers.length < count && guard < 400) {
      guard++;
      const a = rng() * Math.PI * 2;
      // Never in the middle: a marker under the sign would be found by accident.
      const rad = (0.25 + 0.75 * Math.sqrt(rng())) * site.hunt.r;
      const x = site.hunt.x + Math.cos(a) * rad;
      const z = site.hunt.z + Math.sin(a) * rad;
      if (isWater(x, z) || groundY(x, z) < 2) continue;
      if (markers.some((m) => Math.hypot(m.x - x, m.z - z) < 22)) continue;
      markers.push({ x, z, found: false });
    }
    runtime.markers = markers;
  }

  return runtime;
}

export function createAllRuntimes(campaignSeed: number, variant: WorldVariant): Record<string, PuzzleRuntime> {
  const out: Record<string, PuzzleRuntime> = {};
  for (const site of PUZZLE_SITES) out[site.id] = createRuntime(site, campaignSeed, variant);
  return out;
}

// ─── Gating ─────────────────────────────────────────────────────────────────

export type LockReason = 'key' | 'night' | 'crew' | null;

export function lockReason(site: PuzzleSite, ctx: PuzzleContext): LockReason {
  if (site.requiresKey && !ctx.keys.has(site.requiresKey)) return 'key';
  if (site.nightOnly && !ctx.night) return 'night';
  // Not a hard lock — the site still runs — but the HUD says so, because a duo
  // staring at four pads deserves to be told the answer is "you need a third".
  if (ctx.players.length < activeCount(site, ctx.variant) && needsCrew(site)) return 'crew';
  return null;
}

/**
 * Does this lock stop the site from running, or is it just telling you something?
 *
 * `key` and `night` are the site refusing: `evaluate` returns early and `act`
 * rejects, so nothing a player does can move it. `crew` is advice — the site is
 * live and every action still works, there are simply more places to stand than
 * there are of you, and you deserve to be told that rather than left guessing.
 *
 * The distinction has to be one function because it is enforced in three places
 * that must agree. When the HUD had its own copy — "hide the controls if there
 * is a lock at all" — an undersized crew reaching the Final March was shown the
 * crew note with the console and totems REMOVED, even though reading the
 * sequence and turning the totems are one-person jobs the server would have
 * accepted. Only the last stage of that site needs the whole group, so the game
 * ended in a panel with nothing on it.
 */
export function isHardLock(reason: LockReason): reason is 'key' | 'night' {
  return reason === 'key' || reason === 'night';
}

function needsCrew(site: PuzzleSite): boolean {
  return site.kind === 'pads' || site.kind === 'final';
}

// ─── Occupancy ──────────────────────────────────────────────────────────────

function occupants(spot: Spot, players: readonly PuzzlePlayer[]): PuzzlePlayer[] {
  return players.filter((p) => Math.hypot(p.x - spot.x, p.z - spot.z) <= spot.r);
}

function isWithin(player: PuzzlePlayer, spot: Spot): boolean {
  return Math.hypot(player.x - spot.x, player.z - spot.z) <= spot.r;
}

export function atSite(site: PuzzleSite, player: { x: number; z: number }): boolean {
  return Math.hypot(player.x - site.x, player.z - site.z) <= site.radius;
}

/** Pads must be held together for this long, so a run-through does not count. */
const PAD_HOLD_MS = 450;

// ─── Evaluation ─────────────────────────────────────────────────────────────

/**
 * Advance a site by one server tick.
 *
 * Only the position-driven half of a puzzle lives here — pads, plates, digging
 * proximity, discovery. Button presses and totem turns arrive through `act()`,
 * because they are things a player chose to do rather than things that are
 * simply true about where they are standing.
 */
export function evaluate(site: PuzzleSite, runtime: PuzzleRuntime, ctx: PuzzleContext): PuzzleOutcome {
  if (runtime.solved || runtime.skipped) return NOTHING;

  const events: WorldEvent[] = [];
  let changed = false;

  const present = ctx.players.filter((p) => atSite(site, p));
  if (present.length > 0 && !runtime.discovered) {
    runtime.discovered = true;
    changed = true;
    events.push({ kind: 'discovered', site: site.id });
  }

  if (isHardLock(lockReason(site, ctx))) {
    // A locked site still notices you walked past it; it just will not run.
    return { changed, solved: false, events };
  }

  switch (site.kind) {
    case 'pads':
      return merge(events, changed, evaluatePads(site, runtime, ctx));
    case 'blind':
      return merge(events, changed, evaluateBlind(site, runtime, ctx));
    case 'hunt':
      return merge(events, changed, evaluateHunt(site, runtime, ctx));
    case 'final':
      return merge(events, changed, evaluateFinal(site, runtime, ctx));
    default:
      return { changed, solved: false, events };
  }
}

function merge(events: WorldEvent[], changed: boolean, outcome: PuzzleOutcome): PuzzleOutcome {
  return {
    changed: changed || outcome.changed,
    solved: outcome.solved,
    events: events.concat(outcome.events),
  };
}

function evaluatePads(site: PuzzleSite, runtime: PuzzleRuntime, ctx: PuzzleContext): PuzzleOutcome {
  const pads = activePads(site, ctx.variant);
  if (pads.length === 0) return NOTHING;

  // One player cannot hold two pads, so count distinct people, not distinct
  // circles — otherwise two overlapping pads would be solvable alone.
  const claimed = new Set<number>();
  let covered = 0;
  for (const padSpot of pads) {
    const here = occupants(padSpot, ctx.players).find((p) => !claimed.has(p.slot));
    if (here) {
      claimed.add(here.slot);
      covered++;
    }
  }

  const all = covered === pads.length;
  if (!all) {
    if (runtime.padHoldSince === null) return NOTHING;
    runtime.padHoldSince = null;
    return { changed: true, solved: false, events: [] };
  }

  if (runtime.padHoldSince === null) {
    runtime.padHoldSince = ctx.now;
    return { changed: true, solved: false, events: [] };
  }
  if (ctx.now - runtime.padHoldSince < PAD_HOLD_MS) return NOTHING;

  runtime.solved = true;
  return { changed: true, solved: true, events: [] };
}

function evaluateBlind(site: PuzzleSite, runtime: PuzzleRuntime, ctx: PuzzleContext): PuzzleOutcome {
  const plates = site.plates ?? [];
  if (plates.length === 0) return NOTHING;

  const wearer = ctx.players.find((p) => p.blinded && atSite(site, p)) ?? null;
  const wearerSlot = wearer?.slot ?? null;
  let changed = false;

  if (wearerSlot !== runtime.wearer) {
    runtime.wearer = wearerSlot;
    // Taking the bucket off is a legitimate way to give up; the route resets so
    // the next attempt is not half-remembered.
    if (wearerSlot === null) runtime.plateIndex = 0;
    changed = true;
  }
  if (!wearer) return { changed, solved: false, events: [] };

  const wantIndex = runtime.order[runtime.plateIndex];
  const want = plates[wantIndex];
  if (!want) return { changed, solved: false, events: [] };

  if (isWithin(wearer, want)) {
    runtime.plateIndex++;
    if (runtime.plateIndex >= runtime.order.length) {
      runtime.solved = true;
      return { changed: true, solved: true, events: [] };
    }
    return { changed: true, solved: false, events: [] };
  }

  // Any other plate is a wrong turn, and the group has to start the route again.
  for (let i = 0; i < plates.length; i++) {
    if (i === wantIndex) continue;
    // Only plates still ahead of them count as mistakes — walking back over one
    // they already did is how you get somewhere, not an error.
    const alreadyDone = runtime.order.slice(0, runtime.plateIndex).includes(i);
    if (alreadyDone) continue;
    if (isWithin(wearer, plates[i])) {
      runtime.plateIndex = 0;
      return {
        changed: true,
        solved: false,
        events: [{ kind: 'reset', site: site.id, reason: 'wrong-plate' }],
      };
    }
  }

  return { changed, solved: false, events: [] };
}

/** How close you have to be before the ground is worth turning over. */
export const DIG_RADIUS = 5;

function evaluateHunt(_site: PuzzleSite, _runtime: PuzzleRuntime, _ctx: PuzzleContext): PuzzleOutcome {
  // Nothing happens on a tick: a hunt advances only when somebody digs, and the
  // finder's reading is computed per-listener in `revealFor`.
  return NOTHING;
}

function evaluateFinal(site: PuzzleSite, runtime: PuzzleRuntime, ctx: PuzzleContext): PuzzleOutcome {
  // Stages 0 and 1 are driven by `act()`. Only the last one — everybody on a
  // pad at once, having already read and turned — is positional.
  if (runtime.stage < 2) return NOTHING;
  const outcome = evaluatePads(site, runtime, ctx);
  return outcome;
}

// ─── Actions ────────────────────────────────────────────────────────────────

export interface Actor extends PuzzlePlayer {
  /** Distance checks are against the authoritative position, always. */
  name: string;
}

export type ActionResult = PuzzleOutcome & { rejected?: string };

/**
 * Apply a deliberate action.
 *
 * Every branch re-checks that the actor is physically able to do the thing —
 * standing at the console, next to the totem, near an unfound marker. The client
 * only ever gets to say *what* it is trying to do.
 */
export function act(
  site: PuzzleSite,
  runtime: PuzzleRuntime,
  ctx: PuzzleContext,
  actor: Actor,
  action: { action: string; symbol?: string; totem?: string },
): ActionResult {
  if (runtime.solved || runtime.skipped) return { ...NOTHING, rejected: 'done' };
  const locked = lockReason(site, ctx);
  if (isHardLock(locked)) return { ...NOTHING, rejected: locked };

  switch (action.action) {
    case 'press':
      return press(site, runtime, actor, action.symbol);
    case 'turn':
      return turn(site, runtime, ctx, actor, action.totem);
    case 'dig':
      return dig(site, runtime, actor);
    default:
      return { ...NOTHING, rejected: 'unknown' };
  }
}

function press(site: PuzzleSite, runtime: PuzzleRuntime, actor: Actor, symbol?: string): ActionResult {
  const consoleSpot = site.console;
  if (!consoleSpot) return { ...NOTHING, rejected: 'no-console' };
  // The console has a reach. This is what stops the person inside the booth
  // simply doing both jobs.
  if (!isWithin(actor, { ...consoleSpot, r: consoleSpot.r + 1.5 })) {
    return { ...NOTHING, rejected: 'too-far' };
  }
  if (actor.blinded) return { ...NOTHING, rejected: 'blinded' };
  if (!symbol || !runtime.buttons.includes(symbol as SymbolId)) {
    return { ...NOTHING, rejected: 'no-such-button' };
  }
  if (site.kind === 'final' && runtime.stage !== 0) return { ...NOTHING, rejected: 'wrong-stage' };

  const want = runtime.sequence[runtime.pressed.length];
  if (symbol !== want) {
    const hadProgress = runtime.pressed.length > 0;
    runtime.pressed = [];
    return {
      changed: true,
      solved: false,
      events: hadProgress ? [{ kind: 'reset', site: site.id, reason: 'wrong-symbol' }] : [],
    };
  }

  runtime.pressed.push(symbol as SymbolId);
  if (runtime.pressed.length < runtime.sequence.length) {
    return { changed: true, solved: false, events: [] };
  }

  if (site.kind === 'final') {
    runtime.stage = 1;
    return { changed: true, solved: false, events: [] };
  }
  runtime.solved = true;
  return { changed: true, solved: true, events: [] };
}

function turn(
  site: PuzzleSite,
  runtime: PuzzleRuntime,
  ctx: PuzzleContext,
  actor: Actor,
  totemId?: string,
): ActionResult {
  const totems = activeTotems(site, ctx.variant);
  const index = totems.findIndex((t) => t.id === totemId);
  if (index === -1) return { ...NOTHING, rejected: 'no-such-totem' };
  const totem = totems[index];
  if (!isWithin(actor, { ...totem, r: totem.r + 1.5 })) return { ...NOTHING, rejected: 'too-far' };
  if (actor.blinded) return { ...NOTHING, rejected: 'blinded' };
  if (site.kind === 'final' && runtime.stage !== 1) return { ...NOTHING, rejected: 'wrong-stage' };

  runtime.facings[index] = (runtime.facings[index] + 1) % 8;

  const aligned = totems.every((_, i) => runtime.facings[i] === runtime.target[i]);
  if (!aligned) return { changed: true, solved: false, events: [] };

  if (site.kind === 'final') {
    runtime.stage = 2;
    return { changed: true, solved: false, events: [] };
  }
  runtime.solved = true;
  return { changed: true, solved: true, events: [] };
}

function dig(site: PuzzleSite, runtime: PuzzleRuntime, actor: Actor): ActionResult {
  if (!site.hunt) return { ...NOTHING, rejected: 'no-hunt' };
  let nearest = -1;
  let nearestDist = Infinity;
  for (let i = 0; i < runtime.markers.length; i++) {
    const marker = runtime.markers[i];
    if (marker.found) continue;
    const d = Math.hypot(actor.x - marker.x, actor.z - marker.z);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = i;
    }
  }
  if (nearest === -1) return { ...NOTHING, rejected: 'nothing-left' };
  if (nearestDist > DIG_RADIUS) return { ...NOTHING, rejected: 'nothing-here' };

  runtime.markers[nearest].found = true;
  if (runtime.markers.every((m) => m.found)) {
    runtime.solved = true;
    return { changed: true, solved: true, events: [] };
  }
  return { changed: true, solved: false, events: [] };
}

/** A hoop pass, detected by the item simulation rather than by a player. */
export function scoreHoop(site: PuzzleSite, runtime: PuzzleRuntime): ActionResult {
  if (!site.hoop || runtime.solved || runtime.skipped) return NOTHING;
  runtime.throws++;
  if (runtime.throws >= site.hoop.throws) {
    runtime.solved = true;
    return { changed: true, solved: true, events: [] };
  }
  return { changed: true, solved: false, events: [] };
}

// ─── Views ──────────────────────────────────────────────────────────────────

/** The public state of a site: everything every player is allowed to see. */
export function statusOf(site: PuzzleSite, runtime: PuzzleRuntime, ctx: PuzzleContext): PuzzleStatus {
  const locked = lockReason(site, ctx);
  const state = runtime.solved
    ? 'solved'
    : runtime.skipped
      ? 'skipped'
      : isHardLock(locked)
        ? 'locked'
        : ctx.players.some((p) => atSite(site, p))
          ? 'active'
          : 'idle';

  const status: PuzzleStatus = {
    id: site.id,
    state,
    step: 0,
    total: 1,
    ...(locked ? { lockedBy: locked } : {}),
  };

  switch (site.kind) {
    case 'pads': {
      const pads = activePads(site, ctx.variant);
      const held = pads.filter((p) => occupants(p, ctx.players).length > 0).map((p) => p.id);
      status.lit = pads.map((p) => p.id);
      status.held = held;
      status.step = held.length;
      status.total = pads.length;
      break;
    }
    case 'booth':
      status.pressed = runtime.pressed;
      status.buttons = runtime.buttons;
      status.step = runtime.pressed.length;
      status.total = runtime.sequence.length;
      break;
    case 'blind':
      status.wearer = runtime.wearer;
      status.step = runtime.plateIndex;
      status.total = runtime.order.length;
      break;
    case 'totems': {
      const totems = activeTotems(site, ctx.variant);
      status.facings = runtime.facings.slice(0, totems.length);
      status.step = totems.filter((_, i) => runtime.facings[i] === runtime.target[i]).length;
      status.total = totems.length;
      break;
    }
    case 'hoop':
      status.throws = runtime.throws;
      status.step = runtime.throws;
      status.total = site.hoop?.throws ?? 3;
      break;
    case 'hunt':
      status.found = runtime.markers.filter((m) => m.found).length;
      status.step = status.found;
      status.total = runtime.markers.length;
      break;
    case 'final': {
      const pads = activePads(site, ctx.variant);
      status.stage = runtime.stage;
      status.pressed = runtime.pressed;
      status.buttons = runtime.buttons;
      status.facings = runtime.facings;
      status.lit = runtime.stage === 2 ? pads.map((p) => p.id) : [];
      status.held = runtime.stage === 2 ? pads.filter((p) => occupants(p, ctx.players).length > 0).map((p) => p.id) : [];
      status.step = runtime.stage;
      status.total = 3;
      break;
    }
  }

  return status;
}

/**
 * What one specific player is allowed to see that others are not.
 *
 * This is the asymmetry, and it is enforced by never sending the rest. Standing
 * in the booth is the *only* way to learn the sequence; standing on the lookout
 * is the only way to learn the facings; holding the finder is the only way to
 * get a distance. Walk away and `clear` takes it off your screen.
 */
export function revealFor(
  site: PuzzleSite,
  runtime: PuzzleRuntime,
  ctx: PuzzleContext,
  player: PuzzlePlayer,
): Reveal | null {
  if (runtime.solved || runtime.skipped) return null;

  if ((site.kind === 'booth' || site.kind === 'final') && site.booths) {
    if (site.kind === 'final' && runtime.stage !== 0) return null;
    for (let i = 0; i < site.booths.length; i++) {
      const booth = site.booths[i];
      // Inside the wall, not merely near it.
      if (Math.hypot(player.x - booth.x, player.z - booth.z) > booth.r - 0.9) continue;
      if (site.booths.length === 1) {
        return { kind: 'booth', site: site.id, booth: booth.id, symbols: runtime.sequence, offset: 0 };
      }
      // Split booths: alternating glyphs, so neither half is the answer and
      // somebody has to interleave two people's readings in the right order.
      const symbols = runtime.sequence.filter((_, index) => index % site.booths!.length === i);
      return { kind: 'booth', site: site.id, booth: booth.id, symbols, offset: i };
    }
  }

  if ((site.kind === 'totems' || site.kind === 'final') && site.lookout) {
    if (site.kind === 'final' && runtime.stage !== 1) return null;
    if (isWithin(player, site.lookout)) {
      const totems = activeTotems(site, ctx.variant);
      return { kind: 'totems', site: site.id, facings: runtime.target.slice(0, totems.length) };
    }
  }

  if (site.kind === 'blind' && site.plates) {
    // Everyone at the site except the person wearing the bucket.
    if (player.blinded || runtime.wearer === null) return null;
    if (!atSite(site, player)) return null;
    const index = runtime.order[runtime.plateIndex];
    const plate = site.plates[index];
    if (!plate) return null;
    return { kind: 'plate', site: site.id, plate: plate.id, index: runtime.plateIndex };
  }

  if (site.kind === 'hunt' && player.hasFinder) {
    let nearest = Infinity;
    for (const marker of runtime.markers) {
      if (marker.found) continue;
      const d = Math.hypot(player.x - marker.x, player.z - marker.z);
      if (d < nearest) nearest = d;
    }
    if (!Number.isFinite(nearest)) return null;
    return { kind: 'finder', site: site.id, distance: nearest };
  }

  return null;
}

// ─── Persistence ────────────────────────────────────────────────────────────

/** Runtimes go into the campaign save verbatim; they are already plain data. */
export function serializeRuntimes(runtimes: Record<string, PuzzleRuntime>): Record<string, PuzzleRuntime> {
  return runtimes;
}

/**
 * Rebuild from a save, tolerating a save written before a site existed.
 *
 * A campaign started last month must not break because the island gained an
 * installation this week, so anything missing is regenerated from the seed and
 * anything unrecognised is dropped.
 */
export function restoreRuntimes(
  saved: unknown,
  campaignSeed: number,
  variant: WorldVariant,
): Record<string, PuzzleRuntime> {
  const fresh = createAllRuntimes(campaignSeed, variant);
  if (!saved || typeof saved !== 'object') return fresh;
  const record = saved as Record<string, Partial<PuzzleRuntime>>;
  for (const site of PUZZLE_SITES) {
    const from = record[site.id];
    if (!from) continue;
    const into = fresh[site.id];
    into.solved = from.solved === true;
    into.skipped = from.skipped === true;
    into.discovered = from.discovered === true;
    if (Array.isArray(from.sequence) && from.sequence.length) into.sequence = from.sequence as SymbolId[];
    if (Array.isArray(from.buttons) && from.buttons.length) into.buttons = from.buttons as SymbolId[];
    if (Array.isArray(from.facings) && from.facings.length === into.facings.length) into.facings = from.facings;
    if (Array.isArray(from.target) && from.target.length === into.target.length) into.target = from.target;
    if (Array.isArray(from.order) && from.order.length === into.order.length) into.order = from.order;
    if (Array.isArray(from.markers) && from.markers.length === into.markers.length) {
      into.markers = from.markers.map((m) => ({ x: m.x, z: m.z, found: m.found === true }));
    }
    into.throws = typeof from.throws === 'number' ? from.throws : 0;
    into.stage = typeof from.stage === 'number' ? from.stage : 0;
    // Anything mid-attempt is deliberately NOT restored: a half-entered
    // sequence across a week-long gap is a trap, not progress.
  }
  return fresh;
}
