/**
 * The per-user email delivery log (`email_delivery`): what keeps any
 * non-transactional email from reaching the same person twice, and what the
 * frequency cap (`lib/email/frequency.ts`) counts.
 *
 * The pattern is claim, then send, then release on failure:
 *
 *   1. Insert the (userId, dedupeKey) row with `ON CONFLICT DO NOTHING`. Only
 *      the caller whose insert lands may send; a retry, a second worker or a
 *      double-fired cron finds the row and sends nothing.
 *   2. Send.
 *   3. If the provider refused it, delete the row, so the message is not
 *      recorded as received and a later attempt can still deliver it.
 *
 * Sign-in verification, password reset and other mail the person asked for in
 * the moment do not go through here: they must arrive every time.
 */
import { prisma } from '@/lib/prisma.server';
import { sendEmail, type SendEmailInput } from '@/lib/email/send.server';
import { securityAllowed } from '@/lib/email/frequency';

export type DeliveryKind = 'campaign' | 'service' | 'security' | 'digest';

/**
 * Claim delivery rows for many users at once. Returns the users whose claim
 * landed, i.e. who have not had this message before. One statement, so the
 * unique index arbitrates between concurrent senders.
 */
export async function claimDeliveries(
  userIds: readonly string[],
  kind: DeliveryKind,
  dedupeKey: string,
  campaignId: string | null = null,
  db: Pick<typeof prisma, '$queryRaw'> = prisma,
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.$queryRaw<{ userId: string }[]>`
    INSERT INTO "email_delivery" ("userId", "kind", "dedupeKey", "campaignId")
    SELECT u, ${kind}, ${dedupeKey}, ${campaignId}
    FROM unnest(${[...userIds]}::text[]) AS u
    ON CONFLICT ("userId", "dedupeKey") DO NOTHING
    RETURNING "userId"`;
  return new Set(rows.map((r) => r.userId));
}

/** Undo claims whose send failed, so the message is not recorded as received. */
export async function releaseDeliveries(userIds: readonly string[], dedupeKey: string): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.emailDelivery.deleteMany({ where: { userId: { in: [...userIds] }, dedupeKey } });
}

export type SendOnceResult = 'sent' | 'duplicate' | 'throttled' | 'failed';

/**
 * Send one email to one user at most once per `dedupeKey`. Security mail is
 * also held to the hourly cap. Never throws.
 */
export async function sendOnce(
  input: SendEmailInput & { userId: string; kind: DeliveryKind; dedupeKey: string },
): Promise<SendOnceResult> {
  const { userId, kind, dedupeKey, ...message } = input;
  try {
    if (kind === 'security') {
      const recent = await prisma.emailDelivery.findMany({
        where: { userId, kind: 'security', createdAt: { gt: new Date(Date.now() - 3_600_000) } },
        select: { createdAt: true },
      });
      if (!securityAllowed(recent.map((r) => r.createdAt))) return 'throttled';
    }
    const claimed = await claimDeliveries([userId], kind, dedupeKey);
    if (!claimed.has(userId)) return 'duplicate';
    if (await sendEmail(message)) return 'sent';
    await releaseDeliveries([userId], dedupeKey);
    return 'failed';
  } catch (error) {
    console.error('[email] sendOnce failed:', error instanceof Error ? error.message : error);
    return 'failed';
  }
}
