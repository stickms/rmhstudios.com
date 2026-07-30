/**
 * The trophy audit.
 *
 * One pass, once a second, over everything a trophy can be earned for. It is a
 * long function on purpose: the alternative is four hundred predicate closures
 * stored in a data file, which costs more to run and considerably more to read.
 *
 * Awarding is idempotent — `grant` checks membership — so this can be called
 * whenever without double-paying, which is what lets the loader run it once on
 * boot to catch up a save from an older build.
 */
import type { GameState, Notice } from './types';
import { OWN_TIERS, JOY_TROPHY_TIERS, TROPHY_MAP } from './data/trophies';
import { SOURCES } from './data/sources';
import { SEEDS } from './minigames/garden';
import { LEGACY } from './data/legacy';
import { GOODS } from './minigames/exchange';
import { computeGrossJps, computeTotalLevels } from './engine';

export function auditTrophies(state: GameState, nowMs = Date.now()): GameState {
  let trophies = state.trophies;
  const earned: string[] = [];

  function grant(id: string): void {
    if (trophies.has(id)) return;
    if (trophies === state.trophies) trophies = new Set(trophies);
    trophies.add(id);
    earned.push(id);
  }

  /* ── Owning things ── */
  for (const source of SOURCES) {
    const count = state.sources[source.id] ?? 0;
    if (count === 0) continue;
    for (const tier of OWN_TIERS) {
      if (count >= tier) grant(`own_${source.id}_${tier}`);
    }
    if (count >= 1_000) grant('shadow_hoard');
  }

  /* ── Joy ── */
  JOY_TROPHY_TIERS.forEach((threshold, i) => {
    if (state.lifetimeJoy >= threshold) grant(`joy_${i}`);
  });

  /* ── The offering ── */
  if (state.totalTouches >= 100) grant('touch_100');
  if (state.totalTouches >= 1_000) grant('touch_1000');
  if (state.totalTouches >= 10_000) grant('touch_10000');
  if (state.totalTouches >= 100_000) grant('touch_100000');
  if (state.totalTouches >= 1_000_000) grant('touch_1000000');
  if (state.recentTouches.filter((t) => nowMs - t < 3_000).length >= 15) grant('fervour');

  /* ── Halos ── */
  if (state.halosCaught >= 1) grant('halo_1');
  if (state.halosCaught >= 10) grant('halo_10');
  if (state.halosCaught >= 50) grant('halo_50');
  if (state.halosCaught >= 200) grant('halo_200');
  if (state.halosCaught >= 1_000) grant('halo_1000');
  if (state.haloStreak >= 20) grant('halo_streak');

  /* ── Rapture ── */
  if (state.rapture >= 1) grant('rapture_open');
  if (state.rapture >= 3) grant('rapture_full');
  if (state.sinnersStruck >= 1) grant('sinner_1');
  if (state.sinnersStruck >= 100) grant('sinner_100');
  if (state.sinnersStruck >= 1_000) grant('sinner_1000');
  if (state.sinners.length >= 12) grant('sinner_full');
  if (state.rapture === 0 && state.blessings.has('rapture_calm')) grant('rapture_close');

  /* ── Manna ── */
  if (state.manna.gathered >= 1) grant('manna_1');
  if (state.manna.gathered >= 10) grant('manna_10');
  if (state.manna.gathered >= 50) grant('manna_50');
  if (state.manna.gathered >= 100) grant('manna_100');
  const levels = computeTotalLevels(state);
  if (levels >= 10) grant('level_10');
  if (levels >= 50) grant('level_50');
  if (levels >= 100) grant('level_100');

  /* ── Garden ── */
  if (state.garden.unlocked) {
    grant('garden_open');
    if (state.garden.known.length > 2) {
      grant('garden_cross');
      if (state.garden.known.length >= 8) grant('garden_half');
      if (state.garden.known.length >= SEEDS.length) grant('garden_all');
    }
    if (state.garden.plots.some((p) => p.seed === 'tree' && p.growth >= 100)) grant('garden_tree');
    if (state.garden.plots.every((p) => p.seed !== null)) grant('garden_full');
    if (state.garden.soil === 'grace') grant('garden_grace');
  }

  /* ── Choir ── */
  if (state.choir.unlocked) {
    grant('choir_open');
    if (state.choir.stalls.every((s) => s !== null)) grant('choir_full');
    if (state.choir.swaps >= 25) grant('choir_swap');
  }

  /* ── Exchange ── */
  if (state.exchange.unlocked) {
    grant('exchange_open');
    if (state.exchange.lifetimeProfit > 0) grant('exchange_profit');
    if (GOODS.every((g) => state.exchange.goods[g.id].held > 0)) grant('exchange_all');
    const jps = computeGrossJps(state);
    if (jps > 0 && state.exchange.lifetimeProfit >= jps * 86_400) grant('exchange_fortune');
  }

  /* ── Hours ── */
  if (state.hours.unlocked) {
    grant('hours_open');
    if (state.hours.said >= 1) grant('hours_first');
    if (state.hours.said >= 100) grant('hours_100');
    if (state.hours.backfired >= 1) grant('hours_backfire');
  }

  /* ── Ascension ── */
  if (state.ascensions >= 1) grant('ascend_1');
  if (state.ascensions >= 5) grant('ascend_5');
  if (state.ascensions >= 25) grant('ascend_25');
  if (state.ascensions >= 100) grant('ascend_100');
  if (state.grace >= 100) grant('grace_100');
  if (state.grace >= 10_000) grant('grace_10000');
  if (state.legacy.size >= Math.ceil(LEGACY.length / 2)) grant('legacy_half');
  if (state.legacy.size >= LEGACY.length) grant('legacy_all');

  /* ── Time ── */
  if (state.playtime >= 3_600) grant('time_1h');
  if (state.playtime >= 36_000) grant('time_10h');
  if (state.playtime >= 360_000) grant('time_100h');
  if (state.playtime >= 900_000) grant('time_250h');
  if (state.playtime >= 1_800_000) grant('time_500h');
  if (state.playtime >= 3_600_000) grant('time_1000h');
  if (state.vigil.seconds >= 86_400) grant('vigil_long');

  /* ── Secrets ── */
  if (state.lifetimeJoy >= 1e12 && state.totalTouches === 0) grant('secret_patience');
  if (state.lifetimeJoy >= 1e9 && state.blessings.size === 0) grant('secret_frugal');
  if (SOURCES.every((s) => (state.sources[s.id] ?? 0) === 1)) grant('secret_singular');
  if (state.joy < 1 && computeGrossJps(state) >= 1e9) grant('secret_empty');
  if (nowMs - state.openedAt >= 3_600_000 && state.totalTouches === state.touchesAtOpen)
    grant('secret_nothing');

  if (trophies === state.trophies) return state;

  const notices: Notice[] = [
    ...state.notices,
    ...earned.slice(0, 3).map((id, i) => ({
      id: nowMs + i,
      icon: '🏆',
      title: TROPHY_MAP[id]?.name ?? 'A trophy',
      body: TROPHY_MAP[id]?.description,
      kind: 'trophy' as const,
    })),
  ];

  return { ...state, trophies, notices };
}
