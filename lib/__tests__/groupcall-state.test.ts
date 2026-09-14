/**
 * The group-call state machine.
 *
 * Deliberately the same shape as `lib/__tests__/call-state.test.ts`: this is the
 * 1:1 machine's sibling, it is pure for the same reason, and the bugs worth
 * catching are in the same place — the transitions, not the arithmetic. Where
 * the two differ, it is because a room of eight has races a pair cannot have,
 * and those get their own suite at the bottom.
 *
 * Nothing here touches a socket, an `RTCPeerConnection` or React. The mesh
 * (`lib/groupcall/mesh.ts`), the store and the hub handler are all tested — or
 * not — elsewhere; what is tested here is the set of rules they all share, which
 * is the only part both the browser and the server run.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  IDLE_GROUP_CALL,
  reduce,
  isGroupCallBusy,
  wantsMicrophone,
  shouldOffer,
  indexRoster,
  rosterList,
  joinedParticipants,
  pendingInvitees,
  participantCount,
  isRosterFull,
  remainingSlots,
  meshPeers,
  addParticipant,
  removeParticipant,
  setParticipantMuted,
  markJoined,
  canJoinGroupCall,
  canJoinOpenRoom,
  persistedOrigin,
  persistedStatus,
  persistedParticipantStatus,
  durationSeconds as groupDurationSeconds,
  formatDuration as groupFormatDuration,
  type GroupCallEvent,
  type GroupCallPhase,
  type GroupCallState,
} from '@/lib/groupcall/state';
import {
  GROUP_CALL_ORIGINS,
  MAX_GROUP_CALL_INVITES,
  MAX_GROUP_CALL_PARTICIPANTS,
  type GroupCallEndReason,
  type GroupCallLeaveReason,
  type GroupCallParticipantView,
  type GroupCallRejectReason,
  type OpenRoomOrigin,
} from '@/lib/groupcall/events';
import { CALL_PRIVACY_VALUES, canCall, durationSeconds, formatDuration } from '@/lib/call/state';

const ME = 'u-me';
const HOST = 'u-host';
const CALL_ID = 'gc1';
const AT = 1_700_000_000_000;

/** One roster row. `joinedAt` defaults to "actually in the room". */
function person(
  userId: string,
  over: Partial<GroupCallParticipantView> = {},
): GroupCallParticipantView {
  return {
    userId,
    name: userId,
    image: null,
    handle: null,
    muted: false,
    host: false,
    joinedAt: AT,
    ...over,
  };
}

/** On the roster but still ringing — `joinedAt === null` is the whole distinction. */
function invitee(userId: string): GroupCallParticipantView {
  return person(userId, { joinedAt: null });
}

/** We pressed call. No room id yet; the server has not named it. */
function starting(): GroupCallState {
  return reduce(IDLE_GROUP_CALL, {
    type: 'start',
    origin: 'adhoc',
    originId: null,
    conversationId: 'conv1',
    selfId: ME,
  });
}

/** Somebody else's ad-hoc room is ringing us. */
function incoming(
  participants: GroupCallParticipantView[] = [
    person(HOST, { host: true, joinedAt: AT - 500 }),
    invitee(ME),
  ],
): GroupCallState {
  return reduce(IDLE_GROUP_CALL, {
    type: 'incoming',
    callId: CALL_ID,
    origin: 'adhoc',
    originId: null,
    conversationId: 'conv1',
    hostId: HOST,
    selfId: ME,
    participants,
  });
}

const DEFAULT_ROSTER = [person(ME, { host: true }), person('u-ana'), invitee('u-ben')];

/** We are in a room we started. */
function active(participants: GroupCallParticipantView[] = DEFAULT_ROSTER): GroupCallState {
  return reduce(starting(), {
    type: 'joined',
    callId: CALL_ID,
    origin: 'adhoc',
    originId: null,
    conversationId: 'conv1',
    hostId: ME,
    selfId: ME,
    participants,
    at: AT,
  });
}

/** A live room with `joined` people in it and `ringing` more still being rung. */
function roomOf(joined: number, ringing = 0): GroupCallState {
  return active([
    ...Array.from({ length: joined }, (_, i) => person(`u-in-${i}`, { joinedAt: AT + i })),
    ...Array.from({ length: ringing }, (_, i) => invitee(`u-ring-${i}`)),
  ]);
}

const PHASES: readonly GroupCallPhase[] = ['idle', 'incoming', 'joining', 'active', 'ended'];

/** One representative state per phase. Exhaustive, so a new phase fails to compile. */
function stateIn(phase: GroupCallPhase): GroupCallState {
  switch (phase) {
    case 'idle':
      return IDLE_GROUP_CALL;
    case 'incoming':
      return incoming();
    case 'joining':
      return starting();
    case 'active':
      return active();
    case 'ended':
      return reduce(active(), { type: 'end', reason: 'host-ended' });
  }
}

/* -------------------------------------------------------------------------- */

describe('group call state machine', () => {
  it('starts idle', () => {
    expect(IDLE_GROUP_CALL.phase).toBe('idle');
    expect(isGroupCallBusy(IDLE_GROUP_CALL)).toBe(false);
    expect(IDLE_GROUP_CALL.participants).toEqual({});
    expect(IDLE_GROUP_CALL.endReason).toBeNull();
  });

  it('goes joining the moment we press call, before the server has named the room', () => {
    // The host is not "ringing" anybody's phone from their own point of view —
    // they are standing in a room waiting for company, which is why there is no
    // separate outgoing phase here as there is in the 1:1 machine.
    const s = starting();
    expect(s.phase).toBe('joining');
    expect(s.callId).toBeNull();
    expect(s.origin).toBe('adhoc');
    expect(s.conversationId).toBe('conv1');
    expect(s.selfId).toBe(ME);
    // The server owns the roster; a locally invented host row would be a second
    // source of truth that has to agree with the first.
    expect(s.participants).toEqual({});
    expect(isGroupCallBusy(s)).toBe(true);
  });

  it('ends a start that was refused before a room existed', () => {
    // The whole reason `start` has no callId. Every refusal arrives before the
    // room is named, and `end` is a no-op from `idle` — so without a pre-join
    // state a refused call showed the user nothing at all.
    const rejections: readonly GroupCallRejectReason[] = [
      'blocked',
      'privacy',
      'not-member',
      'full',
      'gone',
      'busy',
      'failed',
    ];
    for (const reason of rejections) {
      const refused = reduce(starting(), { type: 'end', reason });
      expect(refused.phase).toBe('ended');
      expect(refused.endReason).toBe(reason);
      expect(refused.callId).toBeNull();
    }
  });

  it('walks start → joining → active → ended', () => {
    const s = starting();
    expect(s.phase).toBe('joining');
    const live = active();
    expect(live.phase).toBe('active');
    expect(live.callId).toBe(CALL_ID);
    expect(live.hostId).toBe(ME);
    expect(live.joinedAt).toBe(AT);
    expect(rosterList(live)).toHaveLength(3);
    const over = reduce(live, { type: 'end', reason: 'left' });
    expect(over.phase).toBe('ended');
    expect(over.endReason).toBe('left');
  });

  it('rings in on incoming, carrying the roster so the card can name people', () => {
    const s = incoming();
    expect(s.phase).toBe('incoming');
    expect(s.callId).toBe(CALL_ID);
    expect(s.hostId).toBe(HOST);
    expect(s.conversationId).toBe('conv1');
    expect(Object.keys(s.participants).sort()).toEqual([HOST, ME]);
    expect(isGroupCallBusy(s)).toBe(true);
  });

  it('walks incoming → joining → active', () => {
    const accepted = reduce(incoming(), { type: 'join', callId: CALL_ID });
    expect(accepted.phase).toBe('joining');
    // Accepting keeps everything the ring told us — only the phase moves.
    expect(accepted.callId).toBe(CALL_ID);
    expect(accepted.hostId).toBe(HOST);
    const live = reduce(accepted, {
      type: 'joined',
      callId: CALL_ID,
      origin: 'adhoc',
      originId: null,
      conversationId: 'conv1',
      hostId: HOST,
      selfId: ME,
      participants: [person(HOST, { host: true }), person(ME)],
      at: AT,
    });
    expect(live.phase).toBe('active');
    expect(live.joinedAt).toBe(AT);
  });

  it('goes incoming → declined without ever being active', () => {
    const declined = reduce(incoming(), { type: 'end', reason: 'declined' });
    expect(declined.phase).toBe('ended');
    expect(declined.endReason).toBe('declined');
    expect(declined.joinedAt).toBeNull();
  });

  it('walks into an open room from idle, and from a room that already ended', () => {
    for (const before of [IDLE_GROUP_CALL, reduce(active(), { type: 'end', reason: 'left' })]) {
      const s = reduce(before, { type: 'join', callId: 'gc-open' });
      expect(s.phase).toBe('joining');
      expect(s.callId).toBe('gc-open');
      // A fresh room: nothing of the last one may leak into it.
      expect(s.endReason).toBeNull();
      expect(s.participants).toEqual({});
      expect(s.joinedAt).toBeNull();
    }
  });

  it('takes the room from `joined` rather than from what the client guessed', () => {
    const live = active();
    expect(live.origin).toBe('adhoc');
    expect(live.originId).toBeNull();
    expect(live.selfId).toBe(ME);
    expect(live.participants['u-ana'].joinedAt).toBe(AT);
    expect(live.participants['u-ben'].joinedAt).toBeNull();
  });

  it('ignores an unknown event rather than throwing', () => {
    // A hub that learns a new event before this client does must not crash a tab
    // that is in the middle of a call.
    const unknown = { type: 'gcall:something-new' } as unknown as GroupCallEvent;
    for (const phase of PHASES) {
      const s = stateIn(phase);
      expect(reduce(s, unknown)).toBe(s);
    }
  });

  it('resets back to idle from every phase', () => {
    for (const phase of PHASES) {
      expect(reduce(stateIn(phase), { type: 'reset' })).toEqual(IDLE_GROUP_CALL);
    }
  });

  it('can start a fresh call once the last one ended', () => {
    const over = reduce(active(), { type: 'end', reason: 'host-ended' });
    expect(isGroupCallBusy(over)).toBe(false);
    const next = reduce(over, {
      type: 'start',
      origin: 'community',
      originId: 'c1',
      conversationId: null,
      selfId: ME,
    });
    expect(next.phase).toBe('joining');
    expect(next.origin).toBe('community');
    expect(next.originId).toBe('c1');
    // The dead room's reason and roster are gone, not carried forward.
    expect(next.endReason).toBeNull();
    expect(next.participants).toEqual({});
  });

  it('is busy only while committed to a room', () => {
    expect(isGroupCallBusy(stateIn('idle'))).toBe(false);
    expect(isGroupCallBusy(stateIn('incoming'))).toBe(true);
    expect(isGroupCallBusy(stateIn('joining'))).toBe(true);
    expect(isGroupCallBusy(stateIn('active'))).toBe(true);
    // Ended is not busy, so the next call can start immediately.
    expect(isGroupCallBusy(stateIn('ended'))).toBe(false);
  });

  it('knows when the microphone should be live', () => {
    expect(wantsMicrophone('idle')).toBe(false);
    // Not while merely being rung: the prompt belongs to the moment the user
    // pressed Join, never to somebody else's room starting to ring.
    expect(wantsMicrophone('incoming')).toBe(false);
    expect(wantsMicrophone('joining')).toBe(true);
    expect(wantsMicrophone('active')).toBe(true);
    expect(wantsMicrophone('ended')).toBe(false);
  });

  it('lets us mute before the room has finished admitting us', () => {
    const preMuted = reduce(starting(), { type: 'set-muted', muted: true });
    expect(preMuted.muted).toBe(true);
    expect(reduce(active(), { type: 'set-muted', muted: true }).muted).toBe(true);
  });

  it('ignores our own mute outside a room we are in or entering', () => {
    for (const phase of ['idle', 'incoming', 'ended'] as const) {
      const s = stateIn(phase);
      expect(reduce(s, { type: 'set-muted', muted: true })).toBe(s);
    }
  });

  it('returns the identical object when a mute changes nothing', () => {
    const live = active();
    expect(reduce(live, { type: 'set-muted', muted: false })).toBe(live);
    const muted = reduce(live, { type: 'set-muted', muted: true });
    expect(reduce(muted, { type: 'set-muted', muted: true })).toBe(muted);
  });

  it('replaces the roster from an authoritative snapshot', () => {
    const live = active();
    const snapshot = reduce(live, {
      type: 'roster',
      callId: CALL_ID,
      participants: [person(ME, { host: true }), person('u-cara')],
    });
    expect(Object.keys(snapshot.participants).sort()).toEqual(['u-cara', ME]);
    // A snapshot REPLACES; the person it no longer lists is gone.
    expect(snapshot.participants['u-ana']).toBeUndefined();
  });

  it('does not let a snapshot be what puts us in a room', () => {
    for (const phase of ['idle', 'incoming', 'joining', 'ended'] as const) {
      const s = stateIn(phase);
      expect(reduce(s, { type: 'roster', callId: CALL_ID, participants: [person('u-ana')] })).toBe(
        s,
      );
    }
  });

  it('accepts peer arrivals and departures while the card is still ringing', () => {
    // So "Ana, Ben and 2 others" stays right while the user decides.
    const ringing = incoming();
    const bigger = reduce(ringing, { type: 'peer-joined', participant: person('u-cara') });
    expect(Object.keys(bigger.participants)).toHaveLength(3);
    const smaller = reduce(bigger, { type: 'peer-left', userId: 'u-cara' });
    expect(Object.keys(smaller.participants)).toHaveLength(2);
  });

  it('ignores peer arrivals for a room we are not in', () => {
    for (const phase of ['idle', 'joining', 'ended'] as const) {
      const s = stateIn(phase);
      expect(reduce(s, { type: 'peer-joined', participant: person('u-cara') })).toBe(s);
      expect(reduce(s, { type: 'peer-left', userId: 'u-ana' })).toBe(s);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe('roster helpers', () => {
  it('indexes by userId, last row winning, so a snapshot is self-healing', () => {
    expect(indexRoster([])).toEqual({});
    const indexed = indexRoster([
      person('u-ana', { muted: false }),
      person('u-ben'),
      person('u-ana', { muted: true }),
    ]);
    expect(Object.keys(indexed).sort()).toEqual(['u-ana', 'u-ben']);
    expect(indexed['u-ana'].muted).toBe(true);
  });

  it('renders the people who are in first, oldest first, then the ones still ringing', () => {
    const s = active([
      invitee('u-zoe'),
      person('u-late', { joinedAt: AT + 900 }),
      invitee('u-ana'),
      person('u-early', { joinedAt: AT }),
    ]);
    expect(rosterList(s).map((p) => p.userId)).toEqual([
      'u-early',
      'u-late',
      // Still ringing sorts last, and among themselves by id, so the tiles do
      // not reshuffle when a snapshot arrives in a different order.
      'u-ana',
      'u-zoe',
    ]);
  });

  it('breaks a tie on identical join times by userId, so the order is stable', () => {
    const s = active([person('u-b', { joinedAt: AT }), person('u-a', { joinedAt: AT })]);
    expect(rosterList(s).map((p) => p.userId)).toEqual(['u-a', 'u-b']);
  });

  it('splits the roster into who is in and who is still ringing', () => {
    const s = active([person(ME), person('u-ana'), invitee('u-ben'), invitee('u-cara')]);
    expect(joinedParticipants(s).map((p) => p.userId)).toEqual(['u-ana', ME]);
    expect(pendingInvitees(s).map((p) => p.userId)).toEqual(['u-ben', 'u-cara']);
  });

  it('counts only the people who actually got in', () => {
    // A room "full" of people who have not answered is a room nobody can join —
    // so a ringing invitee occupies no slot. This is the property `isRosterFull`
    // rests on, not an accident of the count.
    expect(participantCount(active([person(ME), invitee('a'), invitee('b')]))).toBe(1);
    expect(participantCount(IDLE_GROUP_CALL)).toBe(0);
    expect(participantCount(roomOf(4, 4))).toBe(4);
  });

  it('never puts us in our own mesh', () => {
    const s = active([person(ME, { host: true }), person('u-ana'), invitee('u-ben')]);
    expect(s.selfId).toBe(ME);
    const peers = meshPeers(s).map((p) => p.userId);
    expect(peers).toEqual(['u-ana']);
    expect(peers).not.toContain(ME);
    // ...even when the server sends us a roster row for ourselves twice over.
    const dup = reduce(s, { type: 'peer-joined', participant: person(ME, { host: true }) });
    expect(meshPeers(dup).map((p) => p.userId)).not.toContain(ME);
  });

  it('holds no peer connection to somebody who is only ringing', () => {
    const s = active([person(ME), invitee('u-ben')]);
    expect(meshPeers(s)).toEqual([]);
  });

  it('adds and replaces a roster row without mutating the old one', () => {
    const before = indexRoster([person('u-ana', { muted: false })]);
    const after = addParticipant(before, person('u-ana', { muted: true }));
    expect(after).not.toBe(before);
    expect(before['u-ana'].muted).toBe(false);
    expect(after['u-ana'].muted).toBe(true);
    expect(Object.keys(after)).toHaveLength(1);
  });

  it('returns the identical roster when removing somebody who was not on it', () => {
    const before = indexRoster([person('u-ana')]);
    expect(removeParticipant(before, 'u-nobody')).toBe(before);
    const after = removeParticipant(before, 'u-ana');
    expect(after).toEqual({});
    expect(before['u-ana']).toBeDefined();
  });

  it('drops a mute for somebody who is not on the roster rather than inventing a row', () => {
    // A stray state event from a peer who has since left must not put them back
    // on screen.
    const before = indexRoster([person('u-ana', { muted: false })]);
    expect(setParticipantMuted(before, 'u-ghost', true)).toBe(before);
    expect(setParticipantMuted(before, 'u-ghost', true)['u-ghost']).toBeUndefined();
  });

  it('returns the identical roster when a mute changes nothing', () => {
    const before = indexRoster([person('u-ana', { muted: true })]);
    expect(setParticipantMuted(before, 'u-ana', true)).toBe(before);
    const after = setParticipantMuted(before, 'u-ana', false);
    expect(after).not.toBe(before);
    expect(after['u-ana'].muted).toBe(false);
    expect(before['u-ana'].muted).toBe(true);
  });

  it('marks a ringing invitee as joined, once', () => {
    const before = indexRoster([invitee('u-ben')]);
    const after = markJoined(before, 'u-ben', AT);
    expect(after['u-ben'].joinedAt).toBe(AT);
    // Already in: the first join time is the real one and must not be moved by
    // a duplicate.
    expect(markJoined(after, 'u-ben', AT + 5_000)).toBe(after);
    expect(before['u-ben'].joinedAt).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe('the cap at eight', () => {
  it('is eight, and the invite cap is derived from it', () => {
    expect(MAX_GROUP_CALL_PARTICIPANTS).toBe(8);
    // The host already occupies a slot, so the most invitees that could ever fit
    // is the cap minus one — derived, so the two cannot drift.
    expect(MAX_GROUP_CALL_INVITES).toBe(MAX_GROUP_CALL_PARTICIPANTS - 1);
    expect(MAX_GROUP_CALL_INVITES).toBe(7);
  });

  it('is full at exactly eight and not at seven', () => {
    expect(isRosterFull(6)).toBe(false);
    expect(isRosterFull(7)).toBe(false);
    expect(isRosterFull(8)).toBe(true);
    // A ninth would have got in somehow; still full.
    expect(isRosterFull(9)).toBe(true);
  });

  it('takes a state as readily as a count', () => {
    expect(isRosterFull(roomOf(7))).toBe(false);
    expect(isRosterFull(roomOf(8))).toBe(true);
    expect(isRosterFull(IDLE_GROUP_CALL)).toBe(false);
  });

  it('is not full when the room is merely ringing a lot of people', () => {
    // Deliberate: a room of one with seven unanswered rings has seven free
    // slots, because none of those rings has cost anyone anything yet.
    const s = roomOf(1, 7);
    expect(participantCount(s)).toBe(1);
    expect(isRosterFull(s)).toBe(false);
    expect(remainingSlots(s)).toBe(7);
  });

  it('counts down the remaining slots and stops at zero', () => {
    expect(remainingSlots(IDLE_GROUP_CALL)).toBe(MAX_GROUP_CALL_PARTICIPANTS);
    expect(remainingSlots(roomOf(1))).toBe(7);
    expect(remainingSlots(roomOf(7))).toBe(1);
    expect(remainingSlots(roomOf(8))).toBe(0);
    // Never negative, whatever an over-full room would mean.
    expect(remainingSlots(roomOf(9))).toBe(0);
  });

  it('refuses the ninth person at the door', () => {
    expect(canJoinOpenRoom({ origin: 'community', isMember: true, participantCount: 7 })).toEqual({
      allowed: true,
    });
    expect(canJoinOpenRoom({ origin: 'community', isMember: true, participantCount: 8 })).toEqual({
      allowed: false,
      reason: 'full',
    });
  });
});

/* -------------------------------------------------------------------------- */

describe('glare — who offers to whom', () => {
  /**
   * A deliberately awkward spread of ids: sequential (so `u2` vs `u10` exercises
   * lexicographic order, which is what the rule actually uses), case-mixed,
   * cuid-shaped, non-ASCII, and the degenerate empty string. The property must
   * hold for all of them, because the rule is applied to whatever userIds the
   * database happens to hold.
   */
  const IDS = [
    ...new Set([
      ...Array.from({ length: 24 }, (_, i) => `u${i}`),
      'A',
      'a',
      'Z',
      'z',
      'zz',
      '0',
      '~',
      'ä',
      '🙂',
      '',
      'clx0000000000000000000000',
      'clx0000000000000000000001',
    ]),
  ];

  it('nobody offers to themselves', () => {
    for (const id of IDS) expect(shouldOffer(id, id)).toBe(false);
  });

  it('is total and antisymmetric over every ordered pair', () => {
    // The whole mesh rests on this: exactly one side of every pair must offer.
    // If both do, the negotiations collide and neither leg ever connects; if
    // neither does, the leg is silent forever.
    const violations: string[] = [];
    for (const a of IDS) {
      for (const b of IDS) {
        if (a === b) continue;
        if (shouldOffer(a, b) === shouldOffer(b, a)) {
          violations.push(`${JSON.stringify(a)} / ${JSON.stringify(b)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('is transitive, so no three people can form an offer cycle', () => {
    const violations: string[] = [];
    for (const a of IDS) {
      for (const b of IDS) {
        if (!shouldOffer(a, b)) continue;
        for (const c of IDS) {
          if (shouldOffer(b, c) && !shouldOffer(a, c)) {
            violations.push([a, b, c].map((v) => JSON.stringify(v)).join(' → '));
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('produces exactly one offerer per leg in a full room', () => {
    const room = Array.from({ length: MAX_GROUP_CALL_PARTICIPANTS }, (_, i) => `u-${i}`);
    let offers = 0;
    for (const self of room) {
      for (const peer of room) {
        if (self !== peer && shouldOffer(self, peer)) offers += 1;
      }
    }
    // C(8,2) = 28 legs, one offer each.
    expect(offers).toBe((MAX_GROUP_CALL_PARTICIPANTS * (MAX_GROUP_CALL_PARTICIPANTS - 1)) / 2);
  });

  it('does not depend on socket identity, so a reconnect cannot flip it', () => {
    // Same two users, evaluated any number of times, always the same answer —
    // which is the reason the rule compares userIds rather than socket ids.
    expect(shouldOffer('u-ana', 'u-ben')).toBe(true);
    expect(shouldOffer('u-ana', 'u-ben')).toBe(true);
    expect(shouldOffer('u-ben', 'u-ana')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe('who may be rung into a group call', () => {
  const MATRIX = CALL_PRIVACY_VALUES.flatMap((privacy) =>
    [true, false].flatMap((blocked) =>
      [true, false].map((calleeFollowsCaller) => ({ privacy, blocked, calleeFollowsCaller })),
    ),
  );

  it('is exactly the 1:1 rule, never a looser one', () => {
    // THE security property of this feature. A stranger who cannot ring you
    // alone must not be able to ring you by putting you in a room with somebody
    // you do follow, so a future edit that relaxes one rule and not the other
    // has to fail here.
    for (const args of MATRIX) {
      const group = canJoinGroupCall(args);
      const oneToOne = canCall(args);
      expect(group).toEqual(oneToOne);
      if (group.allowed) expect(oneToOne.allowed).toBe(true);
    }
  });

  it('lets anyone be rung when the setting is everyone', () => {
    expect(
      canJoinGroupCall({ privacy: 'everyone', blocked: false, calleeFollowsCaller: false }),
    ).toEqual({ allowed: true });
  });

  it('refuses everyone when the setting is nobody', () => {
    expect(
      canJoinGroupCall({ privacy: 'nobody', blocked: false, calleeFollowsCaller: true }),
    ).toEqual({ allowed: false, reason: 'privacy' });
  });

  it('requires the INVITEE to follow the STARTER on the default setting', () => {
    expect(
      canJoinGroupCall({ privacy: 'following', blocked: false, calleeFollowsCaller: true }),
    ).toEqual({ allowed: true });
    expect(
      canJoinGroupCall({ privacy: 'following', blocked: false, calleeFollowsCaller: false }),
    ).toEqual({ allowed: false, reason: 'privacy' });
  });

  it('lets a block beat every privacy setting', () => {
    for (const privacy of CALL_PRIVACY_VALUES) {
      expect(canJoinGroupCall({ privacy, blocked: true, calleeFollowsCaller: true })).toEqual({
        allowed: false,
        reason: 'blocked',
      });
    }
  });
});

describe('who may walk into an open room', () => {
  const OPEN_ORIGINS: readonly OpenRoomOrigin[] = ['community', 'party'];

  it('admits a member of either kind of room', () => {
    for (const origin of OPEN_ORIGINS) {
      expect(canJoinOpenRoom({ origin, isMember: true, participantCount: 0 })).toEqual({
        allowed: true,
      });
    }
  });

  it('refuses a non-member', () => {
    for (const origin of OPEN_ORIGINS) {
      expect(canJoinOpenRoom({ origin, isMember: false, participantCount: 0 })).toEqual({
        allowed: false,
        reason: 'not-member',
      });
    }
  });

  it('tells a banned member they are banned, not that they are a stranger', () => {
    expect(
      canJoinOpenRoom({ origin: 'community', isMember: true, banned: true, participantCount: 0 }),
    ).toEqual({ allowed: false, reason: 'blocked' });
  });

  it('checks the ban before membership and both before capacity', () => {
    // Somebody who was never getting in must not be told the room is merely
    // full, which would be an invitation to keep retrying.
    expect(
      canJoinOpenRoom({ origin: 'party', isMember: false, banned: true, participantCount: 8 }),
    ).toEqual({ allowed: false, reason: 'blocked' });
    expect(
      canJoinOpenRoom({ origin: 'party', isMember: false, banned: false, participantCount: 8 }),
    ).toEqual({ allowed: false, reason: 'not-member' });
  });

  it('treats an absent ban flag as not banned', () => {
    expect(canJoinOpenRoom({ origin: 'party', isMember: true, participantCount: 1 })).toEqual({
      allowed: true,
    });
  });
});

/* -------------------------------------------------------------------------- */

/**
 * The Prisma enums these map onto, read out of the schema rather than copied.
 *
 * Copying them would make the assertions below tautological — they would prove
 * the mapping matches a list in this file, which is not the thing that can
 * break. Reading the schema means a member renamed in the database fails here.
 */
const SCHEMA = readFileSync(
  path.join(path.resolve(__dirname, '..', '..'), 'prisma', 'schema.prisma'),
  'utf8',
);

function prismaEnumMembers(name: string): string[] {
  const block = new RegExp(`\\benum ${name} \\{\\n([\\s\\S]*?)\\n\\}`).exec(SCHEMA);
  if (!block) throw new Error(`enum ${name} not found in prisma/schema.prisma`);
  return block[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));
}

/**
 * Every member of the two reason unions, as values.
 *
 * `satisfies` is what gives this teeth: the object must have exactly one key per
 * union member, so adding a reason to `GroupCallEndReason` without adding it
 * here is a typecheck failure, and the mapping tests below then run against it.
 */
const END_REASONS = Object.keys({
  'host-ended': true,
  left: true,
  empty: true,
  declined: true,
  unanswered: true,
  failed: true,
  full: true,
  gone: true,
  busy: true,
  blocked: true,
  privacy: true,
  'not-member': true,
} satisfies Record<GroupCallEndReason, true>) as GroupCallEndReason[];

const LEAVE_REASONS = Object.keys({
  left: true,
  declined: true,
  unanswered: true,
  failed: true,
} satisfies Record<GroupCallLeaveReason, true>) as GroupCallLeaveReason[];

describe('persistence mapping', () => {
  it('maps every wire origin onto a real GroupCallOrigin member', () => {
    const members = prismaEnumMembers('GroupCallOrigin');
    expect(members).toHaveLength(GROUP_CALL_ORIGINS.length);
    for (const origin of GROUP_CALL_ORIGINS) {
      expect(members).toContain(persistedOrigin(origin));
    }
    expect(persistedOrigin('adhoc')).toBe('ADHOC');
    expect(persistedOrigin('community')).toBe('COMMUNITY');
    expect(persistedOrigin('party')).toBe('PARTY');
  });

  it('maps every end reason onto a real GroupCallStatus member', () => {
    const members = prismaEnumMembers('GroupCallStatus');
    expect(END_REASONS).toHaveLength(12);
    for (const reason of END_REASONS) {
      expect(members).toContain(persistedStatus(reason, true));
      expect(members).toContain(persistedStatus(reason, false));
    }
  });

  it('records a room somebody else reached as ENDED, whatever the reason', () => {
    for (const reason of END_REASONS) {
      expect(persistedStatus(reason, true)).toBe('ENDED');
    }
  });

  it('separates a call that did not happen from one that did', () => {
    expect(persistedStatus('declined', false)).toBe('DECLINED');
    expect(persistedStatus('unanswered', false)).toBe('MISSED');
    expect(persistedStatus('failed', false)).toBe('FAILED');
    // A room nobody else reached, closed by the host or by its own emptiness.
    expect(persistedStatus('host-ended', false)).toBe('MISSED');
    expect(persistedStatus('left', false)).toBe('MISSED');
    expect(persistedStatus('empty', false)).toBe('MISSED');
  });

  it('does not leak a refusal into anyone history', () => {
    // Same reasoning as the 1:1 machine: a status of "you were blocked" in a
    // history row tells the caller their block was noticed.
    for (const reason of ['blocked', 'privacy', 'not-member', 'busy', 'full', 'gone'] as const) {
      expect(persistedStatus(reason, false)).toBe('MISSED');
    }
  });

  it('never persists a live status for a room that has ended', () => {
    // RINGING and ACTIVE are states a room is in, not outcomes it can end with.
    for (const reason of END_REASONS) {
      for (const everJoined of [true, false]) {
        expect(['RINGING', 'ACTIVE']).not.toContain(persistedStatus(reason, everJoined));
      }
    }
  });

  it('maps every participant outcome onto a real GroupCallParticipantStatus member', () => {
    const members = prismaEnumMembers('GroupCallParticipantStatus');
    for (const joined of [true, false]) {
      for (const left of [true, false]) {
        expect(members).toContain(persistedParticipantStatus({ joined, left }));
        for (const reason of END_REASONS) {
          expect(members).toContain(persistedParticipantStatus({ joined, left, reason }));
        }
      }
    }
  });

  it('lets what actually happened beat the reason', () => {
    // Somebody who was in the room is JOINED or LEFT even if the room itself
    // ended in a refusal for somebody else.
    expect(persistedParticipantStatus({ joined: true, left: false })).toBe('JOINED');
    expect(persistedParticipantStatus({ joined: true, left: true })).toBe('LEFT');
    expect(persistedParticipantStatus({ joined: true, left: true, reason: 'declined' })).toBe(
      'LEFT',
    );
    expect(persistedParticipantStatus({ joined: true, left: false, reason: 'unanswered' })).toBe(
      'JOINED',
    );
  });

  it('describes a never-joined row by the reason they are gone', () => {
    expect(persistedParticipantStatus({ joined: false, left: true, reason: 'declined' })).toBe(
      'DECLINED',
    );
    expect(persistedParticipantStatus({ joined: false, left: true, reason: 'unanswered' })).toBe(
      'MISSED',
    );
    expect(persistedParticipantStatus({ joined: false, left: true, reason: 'failed' })).toBe(
      'FAILED',
    );
    // No reason at all, and every reason with no per-person meaning, stays at
    // the truthful minimum: they were invited.
    expect(persistedParticipantStatus({ joined: false, left: false })).toBe('INVITED');
    expect(persistedParticipantStatus({ joined: false, left: false, reason: 'host-ended' })).toBe(
      'INVITED',
    );
  });

  it('handles every leave reason a participant can be dropped for', () => {
    const members = prismaEnumMembers('GroupCallParticipantStatus');
    expect(LEAVE_REASONS).toHaveLength(4);
    for (const reason of LEAVE_REASONS) {
      expect(members).toContain(persistedParticipantStatus({ joined: false, left: true, reason }));
      expect(members).toContain(persistedParticipantStatus({ joined: true, left: true, reason }));
    }
    // `left` is the one leave reason with no never-joined meaning — somebody who
    // never got in did not leave — so it falls back to INVITED rather than
    // claiming they were in the room.
    expect(persistedParticipantStatus({ joined: false, left: true, reason: 'left' })).toBe(
      'INVITED',
    );
  });
});

/* -------------------------------------------------------------------------- */

describe('shared with the 1:1 machine', () => {
  it('re-exports the call timer rather than growing a second copy', () => {
    // Two implementations of "how long has this been going" is how one surface
    // ends up a second behind another.
    expect(groupDurationSeconds).toBe(durationSeconds);
    expect(groupFormatDuration).toBe(formatDuration);
    expect(groupDurationSeconds(AT, AT + 90_400)).toBe(90);
    expect(groupFormatDuration(3661)).toBe('1:01:01');
  });
});

/* -------------------------------------------------------------------------- */
/* Races. Every one of these is a real thing that happens in a room of eight.  */
/* -------------------------------------------------------------------------- */

describe('races', () => {
  it('ignores a second start while already busy', () => {
    for (const phase of ['incoming', 'joining', 'active'] as const) {
      const s = stateIn(phase);
      expect(
        reduce(s, {
          type: 'start',
          origin: 'party',
          originId: 'p1',
          conversationId: null,
          selfId: ME,
        }),
      ).toBe(s);
    }
  });

  it('ignores an incoming ring while already in a room', () => {
    // The server sends BUSY to the caller; our own room must not be clobbered
    // mid-conversation.
    for (const phase of ['incoming', 'joining', 'active'] as const) {
      const s = stateIn(phase);
      expect(
        reduce(s, {
          type: 'incoming',
          callId: 'gc9',
          origin: 'adhoc',
          originId: null,
          conversationId: null,
          hostId: 'u-other',
          selfId: ME,
          participants: [person('u-other', { host: true })],
        }),
      ).toBe(s);
    }
  });

  it('ignores an accept aimed at a ring that has since been replaced', () => {
    // A stale click on a card that is no longer the one on screen must not put
    // us in a different room than the one the user is looking at.
    const ringing = incoming();
    expect(reduce(ringing, { type: 'join', callId: 'gc9' })).toBe(ringing);
  });

  it('ignores a duplicate join while already joining or in the room', () => {
    for (const s of [starting(), active()]) {
      expect(reduce(s, { type: 'join', callId: CALL_ID })).toBe(s);
      expect(reduce(s, { type: 'join', callId: 'gc9' })).toBe(s);
    }
  });

  it('ignores a roster snapshot for a foreign call', () => {
    // Two rooms in one tab is not supposed to happen, but a late snapshot from
    // the room we just left is routine.
    const live = active();
    expect(
      reduce(live, { type: 'roster', callId: 'gc9', participants: [person('u-nobody')] }),
    ).toBe(live);
  });

  it('does not resurrect a call with a `joined` that arrives after we gave up', () => {
    // Hung up during the round trip, or the mic prompt failed, and the server
    // has since put us on the roster. Sitting in seven other people's tiles as
    // a participant who is not there is the failure this prevents.
    const gaveUp = reduce(starting(), { type: 'end', reason: 'left' });
    const late = reduce(gaveUp, {
      type: 'joined',
      callId: CALL_ID,
      origin: 'adhoc',
      originId: null,
      conversationId: 'conv1',
      hostId: ME,
      selfId: ME,
      participants: DEFAULT_ROSTER,
      at: AT,
    });
    expect(late).toBe(gaveUp);
    expect(late.phase).toBe('ended');
    expect(late.endReason).toBe('left');
  });

  it('takes the room named by `joined`, even if we thought we were joining another', () => {
    // Current behaviour, and deliberate as far as this layer goes: a `start`
    // has no id to compare against, so the machine cannot tell a corrected id
    // from a foreign one. The callId guard is one layer up, in
    // `lib/groupcall/store.ts` (`s.callId !== null && s.callId !== payload.callId`),
    // which is the only place that knows whether we named a room ourselves.
    const accepted = reduce(incoming(), { type: 'join', callId: CALL_ID });
    const live = reduce(accepted, {
      type: 'joined',
      callId: 'gc-different',
      origin: 'adhoc',
      originId: null,
      conversationId: null,
      hostId: HOST,
      selfId: ME,
      participants: [person(HOST, { host: true })],
      at: AT,
    });
    expect(live.callId).toBe('gc-different');
  });

  it('takes a duplicate peer-joined without cloning the person', () => {
    // Two hubs, or a snapshot racing a delta, deliver the same arrival twice.
    // Idempotent by construction: the roster is keyed by userId, so the second
    // one replaces the row rather than adding a second. (The state object is
    // still reallocated — this is idempotent in content, not in reference.)
    const ana = person('u-ana');
    const once = reduce(active([person(ME, { host: true })]), {
      type: 'peer-joined',
      participant: ana,
    });
    const twice = reduce(once, { type: 'peer-joined', participant: ana });
    expect(Object.keys(twice.participants)).toHaveLength(2);
    expect(twice.participants).toEqual(once.participants);
    expect(rosterList(twice)).toEqual(rosterList(once));
  });

  it('lets a later peer-joined correct the row it duplicates', () => {
    // The invite-then-answer sequence: the same person arrives first as a
    // ringing invitee and then as somebody who is actually in.
    const withInvitee = active([person(ME, { host: true }), invitee('u-ben')]);
    expect(meshPeers(withInvitee)).toEqual([]);
    const answered = reduce(withInvitee, {
      type: 'peer-joined',
      participant: person('u-ben', { joinedAt: AT + 3_000 }),
    });
    expect(Object.keys(answered.participants)).toHaveLength(2);
    expect(meshPeers(answered).map((p) => p.userId)).toEqual(['u-ben']);
  });

  it('ignores a peer-left for somebody who is already gone', () => {
    const live = active();
    const gone = reduce(live, { type: 'peer-left', userId: 'u-ana' });
    expect(gone).not.toBe(live);
    // Same departure delivered twice — the second changes nothing at all, so a
    // store keyed on reference equality re-renders nothing.
    expect(reduce(gone, { type: 'peer-left', userId: 'u-ana' })).toBe(gone);
  });

  it('drops a mute that arrives after its sender left', () => {
    // Routine during churn, not an edge case: somebody hangs up mid-sentence
    // and their last state event lands after their departure.
    const live = active();
    const gone = reduce(live, { type: 'peer-left', userId: 'u-ana' });
    const late = reduce(gone, { type: 'peer-muted', userId: 'u-ana', muted: true });
    expect(late).toBe(gone);
    expect(late.participants['u-ana']).toBeUndefined();
  });

  it('guards a peer mute on roster membership rather than on the phase', () => {
    // Current behaviour: `peer-muted` has no phase check, so a mute for somebody
    // still on a dead room's roster applies. Harmless — the roster is only
    // decoration once the room has ended — but it is what the machine does.
    const over = reduce(active(), { type: 'end', reason: 'host-ended' });
    const muted = reduce(over, { type: 'peer-muted', userId: 'u-ana', muted: true });
    expect(muted.participants['u-ana'].muted).toBe(true);
    expect(muted.phase).toBe('ended');
    // And it is still refused for somebody not on that roster.
    expect(reduce(over, { type: 'peer-muted', userId: 'u-ghost', muted: true })).toBe(over);
  });

  it('keeps the FIRST end reason when the room ends twice at once', () => {
    // We left; the host ended it a moment later. The user already saw "you left
    // the call", and flipping it to "the host ended the call" would be a lie
    // about something they were looking at.
    const left = reduce(active(), { type: 'end', reason: 'left' });
    const alsoEnded = reduce(left, { type: 'end', reason: 'host-ended' });
    expect(alsoEnded).toBe(left);
    expect(alsoEnded.endReason).toBe('left');
  });

  it('never ends an idle room', () => {
    expect(reduce(IDLE_GROUP_CALL, { type: 'end', reason: 'host-ended' })).toBe(IDLE_GROUP_CALL);
  });

  it('can end from any live phase', () => {
    for (const phase of ['incoming', 'joining', 'active'] as const) {
      const ended = reduce(stateIn(phase), { type: 'end', reason: 'gone' });
      expect(ended.phase).toBe('ended');
      expect(ended.endReason).toBe('gone');
    }
  });

  it('does nothing when told to mark somebody who is not on the roster as joined', () => {
    // The optimistic path racing the server's roster: we saw an answer for
    // somebody the snapshot has since dropped.
    const roster = indexRoster([person(ME), invitee('u-ben')]);
    expect(markJoined(roster, 'u-nobody', AT)).toBe(roster);
    expect(markJoined(roster, 'u-nobody', AT)['u-nobody']).toBeUndefined();
  });

  it('survives the whole churn of a room without leaking a row', () => {
    // Eight arrivals, four departures, a snapshot that disagrees, and a mute
    // for somebody the snapshot dropped.
    let s = active([person(ME, { host: true })]);
    for (let i = 0; i < 7; i += 1) {
      s = reduce(s, { type: 'peer-joined', participant: person(`u-${i}`, { joinedAt: AT + i }) });
    }
    expect(participantCount(s)).toBe(MAX_GROUP_CALL_PARTICIPANTS);
    expect(isRosterFull(s)).toBe(true);
    expect(meshPeers(s)).toHaveLength(MAX_GROUP_CALL_PARTICIPANTS - 1);

    for (let i = 0; i < 4; i += 1) s = reduce(s, { type: 'peer-left', userId: `u-${i}` });
    expect(participantCount(s)).toBe(4);
    expect(remainingSlots(s)).toBe(4);

    s = reduce(s, {
      type: 'roster',
      callId: CALL_ID,
      participants: [person(ME, { host: true }), person('u-4', { joinedAt: AT + 4 })],
    });
    expect(rosterList(s).map((p) => p.userId)).toEqual([ME, 'u-4']);
    expect(reduce(s, { type: 'peer-muted', userId: 'u-5', muted: true })).toBe(s);
  });
});
