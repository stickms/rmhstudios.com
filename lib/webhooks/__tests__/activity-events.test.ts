import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock('@/lib/webhooks/emit.server', () => ({ emitWebhookEvent: m.emit }));

import {
  ACTIVITY_EVENTS,
  ACTIVITY_PAYLOAD_KEYS,
  buildHighlightCreatedData,
  buildMatchSettledData,
  buildReadingFinishedData,
  buildReleaseData,
  buildRsvpData,
  rsvpPayloadStatus,
} from '@/lib/webhooks/activity-events';
import { emitActivity, emitMatchSettled, emitRsvpChanged } from '@/lib/webhooks/activity-emit.server';
import { WEBHOOK_EVENT_NAMES, WEBHOOK_EVENTS } from '@/lib/webhooks/events';

const at = new Date('2026-11-22T10:00:00.000Z');
const keys = (o: object) => Object.keys(o).sort();
const allowed = (e: keyof typeof ACTIVITY_PAYLOAD_KEYS) => [...ACTIVITY_PAYLOAD_KEYS[e]].sort();

beforeEach(() => {
  m.emit.mockReset();
  m.emit.mockResolvedValue(undefined);
});

describe('activity event catalog', () => {
  it('registers five events in four groups, shown in the catalog', () => {
    expect(ACTIVITY_EVENTS.map((e) => e.name)).toEqual([
      'build.released',
      'event.rsvp_changed',
      'reading.finished',
      'highlight.created',
      'tournament.match_settled',
    ]);
    expect(new Set(ACTIVITY_EVENTS.map((e) => e.group))).toEqual(
      new Set(['builds', 'events', 'reading', 'tournaments']),
    );
    for (const e of ACTIVITY_EVENTS) {
      expect(WEBHOOK_EVENT_NAMES).toContain(e.name);
      expect(WEBHOOK_EVENTS.find((x) => x.name === e.name)?.group).toBe(e.group);
    }
    // The earlier events are kept.
    expect(WEBHOOK_EVENT_NAMES).toEqual(expect.arrayContaining(['post.created', 'personal_best.created']));
  });
});

describe('payload key allowlists', () => {
  it('build.released', () => {
    const d = buildReleaseData({ buildSlug: 's', version: '1.0', title: 'T', releasedAt: at });
    expect(keys(d)).toEqual(allowed('build.released'));
    expect(d.releasedAt).toBe(at.toISOString());
  });
  it('event.rsvp_changed', () => {
    expect(keys(buildRsvpData({ eventId: 'e', status: 'going' }))).toEqual(allowed('event.rsvp_changed'));
    expect(buildRsvpData({ eventId: 'e', status: 'maybe' }).occurrenceAt).toBeNull();
    expect(buildRsvpData({ eventId: 'e', occurrenceAt: at, status: 'maybe' }).occurrenceAt).toBe(at.toISOString());
  });
  it('reading.finished', () => {
    const d = buildReadingFinishedData({ docKind: 'library', docKey: 'k', title: 'T', finishedAt: at });
    expect(keys(d)).toEqual(allowed('reading.finished'));
  });
  it('highlight.created carries no text or note even when given extras', () => {
    const input = {
      highlightId: 'h',
      docKind: 'blog',
      docKey: 'k',
      createdAt: at,
      exact: 'secret text',
      note: 'private note',
    };
    const d = buildHighlightCreatedData(input);
    expect(keys(d)).toEqual(allowed('highlight.created'));
    expect(JSON.stringify(d)).not.toMatch(/secret text|private note/);
  });
  it('tournament.match_settled has no opponent identity', () => {
    const d = buildMatchSettledData({ tournamentId: 't', matchId: 'm', round: 1, result: 'won', settledAt: at });
    expect(keys(d)).toEqual(allowed('tournament.match_settled'));
  });
  it('maps RSVP statuses', () => {
    expect(rsvpPayloadStatus('waitlist')).toBe('waitlisted');
    expect(rsvpPayloadStatus('none')).toBe('not_going');
    expect(rsvpPayloadStatus('going')).toBe('going');
  });
});

describe('emitting', () => {
  it('a failed queue never throws into the caller', async () => {
    m.emit.mockRejectedValue(new Error('queue down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(emitRsvpChanged('u1', { eventId: 'e', status: 'going' })).resolves.toBeUndefined();
    await expect(
      emitActivity('u1', 'x', () => {
        throw new Error('bad payload');
      }),
    ).resolves.toBeUndefined();
    err.mockRestore();
  });

  it('settle emits one event per player with the right result and no one else named', async () => {
    const db = {
      tournamentEntrant: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'eA', userId: 'userA' },
          { id: 'eB', userId: 'userB' },
        ]),
      },
    };
    await emitMatchSettled(db, {
      tournamentId: 't1',
      matchId: 'm1',
      round: 2,
      winnerEntrantId: 'eB',
      loserEntrantId: 'eA',
      settledAt: at,
    });
    expect(m.emit).toHaveBeenCalledTimes(2);
    const byUser = Object.fromEntries(m.emit.mock.calls.map((c) => [c[0], c]));
    expect(byUser.userB[1]).toBe('tournament.match_settled');
    expect(byUser.userB[2].result).toBe('won');
    expect(byUser.userA[2].result).toBe('lost');
    for (const c of m.emit.mock.calls) {
      expect(keys(c[2])).toEqual(allowed('tournament.match_settled'));
      expect(JSON.stringify(c[2])).not.toMatch(/user[AB]|eA|eB/);
    }
  });

  it('a bye emits nothing, and a failed lookup does not throw', async () => {
    const db = { tournamentEntrant: { findMany: vi.fn().mockRejectedValue(new Error('db')) } };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await emitMatchSettled(db, {
      tournamentId: 't',
      matchId: 'm',
      round: 1,
      winnerEntrantId: 'eA',
      loserEntrantId: null,
      settledAt: at,
    });
    expect(db.tournamentEntrant.findMany).not.toHaveBeenCalled();
    await expect(
      emitMatchSettled(db, {
        tournamentId: 't',
        matchId: 'm',
        round: 1,
        winnerEntrantId: 'eA',
        loserEntrantId: 'eB',
        settledAt: at,
      }),
    ).resolves.toBeUndefined();
    expect(m.emit).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
