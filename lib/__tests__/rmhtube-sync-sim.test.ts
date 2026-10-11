/**
 * RMHTube sync — the merge rule for optimistic anchors, and a deterministic
 * simulation of a whole watch party.
 *
 * The simulation drives the REAL policy (`planSync`, `observePosition`,
 * `extrapolate`, `reanchor`, `acceptServerAnchor`) against a model player that
 * misbehaves the way real ones do: seeks take time and stall, buffering
 * happens at random, the clock estimate is off, anchors arrive late and out of
 * order. It then checks the two properties "never desyncs" means in practice:
 *
 *  1. after any leader action settles, every viewer is within tolerance of
 *     the room — 0.5 s where the player can nudge its rate, 2 s where it can't;
 *  2. the correction never feeds itself — a bounded number of seeks per
 *     action, no seek loops.
 */

import { describe, it, expect } from 'vitest';
import {
  acceptServerAnchor,
  extrapolate,
  initialVideoState,
  OPTIMISTIC_ANCHOR_TTL_MS,
  reanchor,
} from '@/lib/rmhtube/sync-math';
import { observePosition, planSync, type PlayerSample } from '@/lib/rmhtube/sync-plan';
import {
  POSITION_JUMP_TOLERANCE_S,
  SEEK_COOLDOWN_MS,
  SYNC_HARD_TOLERANCE_S,
  SYNC_SOFT_TOLERANCE_S,
  SYNC_TICK_INTERVAL_MS,
} from '@/lib/rmhtube/constants';
import type { VideoState } from '@/lib/rmhtube/types';

// ─── acceptServerAnchor ──────────────────────────────────────────

const vs = (over: Partial<VideoState> = {}): VideoState => ({
  ...initialVideoState(1_000),
  ...over,
});

describe('acceptServerAnchor', () => {
  it('takes a newer anchor and drops an older one, as isNewerAnchor does', () => {
    expect(acceptServerAnchor(vs({ rev: 3 }), vs({ rev: 4 }), null, 0)).toBe(true);
    expect(acceptServerAnchor(vs({ rev: 4 }), vs({ rev: 3 }), null, 0)).toBe(false);
  });

  it('holds a fresh optimistic anchor against the in-flight heartbeat', () => {
    // Local optimistic play built on rev 5 (carries 6); the heartbeat still says 5.
    const pending = { baseRev: 5, at: 10_000 };
    expect(acceptServerAnchor(vs({ rev: 6 }), vs({ rev: 5 }), pending, 10_500)).toBe(false);
  });

  it('lets the server win once an unconfirmed optimistic anchor has expired', () => {
    // The edge never reached the room (leadership moved, socket down, rate
    // limited). Before this rule the client ignored the room until someone
    // else bumped the revision — a permanently frozen player.
    const pending = { baseRev: 5, at: 10_000 };
    const now = 10_000 + OPTIMISTIC_ANCHOR_TTL_MS + 1;
    expect(acceptServerAnchor(vs({ rev: 6 }), vs({ rev: 5 }), pending, now)).toBe(true);
    // …but never an anchor older than the base it was built on.
    expect(acceptServerAnchor(vs({ rev: 6 }), vs({ rev: 4 }), pending, now)).toBe(false);
  });
});

// ─── The simulation ──────────────────────────────────────────────

/** Small seeded PRNG so every run is the same run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface Player {
  position: number;
  paused: boolean;
  rate: number;
  /** ms of stall remaining (seek settling or a network hiccup). */
  stallMs: number;
  duration: number;
}

interface Viewer {
  player: Player;
  /** This viewer's error in estimating server time, ms. */
  clockErrorMs: number;
  anchor: VideoState;
  pending: Array<{ at: number; state: VideoState }>;
  lastSample: { position: number; at: number } | null;
  suppressUntil: number;
  force: boolean;
  seeks: number;
  canNudge: boolean;
  nudging: boolean;
  /** EMA of measured seek-to-playing latency, seconds (VideoPlayer does the same). */
  seekLeadS: number;
  seekAt: number | null;
  /** Until when this viewer is recovering from its own network hiccup. */
  hiccupUntil: number;
}

interface LeaderAction {
  at: number;
  apply: (room: VideoState, now: number) => Partial<VideoState>;
}

function runParty(opts: {
  seed: number;
  viewers: number;
  canNudge: boolean;
  durationMs: number;
  actions: LeaderAction[];
  /** Probability per tick that a viewer hits a random stall. */
  stallChance: number;
}) {
  const rand = rng(opts.seed);
  const HEARTBEAT_MS = 2_000;
  let room: VideoState = initialVideoState(0);
  let lastHeartbeat = 0;

  const viewers: Viewer[] = Array.from({ length: opts.viewers }, () => ({
    player: { position: 0, paused: true, rate: 1, stallMs: 0, duration: 3_600 },
    clockErrorMs: (rand() - 0.5) * 120, // ±60 ms after the NTP-lite handshake
    anchor: room,
    pending: [],
    lastSample: null,
    suppressUntil: 0,
    force: true,
    seeks: 0,
    canNudge: opts.canNudge,
    nudging: false,
    seekLeadS: 0,
    seekAt: null,
    hiccupUntil: 0,
  }));

  const broadcast = (now: number) => {
    const anchor = reanchor(room, now);
    for (const v of viewers) {
      // 30–330 ms one-way latency, and occasionally reordered.
      v.pending.push({ at: now + 30 + rand() * 300, state: anchor });
    }
  };

  const drifts: Array<{ at: number; drift: number; viewer: number; hiccup: boolean }> = [];
  const STEP = 10; // ms of simulated time per step
  const actions = [...opts.actions].sort((a, b) => a.at - b.at);

  for (let now = 0; now <= opts.durationMs; now += STEP) {
    // Leader actions bump the revision and broadcast at once.
    while (actions.length && actions[0].at <= now) {
      const a = actions.shift()!;
      room = { ...room, ...a.apply(room, now), updatedAt: now, rev: room.rev + 1 };
      broadcast(now);
    }
    if (now - lastHeartbeat >= HEARTBEAT_MS) {
      lastHeartbeat = now;
      broadcast(now);
    }

    viewers.forEach((v, index) => {
      // Deliver anchors that have arrived (in arrival order).
      v.pending.sort((a, b) => a.at - b.at);
      while (v.pending.length && v.pending[0].at <= now) {
        const { state } = v.pending.shift()!;
        if (acceptServerAnchor(v.anchor, state, null, now)) v.anchor = state;
      }

      // Advance the model player.
      const p = v.player;
      if (p.stallMs > 0) {
        p.stallMs -= STEP;
        if (p.stallMs <= 0 && v.seekAt !== null) {
          // Frames flowing again: fold this seek's latency into the estimate.
          const measured = (now - v.seekAt) / 1000;
          v.seekLeadS = v.seekLeadS === 0 ? measured : v.seekLeadS * 0.7 + measured * 0.3;
          v.seekAt = null;
        }
      } else if (!p.paused) p.position = Math.min(p.duration, p.position + (STEP / 1000) * p.rate);

      if (now % SYNC_TICK_INTERVAL_MS !== 0) return;

      // ── One viewer tick: the same steps as VideoPlayer.runViewerTick ──
      const sample: PlayerSample = {
        position: p.position,
        paused: p.paused,
        ended: false,
        ready: true,
        buffering: p.stallMs > 0,
        rate: p.rate,
        seekableStart: null,
        seekableEnd: null,
      };
      const prev = v.lastSample;
      v.lastSample = { position: p.position, at: now };
      const suppressed = now < v.suppressUntil;
      if (prev) {
        observePosition(prev.position, p.position, now - prev.at, p.rate, !p.paused, POSITION_JUMP_TOLERANCE_S);
      }

      // Mirror play/pause.
      if (v.anchor.playing && p.paused) p.paused = false;
      else if (!v.anchor.playing && !p.paused) p.paused = true;

      const serverNow = now + v.clockErrorMs;
      const plan = planSync({
        state: v.anchor,
        serverNow,
        sample,
        canCorrect: !suppressed,
        canNudge: v.canNudge,
        force: v.force,
        nudging: v.nudging,
        seekLeadS: v.seekLeadS,
      });
      const roomRate = v.anchor.playbackRate || 1;
      switch (plan.action) {
        case 'seek':
          v.force = false;
          // A seek lands within its latency estimate's error; leave the
          // planner in fine-tune mode so the residual is nudged down to 0.1 s.
          v.nudging = true;
          v.seekAt = now;
          v.seeks += 1;
          v.suppressUntil = now + SEEK_COOLDOWN_MS;
          v.lastSample = null;
          p.position = Math.max(0, plan.to);
          // A seek drops the buffer: 200–1200 ms before frames flow again.
          p.stallMs = 200 + rand() * 1_000;
          break;
        case 'settled':
          v.force = false;
          v.nudging = false;
          p.rate = plan.rate;
          break;
        case 'rate':
          v.nudging = true;
          p.rate = plan.rate;
          break;
        default:
          if (!v.canNudge) p.rate = roomRate;
      }

      // Random network hiccups.
      if (!p.paused && rand() < opts.stallChance) {
        p.stallMs = 300 + rand() * 1_500;
        // The policy deliberately does not chase a buffering player (the room's
        // wait-for-peers covers long stalls), so its recovery is judged apart.
        v.hiccupUntil = now + p.stallMs + 20_000;
      }

      // True drift against the room (server time, no estimation error).
      drifts.push({
        at: now,
        viewer: index,
        drift: extrapolate(room, now) - p.position,
        hiccup: now < v.hiccupUntil,
      });
    });
  }

  return { drifts, viewers, room };
}

/** Max |drift| for samples at least `settleMs` after the last action before them. */
function settledDrift(
  drifts: Array<{ at: number; drift: number; hiccup: boolean }>,
  actionTimes: number[],
  settleMs: number,
): number {
  let max = 0;
  for (const d of drifts) {
    if (d.hiccup) continue;
    const last = Math.max(0, ...actionTimes.filter((t) => t <= d.at));
    if (d.at - last < settleMs) continue;
    max = Math.max(max, Math.abs(d.drift));
  }
  return max;
}

const SCRIPT: LeaderAction[] = [
  { at: 1_000, apply: () => ({ playing: true }) },
  { at: 20_000, apply: () => ({ currentTime: 300 }) },
  { at: 40_000, apply: (r, now) => ({ playing: false, currentTime: extrapolate(r, now) }) },
  { at: 46_000, apply: (r, now) => ({ playing: true, currentTime: extrapolate(r, now) }) },
  { at: 60_000, apply: (r, now) => ({ playbackRate: 1.5, currentTime: extrapolate(r, now) }) },
  { at: 80_000, apply: (r, now) => ({ currentTime: Math.max(0, extrapolate(r, now) - 30) }) },
  { at: 95_000, apply: (r, now) => ({ playbackRate: 1, currentTime: extrapolate(r, now) }) },
];
const ACTION_TIMES = SCRIPT.map((a) => a.at);

describe('RMHTube watch party simulation', () => {
  for (const seed of [1, 7, 42, 1337]) {
    it(`native-video viewers converge and stay within tolerance (seed ${seed})`, () => {
      const { drifts, viewers } = runParty({
        seed,
        viewers: 6,
        canNudge: true,
        durationMs: 120_000,
        actions: SCRIPT,
        stallChance: 0.002,
      });
      // 6 s after any action, accounting for random stalls already in flight.
      // Within 6 s of any action nobody is past the hard tolerance (no viewer is
      // left needing another seek)…
      expect(settledDrift(drifts, ACTION_TIMES, 6_000)).toBeLessThanOrEqual(SYNC_HARD_TOLERANCE_S);
      // …and 20 s after, everyone is inside the soft band.
      expect(settledDrift(drifts, ACTION_TIMES, 20_000)).toBeLessThanOrEqual(SYNC_SOFT_TOLERANCE_S);
      // And the steady state: once settled, viewers sit close to the room — the
      // median well under the soft band, the 90th percentile inside it.
      const steady = drifts
        .filter((d) => !d.hiccup && ACTION_TIMES.every((t) => d.at < t || d.at - t > 15_000))
        .map((d) => Math.abs(d.drift))
        .sort((a, b) => a - b);
      expect(steady[Math.floor(steady.length * 0.5)]).toBeLessThanOrEqual(0.2);
      expect(steady[Math.floor(steady.length * 0.9)]).toBeLessThanOrEqual(SYNC_SOFT_TOLERANCE_S);
      // No seek loops: a handful of seeks per viewer for 7 actions + hiccups.
      for (const v of viewers) expect(v.seeks).toBeLessThanOrEqual(ACTION_TIMES.length * 2 + 6);
    });
  }

  for (const seed of [3, 99]) {
    it(`embedded players without rate control stay within ${SYNC_HARD_TOLERANCE_S}s (seed ${seed})`, () => {
      const { drifts, viewers } = runParty({
        seed,
        viewers: 4,
        canNudge: false,
        durationMs: 120_000,
        actions: SCRIPT,
        stallChance: 0.002,
      });
      expect(settledDrift(drifts, ACTION_TIMES, 6_000)).toBeLessThanOrEqual(SYNC_HARD_TOLERANCE_S);
      for (const v of viewers) expect(v.seeks).toBeLessThanOrEqual(ACTION_TIMES.length * 2 + 8);
    });
  }

  it('a paused room holds every viewer on the same frame', () => {
    const { drifts } = runParty({
      seed: 5,
      viewers: 5,
      canNudge: true,
      durationMs: 20_000,
      actions: [
        { at: 500, apply: () => ({ playing: true }) },
        { at: 8_000, apply: (r, now) => ({ playing: false, currentTime: extrapolate(r, now) }) },
      ],
      stallChance: 0,
    });
    const paused = drifts.filter((d) => d.at > 12_000).map((d) => Math.abs(d.drift));
    expect(Math.max(...paused)).toBeLessThanOrEqual(SYNC_SOFT_TOLERANCE_S);
  });
});
