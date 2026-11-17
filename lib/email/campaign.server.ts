/**
 * Admin email campaigns (/admin/email): preview an audience, send a test to
 * yourself, send for real, and run the send in the background.
 *
 * The flow:
 *   1. `createCampaign` resolves the audience ONCE, minus anyone who opted out
 *      of the category, and writes one `pending` recipient row per person.
 *   2. The send runs on the `email.campaign` pg-boss queue in the `jobs`
 *      worker (inline in the web process when the queue is unavailable).
 *   3. `runCampaign` claims up to 100 pending rows at a time with
 *      `FOR UPDATE SKIP LOCKED`, so two runners never mail the same person,
 *      re-checks each preference (someone may have unsubscribed meanwhile),
 *      and sends them as one Resend batch.
 *   4. A send that stops making progress (the worker restarted mid-batch) can
 *      be resumed from the admin page once it has been idle for
 *      {@link RESUME_AFTER_MS}; resuming releases the claimed rows.
 *
 * Required service notices (`category: 'service'`) skip the preference check
 * and carry no unsubscribe link. Every other campaign carries a one-click
 * `List-Unsubscribe` for its own list.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { getBoss } from '@/lib/jobs/boss.server';
import { SITE_URL } from '@/lib/seo';
import { EMAIL_BATCH_LIMIT, sendEmail, sendEmailBatch } from '@/lib/email/send.server';
import { signUnsubToken } from '@/lib/email/unsubscribe';
import { renderCampaignEmail } from '@/lib/email/campaign-render';
import { audienceWhere, needsMemberIds, preferenceWhere } from '@/lib/email/audience';
import {
  campaignPreference,
  resolveEmailPrefs,
  type CampaignCategory,
} from '@/lib/email/preferences';
import type { Audience, CreateCampaignBody, TestSendBody } from '@/lib/email/campaign-schema';
import { logAdminAction } from '@/lib/admin-audit.server';
import { userChipSelect } from '@/lib/user-display';

/** The recipient shape: the shared chip fields, the chosen display name and the address. */
const recipientSelect = {
  ...userChipSelect,
  email: true,
  profile: { select: { displayName: true } },
} as const;

type RecipientRow = {
  id: string;
  name: string | null;
  handle: string | null;
  email: string | null;
  profile: { displayName: string | null } | null;
};

/** The name a person chose for themselves, as the rest of the site shows it. */
function displayName(u: RecipientRow): string | null {
  return u.profile?.displayName || u.name || u.handle;
}

function summary(u: RecipientRow) {
  return { id: u.id, name: displayName(u), handle: u.handle, email: u.email };
}

export const EMAIL_CAMPAIGN_QUEUE = 'email.campaign';

/** A send with no finished batch for this long can be resumed. */
export const RESUME_AFTER_MS = 5 * 60_000;
/** Pause between batches, under Resend's default of two requests a second. */
const BATCH_GAP_MS = 600;
const SETTINGS_URL = `${SITE_URL}/settings/notifications`;

interface CampaignJob {
  campaignId: string;
}

/* ── Audience ─────────────────────────────────────────────────────────────── */

async function memberIds(): Promise<string[]> {
  const now = new Date();
  const [subs, gifts] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: { in: ['active', 'trialing'] } },
      select: { referenceId: true },
    }),
    prisma.giftMembership.findMany({
      where: { expiresAt: { gt: now } },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);
  return [...new Set([...subs.map((s) => s.referenceId), ...gifts.map((g) => g.userId)])];
}

async function whereFor(audience: Audience) {
  return audienceWhere(audience, needsMemberIds(audience) ? { memberIds: await memberIds() } : {});
}

export interface AudiencePreview {
  /** Everyone the audience matches, before preferences. */
  matched: number;
  /** Of those, the people who will receive it. */
  eligible: number;
  /** Matched people who opted out of this category. */
  optedOut: number;
  sample: { id: string; name: string | null; handle: string | null; email: string | null }[];
}

export async function previewAudience(
  audience: Audience,
  category: CampaignCategory,
): Promise<AudiencePreview> {
  const base = await whereFor(audience);
  const pref = preferenceWhere(category);
  const eligibleWhere = pref ? { AND: [base, pref] } : base;
  const [matched, eligible, sample] = await Promise.all([
    prisma.user.count({ where: base }),
    pref ? prisma.user.count({ where: eligibleWhere }) : null,
    prisma.user.findMany({
      where: eligibleWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 8,
      select: recipientSelect,
    }),
  ]);
  const eligibleCount = eligible ?? matched;
  return {
    matched,
    eligible: eligibleCount,
    optedOut: matched - eligibleCount,
    sample: sample.map(summary),
  };
}

/* ── Rendering ────────────────────────────────────────────────────────────── */

function reasonFor(category: CampaignCategory): string {
  switch (category) {
    case 'announcements':
      return 'You are receiving this because site announcement emails are on for your RMH Studios account.';
    case 'product':
      return 'You are receiving this because you turned on product news emails for your RMH Studios account.';
    case 'service':
      return 'This is a required notice about your RMH Studios account or the service, sent to every affected account.';
  }
}

function unsubscribeUrl(userId: string, category: CampaignCategory): string | null {
  const list = campaignPreference(category);
  if (list !== 'announcements' && list !== 'product') return null;
  const token = signUnsubToken(userId, undefined, list);
  return `${SITE_URL}/api/email/unsubscribe?token=${encodeURIComponent(token)}&list=${list}`;
}

function messageFor(
  campaign: { subject: string; body: string; category: CampaignCategory },
  user: RecipientRow & { email: string },
) {
  const unsub = unsubscribeUrl(user.id, campaign.category);
  const rendered = renderCampaignEmail({
    subject: campaign.subject,
    body: campaign.body,
    name: displayName(user),
    reason: reasonFor(campaign.category),
    unsubscribeUrl: unsub,
    settingsUrl: SETTINGS_URL,
  });
  return {
    to: user.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(unsub
      ? {
          headers: {
            'List-Unsubscribe': `<${unsub}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }
      : {}),
  };
}

/* ── Test send ────────────────────────────────────────────────────────────── */

export async function sendTestEmail(
  adminId: string,
  draft: TestSendBody,
): Promise<{ ok: boolean; to: string | null }> {
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: recipientSelect,
  });
  if (!admin?.email) return { ok: false, to: null };
  const message = messageFor(
    { subject: `[Test] ${draft.subject}`, body: draft.body, category: draft.category },
    { ...admin, email: admin.email },
  );
  return { ok: await sendEmail(message), to: admin.email };
}

/* ── Create ───────────────────────────────────────────────────────────────── */

const ID_PAGE = 5_000;

export async function createCampaign(
  adminId: string,
  input: CreateCampaignBody,
): Promise<{ id: string; total: number; skipped: number }> {
  const base = await whereFor(input.audience);
  const pref = preferenceWhere(input.category);
  const eligibleWhere = pref ? { AND: [base, pref] } : base;
  const matched = await prisma.user.count({ where: base });

  const campaign = await prisma.emailCampaign.create({
    data: {
      authorId: adminId,
      subject: input.subject,
      body: input.body,
      category: input.category,
      audience: input.audience,
    },
    select: { id: true },
  });

  // Page through the ids so a whole-site send never holds every row in memory.
  let total = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.user.findMany({
      where: eligibleWhere,
      orderBy: { id: 'asc' },
      take: ID_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });
    if (page.length === 0) break;
    await prisma.emailCampaignRecipient.createMany({
      data: page.map((u) => ({ campaignId: campaign.id, userId: u.id })),
      skipDuplicates: true,
    });
    total += page.length;
    cursor = page[page.length - 1]!.id;
    if (page.length < ID_PAGE) break;
  }

  const skipped = Math.max(0, matched - total);
  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      total,
      skipped,
      ...(total === 0 ? { status: 'sent', finishedAt: new Date() } : {}),
    },
  });

  await logAdminAction(adminId, 'email.campaign.send', {
    targetType: 'email_campaign',
    targetId: campaign.id,
    detail: `${input.category} to ${total} (${input.audience.mode}): ${input.subject}`,
  });

  if (total > 0) await startCampaign(campaign.id);
  return { id: campaign.id, total, skipped };
}

async function startCampaign(campaignId: string): Promise<void> {
  const boss = await getBoss();
  if (boss) {
    try {
      const jobId = await boss.send(EMAIL_CAMPAIGN_QUEUE, { campaignId } satisfies CampaignJob, {
        singletonKey: campaignId,
        retryLimit: 3,
        retryDelay: 60,
      });
      // `null` means the queue already holds a job for this campaign (a resume
      // after the worker died while pg-boss still counts that job active). The
      // claim in `runCampaign` keeps two runners apart, so run it here instead.
      if (jobId) return;
    } catch (error) {
      console.error('[email] campaign enqueue failed; sending inline:', error);
    }
  }
  // No queue: send from this process, off the request path.
  void runCampaign(campaignId).catch((error) =>
    console.error('[email] inline campaign send failed:', error),
  );
}

/* ── Run ──────────────────────────────────────────────────────────────────── */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function claimBatch(campaignId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ userId: string }[]>`
    UPDATE "email_campaign_recipient" SET "status" = 'claimed'
    WHERE ("campaignId", "userId") IN (
      SELECT "campaignId", "userId" FROM "email_campaign_recipient"
      WHERE "campaignId" = ${campaignId} AND "status" = 'pending'
      LIMIT ${EMAIL_BATCH_LIMIT}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "userId"`;
  return rows.map((r) => r.userId);
}

async function finish(campaignId: string): Promise<void> {
  const [left, campaign] = await Promise.all([
    prisma.emailCampaignRecipient.count({
      where: { campaignId, status: { in: ['pending', 'claimed'] } },
    }),
    prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      select: { sent: true, failed: true },
    }),
  ]);
  if (left > 0 || !campaign) return;
  await prisma.emailCampaign.updateMany({
    where: { id: campaignId, status: 'sending' },
    data: {
      status: campaign.sent === 0 && campaign.failed > 0 ? 'failed' : 'sent',
      finishedAt: new Date(),
    },
  });
}

export async function runCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, subject: true, body: true, category: true, status: true },
  });
  if (!campaign || campaign.status !== 'sending') return;
  const category = campaign.category as CampaignCategory;
  const pref = campaignPreference(category);

  for (;;) {
    const ids = await claimBatch(campaignId);
    if (ids.length === 0) break;

    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        ...userChipSelect,
        email: true,
        profile: { select: { displayName: true } },
        notificationPreference: {
          select: { emailSecurity: true, emailAnnouncements: true, emailProduct: true, emailDigest: true },
        },
      },
    });

    // Re-check at send time: an unsubscribe since the campaign was created wins.
    const deliverable = users.filter(
      (u): u is typeof u & { email: string } =>
        !!u.email && (!pref || resolveEmailPrefs(u.notificationPreference)[pref]),
    );
    const deliverableIds = new Set(deliverable.map((u) => u.id));
    const skippedIds = ids.filter((id) => !deliverableIds.has(id));

    const results = await sendEmailBatch(deliverable.map((u) => messageFor({ ...campaign, category }, u)));
    const sentIds = deliverable.filter((_, i) => results[i]).map((u) => u.id);
    const failedIds = deliverable.filter((_, i) => !results[i]).map((u) => u.id);
    const now = new Date();

    await prisma.$transaction([
      prisma.emailCampaignRecipient.updateMany({
        where: { campaignId, userId: { in: sentIds } },
        data: { status: 'sent', sentAt: now },
      }),
      prisma.emailCampaignRecipient.updateMany({
        where: { campaignId, userId: { in: failedIds } },
        data: { status: 'failed' },
      }),
      prisma.emailCampaignRecipient.updateMany({
        where: { campaignId, userId: { in: skippedIds } },
        data: { status: 'skipped' },
      }),
      prisma.emailCampaign.update({
        where: { id: campaignId },
        data: {
          sent: { increment: sentIds.length },
          failed: { increment: failedIds.length },
          skipped: { increment: skippedIds.length },
          lastBatchAt: now,
        },
      }),
    ]);

    await sleep(BATCH_GAP_MS);
  }

  await finish(campaignId);
}

/**
 * Resume a send that stopped making progress. Refused while a runner may still
 * hold rows (a batch finished within {@link RESUME_AFTER_MS}), so resuming can
 * never mail anyone twice.
 */
export async function resumeCampaign(
  adminId: string,
  campaignId: string,
): Promise<'resumed' | 'not-found' | 'not-sending' | 'busy'> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    select: { status: true, lastBatchAt: true, createdAt: true },
  });
  if (!campaign) return 'not-found';
  if (campaign.status !== 'sending') return 'not-sending';
  const lastProgress = (campaign.lastBatchAt ?? campaign.createdAt).getTime();
  if (Date.now() - lastProgress < RESUME_AFTER_MS) return 'busy';

  await prisma.emailCampaignRecipient.updateMany({
    where: { campaignId, status: 'claimed' },
    data: { status: 'pending' },
  });
  await prisma.emailCampaign.update({ where: { id: campaignId }, data: { lastBatchAt: new Date() } });
  await logAdminAction(adminId, 'email.campaign.resume', {
    targetType: 'email_campaign',
    targetId: campaignId,
  });
  await startCampaign(campaignId);
  return 'resumed';
}

/* ── History ──────────────────────────────────────────────────────────────── */

export async function listCampaigns(limit = 30) {
  const rows = await prisma.emailCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      subject: true,
      category: true,
      audience: true,
      status: true,
      total: true,
      sent: true,
      failed: true,
      skipped: true,
      createdAt: true,
      lastBatchAt: true,
      finishedAt: true,
      author: { select: { ...userChipSelect, profile: { select: { displayName: true } } } },
    },
  });
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    category: r.category as CampaignCategory,
    audienceMode: ((r.audience as { mode?: string } | null)?.mode ?? 'all') as Audience['mode'],
    status: r.status as 'sending' | 'sent' | 'failed',
    total: r.total,
    sent: r.sent,
    failed: r.failed,
    skipped: r.skipped,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    author: r.author.profile?.displayName || r.author.name || r.author.handle || null,
    canResume:
      r.status === 'sending' && now - (r.lastBatchAt ?? r.createdAt).getTime() >= RESUME_AFTER_MS,
  }));
}

/* ── Manual selection search ──────────────────────────────────────────────── */

export async function searchRecipients(q: string) {
  const contains = { contains: q, mode: 'insensitive' as const };
  const users = await prisma.user.findMany({
    where: {
      isBot: false,
      OR: [{ name: contains }, { username: contains }, { handle: contains }, { email: contains }],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 20,
    select: {
      ...userChipSelect,
      email: true,
      profile: { select: { displayName: true, customImage: true } },
    },
  });
  return users.map((u) => ({ ...summary(u), image: u.profile?.customImage ?? u.image }));
}

/* ── Worker ───────────────────────────────────────────────────────────────── */

/** Registered by the `jobs` worker (`server/jobs/index.ts`). */
export async function registerEmailCampaignWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(EMAIL_CAMPAIGN_QUEUE, { policy: 'stately' });
  await boss.work<CampaignJob>(EMAIL_CAMPAIGN_QUEUE, async (jobs) => {
    for (const job of jobs) await runCampaign(job.data.campaignId);
  });
}
