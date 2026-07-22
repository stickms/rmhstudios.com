import { describe, it, expect } from 'vitest';
import {
  FAIL_KEY,
  FAILURE_COOLDOWN_MS,
  GL_TRUST_VERSION,
  STALL_MS,
  VERIFY_FRAMES,
  initialVerify,
  isBlockedByPriorFailure,
  isGateFrame,
  isWebKit,
  preferredTierOrder,
  webKitWebGPUIsSafe,
  clearFailure,
  recordFailure,
  stepVerify,
  watchdogFailed,
  type FrameHealth,
} from '../trust';

const CLEAN: FrameHealth = { ok: true, nonBlank: true, lost: false };

describe('verified-frame gating (§16.4b.1)', () => {
  it('requires VERIFY_FRAMES clean frames before promoting', () => {
    let s = initialVerify();
    expect(s.verified).toBe(false);
    for (let i = 0; i < VERIFY_FRAMES - 1; i++) {
      s = stepVerify(s, CLEAN);
      expect(s.verified).toBe(false);
      expect(s.aborted).toBe(false);
    }
    s = stepVerify(s, CLEAN);
    expect(s.verified).toBe(true);
    expect(s.frames).toBe(VERIFY_FRAMES);
  });

  it('does NOT promote if the gate frame reads blank (all-black wedged canvas)', () => {
    let s = initialVerify();
    for (let i = 0; i < VERIFY_FRAMES - 1; i++) s = stepVerify(s, CLEAN);
    // The gate frame — the one that would reach VERIFY_FRAMES.
    expect(isGateFrame(s)).toBe(true);
    s = stepVerify(s, { ok: true, nonBlank: false, lost: false });
    expect(s.verified).toBe(false);
    expect(s.aborted).toBe(false);
    // A later non-blank frame still promotes.
    s = stepVerify(s, CLEAN);
    expect(s.verified).toBe(true);
  });

  it('aborts on a GL error during probation', () => {
    let s = stepVerify(initialVerify(), CLEAN);
    s = stepVerify(s, { ok: false, nonBlank: true, lost: false });
    expect(s.aborted).toBe(true);
    expect(s.verified).toBe(false);
  });

  it('aborts on a lost context during probation', () => {
    const s = stepVerify(initialVerify(), { ok: true, nonBlank: true, lost: true });
    expect(s.aborted).toBe(true);
  });

  it('terminal states are stable (further frames no-op)', () => {
    let s = initialVerify();
    for (let i = 0; i < VERIFY_FRAMES; i++) s = stepVerify(s, CLEAN);
    expect(s.verified).toBe(true);
    const after = stepVerify(s, { ok: false, nonBlank: false, lost: true });
    expect(after).toEqual(s); // verified stays verified

    let a = stepVerify(initialVerify(), { ok: false, nonBlank: false, lost: false });
    expect(a.aborted).toBe(true);
    a = stepVerify(a, CLEAN);
    expect(a.aborted).toBe(true);
    expect(a.verified).toBe(false);
  });

  it('isGateFrame is only true approaching the threshold', () => {
    const threshold: number = VERIFY_FRAMES;
    let s = initialVerify();
    expect(isGateFrame(s)).toBe(threshold === 1);
    for (let i = 0; i < VERIFY_FRAMES - 1; i++) s = stepVerify(s, CLEAN);
    expect(isGateFrame(s)).toBe(true);
  });
});

describe('runtime watchdog (§16.4b.2)', () => {
  const base = {
    now: 10_000,
    lastRenderTs: 10_000,
    running: true,
    visible: true,
    contextLost: false,
  };

  it('passes when frames are fresh', () => {
    expect(watchdogFailed(base)).toBe(false);
  });

  it('fails when the heartbeat stalls past STALL_MS while running+visible', () => {
    expect(watchdogFailed({ ...base, lastRenderTs: base.now - STALL_MS - 1 })).toBe(true);
  });

  it('does NOT fail a legitimately paused loop (tab hidden / not running)', () => {
    const stalled = { ...base, lastRenderTs: base.now - STALL_MS - 5000 };
    expect(watchdogFailed({ ...stalled, visible: false })).toBe(false);
    expect(watchdogFailed({ ...stalled, running: false })).toBe(false);
  });

  it('always fails on a lost context, even if paused', () => {
    expect(watchdogFailed({ ...base, running: false, visible: false, contextLost: true })).toBe(
      true,
    );
  });
});

describe('WebKit caution tier (§16.4b.3)', () => {
  const SAFARI_IOS_17 =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const SAFARI_MAC_17 =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  // iOS 26 deliberately freezes the OS token at 18_6; Version/ is authoritative.
  const SAFARI_IOS_26_3 =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1';
  const SAFARI_IOS_26_4 =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1';
  const SAFARI_MAC_26_5 =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15';
  const CHROME_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';
  const CHROME_DESKTOP =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const FIREFOX_DESKTOP =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';
  const EDGE_DESKTOP =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

  it('keeps affected or unversioned WebKit releases on the CSS tier', () => {
    for (const ua of [SAFARI_IOS_17, SAFARI_MAC_17, SAFARI_IOS_26_3, CHROME_IOS]) {
      expect(isWebKit(ua)).toBe(true);
      expect(webKitWebGPUIsSafe(ua)).toBe(false);
      expect(preferredTierOrder(ua)).toEqual([]);
    }
  });

  it('enables WebGPU (without unsafe WebGL2 fallback) on Safari 26.4+', () => {
    for (const ua of [SAFARI_IOS_26_4, SAFARI_MAC_26_5]) {
      expect(isWebKit(ua)).toBe(true);
      expect(webKitWebGPUIsSafe(ua)).toBe(true);
      expect(preferredTierOrder(ua)).toEqual(['webgpu']);
    }
  });

  it('treats desktop Blink/Gecko as non-WebKit → WebGPU then WebGL2', () => {
    for (const ua of [CHROME_DESKTOP, FIREFOX_DESKTOP, EDGE_DESKTOP]) {
      expect(isWebKit(ua)).toBe(false);
      expect(preferredTierOrder(ua)).toEqual(['webgpu', 'webgl2']);
    }
  });
});

describe('failure persistence (§16.4b.2 — version-gated)', () => {
  function fakeStore() {
    const m = new Map<string, string>();
    return {
      get: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
      set: (k: string, v: string) => void m.set(k, v),
      map: m,
    };
  }

  it('blocks GL after a failure recorded for the current version', () => {
    const s = fakeStore();
    const now = 1_000_000;
    expect(isBlockedByPriorFailure(GL_TRUST_VERSION, s.get, now)).toBe(false);
    recordFailure(GL_TRUST_VERSION, s.set, now);
    expect(JSON.parse(s.map.get(FAIL_KEY) as string)).toEqual({
      version: GL_TRUST_VERSION,
      failedAt: now,
    });
    expect(isBlockedByPriorFailure(GL_TRUST_VERSION, s.get, now)).toBe(true);
  });

  it('ignores a stale failure from a different version (auto-clears on version change)', () => {
    const s = fakeStore();
    recordFailure('old-version', s.set, 1_000_000);
    expect(isBlockedByPriorFailure(GL_TRUST_VERSION, s.get)).toBe(false);
  });

  it('retries after the failure cooldown and clears the marker after success', () => {
    const s = fakeStore();
    const failedAt = 1_000_000;
    recordFailure(GL_TRUST_VERSION, s.set, failedAt);
    expect(
      isBlockedByPriorFailure(GL_TRUST_VERSION, s.get, failedAt + FAILURE_COOLDOWN_MS - 1),
    ).toBe(true);
    expect(isBlockedByPriorFailure(GL_TRUST_VERSION, s.get, failedAt + FAILURE_COOLDOWN_MS)).toBe(
      false,
    );
    clearFailure((key) => void s.map.delete(key));
    expect(s.map.has(FAIL_KEY)).toBe(false);
  });

  it('never throws when storage access throws (private mode)', () => {
    const throwing = () => {
      throw new Error('SecurityError');
    };
    expect(isBlockedByPriorFailure(GL_TRUST_VERSION, throwing)).toBe(false);
    expect(() => recordFailure(GL_TRUST_VERSION, throwing)).not.toThrow();
  });
});
