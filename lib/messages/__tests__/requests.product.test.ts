import { describe, expect, it } from 'vitest';
import {
  REQUEST_COOLDOWN_MS,
  REQUEST_DAILY_CAP,
  cooldownActive,
  cooldownEndsAt,
  decideGate,
  gateRefusalCopy,
  hiddenFromRecipient,
  privacyAllows,
  requestContentProblem,
  requestOut,
  senderRequestState,
  type DmPrivacyValue,
  type GateFacts,
  type RequestFacts,
} from '@/lib/messages/requests';

/**
 * The decision table behind message requests (sprint 04 #16), pure. The route and
 * database half is in `message-requests.test.ts`.
 */

const NOW = new Date('2026-11-24T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function facts(over: Partial<GateFacts> = {}): GateFacts {
  return {
    senderId: 'sender',
    recipientId: 'recipient',
    privacy: 'FOLLOWERS',
    recipientFollowsSender: false,
    requestsOn: true,
    request: null,
    hasHistory: false,
    sentInWindow: 0,
    now: NOW,
    ...over,
  };
}

const row = (over: Partial<RequestFacts> = {}): RequestFacts => ({
  senderId: 'sender',
  recipientId: 'recipient',
  status: 'pending',
  decidedAt: null,
  ...over,
});

describe('privacyAllows', () => {
  it('is the recipient’s DM privacy on its own', () => {
    expect(privacyAllows('EVERYONE', false)).toBe(true);
    expect(privacyAllows('FOLLOWERS', true)).toBe(true);
    expect(privacyAllows('FOLLOWERS', false)).toBe(false);
    expect(privacyAllows('NONE', true)).toBe(false);
  });
});

describe('decideGate: privacy x follow x switch', () => {
  const cases: {
    privacy: DmPrivacyValue;
    follows: boolean;
    on: boolean;
    expected: string;
  }[] = [
    { privacy: 'EVERYONE', follows: false, on: false, expected: 'allowed' },
    { privacy: 'EVERYONE', follows: false, on: true, expected: 'allowed' },
    { privacy: 'FOLLOWERS', follows: true, on: false, expected: 'allowed' },
    { privacy: 'FOLLOWERS', follows: true, on: true, expected: 'allowed' },
    { privacy: 'FOLLOWERS', follows: false, on: false, expected: 'refused:FOLLOWERS' },
    { privacy: 'FOLLOWERS', follows: false, on: true, expected: 'request' },
    { privacy: 'NONE', follows: true, on: false, expected: 'refused:NONE' },
    { privacy: 'NONE', follows: false, on: false, expected: 'refused:NONE' },
    { privacy: 'NONE', follows: true, on: true, expected: 'request' },
    { privacy: 'NONE', follows: false, on: true, expected: 'request' },
  ];
  for (const c of cases) {
    it(`${c.privacy}, follows ${c.follows}, switch ${c.on ? 'on' : 'off'} -> ${c.expected}`, () => {
      const d = decideGate(
        facts({ privacy: c.privacy, recipientFollowsSender: c.follows, requestsOn: c.on }),
      );
      const label = d.outcome === 'refused' ? `refused:${d.reason}` : d.outcome;
      expect(label).toBe(c.expected);
    });
  }

  it('answers a request with the privacy the recipient set', () => {
    expect(decideGate(facts({ privacy: 'NONE' }))).toEqual({ outcome: 'request', privacy: 'NONE' });
    expect(decideGate(facts({ privacy: 'FOLLOWERS' }))).toEqual({
      outcome: 'request',
      privacy: 'FOLLOWERS',
    });
  });

  it('always allows a note to yourself', () => {
    expect(
      decideGate(facts({ senderId: 'a', recipientId: 'a', privacy: 'NONE', requestsOn: false })),
    ).toEqual({ outcome: 'allowed' });
  });
});

describe('decideGate: request state', () => {
  it('refuses everything into a pending request, from either side, whatever the privacy says', () => {
    expect(decideGate(facts({ request: row() }))).toEqual({ outcome: 'refused', reason: 'pending' });
    expect(decideGate(facts({ request: row(), privacy: 'EVERYONE' }))).toEqual({
      outcome: 'refused',
      reason: 'pending',
    });
    expect(
      decideGate(facts({ senderId: 'recipient', recipientId: 'sender', request: row() })),
    ).toEqual({ outcome: 'refused', reason: 'incoming' });
  });

  it('lifts the privacy rule for an accepted pair, both ways', () => {
    const accepted = row({ status: 'accepted', decidedAt: NOW });
    expect(decideGate(facts({ privacy: 'NONE', requestsOn: false, request: accepted }))).toEqual({
      outcome: 'allowed',
    });
    expect(
      decideGate(
        facts({
          senderId: 'recipient',
          recipientId: 'sender',
          privacy: 'NONE',
          requestsOn: false,
          request: accepted,
        }),
      ),
    ).toEqual({ outcome: 'allowed' });
  });

  it('keeps a declined sender out for 30 days with the privacy refusal, then lets them ask again', () => {
    const declined = (ago: number) =>
      row({ status: 'declined', decidedAt: new Date(NOW.getTime() - ago) });
    expect(decideGate(facts({ request: declined(DAY) }))).toEqual({
      outcome: 'refused',
      reason: 'FOLLOWERS',
    });
    expect(decideGate(facts({ privacy: 'NONE', request: declined(29 * DAY) }))).toEqual({
      outcome: 'refused',
      reason: 'NONE',
    });
    expect(decideGate(facts({ request: declined(REQUEST_COOLDOWN_MS) })).outcome).toBe('request');
    expect(decideGate(facts({ request: declined(31 * DAY) })).outcome).toBe('request');
  });

  it('a decline only matters while the privacy rule still refuses', () => {
    const declined = row({ status: 'declined', decidedAt: new Date(NOW.getTime() - DAY) });
    expect(decideGate(facts({ request: declined, recipientFollowsSender: true })).outcome).toBe(
      'allowed',
    );
  });

  it('turning the switch off turns a would-be request into the plain refusal', () => {
    expect(decideGate(facts({ requestsOn: false }))).toEqual({
      outcome: 'refused',
      reason: 'FOLLOWERS',
    });
  });

  it('lets the sender reuse their own draft, but not someone else’s request', () => {
    expect(decideGate(facts({ request: row({ status: 'draft' }) })).outcome).toBe('request');
    expect(
      decideGate(facts({ request: row({ status: 'draft', senderId: 'recipient', recipientId: 'sender' }) })),
    ).toEqual({ outcome: 'refused', reason: 'FOLLOWERS' });
  });

  it('refuses a chat that already has history and no request (it was never a request)', () => {
    expect(decideGate(facts({ hasHistory: true }))).toEqual({
      outcome: 'refused',
      reason: 'FOLLOWERS',
    });
  });

  it('caps new requests at 20 per sender per day', () => {
    expect(decideGate(facts({ sentInWindow: REQUEST_DAILY_CAP - 1 })).outcome).toBe('request');
    expect(decideGate(facts({ sentInWindow: REQUEST_DAILY_CAP }))).toEqual({
      outcome: 'refused',
      reason: 'cap',
    });
  });
});

describe('cooldown', () => {
  it('runs 30 days from the decline', () => {
    const decided = new Date('2026-11-01T00:00:00Z');
    expect(cooldownEndsAt(decided).getTime() - decided.getTime()).toBe(30 * DAY);
    expect(cooldownActive(decided, new Date(decided.getTime() + 30 * DAY - 1))).toBe(true);
    expect(cooldownActive(decided, new Date(decided.getTime() + 30 * DAY))).toBe(false);
    expect(cooldownActive(null, NOW)).toBe(false);
  });
});

describe('what each side sees', () => {
  it('hides a draft or pending request from its recipient only', () => {
    for (const status of ['draft', 'pending']) {
      expect(hiddenFromRecipient(row({ status }), 'recipient')).toBe(true);
      expect(hiddenFromRecipient(row({ status }), 'sender')).toBe(false);
    }
    expect(hiddenFromRecipient(row({ status: 'accepted' }), 'recipient')).toBe(false);
    expect(hiddenFromRecipient(row({ status: 'declined' }), 'recipient')).toBe(false);
    expect(hiddenFromRecipient(null, 'recipient')).toBe(false);
  });

  it('shows the sender "sent" for a pending and a declined request alike', () => {
    const refused = { outcome: 'refused', reason: 'pending' } as const;
    expect(senderRequestState(refused, row({ status: 'pending' }), 'sender')).toBe('sent');
    expect(senderRequestState(refused, row({ status: 'declined' }), 'sender')).toBe('sent');
    expect(senderRequestState(refused, row({ status: 'accepted' }), 'sender')).toBeNull();
    expect(senderRequestState({ outcome: 'allowed' }, null, 'sender')).toBeNull();
    expect(senderRequestState({ outcome: 'request', privacy: 'NONE' }, null, 'sender')).toBe(
      'compose',
    );
  });

  it('shows the recipient no composer state at all', () => {
    expect(
      senderRequestState({ outcome: 'refused', reason: 'incoming' }, row(), 'recipient'),
    ).toBeNull();
    expect(requestOut(row({ status: 'pending' }), 'recipient')).toBe(false);
  });
});

describe('a request carries one text message', () => {
  it('refuses a GIF or an image, and an empty message', () => {
    expect(requestContentProblem({ content: 'hello' })).toBeNull();
    expect(requestContentProblem({ content: 'hello', gifUrl: 'https://x/y.gif' })).toBe('text-only');
    expect(requestContentProblem({ content: 'hello', imageUrls: ['/a.png'] })).toBe('text-only');
    expect(requestContentProblem({ content: '   ' })).toBe('empty');
    expect(requestContentProblem({})).toBe('empty');
  });

  it('has refusal copy that does not say whether a request was declined', () => {
    expect(gateRefusalCopy('pending')).toMatch(/waiting/);
    expect(gateRefusalCopy('cap')).toMatch(/too many/);
    expect(gateRefusalCopy('incoming')).toMatch(/Accept it from Requests/);
  });
});
