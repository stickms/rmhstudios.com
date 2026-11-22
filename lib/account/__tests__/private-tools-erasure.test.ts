import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

/**
 * Sprint 08 19: the member's profile extras, saved places, ladder data, recipes, inbox arrangement, mutes, rivals and
 * characters are erased with the account, each by the member's own id (both columns for the two-direction tables),
 * and nothing else is touched. The delete request removes the pronunciation clip's stored object.
 */

interface Op {
  model: string;
  method: string;
  args: {
    where?: Record<string, unknown>;
    data?: unknown;
  };
}

const h = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => ({
          model: name,
          method,
          args,
        }),
      },
    );
  const prismaMock = new Proxy(
    {
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    } as Record<string, unknown>,
    {
      get: (t, key: string) => (key in t ? t[key] : model(key)),
    },
  );
  return {
    prismaMock,
    deleteObject: vi.fn(async (_key: string) => undefined),
    calls: [] as string[],
    plus: {
      pronunciationKey: 'profile-pronunciation/u1.webm',
    } as {
      pronunciationKey: string | null;
    } | null,
  };
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: h.prismaMock,
}));
vi.mock('@/lib/storage/s3.server', () => ({
  deleteObject: h.deleteObject,
}));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/email/send.server', () => ({
  sendEmail: vi.fn(async () => undefined),
}));
vi.mock('@/lib/account/deletion.server', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  scheduleDeletion: vi.fn(async () => new Date('2026-12-22')),
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { privateDataErasureOps } from '@/lib/account/erasure-private.server';
import { ERASURE_REGISTRY, TODO_CEILING } from '@/lib/account/erasure-registry';

const accessor = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

/** Model, then the exact `where` the operation must carry. */
const EXPECTED: Array<[string, Record<string, unknown>]> = [
  [
    'ProfileLink',
    {
      userId: 'user-1',
    },
  ],
  [
    'ProfilePlus',
    {
      userId: 'user-1',
    },
  ],
  [
    'ProfileLayout',
    {
      userId: 'user-1',
    },
  ],
  [
    'ProfileStamp',
    {
      userId: 'user-1',
    },
  ],
  [
    'LoadoutPreset',
    {
      userId: 'user-1',
    },
  ],
  [
    'LadderJobMatch',
    {
      userId: 'user-1',
    },
  ],
  [
    'LadderResumeReview',
    {
      userId: 'user-1',
    },
  ],
  [
    'LadderAiTask',
    {
      userId: 'user-1',
    },
  ],
  [
    'LadderReferralRequest',
    {
      applicantId: 'user-1',
    },
  ],
  [
    'LadderReferralOffer',
    {
      userId: 'user-1',
    },
  ],
  [
    'DevRecipe',
    {
      userId: 'user-1',
    },
  ],
  [
    'RideSavedPlace',
    {
      userId: 'user-1',
    },
  ],
  [
    'HomeFavorite',
    {
      userId: 'user-1',
    },
  ],
  [
    'HomeWatch',
    {
      userId: 'user-1',
    },
  ],
  [
    'BlogAnnouncementSeen',
    {
      userId: 'user-1',
    },
  ],
  [
    'ReadingShelfEntry',
    {
      userId: 'user-1',
    },
  ],
  [
    'DiscordWatchAlert',
    {
      userId: 'user-1',
    },
  ],
  [
    'ExperimentExposure',
    {
      userId: 'user-1',
    },
  ],
  [
    'SiteIdempotencyKey',
    {
      userId: 'user-1',
    },
  ],
  [
    'ChatFolder',
    {
      userId: 'user-1',
    },
  ],
  [
    'DirectMessageHide',
    {
      userId: 'user-1',
    },
  ],
  [
    'OfficeHoursConfig',
    {
      userId: 'user-1',
    },
  ],
  [
    'AvailabilityPollInvitee',
    {
      userId: 'user-1',
    },
  ],
  [
    'CallMute',
    {
      userId: 'user-1',
    },
  ],
  [
    'CallMute',
    {
      mutedUserId: 'user-1',
    },
  ],
  [
    'ArcadeRival',
    {
      userId: 'user-1',
    },
  ],
  [
    'ArcadeRival',
    {
      rivalUserId: 'user-1',
    },
  ],
  [
    'FortuneCookie',
    {
      userId: 'user-1',
    },
  ],
  [
    'RmhCharacter',
    {
      userId: 'user-1',
    },
  ],
];

describe('privateDataErasureOps', () => {
  const ops = privateDataErasureOps('user-1') as unknown as Op[];

  it('deletes each table by the member id, both columns where two directions exist', () => {
    expect(ops.map((o) => [o.model, o.args.where])).toEqual(EXPECTED.map(([m, w]) => [accessor(m), w]));
    for (const o of ops) expect(o.method).toBe('deleteMany');
  });

  it('touches nothing else: no Stamp, no update, no raw SQL', () => {
    expect(ops.some((o) => o.model === 'stamp')).toBe(false);
    expect(ops.every((o) => o.method === 'deleteMany')).toBe(true);
  });

  it('runs inside anonymizeAccount, and leaves a deleted member another member own data alone', async () => {
    const fn = h.prismaMock.$transaction as ReturnType<typeof vi.fn>;
    fn.mockClear();
    await anonymizeAccount('user-1');
    const all = fn.mock.calls[0]![0] as Op[];
    for (const [m, w] of EXPECTED) {
      expect(
        all.some(
          (o) =>
            o.model === accessor(m) && o.method === 'deleteMany' && JSON.stringify(o.args.where) === JSON.stringify(w),
        ),
      ).toBe(true);
    }
    // Every private-tools delete is scoped to the member; none is unscoped.
    for (const o of all.filter((o) => EXPECTED.some(([m]) => accessor(m) === o.model && o.method === 'deleteMany'))) {
      expect(Object.values(o.args.where ?? {})).toContain('user-1');
    }
  });

  it('classifies every table as erase and the ceiling equals the todo entries left', () => {
    for (const [m] of EXPECTED) expect(ERASURE_REGISTRY[m]?.decision).toBe('erase');
    const todo = Object.values(ERASURE_REGISTRY).filter((e) => e.decision === 'todo').length;
    expect(TODO_CEILING).toBe(todo);
  });
});

describe('POST /api/account/delete pronunciation clip', () => {
  beforeEach(() => {
    h.deleteObject.mockClear();
    h.calls.length = 0;
    h.plus = {
      pronunciationKey: 'profile-pronunciation/u1.webm',
    };
    const p = h.prismaMock as Record<string, unknown>;
    p.user = {
      findUnique: async () => ({
        handle: 'me',
        username: 'me',
        email: null,
      }),
    };
    p.ladderResumeVersion = {
      findMany: async () => [
        {
          storageKey: 'resumes/a.pdf',
        },
      ],
    };
    p.profilePlus = {
      findUnique: async () => h.plus,
      updateMany: async (a: unknown) => {
        h.calls.push(JSON.stringify(a));
        return {
          count: 1,
        };
      },
    };
  });

  const run = async () => {
    const mod = await import('@/lib/account/api/account.delete.server');
    const handler = handlersOfModule<(a: unknown) => Promise<Response>>(mod).POST!;
    return handler({
      session: {
        user: {
          id: 'u1',
        },
      },
      body: {
        confirm: 'me',
      },
      request: new Request('http://x/api/account/delete', {
        method: 'POST',
      }),
    });
  };

  it('deletes the clip object beside the resume object and nulls the key', async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(h.deleteObject).toHaveBeenCalledWith('resumes/a.pdf');
    expect(h.deleteObject).toHaveBeenCalledWith('profile-pronunciation/u1.webm');
    expect(h.calls[0]).toContain('"pronunciationKey":null');
    expect(h.calls[0]).toContain('"pronunciationMs":null');
  });

  it('still schedules the deletion when the clip object cannot be removed', async () => {
    h.deleteObject.mockImplementationOnce(async () => undefined);
    h.deleteObject.mockImplementationOnce(async () => {
      throw new Error('bucket unreachable');
    });
    const res = await run();
    expect(res.status).toBe(200);
    expect(h.calls).toHaveLength(0);
  });

  it('does nothing for a member without a clip', async () => {
    h.plus = {
      pronunciationKey: null,
    };
    await run();
    expect(h.deleteObject).toHaveBeenCalledTimes(1);
    expect(h.calls).toHaveLength(0);
  });
});
