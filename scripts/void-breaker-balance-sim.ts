/* eslint-disable no-console */
// Headless balance simulation: a kiting bot plays full runs; we measure how far
// it gets. The simulation (game.ts) is node-safe (sprite preload is SSR-guarded).
// Run: node_modules/.bin/tsx scripts/void-breaker-balance-sim.ts [runs] [--weapon=<id>]
//
// Phase 2a per-weapon medians (40 runs each): pulse ~12, railgun ~10, arc ~10,
// scatter ~6, grenade ~5. NOTE: the bot KITES (keeps max distance), which
// structurally underrates short-range (scatter) and lobbed-AoE (grenade) weapons —
// their sim floor is lower than a positioning human would achieve. None are
// dead-on-arrival (scatter/grenade still reach wave 14-15 on good rolls) and none
// dominate. Re-run this after any weapon/upgrade change.
import { VoidBreakerEngine } from '../lib/void-breaker/game';
import { ARENA_W, ARENA_H, DET_MIN_SHARDS } from '../lib/void-breaker/constants';
import { getWeapon, isWeaponId, type WeaponId } from '../lib/void-breaker/weapons';
import type { InputState } from '../lib/void-breaker/types';

function fresh(): InputState {
  return {
    up: false, down: false, left: false, right: false, mouseX: ARENA_W / 2, mouseY: ARENA_H / 2,
    detonate: false, dash: false, focus: false, pause: false,
    voidPulse: false, phaseShift: false, reflectShield: false, allySynergy: false,
  };
}

function botInput(g: VoidBreakerEngine): InputState {
  const p = g.player;
  const input = fresh();
  let nearest = null as null | { x: number; y: number };
  let nd = Infinity, near = 0;
  for (const e of g.enemies) {
    if (!e.active) continue;
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < nd) { nd = d; nearest = e; }
    if (d < 220 * 220) near++;
  }
  const dist = Math.sqrt(nd);
  if (nearest) { input.mouseX = nearest.x; input.mouseY = nearest.y; }
  // Move away from the nearest threat, biased back toward the arena center.
  let mvx = (ARENA_W / 2 - p.x) * 0.5, mvy = (ARENA_H / 2 - p.y) * 0.5;
  if (nearest && dist < 280) { mvx += (p.x - nearest.x) * 2; mvy += (p.y - nearest.y) * 2; }
  const th = Math.atan2(mvy, mvx);
  input.right = Math.cos(th) > 0.35; input.left = Math.cos(th) < -0.35;
  input.down = Math.sin(th) > 0.35; input.up = Math.sin(th) < -0.35;
  input.dash = !!nearest && dist < 90 && p.dashCooldown <= 0 && !p.dashActive;
  input.focus = near >= 4 && p.focusCooldown <= 0 && !p.focusActive;
  input.detonate = p.shards >= DET_MIN_SHARDS && p.detonateCooldown <= 0 && (near >= 3 || (!!nearest && dist < 130));
  input.voidPulse = near >= 4;
  input.phaseShift = p.hp <= 1 && near >= 2;
  input.reflectShield = near >= 5;
  return input;
}

const UPGRADE_PRIORITY = [
  'explosive_rounds', 'chain_lightning', 'orbitals', 'overcharge', 'ricochet',
  'multishot', 'rapid_fire', 'piercing', 'high_caliber', 'heavy_rounds', 'deadeye',
  'napalm', 'tesla_capacitor', 'vitality', 'siphon', 'bloodlust', 'swift',
];
function pickUpgrade(g: VoidBreakerEngine): void {
  const choices = g.pendingUpgrades;
  if (choices.length === 0) { return; }
  let best = choices[0];
  for (const pref of UPGRADE_PRIORITY) {
    const m = choices.find(c => c.id === pref);
    if (m) { best = m; break; }
  }
  g.applyUpgrade(best.id);
}

function runSim(weaponId: WeaponId): { wave: number; won: boolean; secs: number } {
  const g = new VoidBreakerEngine();
  g.headless = true; // disable presentation-only hitstop/slow-mo so sim time isn't distorted
  g.weapon = getWeapon(weaponId);
  g.startGame();
  let ticks = 0;
  const maxTicks = 60 * 60 * 12; // 12 sim-minutes cap
  while ((g.state as string) !== 'gameOver' && ticks < maxTicks) {
    if (g.state === 'upgrade') { pickUpgrade(g); continue; }
    const input = botInput(g);
    g.update(1 / 60, input);
    ticks++;
  }
  return { wave: g.wave, won: g.player.hp > 0 && g.wave >= 40, secs: ticks / 60 };
}

// Args: a numeric run count and/or --weapon=<id> (default pulse), in any order.
const args = process.argv.slice(2);
const weaponArg = args.find(a => a.startsWith('--weapon='))?.split('=')[1] ?? 'pulse';
const weaponId: WeaponId = isWeaponId(weaponArg) ? weaponArg : 'pulse';
const N = parseInt(args.find(a => /^\d+$/.test(a)) ?? '24', 10);
const waves: number[] = [];
let wins = 0;
for (let i = 0; i < N; i++) {
  const r = runSim(weaponId);
  waves.push(r.wave);
  if (r.won) wins++;
}
waves.sort((a, b) => a - b);
const avg = waves.reduce((s, v) => s + v, 0) / N;
const median = waves[Math.floor(N / 2)];
console.log(`weapon=${weaponId}  runs=${N}  avgWave=${avg.toFixed(1)}  medianWave=${median}  min=${waves[0]}  max=${waves[N - 1]}  winRate=${(wins / N * 100).toFixed(0)}%`);
console.log('wave distribution:', waves.join(','));
