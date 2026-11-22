import { describe, expect, it, vi } from 'vitest';

/**
 * Sprint 07 erasure coverage (`coverageErasureOps`): the clearly private leaf tables are erased, exactly these and no
 * others, and how follows, reviews, guides, jam entries and public decks are handled is pinned until the owner decides.
 */

interface Op {
  model: string;
  method: string;
  args: {
    where?: Record<string, unknown>;
  };
}

const prismaMock = vi.hoisted(() => {
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
  return new Proxy(
    {
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    } as Record<string, unknown>,
    {
      get: (t, key: string) => (key in t ? t[key] : model(key)),
    },
  );
});
vi.mock('@/lib/prisma.server', () => ({
  prisma: prismaMock,
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { coverageErasureOps } from '@/lib/account/erasure-coverage.server';
import { ERASURE_REGISTRY } from '@/lib/account/erasure-registry';

/** The accessors `coverageErasureOps` may touch, in the order the specification lists them. */
const FR2 = [
  'userBirthday',
  'reminder',
  'scheduledPost',
  'readingGoal',
  'readingPrefs',
  'historyEntry',
  'savedItem',
  'saveFolder',
  'calcNotebook',
  'studyPlan',
  'appearancePreference',
  'keyboardPreference',
  'layoutPreference',
  'notificationPreference',
  'notification',
  'heldNotification',
  'keywordAlertHit',
  'targetedNoticeDismissal',
  'rmhTubeWatchLater',
  'memoriesOptIn',
  'readingHighlight',
];

const accessor = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

async function recorded(): Promise<Op[]> {
  const fn = prismaMock.$transaction as ReturnType<typeof vi.fn>;
  fn.mockClear();
  await anonymizeAccount('user-1');
  return fn.mock.calls[0]![0] as Op[];
}

describe('coverageErasureOps', () => {
  const ops = coverageErasureOps('user-1') as unknown as Op[];

  it('deletes with one deleteMany per model, in the listed order', () => {
    expect(ops.map((o) => o.model)).toEqual(FR2);
    expect(ops.every((o) => o.method === 'deleteMany')).toBe(true);
  });

  it('names the member in every where, and nobody else', () => {
    for (const o of ops) {
      expect(o.args.where, o.model).toBeDefined();
      expect(o.args.where!.userId, o.model).toBe('user-1');
    }
  });

  it('erases each model on exactly { userId } (ReadingHighlight adds isPublic: false)', () => {
    for (const o of ops) {
      if (o.model === 'readingHighlight') continue;
      expect(o.args, o.model).toEqual({
        where: {
          userId: 'user-1',
        },
      });
    }
  });

  it('erases only private reading highlights, never a public one', () => {
    const op = ops.find((o) => o.model === 'readingHighlight')!;
    expect(op.args).toEqual({
      where: {
        userId: 'user-1',
        isPublic: false,
      },
    });
  });

  it('deletes saved items before the folders they refer to', () => {
    const names = ops.map((o) => o.model);
    expect(names.indexOf('savedItem')).toBeLessThan(names.indexOf('saveFolder'));
  });

  it('erases notifications addressed to the member only, never those about them (actorId)', () => {
    const op = ops.find((o) => o.model === 'notification')!;
    expect(op.args.where).toEqual({
      userId: 'user-1',
    });
    expect(JSON.stringify(op.args)).not.toContain('actorId');
  });

  it('is exactly the models the registry marks erase and that anonymizeAccount did not erase before', () => {
    for (const model of FR2) {
      const entry = ERASURE_REGISTRY[model.charAt(0).toUpperCase() + model.slice(1)];
      expect(entry?.decision, model).toBe('erase');
    }
  });
});

describe('anonymizeAccount with the coverage operations', () => {
  it('runs every coverage operation inside the one transaction, before the profile scrub', async () => {
    const tx = await recorded();
    const names = tx.map((o) => o.model);
    for (const model of FR2) expect(names, model).toContain(model);
    const scrub = names.indexOf('userProfile');
    for (const model of FR2) expect(names.lastIndexOf(model), model).toBeLessThan(scrub);
    expect(names.indexOf('user')).toBe(names.length - 1);
  });

  it('touches no keep or owner model through the coverage operations', () => {
    const touched = (coverageErasureOps('user-1') as unknown as Op[]).map((o) => o.model);
    for (const model of touched) {
      const decision = ERASURE_REGISTRY[model.charAt(0).toUpperCase() + model.slice(1)]?.decision;
      expect(['keep', 'owner', 'todo'], `${model} is ${decision}`).not.toContain(decision);
    }
  });

  it('leaves every owner model exactly as it was at the wave base', async () => {
    // Recorded from anonymizeAccount before this feature edited it: follows, game reviews (and their votes), guides and
    // jam entries are not touched at all; a deleted member's decks are only taken out of their folders.
    const PINS: Record<string, string[]> = {
      Follow: [],
      GameReview: [],
      GameReviewVote: [],
      GameGuide: [],
      GameJamEntry: [],
      RmhTubeSubscription: [],
      FlashcardDeck: ['updateMany'],
    };
    const tx = await recorded();
    const owners = Object.entries(ERASURE_REGISTRY)
      .filter(([, e]) => e.decision === 'owner')
      .map(([name]) => name)
      .sort();
    expect(owners, 'a new owner decision needs a pin here').toEqual(Object.keys(PINS).sort());
    for (const name of owners) {
      const methods = tx.filter((o) => o.model === accessor(name)).map((o) => o.method);
      expect(methods, `${name}: the owner has not decided how this is handled`).toEqual(PINS[name]);
    }
  });
});
