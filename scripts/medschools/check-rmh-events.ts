/**
 * Read-only audit of the RMH tracker's anonymous shared events (`auditRmh`, features/medschools/api/share-sync.server.ts).
 *
 *   MEDSCHOOLS_DEDUPE_SECRET=… DATABASE_URL=… pnpm exec tsx scripts/medschools/check-rmh-events.ts
 *
 * Prints three counts and exits 1 unless all are zero:
 *   orphanEvents      RMH events whose hash matches no milestone (the secret changed, or a row was deleted around the writer)
 *   mismatchedCells   RMH count rows that differ from the grouped events, or events with no count row
 *   missingEvents     shared, shareable milestones with no event
 *
 * Run it after ROTATING `MEDSCHOOLS_DEDUPE_SECRET`: every existing event then reads as an orphan, because the hashes are
 * keyed by the old secret and cannot be recomputed. It writes nothing, so it is safe against production. Exit 2: no
 * secret (the audit cannot recompute a hash without it). The logic stays in `auditRmh`; this is the thin entry point.
 */
/* eslint-disable no-console -- a CLI: the report is its output. */

async function main(): Promise<number> {
  const secret = process.env.MEDSCHOOLS_DEDUPE_SECRET;
  if (!secret || secret.length < 16) {
    console.error("check-rmh-events: MEDSCHOOLS_DEDUPE_SECRET (16+ characters, the app's value) is required");
    return 2;
  }
  const [{ prisma }, { auditRmh }] = await Promise.all([
    import('../../lib/prisma.server'),
    import('../../features/medschools/api/share-sync.server'),
  ]);
  try {
    const r = await auditRmh(prisma as unknown as Parameters<typeof auditRmh>[0], secret);
    console.log(`orphanEvents=${r.orphanEvents}`);
    console.log(`mismatchedCells=${r.mismatchedCells}`);
    console.log(`missingEvents=${r.missingEvents}`);
    const bad = r.orphanEvents + r.mismatchedCells + r.missingEvents;
    console.log(
      bad === 0 ? 'OK: every event has its milestone and every cell matches.' : 'NOT OK: see the counts above.',
    );
    return bad === 0 ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
