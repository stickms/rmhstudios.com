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
 *      `FOR UPDATE SKIP LOCKED`, re-checks each preference (someone may have
 *      unsubscribed meanwhile) and the frequency cap, claims a row per person
 *      in the delivery log, and sends the claimed ones as one Resend batch.
 *   4. A send that stops making progress (the worker restarted mid-batch) can
 *      be resumed from the admin page once it has been idle for
 *      {@link RESUME_AFTER_MS}; resuming releases the claimed rows.
 *
 * Never twice, never too often (the "no spam" rules):
 *   - The per-user delivery log (`lib/email/deliveries.server.ts`) is keyed by
 *     `campaign:<contentHash>`, a hash of category, subject and body. The same
 *     message reaches a person at most once, even if an admin sends it again
 *     as a new campaign, a job retries, or two runners overlap.
 *   - Sending the same message twice within {@link DOUBLE_SUBMIT_MS} returns
 *     the first campaign instead of creating a second (a double click).
 *   - Optional bulk mail is capped at one email per person per
 *     `BULK_MIN_GAP_HOURS` (`lib/email/frequency.ts`). The cap check and the
 *     claim run under one advisory lock, so two campaigns sending at once
 *     cannot both get through to the same person. An admin may override the
 *     cap for one campaign (`ignoreFrequencyCap`, recorded on the campaign and
 *     in the audit log); opt-outs and the dedupe still apply, and the send
 *     still counts toward the next campaign's cap.
 *
 * Required service notices (`category: 'service'`) skip the preference check
 * and the frequency cap (never the dedupe) and carry no unsubscribe link. Every other campaign carries a one-click
 * `List-Unsubscribe` for its own list.
 */
import { createHash } from 'node:crypto';
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { getBoss } from '@/lib/jobs/boss.server';
import { SITE_URL } from '@/lib/seo';
import {
  EMAIL_BATCH_LIMIT,
  sendEmail,
  sendEmailBatch,
} from '@/lib/email/send.server';
import { signUnsubToken } from '@/lib/email/unsubscribe';
import { renderCampaignEmail } from '@/lib/email/campaign-render';
import {
  audienceWhere,
  needsMemberIds,
  notAlreadySentWhere,
  notThrottledWhere,
  preferenceWhere,
} from '@/lib/email/audience';
import {
  claimDeliveries,
  releaseDeliveries,
  type DeliveryKind,
} from '@/lib/email/deliveries.server';
import { bulkGapStart } from '@/lib/email/frequency';
import type { Prisma } from '@prisma/client';
import {
  campaignPreference,
  resolveEmailPrefs,
  type CampaignCategory,
} from '@/lib/email/preferences';
import type {
  Audience,
  CreateCampaignBody,
  EmailDesign,
  RenderBody,
  TestSendBody,
} from '@/lib/email/campaign-schema';
import { renderDesignedEmail } from '@/lib/email/design-render';
import { sanitizeDesign } from '@/lib/email/design';
import { BRAND } from '@/lib/email/brand';
import { logAdminAction } from '@/lib/admin-audit.server';
import { userChipSelect } from '@/lib/user-display';

/** The recipient shape: the shared chip fields, the chosen display name and the address. */
const recipientSelect =
  {
    ...userChipSelect,
    email: true,
    profile:
      {
        select:
          {
            displayName: true,
          },
      },
  } as const;

type RecipientRow =
  {
    id: string;
    name:
      | string
      | null;
    handle:
      | string
      | null;
    email:
      | string
      | null;
    profile: {
      displayName:
        | string
        | null;
    } | null;
  };

/** The name a person chose for themselves, as the rest of the site shows it. */
function displayName(
  u: RecipientRow,
):
  | string
  | null {
  return (
    u
      .profile
      ?.displayName ||
    u.name ||
    u.handle
  );
}

function summary(
  u: RecipientRow,
) {
  return {
    id: u.id,
    name: displayName(
      u,
    ),
    handle:
      u.handle,
    email:
      u.email,
  };
}

export const EMAIL_CAMPAIGN_QUEUE =
  'email.campaign';

/** A send with no finished batch for this long can be resumed. */
export const RESUME_AFTER_MS =
  5 *
  60_000;
/** A second send of the same message within this window is treated as a double submit. */
export const DOUBLE_SUBMIT_MS =
  10 *
  60_000;
/** Pause between batches, under Resend's default of two requests a second. */
const BATCH_GAP_MS = 600;
const SETTINGS_URL = `${SITE_URL}/settings/notifications`;

interface CampaignJob {
  campaignId: string;
}

/* ── Audience ─────────────────────────────────────────────────────────────── */

async function memberIds(): Promise<
  string[]
> {
  const now =
    new Date();
  const [
    subs,
    gifts,
  ] =
    await Promise.all(
      [
        prisma.subscription.findMany(
          {
            where:
              {
                status:
                  {
                    in: [
                      'active',
                      'trialing',
                    ],
                  },
              },
            select:
              {
                referenceId: true,
              },
          },
        ),
        prisma.giftMembership.findMany(
          {
            where:
              {
                expiresAt:
                  {
                    gt: now,
                  },
              },
            select:
              {
                userId: true,
              },
            distinct:
              [
                'userId',
              ],
          },
        ),
      ],
    );
  return [
    ...new Set(
      [
        ...subs.map(
          (
            s,
          ) =>
            s.referenceId,
        ),
        ...gifts.map(
          (
            g,
          ) =>
            g.userId,
        ),
      ],
    ),
  ];
}

async function whereFor(
  audience: Audience,
) {
  return audienceWhere(
    audience,
    needsMemberIds(
      audience,
    )
      ? {
          memberIds:
            await memberIds(),
        }
      : {},
  );
}

/** The hash a message is deduplicated by: same type, subject and body = same message. */
export function campaignContentHash(
  category: CampaignCategory,
  subject: string,
  body: string,
  imageUrls: readonly string[] = [],
  design: EmailDesign | null = null,
): string {
  const norm =
    (
      v: string,
    ) =>
      v
        .replace(
          /\r\n?/g,
          '\n',
        )
        .trim();
  // Pictures and the design are part of the message; with neither, the hash is
  // what it was before they existed, so a resend of an older message still
  // deduplicates.
  const pictures =
    imageUrls.length >
    0
      ? `\n${imageUrls.join('\n')}`
      : '';
  const layout =
    design
      ? `\n${JSON.stringify(design)}`
      : '';
  return createHash(
    'sha256',
  )
    .update(
      `${category}\n${norm(subject)}\n${norm(body)}${pictures}${layout}`,
    )
    .digest(
      'hex',
    );
}

/** A design held to the link and picture rules for this message, or null. */
function checkedDesign(
  design:
    | EmailDesign
    | null
    | undefined,
  body: string,
  imageUrls: readonly string[],
): EmailDesign | null {
  return design
    ? sanitizeDesign(
        design,
        {
          body,
          imageCount:
            imageUrls.length,
        },
      )
    : null;
}

/** Site image URLs as an email client needs them: absolute. */
function absoluteImages(
  urls: readonly string[],
): string[] {
  return urls.map(
    (
      u,
    ) =>
      u.startsWith(
        '/',
      )
        ? `${SITE_URL}${u}`
        : u,
  );
}

const dedupeKeyFor =
  (
    contentHash: string,
  ) =>
    `campaign:${contentHash}`;
const deliveryKindFor =
  (
    category: CampaignCategory,
  ): DeliveryKind =>
    category ===
    'service'
      ? 'service'
      : 'campaign';

/**
 * The audience narrowed step by step, so each exclusion can be counted:
 * base → accepts this type of email → has not had this message → not emailed too recently.
 */
async function funnel(
  audience: Audience,
  category: CampaignCategory,
  contentHash:
    | string
    | null,
  now: Date,
  ignoreFrequencyCap = false,
) {
  const base =
    await whereFor(
      audience,
    );
  const steps: Prisma.UserWhereInput[] =
    [
      base,
    ];
  const pref =
    preferenceWhere(
      category,
    );
  const afterPref =
    pref
      ? [
          ...steps,
          pref,
        ]
      : steps;
  const afterDup =
    contentHash
      ? [
          ...afterPref,
          notAlreadySentWhere(
            dedupeKeyFor(
              contentHash,
            ),
          ),
        ]
      : afterPref;
  const throttle =
    ignoreFrequencyCap
      ? null
      : notThrottledWhere(
          category,
          bulkGapStart(
            now,
          ),
        );
  const eligible =
    throttle
      ? [
          ...afterDup,
          throttle,
        ]
      : afterDup;
  return {
    base,
    afterPref:
      {
        AND: afterPref,
      },
    afterDup:
      {
        AND: afterDup,
      },
    eligible:
      {
        AND: eligible,
      } as Prisma.UserWhereInput,
  };
}

export interface AudiencePreview {
  /** Everyone the audience matches, before preferences. */
  matched: number;
  /** Of those, the people who will receive it. */
  eligible: number;
  /** Matched people who opted out of this category. */
  optedOut: number;
  /** People who already received this exact message (only known once a subject and body are given). */
  duplicates: number;
  /** People held back because they had an optional email too recently. */
  throttled: number;
  sample: {
    id: string;
    name:
      | string
      | null;
    handle:
      | string
      | null;
    email:
      | string
      | null;
  }[];
}

export async function previewAudience(
  audience: Audience,
  category: CampaignCategory,
  draft?: {
    subject?:
      | string
      | undefined;
    body?:
      | string
      | undefined;
    imageUrls?:
      | readonly string[]
      | undefined;
    design?:
      | EmailDesign
      | null
      | undefined;
  },
  ignoreFrequencyCap = false,
): Promise<AudiencePreview> {
  const hash =
    draft?.subject?.trim() &&
    draft.body?.trim()
      ? campaignContentHash(
          category,
          draft.subject,
          draft.body,
          draft.imageUrls ??
            [],
          checkedDesign(
            draft.design,
            draft.body,
            draft.imageUrls ??
              [],
          ),
        )
      : null;
  const f =
    await funnel(
      audience,
      category,
      hash,
      new Date(),
      ignoreFrequencyCap,
    );
  const [
    matched,
    afterPref,
    afterDup,
    eligible,
    sample,
  ] =
    await Promise.all(
      [
        prisma.user.count(
          {
            where:
              f.base,
          },
        ),
        prisma.user.count(
          {
            where:
              f.afterPref,
          },
        ),
        prisma.user.count(
          {
            where:
              f.afterDup,
          },
        ),
        prisma.user.count(
          {
            where:
              f.eligible,
          },
        ),
        prisma.user.findMany(
          {
            where:
              f.eligible,
            orderBy:
              [
                {
                  createdAt:
                    'desc',
                },
                {
                  id: 'desc',
                },
              ],
            take: 8,
            select:
              recipientSelect,
          },
        ),
      ],
    );
  return {
    matched,
    eligible,
    optedOut:
      matched -
      afterPref,
    duplicates:
      afterPref -
      afterDup,
    throttled:
      afterDup -
      eligible,
    sample:
      sample.map(
        summary,
      ),
  };
}

/* ── Rendering ────────────────────────────────────────────────────────────── */

function reasonFor(
  category: CampaignCategory,
): string {
  switch (
    category
  ) {
    case 'announcements':
      return 'You are receiving this because site announcement emails are on for your RMH Studios account.';
    case 'product':
      return 'You are receiving this because you turned on product news emails for your RMH Studios account.';
    case 'service':
      return 'This is a required notice about your RMH Studios account or the service, sent to every affected account.';
  }
}

function unsubscribeUrl(
  userId: string,
  category: CampaignCategory,
):
  | string
  | null {
  const list =
    campaignPreference(
      category,
    );
  if (
    list !==
      'announcements' &&
    list !==
      'product'
  )
    return null;
  const token =
    signUnsubToken(
      userId,
      undefined,
      list,
    );
  return `${SITE_URL}/api/email/unsubscribe?token=${encodeURIComponent(token)}&list=${list}`;
}

function messageFor(
  campaign: {
    subject: string;
    body: string;
    category: CampaignCategory;
    imageUrls?: readonly string[];
    design?: EmailDesign | null;
  },
  user: Pick<
    RecipientRow,
    | 'id'
    | 'name'
    | 'handle'
    | 'profile'
  > & {
    email: string;
  },
) {
  const unsub =
    unsubscribeUrl(
      user.id,
      campaign.category,
    );
  const rendered =
    renderFor(
      campaign,
      displayName(
        user,
      ),
      unsub,
    );
  return {
    to: user.email,
    subject:
      rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(unsub
      ? {
          headers:
            {
              'List-Unsubscribe': `<${unsub}>`,
              'List-Unsubscribe-Post':
                'List-Unsubscribe=One-Click',
            },
        }
      : {}),
  };
}

/** The subject, HTML and text of one message, in its plain or designed layout. */
function renderFor(
  campaign: {
    subject: string;
    body: string;
    category: CampaignCategory;
    imageUrls?: readonly string[];
    design?: EmailDesign | null;
  },
  name:
    | string
    | null,
  unsubscribe:
    | string
    | null,
) {
  const shared =
    {
      subject:
        campaign.subject,
      name,
      reason:
        reasonFor(
          campaign.category,
        ),
      unsubscribeUrl:
        unsubscribe,
      settingsUrl:
        SETTINGS_URL,
      imageUrls:
        absoluteImages(
          campaign.imageUrls ??
            [],
        ),
    };
  return campaign.design
    ? renderDesignedEmail(
        {
          ...shared,
          design:
            campaign.design,
          logoUrl: `${SITE_URL}${BRAND.logoPath}`,
        },
      )
    : renderCampaignEmail(
        {
          ...shared,
          body: campaign.body,
        },
      );
}

/* ── Preview ──────────────────────────────────────────────────────────────── */

/**
 * The message exactly as a recipient gets it, addressed to the admin viewing
 * it. The unsubscribe link is shown but inert (`#`), so clicking around the
 * preview cannot unsubscribe the admin.
 */
export async function renderPreview(
  adminId: string,
  draft: RenderBody,
) {
  const admin =
    await prisma.user.findUnique(
      {
        where:
          {
            id: adminId,
          },
        select:
          recipientSelect,
      },
    );
  const imageUrls =
    draft.imageUrls ??
    [];
  const design =
    checkedDesign(
      draft.design,
      draft.body,
      imageUrls,
    );
  const rendered =
    renderFor(
      {
        ...draft,
        imageUrls,
        design,
      },
      admin
        ? displayName(
            admin,
          )
        : null,
      campaignPreference(
        draft.category,
      ) &&
        draft.category !==
          'service'
        ? '#'
        : null,
    );
  return {
    subject:
      rendered.subject,
    html: rendered.html,
    design,
  };
}

/* ── Test send ────────────────────────────────────────────────────────────── */

export async function sendTestEmail(
  adminId: string,
  draft: TestSendBody,
): Promise<{
  ok: boolean;
  to:
    | string
    | null;
}> {
  const admin =
    await prisma.user.findUnique(
      {
        where:
          {
            id: adminId,
          },
        select:
          recipientSelect,
      },
    );
  if (
    !admin?.email
  )
    return {
      ok: false,
      to: null,
    };
  const message =
    messageFor(
      {
        subject: `[Test] ${draft.subject}`,
        body: draft.body,
        category:
          draft.category,
        imageUrls:
          draft.imageUrls ??
          [],
        design:
          checkedDesign(
            draft.design,
            draft.body,
            draft.imageUrls ??
              [],
          ),
      },
      {
        ...admin,
        email:
          admin.email,
      },
    );
  return {
    ok: await sendEmail(
      message,
    ),
    to: admin.email,
  };
}

/* ── Create ───────────────────────────────────────────────────────────────── */

const ID_PAGE = 5_000;

export async function createCampaign(
  adminId: string,
  input: CreateCampaignBody,
): Promise<{
  id: string;
  total: number;
  skipped: number;
  duplicate: boolean;
}> {
  const imageUrls =
    input.imageUrls ??
    [];
  const design =
    checkedDesign(
      input.design,
      input.body,
      imageUrls,
    );
  const contentHash =
    campaignContentHash(
      input.category,
      input.subject,
      input.body,
      imageUrls,
      design,
    );

  // Double submit: the same message sent again moments later is the first send.
  const recent =
    await prisma.emailCampaign.findFirst(
      {
        where:
          {
            contentHash,
            createdAt:
              {
                gt: new Date(
                  Date.now() -
                    DOUBLE_SUBMIT_MS,
                ),
              },
          },
        orderBy:
          {
            createdAt:
              'desc',
          },
        select:
          {
            id: true,
            total: true,
            skipped: true,
          },
      },
    );
  if (
    recent
  )
    return {
      ...recent,
      duplicate: true,
    };

  const ignoreFrequencyCap =
    input.category !==
      'service' &&
    input.ignoreFrequencyCap ===
      true;
  const now =
    new Date();
  const f =
    await funnel(
      input.audience,
      input.category,
      contentHash,
      now,
      ignoreFrequencyCap,
    );
  const [
    matched,
    afterPref,
    afterDup,
  ] =
    await Promise.all(
      [
        prisma.user.count(
          {
            where:
              f.base,
          },
        ),
        prisma.user.count(
          {
            where:
              f.afterPref,
          },
        ),
        prisma.user.count(
          {
            where:
              f.afterDup,
          },
        ),
      ],
    );

  const campaign =
    await prisma.emailCampaign.create(
      {
        data: {
          authorId:
            adminId,
          subject:
            input.subject,
          body: input.body,
          category:
            input.category,
          audience:
            input.audience,
          contentHash,
          imageUrls,
          ignoreFrequencyCap,
          ...(design
            ? {
                design,
              }
            : {}),
        },
        select:
          {
            id: true,
          },
      },
    );

  // Page through the ids so a whole-site send never holds every row in memory.
  let total = 0;
  let cursor:
    | string
    | undefined;
  for (;;) {
    const page =
      await prisma.user.findMany(
        {
          where:
            f.eligible,
          orderBy:
            {
              id: 'asc',
            },
          take: ID_PAGE,
          ...(cursor
            ? {
                cursor:
                  {
                    id: cursor,
                  },
                skip: 1,
              }
            : {}),
          select:
            {
              id: true,
            },
        },
      );
    if (
      page.length ===
      0
    )
      break;
    await prisma.emailCampaignRecipient.createMany(
      {
        data: page.map(
          (
            u,
          ) => ({
            campaignId:
              campaign.id,
            userId:
              u.id,
          }),
        ),
        skipDuplicates: true,
      },
    );
    total +=
      page.length;
    cursor =
      page[
        page.length -
          1
      ]!
        .id;
    if (
      page.length <
      ID_PAGE
    )
      break;
  }

  const duplicates =
    afterPref -
    afterDup;
  const throttled =
    Math.max(
      0,
      afterDup -
        total,
    );
  const skipped =
    Math.max(
      0,
      matched -
        total,
    );
  await prisma.emailCampaign.update(
    {
      where:
        {
          id: campaign.id,
        },
      data: {
        total,
        skipped,
        duplicates,
        throttled,
        ...(total ===
        0
          ? {
              status:
                'sent',
              finishedAt:
                new Date(),
            }
          : {}),
      },
    },
  );

  await logAdminAction(
    adminId,
    'email.campaign.send',
    {
      targetType:
        'email_campaign',
      targetId:
        campaign.id,
      detail: `${input.category} to ${total} (${input.audience.mode}${ignoreFrequencyCap ? ', frequency cap overridden' : ''}): ${input.subject}`,
    },
  );

  if (
    total >
    0
  )
    await startCampaign(
      campaign.id,
    );
  return {
    id: campaign.id,
    total,
    skipped,
    duplicate: false,
  };
}

async function startCampaign(
  campaignId: string,
): Promise<void> {
  const boss =
    await getBoss();
  if (
    boss
  ) {
    try {
      const jobId =
        await boss.send(
          EMAIL_CAMPAIGN_QUEUE,
          {
            campaignId,
          } satisfies CampaignJob,
          {
            singletonKey:
              campaignId,
            retryLimit: 3,
            retryDelay: 60,
          },
        );
      // `null` means the queue already holds a job for this campaign (a resume
      // after the worker died while pg-boss still counts that job active). The
      // claim in `runCampaign` keeps two runners apart, so run it here instead.
      if (
        jobId
      )
        return;
    } catch (error) {
      console.error(
        '[email] campaign enqueue failed; sending inline:',
        error,
      );
    }
  }
  // No queue: send from this process, off the request path.
  void runCampaign(
    campaignId,
  ).catch(
    (
      error,
    ) =>
      console.error(
        '[email] inline campaign send failed:',
        error,
      ),
  );
}

/* ── Run ──────────────────────────────────────────────────────────────────── */

const sleep =
  (
    ms: number,
  ) =>
    new Promise<void>(
      (
        resolve,
      ) =>
        setTimeout(
          resolve,
          ms,
        ),
    );

async function claimBatch(
  campaignId: string,
): Promise<
  string[]
> {
  const rows =
    await prisma.$queryRaw<
      {
        userId: string;
      }[]
    >`
    UPDATE "email_campaign_recipient" SET "status" = 'claimed'
    WHERE ("campaignId", "userId") IN (
      SELECT "campaignId", "userId" FROM "email_campaign_recipient"
      WHERE "campaignId" = ${campaignId} AND "status" = 'pending'
      LIMIT ${EMAIL_BATCH_LIMIT}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "userId"`;
  return rows.map(
    (
      r,
    ) =>
      r.userId,
  );
}

async function finish(
  campaignId: string,
): Promise<void> {
  const [
    left,
    campaign,
  ] =
    await Promise.all(
      [
        prisma.emailCampaignRecipient.count(
          {
            where:
              {
                campaignId,
                status:
                  {
                    in: [
                      'pending',
                      'claimed',
                    ],
                  },
              },
          },
        ),
        prisma.emailCampaign.findUnique(
          {
            where:
              {
                id: campaignId,
              },
            select:
              {
                sent: true,
                failed: true,
              },
          },
        ),
      ],
    );
  if (
    left >
      0 ||
    !campaign
  )
    return;
  await prisma.emailCampaign.updateMany(
    {
      where:
        {
          id: campaignId,
          status:
            'sending',
        },
      data: {
        status:
          campaign.sent ===
            0 &&
          campaign.failed >
            0
            ? 'failed'
            : 'sent',
        finishedAt:
          new Date(),
      },
    },
  );
}

/**
 * Decide, under one advisory lock, who in a batch may be sent this message:
 * not emailed too recently (optional mail only, unless the admin overrode the
 * cap for this campaign) and not sent it before. Holding
 * the lock across the cap check and the claim is what stops two campaigns that
 * run at the same moment from both reaching one person inside the cap window.
 */
async function claimForBatch(
  userIds: string[],
  category: CampaignCategory,
  contentHash: string,
  campaignId: string,
  ignoreFrequencyCap: boolean,
): Promise<{
  claimed: Set<string>;
  throttled: Set<string>;
  duplicates: Set<string>;
}> {
  return prisma.$transaction(
    async (
      tx,
    ) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('email-delivery-claim'))`;
      const throttled =
        new Set<string>();
      if (
        category !==
          'service' &&
        !ignoreFrequencyCap &&
        userIds.length >
          0
      ) {
        const recent =
          await tx.emailDelivery.findMany(
            {
              where:
                {
                  userId:
                    {
                      in: userIds,
                    },
                  kind: 'campaign',
                  createdAt:
                    {
                      gt: bulkGapStart(),
                    },
                },
              select:
                {
                  userId: true,
                },
              distinct:
                [
                  'userId',
                ],
            },
          );
        for (const r of recent)
          throttled.add(
            r.userId,
          );
      }
      const candidates =
        userIds.filter(
          (
            id,
          ) =>
            !throttled.has(
              id,
            ),
        );
      const claimed =
        await claimDeliveries(
          candidates,
          deliveryKindFor(
            category,
          ),
          dedupeKeyFor(
            contentHash,
          ),
          campaignId,
          tx,
        );
      const duplicates =
        new Set(
          candidates.filter(
            (
              id,
            ) =>
              !claimed.has(
                id,
              ),
          ),
        );
      return {
        claimed,
        throttled,
        duplicates,
      };
    },
  );
}

export async function runCampaign(
  campaignId: string,
): Promise<void> {
  const campaign =
    await prisma.emailCampaign.findUnique(
      {
        where:
          {
            id: campaignId,
          },
        select:
          {
            id: true,
            subject: true,
            body: true,
            category: true,
            status: true,
            contentHash: true,
            imageUrls: true,
            design: true,
            ignoreFrequencyCap: true,
          },
      },
    );
  if (
    !campaign ||
    campaign.status !==
      'sending'
  )
    return;
  const category =
    campaign.category as CampaignCategory;
  const pref =
    campaignPreference(
      category,
    );
  const dedupeKey =
    dedupeKeyFor(
      campaign.contentHash,
    );

  for (;;) {
    const ids =
      await claimBatch(
        campaignId,
      );
    if (
      ids.length ===
      0
    )
      break;

    const users =
      await prisma.user.findMany(
        {
          where:
            {
              id: {
                in: ids,
              },
            },
          select:
            {
              ...userChipSelect,
              email: true,
              profile:
                {
                  select:
                    {
                      displayName: true,
                    },
                },
              notificationPreference:
                {
                  select:
                    {
                      emailSecurity: true,
                      emailAnnouncements: true,
                      emailProduct: true,
                      emailDigest: true,
                    },
                },
            },
        },
      );

    // Re-check at send time: an unsubscribe since the campaign was created wins.
    const wanting =
      users.filter(
        (
          u,
        ): u is typeof u & {
          email: string;
        } =>
          !!u.email &&
          (!pref ||
            resolveEmailPrefs(
              u.notificationPreference,
            )[
              pref
            ]),
      );
    const {
      claimed,
      throttled,
      duplicates,
    } =
      await claimForBatch(
        wanting.map(
          (
            u,
          ) =>
            u.id,
        ),
        category,
        campaign.contentHash,
        campaignId,
        campaign.ignoreFrequencyCap,
      );
    const deliverable =
      wanting.filter(
        (
          u,
        ) =>
          claimed.has(
            u.id,
          ),
      );
    const skippedIds =
      ids.filter(
        (
          id,
        ) =>
          !claimed.has(
            id,
          ),
      );

    // Stored already checked by `createCampaign`; Prisma reads the JSON column as an unknown value.
    const design =
      (campaign.design ??
        null) as EmailDesign | null;
    const results =
      await sendEmailBatch(
        deliverable.map(
          (
            u,
          ) =>
            messageFor(
              {
                ...campaign,
                category,
                design,
              },
              u,
            ),
        ),
      );
    const sentIds =
      deliverable
        .filter(
          (
            _,
            i,
          ) =>
            results[
              i
            ],
        )
        .map(
          (
            u,
          ) =>
            u.id,
        );
    const failedIds =
      deliverable
        .filter(
          (
            _,
            i,
          ) =>
            !results[
              i
            ],
        )
        .map(
          (
            u,
          ) =>
            u.id,
        );
    // A refused message was not received: drop its log row so it is not counted as sent.
    await releaseDeliveries(
      failedIds,
      dedupeKey,
    );
    const now =
      new Date();

    await prisma.$transaction(
      [
        prisma.emailCampaignRecipient.updateMany(
          {
            where:
              {
                campaignId,
                userId:
                  {
                    in: sentIds,
                  },
              },
            data: {
              status:
                'sent',
              sentAt:
                now,
            },
          },
        ),
        prisma.emailCampaignRecipient.updateMany(
          {
            where:
              {
                campaignId,
                userId:
                  {
                    in: failedIds,
                  },
              },
            data: {
              status:
                'failed',
            },
          },
        ),
        prisma.emailCampaignRecipient.updateMany(
          {
            where:
              {
                campaignId,
                userId:
                  {
                    in: skippedIds,
                  },
              },
            data: {
              status:
                'skipped',
            },
          },
        ),
        prisma.emailCampaign.update(
          {
            where:
              {
                id: campaignId,
              },
            data: {
              sent: {
                increment:
                  sentIds.length,
              },
              failed:
                {
                  increment:
                    failedIds.length,
                },
              skipped:
                {
                  increment:
                    skippedIds.length,
                },
              duplicates:
                {
                  increment:
                    duplicates.size,
                },
              throttled:
                {
                  increment:
                    throttled.size,
                },
              lastBatchAt:
                now,
            },
          },
        ),
      ],
    );

    await sleep(
      BATCH_GAP_MS,
    );
  }

  await finish(
    campaignId,
  );
}

/**
 * Resume a send that stopped making progress. Refused while a runner may still
 * hold rows (a batch finished within {@link RESUME_AFTER_MS}), so resuming can
 * never mail anyone twice.
 */
export async function resumeCampaign(
  adminId: string,
  campaignId: string,
): Promise<
  | 'resumed'
  | 'not-found'
  | 'not-sending'
  | 'busy'
> {
  const campaign =
    await prisma.emailCampaign.findUnique(
      {
        where:
          {
            id: campaignId,
          },
        select:
          {
            status: true,
            lastBatchAt: true,
            createdAt: true,
          },
      },
    );
  if (
    !campaign
  )
    return 'not-found';
  if (
    campaign.status !==
    'sending'
  )
    return 'not-sending';
  const lastProgress =
    (
      campaign.lastBatchAt ??
      campaign.createdAt
    ).getTime();
  if (
    Date.now() -
      lastProgress <
    RESUME_AFTER_MS
  )
    return 'busy';

  await prisma.emailCampaignRecipient.updateMany(
    {
      where:
        {
          campaignId,
          status:
            'claimed',
        },
      data: {
        status:
          'pending',
      },
    },
  );
  await prisma.emailCampaign.update(
    {
      where:
        {
          id: campaignId,
        },
      data: {
        lastBatchAt:
          new Date(),
      },
    },
  );
  await logAdminAction(
    adminId,
    'email.campaign.resume',
    {
      targetType:
        'email_campaign',
      targetId:
        campaignId,
    },
  );
  await startCampaign(
    campaignId,
  );
  return 'resumed';
}

/* ── History ──────────────────────────────────────────────────────────────── */

export async function listCampaigns(
  limit = 30,
) {
  const rows =
    await prisma.emailCampaign.findMany(
      {
        orderBy:
          {
            createdAt:
              'desc',
          },
        take: limit,
        select:
          {
            id: true,
            subject: true,
            category: true,
            audience: true,
            status: true,
            total: true,
            sent: true,
            failed: true,
            skipped: true,
            duplicates: true,
            throttled: true,
            ignoreFrequencyCap: true,
            createdAt: true,
            lastBatchAt: true,
            finishedAt: true,
            author:
              {
                select:
                  {
                    ...userChipSelect,
                    profile:
                      {
                        select:
                          {
                            displayName: true,
                          },
                      },
                  },
              },
          },
      },
    );
  const now =
    Date.now();
  return rows.map(
    (
      r,
    ) => ({
      id: r.id,
      subject:
        r.subject,
      category:
        r.category as CampaignCategory,
      audienceMode:
        ((
          r.audience as {
            mode?: string;
          } | null
        )
          ?.mode ??
          'all') as Audience['mode'],
      status:
        r.status as
          | 'sending'
          | 'sent'
          | 'failed',
      total:
        r.total,
      sent: r.sent,
      failed:
        r.failed,
      skipped:
        r.skipped,
      duplicates:
        r.duplicates,
      throttled:
        r.throttled,
      ignoreFrequencyCap:
        r.ignoreFrequencyCap,
      createdAt:
        r.createdAt.toISOString(),
      finishedAt:
        r.finishedAt?.toISOString() ??
        null,
      author:
        r
          .author
          .profile
          ?.displayName ||
        r
          .author
          .name ||
        r
          .author
          .handle ||
        null,
      canResume:
        r.status ===
          'sending' &&
        now -
          (
            r.lastBatchAt ??
            r.createdAt
          ).getTime() >=
          RESUME_AFTER_MS,
    }),
  );
}

/* ── Manual selection search ──────────────────────────────────────────────── */

export async function searchRecipients(
  q: string,
) {
  const contains =
    {
      contains:
        q,
      mode: 'insensitive' as const,
    };
  const users =
    await prisma.user.findMany(
      {
        where:
          {
            isBot: false,
            OR: [
              {
                name: contains,
              },
              {
                username:
                  contains,
              },
              {
                handle:
                  contains,
              },
              {
                email:
                  contains,
              },
            ],
          },
        orderBy:
          [
            {
              createdAt:
                'desc',
            },
            {
              id: 'desc',
            },
          ],
        take: 20,
        select:
          {
            ...userChipSelect,
            email: true,
            profile:
              {
                select:
                  {
                    displayName: true,
                    customImage: true,
                  },
              },
          },
      },
    );
  return users.map(
    (
      u,
    ) => ({
      ...summary(
        u,
      ),
      image:
        u
          .profile
          ?.customImage ??
        u.image,
    }),
  );
}

/* ── Worker ───────────────────────────────────────────────────────────────── */

/** Registered by the `jobs` worker (`server/jobs/index.ts`). */
export async function registerEmailCampaignWorker(
  boss: PgBoss,
): Promise<void> {
  await boss.createQueue(
    EMAIL_CAMPAIGN_QUEUE,
    {
      policy:
        'stately',
    },
  );
  await boss.work<CampaignJob>(
    EMAIL_CAMPAIGN_QUEUE,
    async (
      jobs,
    ) => {
      for (const job of jobs)
        await runCampaign(
          job
            .data
            .campaignId,
        );
    },
  );
}
