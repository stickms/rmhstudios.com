/**
 * Proves account erasure removes a member's anonymous med school events and nothing else, against a SCRATCH database.
 *
 *   MEDSCHOOLS_DEDUPE_SECRET=… DATABASE_URL=postgresql://postgres@127.0.0.1:55432/scratch \
 *     pnpm exec tsx scripts/medschools/verify-erasure.ts
 *
 * Refuses unless DATABASE_URL is on localhost and the database name contains `scratch` (like `seed-visual.ts`).
 * Seeds a FIXTURE school and three members (A, B, C, accounts 30 days old) with shared INTERVIEW milestones in the same
 * cell and one more in a different cell, plus A's second (private) cycle, lists and preferences. Then:
 *
 *   1. kills the erasure pre-step midway (a failing database wrapper handed to `eraseSharedMedEvents`: the injected
 *      error lives here, not in the product) and checks the transaction rolled back: A's events are all still there;
 *   2. re-runs the pre-step for real and checks it is idempotent;
 *   3. runs the real `anonymizeAccount(A)` and checks: zero RMH events hash from A's milestones, counts equal a
 *      from-scratch recompute (no event of B or C touched), A's tracker, lists and preferences rows are gone, B's and
 *      C's rows are intact, and `auditRmh` reports nothing new (it reads the whole database, so the check is against its own baseline).
 *
 * Exits non-zero on the first broken invariant. Removes everything it created.
 */
/* eslint-disable no-console -- a CLI: the report is its output. */

function guard(): string {
  const url = process.env.DATABASE_URL ?? '';
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('verify-erasure: DATABASE_URL is not a URL');
  }
  const name = u.pathname.replace(/^\//, '');
  if (!['localhost', '127.0.0.1'].includes(u.hostname) || !name.includes('scratch'))
    throw new Error(
      `verify-erasure: refusing ${u.hostname}/${name}: needs a localhost host and a database name with "scratch"`,
    );
  const secret = process.env.MEDSCHOOLS_DEDUPE_SECRET;
  if (!secret || secret.length < 16)
    throw new Error('verify-erasure: MEDSCHOOLS_DEDUPE_SECRET (16+ characters) is required');
  return url;
}

let failures = 0;
function check(ok: boolean, what: string, detail?: unknown): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok || detail === undefined ? '' : `  (${JSON.stringify(detail)})`}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  guard();
  const [{ prisma }, tracker, lists, prefs, share, deletion, engine] = await Promise.all([
    import('../../lib/prisma.server'),
    import('../../features/medschools/api/tracker.server'),
    import('../../features/medschools/api/lists.server'),
    import('../../features/medschools/api/prefs.server'),
    import('../../features/medschools/api/share-sync.server'),
    import('../../lib/account/deletion.server'),
    import('../../features/medschools/engine/dedupe'),
  ]);
  const secret = process.env.MEDSCHOOLS_DEDUPE_SECRET as string;
  const stamp = Date.now().toString(36);
  const schoolId = `verify-erasure-school-${stamp}`;
  const slug = `verify-erasure-${stamp}`;
  const userIds: string[] = [];
  const DAY = 86_400_000;
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const day = (ago: number) => new Date(today - ago * DAY).toISOString().slice(0, 10);
  const month = new Date().getUTCMonth();
  const cycle = month < 5 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() + 1;
  const hashOf = (milestoneId: string) => engine.dedupeHash(secret, 'RMH', `milestone:${milestoneId}`);

  const cleanup = async () => {
    await prisma.medSchool.deleteMany({ where: { id: schoolId } });
    for (const id of userIds) {
      // The tracker, list and preference rows go with the user (onDelete: Cascade), and the share-ratchet keeps any other
      // writer of those tables out of the tree, scripts included.
      await prisma.user.deleteMany({ where: { id } });
    }
  };

  // `auditRmh` reads the whole database, and a scratch database may already hold seed-visual's RMH FIXTURE count row (99 on
  // two contributors, no events behind it), which it rightly calls a mismatch. The check is that this run adds none.
  const auditBefore = await share.auditRmh(prisma as unknown as Parameters<typeof share.auditRmh>[0], secret);

  try {
    await prisma.medSchool.create({
      data: {
        id: schoolId,
        slug,
        name: 'Erasure Fixture School of Medicine',
        shortName: 'Erasure',
        degree: 'MD',
        city: 'Durham',
        state: 'NC',
        active: true,
      },
    });
    const member = async (label: string): Promise<string> => {
      const u = await prisma.user.create({
        data: {
          name: `Erasure ${label}`,
          email: `verify-erasure-${label}-${stamp}@example.test`,
          createdAt: new Date(Date.now() - 30 * DAY),
        },
      });
      userIds.push(u.id);
      return u.id;
    };
    const [A, B, C] = [await member('a'), await member('b'), await member('c')];

    const shareAll = async (userId: string, milestones: Array<[string, string]>) => {
      await tracker.putCycle(userId, { cycleYear: cycle, shareAnonymously: true });
      const app = await tracker.addApplication(userId, { cycleYear: cycle, schoolSlug: slug, program: 'REG' });
      if (typeof app === 'string') throw new Error(`could not add an application: ${app}`);
      for (const [type, date] of milestones) {
        const r = await tracker.putMilestone(userId, app.id, type as never, date);
        if (r === null || r === 'bad-date') throw new Error(`could not set ${type}: ${r}`);
      }
    };
    // One shared cell (INTERVIEW three days ago) all three fill; A also has a second cell and a private earlier cycle.
    await shareAll(A, [
      ['INTERVIEW', day(3)],
      ['SECONDARY', day(8)],
    ]);
    await shareAll(B, [['INTERVIEW', day(3)]]);
    await shareAll(C, [
      ['INTERVIEW', day(3)],
      ['REJECTION', day(2)],
    ]);
    await tracker.putCycle(A, { cycleYear: cycle - 1, shareAnonymously: false });
    await lists.saveItem(A, { schoolSlug: slug, newListName: 'Erasure list' });
    await lists.saveItem(B, { schoolSlug: slug });
    await prefs.putPrefs(A, { homeState: null, chartCategories: ['INTERVIEW'] });
    await prefs.putPrefs(B, { homeState: null, chartCategories: ['ACCEPTANCE'] });

    const events = () => prisma.medCycleEvent.count({ where: { schoolId, source: 'RMH' } });
    const aHashes = async (): Promise<string[]> => {
      const ms = await prisma.medTrackerMilestone.findMany({
        where: { application: { cycle: { userId: A } } },
        select: { id: true },
      });
      return ms.map((m) => hashOf(m.id));
    };
    const cellCounts = async () =>
      prisma.medCycleCount.findMany({
        where: { schoolId, source: 'RMH' },
        select: { eventType: true, date: true, count: true, contributors: true },
        orderBy: [{ date: 'asc' }, { eventType: 'asc' }],
      });

    check((await events()) === 5, 'seed: five shared events (A 2, B 1, C 2)', await events());
    const aBefore = await aHashes();
    const aEventsBefore = await prisma.medCycleEvent.count({ where: { dedupeHash: { in: aBefore } } });
    check(aEventsBefore === 2, "seed: two of them are A's", aEventsBefore);

    // 1. The pre-step dies midway: the wrapper fails the last write inside the transaction.
    const failing = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop !== '$transaction') return Reflect.get(target, prop, receiver);
        return (fn: (tx: unknown) => Promise<unknown>) =>
          target.$transaction(async (tx) =>
            fn(
              new Proxy(tx, {
                get(t, p, r) {
                  if (p === 'medTrackerCycle') {
                    return new Proxy(Reflect.get(t, p, r) as object, {
                      get(m, mp, mr) {
                        if (mp === 'updateMany')
                          return async () => {
                            throw new Error('injected failure (verify-erasure)');
                          };
                        return Reflect.get(m, mp, mr);
                      },
                    });
                  }
                  return Reflect.get(t, p, r);
                },
              }),
            ),
          );
      },
    });
    let threw = false;
    try {
      await share.eraseSharedMedEvents(A, failing as typeof prisma);
    } catch (e) {
      threw = e instanceof Error && e.message.includes('injected failure');
    }
    check(threw, 'pre-step: the injected mid-step failure propagates');
    const afterFail = await prisma.medCycleEvent.count({ where: { dedupeHash: { in: aBefore } } });
    check(
      afterFail === aEventsBefore,
      "pre-step: the failed run rolled back (A's events are all still there)",
      afterFail,
    );
    check((await events()) === 5, 'pre-step: nothing else changed', await events());

    // 2. Re-run for real, twice: idempotent.
    const first = await share.eraseSharedMedEvents(A);
    const second = await share.eraseSharedMedEvents(A);
    check(
      first.events === 2 && second.events === 0,
      "pre-step: the re-run removes A's two events, a third run finds none",
      { first, second },
    );

    // 3. The real erasure.
    await deletion.anonymizeAccount(A);
    const aLeft = await prisma.medCycleEvent.count({ where: { dedupeHash: { in: aBefore } } });
    check(aLeft === 0, "erasure: zero RMH events hash from A's milestones", aLeft);
    check((await events()) === 3, "erasure: B's and C's three events are intact", await events());
    const rows = await cellCounts();
    check(
      rows.filter((r) => r.count > 0).every((r) => r.count === r.contributors) &&
        rows.filter((r) => r.eventType === 'INTERVIEW' && r.count > 0).some((r) => r.count === 2),
      'erasure: the shared cell dropped from 3 to 2 and no count disagrees with its events',
      rows,
    );
    check(
      (await prisma.medTrackerCycle.count({ where: { userId: A } })) === 0 &&
        (await prisma.medSchoolList.count({ where: { userId: A } })) === 0 &&
        (await prisma.medUserPrefs.count({ where: { userId: A } })) === 0,
      "erasure: A's tracker, list and preference rows are gone",
    );
    check(
      (await prisma.medTrackerCycle.count({ where: { userId: B } })) === 1 &&
        (await prisma.medSchoolList.count({ where: { userId: B } })) === 1 &&
        (await prisma.medUserPrefs.count({ where: { userId: B } })) === 1,
      "erasure: B's rows are untouched",
    );
    const audit = await share.auditRmh(prisma as unknown as Parameters<typeof share.auditRmh>[0], secret);
    check(
      audit.orphanEvents === auditBefore.orphanEvents &&
        audit.missingEvents === auditBefore.missingEvents &&
        audit.mismatchedCells === auditBefore.mismatchedCells,
      'audit: the run left no orphan event, no missing event and no mismatched cell behind',
      { before: auditBefore, after: audit },
    );
  } finally {
    await cleanup().catch((e) => console.error('verify-erasure: cleanup failed', e));
    await prisma.$disconnect();
  }
  console.log(failures === 0 ? 'OK: erasure holds.' : `NOT OK: ${failures} check(s) failed.`);
}

main().then(
  () => process.exit(failures === 0 ? 0 : 1),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
