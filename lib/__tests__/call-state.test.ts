import { describe, it, expect } from 'vitest';
import {
  IDLE,
  reduce,
  isBusy,
  wantsMicrophone,
  persistedStatus,
  durationSeconds,
  formatDuration,
  canCall,
  isCallPrivacy,
  CALL_PRIVACY_VALUES,
  type CallState,
} from '@/lib/call/state';
import {
  buildIceServers,
  hasTurn,
  rtcConfiguration,
  TURN_CREDENTIAL_TTL_SEC,
} from '@/lib/call/ice';

function outgoing(): CallState {
  return reduce(IDLE, { type: 'invite', callId: 'c1', peerId: 'them', conversationId: null });
}
function incoming(): CallState {
  return reduce(IDLE, { type: 'incoming', callId: 'c1', peerId: 'them', conversationId: 'conv1' });
}
function connected(): CallState {
  return reduce(reduce(outgoing(), { type: 'accepted' }), {
    type: 'media-connected',
    at: 1_000_000,
  });
}

describe('call state machine', () => {
  it('starts idle', () => {
    expect(IDLE.phase).toBe('idle');
    expect(isBusy(IDLE)).toBe(false);
  });

  it('rings out on invite', () => {
    const s = outgoing();
    expect(s.phase).toBe('outgoing');
    expect(s.callId).toBe('c1');
    expect(isBusy(s)).toBe(true);
  });

  it('rings in on incoming, carrying the conversation', () => {
    const s = incoming();
    expect(s.phase).toBe('incoming');
    expect(s.conversationId).toBe('conv1');
  });

  it('walks ringing → connecting → connected', () => {
    const accepted = reduce(outgoing(), { type: 'accepted' });
    expect(accepted.phase).toBe('connecting');
    const live = reduce(accepted, { type: 'media-connected', at: 5 });
    expect(live.phase).toBe('connected');
    expect(live.connectedAt).toBe(5);
  });

  // ── Races. Every one of these is a real thing that happens on a phone call. ──

  it('ignores a second invite while already busy', () => {
    const s = outgoing();
    const again = reduce(s, {
      type: 'invite',
      callId: 'c2',
      peerId: 'other',
      conversationId: null,
    });
    expect(again).toBe(s);
  });

  it('ignores an incoming call while already in one', () => {
    // The server sends BUSY to the new caller; our own state must not be
    // clobbered mid-conversation.
    const s = connected();
    const interrupted = reduce(s, {
      type: 'incoming',
      callId: 'c9',
      peerId: 'other',
      conversationId: null,
    });
    expect(interrupted).toBe(s);
  });

  it('ignores an accept that arrives after the call ended', () => {
    // Ring timeout fires on the server at the same moment they hit accept.
    const missed = reduce(outgoing(), { type: 'end', reason: 'missed' });
    const late = reduce(missed, { type: 'accepted' });
    expect(late.phase).toBe('ended');
    expect(late.endReason).toBe('missed');
  });

  it('ignores media-connected unless it was connecting', () => {
    expect(reduce(outgoing(), { type: 'media-connected', at: 1 }).phase).toBe('outgoing');
    expect(reduce(IDLE, { type: 'media-connected', at: 1 }).phase).toBe('idle');
  });

  it('keeps the FIRST end reason when both sides end at once', () => {
    // We hung up; their decline lands a moment later. The user already saw
    // "call ended", and flipping it to "declined" would be a lie.
    const ended = reduce(connected(), { type: 'end', reason: 'hangup' });
    const alsoEnded = reduce(ended, { type: 'end', reason: 'declined' });
    expect(alsoEnded.endReason).toBe('hangup');
  });

  it('never ends an idle call', () => {
    expect(reduce(IDLE, { type: 'end', reason: 'hangup' })).toBe(IDLE);
  });

  it('can end from any live phase', () => {
    for (const s of [
      outgoing(),
      incoming(),
      reduce(outgoing(), { type: 'accepted' }),
      connected(),
    ]) {
      expect(reduce(s, { type: 'end', reason: 'hangup' }).phase).toBe('ended');
    }
  });

  it('resets back to idle', () => {
    const ended = reduce(connected(), { type: 'end', reason: 'hangup' });
    expect(reduce(ended, { type: 'reset' })).toEqual(IDLE);
  });

  it('tracks mute for both sides, but only while in a call', () => {
    const s = reduce(connected(), { type: 'set-muted', muted: true });
    expect(s.muted).toBe(true);
    expect(reduce(s, { type: 'peer-muted', muted: true }).peerMuted).toBe(true);
    // Not while idle — a stray mute event must not resurrect state.
    expect(reduce(IDLE, { type: 'set-muted', muted: true })).toBe(IDLE);
  });

  it('knows when the microphone should be live', () => {
    expect(wantsMicrophone('idle')).toBe(false);
    // Not while merely receiving a ring: the mic opens on accept, never before.
    expect(wantsMicrophone('incoming')).toBe(false);
    expect(wantsMicrophone('connecting')).toBe(true);
    expect(wantsMicrophone('connected')).toBe(true);
    expect(wantsMicrophone('ended')).toBe(false);
  });

  it('treats ended as not-busy so a new call can start', () => {
    expect(isBusy(reduce(connected(), { type: 'end', reason: 'hangup' }))).toBe(false);
  });
});

describe('persisted status', () => {
  it('records a connected call as ENDED whatever the reason', () => {
    for (const reason of ['hangup', 'failed', 'declined'] as const) {
      expect(persistedStatus(reason, true)).toBe('ENDED');
    }
  });

  it('maps unconnected outcomes to their own status', () => {
    expect(persistedStatus('declined', false)).toBe('DECLINED');
    expect(persistedStatus('cancelled', false)).toBe('CANCELLED');
    expect(persistedStatus('missed', false)).toBe('MISSED');
    expect(persistedStatus('busy', false)).toBe('BUSY');
    expect(persistedStatus('failed', false)).toBe('FAILED');
  });

  it('does not leak a refusal reason into the callee history', () => {
    // If it never rang for them, their history says missed — not "you blocked
    // this person", which would tell the caller their block was noticed.
    expect(persistedStatus('blocked', false)).toBe('MISSED');
    expect(persistedStatus('privacy', false)).toBe('MISSED');
    expect(persistedStatus('offline', false)).toBe('MISSED');
  });
});

describe('duration', () => {
  it('is zero for a call that never connected', () => {
    expect(durationSeconds(null, 10_000)).toBe(0);
  });

  it('rounds to whole seconds', () => {
    expect(durationSeconds(1_000_000, 1_090_400)).toBe(90);
  });

  it('never goes negative on a clock skew', () => {
    expect(durationSeconds(2_000, 1_000)).toBe(0);
  });

  it('formats m:ss and h:mm:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(600)).toBe('10:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('who may call whom', () => {
  it('lets anyone call when the setting is everyone', () => {
    expect(canCall({ privacy: 'everyone', blocked: false, calleeFollowsCaller: false })).toEqual({
      allowed: true,
    });
  });

  it('refuses everyone when the setting is nobody', () => {
    expect(canCall({ privacy: 'nobody', blocked: false, calleeFollowsCaller: true })).toEqual({
      allowed: false,
      reason: 'privacy',
    });
  });

  it('requires the CALLEE to follow the CALLER on the default setting', () => {
    // The direction matters: permission is granted by the person being called.
    expect(canCall({ privacy: 'following', blocked: false, calleeFollowsCaller: true })).toEqual({
      allowed: true,
    });
    expect(canCall({ privacy: 'following', blocked: false, calleeFollowsCaller: false })).toEqual({
      allowed: false,
      reason: 'privacy',
    });
  });

  it('lets a block beat every privacy setting', () => {
    for (const privacy of CALL_PRIVACY_VALUES) {
      expect(canCall({ privacy, blocked: true, calleeFollowsCaller: true })).toEqual({
        allowed: false,
        reason: 'blocked',
      });
    }
  });

  it('validates the privacy value', () => {
    expect(isCallPrivacy('everyone')).toBe(true);
    for (const bad of ['EVERYONE', '', null, undefined, 1, 'friends']) {
      expect(isCallPrivacy(bad)).toBe(false);
    }
  });
});

describe('ICE configuration', () => {
  const hmac = (secret: string, message: string) => `hmac(${secret}:${message})`;

  it('falls back to public STUN with no configuration', () => {
    const servers = buildIceServers({ userId: 'u1', now: 0, env: {} });
    expect(servers).toHaveLength(1);
    expect(Array.isArray(servers[0].urls)).toBe(true);
    expect((servers[0].urls as string[])[0]).toMatch(/^stun:/);
    expect(servers[0].credential).toBeUndefined();
  });

  it('reports whether a relay is configured', () => {
    expect(hasTurn({})).toBe(false);
    expect(hasTurn({ TURN_URL: 'turn:x:3478' })).toBe(false); // secret missing
    expect(hasTurn({ TURN_URL: 'turn:x:3478', TURN_SECRET: 's' })).toBe(true);
  });

  it('mints a short-lived, user-bound TURN credential', () => {
    const now = 1_700_000_000_000;
    const servers = buildIceServers({
      userId: 'u1',
      now,
      env: { TURN_URL: 'turn:relay.example:3478', TURN_SECRET: 'sekret' },
      hmacSha1Base64: hmac,
    });
    const turn = servers[1];
    const expiry = Math.floor(now / 1000) + TURN_CREDENTIAL_TTL_SEC;
    expect(turn.username).toBe(`${expiry}:u1`);
    expect(turn.credential).toBe(hmac('sekret', `${expiry}:u1`));
  });

  it('does not emit TURN without both url and secret', () => {
    expect(
      buildIceServers({ userId: 'u1', now: 0, env: { TURN_URL: 'turn:x' }, hmacSha1Base64: hmac }),
    ).toHaveLength(1);
    expect(
      buildIceServers({ userId: 'u1', now: 0, env: { TURN_SECRET: 's' }, hmacSha1Base64: hmac }),
    ).toHaveLength(1);
  });

  it('accepts several relay URLs so TLS/443 fallback can be listed', () => {
    const servers = buildIceServers({
      userId: 'u1',
      now: 0,
      env: { TURN_URL: 'turn:r:3478,turns:r:443', TURN_SECRET: 's' },
      hmacSha1Base64: hmac,
    });
    expect(servers[1].urls).toEqual(['turn:r:3478', 'turns:r:443']);
  });

  it('honours configured STUN servers', () => {
    const servers = buildIceServers({
      userId: 'u1',
      now: 0,
      env: { STUN_URLS: 'stun:a:1, stun:b:2' },
    });
    expect(servers[0].urls).toEqual(['stun:a:1', 'stun:b:2']);
  });

  it('bundles onto one transport to keep firewall surface small', () => {
    const cfg = rtcConfiguration(buildIceServers({ userId: 'u', now: 0, env: {} }));
    expect(cfg.bundlePolicy).toBe('max-bundle');
    expect(cfg.rtcpMuxPolicy).toBe('require');
  });
});
