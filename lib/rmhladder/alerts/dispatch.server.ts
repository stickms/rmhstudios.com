import { createNotification } from '@/lib/notifications.server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { listJobs, type QueriesPrisma } from '../server/queries';
import { formatInUserTimezone, isDigestDue, isQuietTime, localDateKey } from './schedule';

type AlertChannel = 'in_app' | 'email' | 'discord';
type AlertType = 'immediate' | 'daily_digest' | 'weekly_digest' | 'deadline' | 'saved_search' | 'follow_up' | 'interview';

const queriesPrisma = prisma as unknown as QueriesPrisma;
const savedSearchFiltersSchema = z.object({
  preset: z.enum(['new', 'finance', 'consulting', 'tech', 'expiring', 'remote']).optional(),
  q: z.string().max(200).optional(),
  cities: z.array(z.string().max(100)).max(50).optional(),
  programTypes: z.array(z.enum([
    'internship', 'summer_analyst', 'summer_associate', 'analyst_program', 'rotational_program',
    'new_grad', 'leadership_development', 'entry_level', 'mba', 'other',
  ])).max(10).optional(),
  sort: z.enum(['relevance', 'posted', 'deadline']).optional(),
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function enabledChannels(prefs: {
  channelInApp: boolean;
  channelEmail: boolean;
  channelDiscord: boolean;
}): AlertChannel[] {
  const channels: AlertChannel[] = [];
  if (prefs.channelInApp) channels.push('in_app');
  if (prefs.channelEmail) channels.push('email');
  if (prefs.channelDiscord) channels.push('discord');
  return channels;
}

function alertTypeForDigest(digest: string): AlertType {
  if (digest === 'weekly') return 'weekly_digest';
  if (digest === 'daily') return 'daily_digest';
  return 'immediate';
}

async function sendEmail(input: { to: string; subject: string; text: string; link: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { status: 'skipped' as const, error: 'Resend is not configured' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: `${input.text}\n\n${input.link}`,
      html: `<p>${escapeHtml(input.text)}</p><p><a href="${escapeHtml(input.link)}">View on RMHLadder</a></p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return { status: 'failed' as const, error: `Resend HTTP ${response.status}` };
  return { status: 'sent' as const };
}

async function sendDiscord(input: { discordUserId: string; text: string; link: string }) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { status: 'skipped' as const, error: 'Discord bot is not configured' };

  const dm = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ recipient_id: input.discordUserId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!dm.ok) return { status: 'failed' as const, error: `Discord DM HTTP ${dm.status}` };
  const channel = await dm.json() as { id?: string };
  if (!channel.id) return { status: 'failed' as const, error: 'Discord did not return a DM channel' };

  const sent = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ content: `${input.text}\n${input.link}`.slice(0, 2000) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!sent.ok) return { status: 'failed' as const, error: `Discord message HTTP ${sent.status}` };
  return { status: 'sent' as const };
}

async function ensureEvent(input: {
  userId: string;
  jobId?: string | null;
  type: AlertType;
  fingerprint: string;
  payload: Record<string, unknown>;
  channels: AlertChannel[];
}) {
  const event = await prisma.ladderAlertEvent.upsert({
    where: {
      userId_type_fingerprint: {
        userId: input.userId,
        type: input.type,
        fingerprint: input.fingerprint,
      },
    },
    create: {
      userId: input.userId,
      jobId: input.jobId ?? null,
      type: input.type,
      fingerprint: input.fingerprint,
      payload: input.payload as Prisma.InputJsonValue,
    },
    update: { payload: input.payload as Prisma.InputJsonValue },
  });
  await Promise.all(input.channels.map((channel) => prisma.ladderAlertDelivery.upsert({
    where: { alertId_channel: { alertId: event.id, channel } },
    create: { alertId: event.id, channel },
    update: {},
  })));
  return event.id;
}

export async function deliverPendingLadderAlerts(limit = 100): Promise<{ sent: number; failed: number; skipped: number }> {
  const deliveries = await prisma.ladderAlertDelivery.findMany({
    where: { status: { in: ['pending', 'failed'] }, attempts: { lt: 3 } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      alert: {
        include: {
          user: { select: { email: true, emailVerified: true } },
          job: { include: { company: true } },
        },
      },
    },
  });

  const totals = { sent: 0, failed: 0, skipped: 0 };
  for (const delivery of deliveries) {
    const payload = (delivery.alert.payload ?? {}) as Record<string, unknown>;
    const job = delivery.alert.job;
    const title = String(payload.title ?? job?.title ?? 'New RMHLadder match');
    const company = String(payload.company ?? job?.company.name ?? 'an employer');
    const text = String(payload.text ?? `${title} at ${company}`);
    const base = process.env.BETTER_AUTH_URL ?? 'https://rmhstudios.com';
    const link = new URL(String(payload.link ?? `/rmhladder/jobs/${delivery.alert.jobId ?? ''}`), base).toString();

    let outcome: { status: 'sent' | 'failed' | 'skipped'; error?: string };
    try {
      if (delivery.channel === 'in_app') {
        const notificationUrl = new URL(link);
        await createNotification({
          userId: delivery.alert.userId,
          type: 'SYSTEM',
          entityType: 'ladder_job',
          entityId: delivery.alert.jobId,
          preview: text,
          link: `${notificationUrl.pathname}${notificationUrl.search}`,
          dedupeUnread: true,
        });
        outcome = { status: 'sent' };
      } else if (delivery.channel === 'email') {
        outcome = delivery.alert.user.email && delivery.alert.user.emailVerified
          ? await sendEmail({ to: delivery.alert.user.email, subject: `RMHLadder: ${title}`, text, link })
          : { status: 'skipped', error: 'User has no email' };
      } else if (delivery.channel === 'discord') {
        const discordUserId = String(payload.discordUserId ?? '');
        outcome = discordUserId
          ? await sendDiscord({ discordUserId, text, link })
          : { status: 'skipped', error: 'Discord user ID is missing' };
      } else {
        outcome = { status: 'skipped', error: `Unsupported delivery channel ${delivery.channel}` };
      }
    } catch (error) {
      outcome = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }

    totals[outcome.status]++;
    await prisma.ladderAlertDelivery.update({
      where: { id: delivery.id },
      data: {
        status: outcome.status,
        attempts: { increment: 1 },
        lastError: outcome.error ?? null,
        sentAt: outcome.status === 'sent' ? new Date() : null,
      },
    });
  }
  return totals;
}

/** Generate idempotent alerts for newly discovered, verified, early-career roles. */
export async function generateLadderMatchAlerts(now = new Date()): Promise<number> {
  const prefsRows = await prisma.ladderUserPrefs.findMany({
    include: {
      user: {
        select: {
          id: true,
          email: true,
          emailVerified: true,
          accounts: { where: { providerId: 'discord' }, select: { accountId: true }, take: 1 },
        },
      },
    },
  });
  let created = 0;

  for (const prefs of prefsRows) {
    if (!isDigestDue(prefs, now)) continue;
    const linkedDiscordId = prefs.user.accounts[0]?.accountId ?? null;
    const channels = enabledChannels(prefs).filter((channel) =>
      (channel !== 'email' || prefs.user.emailVerified)
      && (channel !== 'discord' || Boolean(linkedDiscordId)),
    );
    if (channels.length === 0) continue;
    const result = await listJobs(queriesPrisma, prefs.userId, {
      preset: 'new',
      sort: 'relevance',
      take: 100,
    });
    const type = alertTypeForDigest(prefs.digestFrequency);
    const matchRows: Array<{ row: (typeof result.rows)[number]; resumeMatch: { score: number } | null }> = [];
    for (const row of result.rows) {
      if (row.finalRelevance < prefs.relevanceThreshold) continue;
      const jobId = row.id as string;
      const resumeMatch = prefs.resumeMatchThreshold == null
        ? null
        : await prisma.ladderJobMatch.findFirst({
            where: {
              userId: prefs.userId,
              jobId,
              score: { gte: prefs.resumeMatchThreshold },
              resumeVersion: { confirmedAt: { not: null } },
            },
            orderBy: { score: 'desc' },
          });
      if (prefs.resumeMatchThreshold != null && !resumeMatch) continue;
      matchRows.push({ row, resumeMatch });
    }

    if (type === 'immediate') {
      for (const { row, resumeMatch } of matchRows) {
        const jobId = row.id as string;
        const title = row.title as string;
        const company = ((row.company as { name?: string } | undefined)?.name ?? 'an employer');
        await ensureEvent({
          userId: prefs.userId,
          jobId,
          type,
          fingerprint: `${type}:${jobId}`,
          payload: {
            title,
            company,
            text: `${title} at ${company} is a ${row.finalRelevance}% preference match.`,
            link: `/rmhladder/jobs/${jobId}`,
            relevance: row.finalRelevance,
            resumeMatch: resumeMatch?.score ?? null,
            discordUserId: linkedDiscordId,
          },
          channels,
        });
        created++;
      }
    } else if (matchRows.length > 0) {
      const period = localDateKey(now, prefs.timezone);
      await ensureEvent({
        userId: prefs.userId,
        type,
        fingerprint: `${type}:${period}`,
        payload: {
          title: type === 'daily_digest' ? 'Your daily RMHLadder digest' : 'Your weekly RMHLadder digest',
          text: `${matchRows.length} new verified role${matchRows.length === 1 ? '' : 's'} match your preferences.`,
          link: '/rmhladder/jobs?preset=new',
          jobs: matchRows.slice(0, 20).map(({ row }) => ({ id: row.id, title: row.title })),
          discordUserId: linkedDiscordId,
        },
        channels,
      });
      created++;
    }

    const savedSearches = await prisma.ladderSavedSearch.findMany({
      where: { userId: prefs.userId, alertsOn: true },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });
    for (const search of savedSearches) {
      const parsedFilters = savedSearchFiltersSchema.safeParse(search.filters);
      if (!parsedFilters.success) continue;
      const result = await listJobs(queriesPrisma, prefs.userId, {
        ...parsedFilters.data,
        take: 100,
      });
      const recent = result.rows.filter((row) =>
        new Date(row.discoveredAt as Date).getTime() >= now.getTime() - 7 * 86_400_000,
      );
      if (prefs.digestFrequency !== 'immediate' && recent.length > 0) {
        await ensureEvent({
          userId: prefs.userId,
          type: 'saved_search',
          fingerprint: `${search.id}:${localDateKey(now, prefs.timezone)}`,
          payload: {
            title: search.name,
            text: `${recent.length} new verified role${recent.length === 1 ? '' : 's'} match your saved search “${search.name}”.`,
            link: '/rmhladder/jobs?preset=new',
            jobs: recent.slice(0, 20).map((row) => ({ id: row.id, title: row.title })),
            savedSearchId: search.id,
            discordUserId: linkedDiscordId,
          },
          channels,
        });
        created++;
        continue;
      }
      for (const row of recent) {
        const jobId = row.id as string;
        const title = row.title as string;
        const company = ((row.company as { name?: string } | undefined)?.name ?? 'an employer');
        await ensureEvent({
          userId: prefs.userId,
          jobId,
          type: 'saved_search',
          fingerprint: `${search.id}:${jobId}`,
          payload: {
            title,
            company,
            text: `${title} at ${company} matches your saved search “${search.name}”.`,
            link: `/rmhladder/jobs/${jobId}`,
            savedSearchId: search.id,
            discordUserId: linkedDiscordId,
          },
          channels,
        });
        created++;
      }
    }
  }
  return created;
}

/** Generate idempotent reminders for follow-ups, interviews, and deadlines. */
export async function generateLadderPipelineReminders(now = new Date()): Promise<number> {
  const lookback = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const applications = await prisma.ladderApplication.findMany({
    where: {
      OR: [
        { followUpDate: { gte: lookback, lte: horizon } },
        { interviewDates: { isEmpty: false } },
        { job: { applicationDeadline: { gte: lookback, lte: horizon } } },
      ],
    },
    include: { job: { include: { company: true } } },
  });
  let generated = 0;
  for (const application of applications) {
    const prefs = await prisma.ladderUserPrefs.findUnique({ where: { userId: application.userId } });
    if (!prefs || isQuietTime(prefs, now)) continue;
    const linkedDiscord = prefs.channelDiscord
      ? await prisma.account.findFirst({
          where: { userId: application.userId, providerId: 'discord' },
          select: { accountId: true },
        })
      : null;
    const emailOwner = prefs.channelEmail
      ? await prisma.user.findUnique({ where: { id: application.userId }, select: { emailVerified: true } })
      : null;
    const channels = enabledChannels(prefs).filter((channel) =>
      (channel !== 'email' || emailOwner?.emailVerified === true)
      && (channel !== 'discord' || Boolean(linkedDiscord?.accountId)),
    );
    const label = `${application.job.title} at ${application.job.company.name}`;
    const basePayload = {
      title: application.job.title,
      company: application.job.company.name,
      link: `/rmhladder/jobs/${application.jobId}`,
      discordUserId: linkedDiscord?.accountId ?? null,
    };
    const followUpHorizon = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    if (application.followUpDate && application.followUpDate >= lookback && application.followUpDate <= followUpHorizon) {
      await ensureEvent({
        userId: application.userId,
        jobId: application.jobId,
        type: 'follow_up',
        fingerprint: `follow_up:${application.id}:${application.followUpDate.toISOString()}`,
        payload: { ...basePayload, text: `Follow up on ${label}.` },
        channels,
      });
      generated++;
    }
    const interviewWindowStart = new Date(now.getTime() + 20 * 60 * 60 * 1000);
    const interviewWindowEnd = new Date(now.getTime() + 28 * 60 * 60 * 1000);
    for (const interview of application.interviewDates.slice(0, 25)) {
      if (interview < interviewWindowStart || interview > interviewWindowEnd) continue;
      await ensureEvent({
        userId: application.userId,
        jobId: application.jobId,
        type: 'interview',
        fingerprint: `interview:24h:${application.id}:${interview.toISOString()}`,
        payload: { ...basePayload, text: `Interview for ${label} is ${formatInUserTimezone(interview, prefs.timezone)}.` },
        channels,
      });
      generated++;
    }
    const deadline = application.job.applicationDeadline;
    const deadlineHorizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    if (deadline && deadline >= now && deadline <= deadlineHorizon) {
      const days = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000));
      await ensureEvent({
        userId: application.userId,
        jobId: application.jobId,
        type: 'deadline',
        fingerprint: `deadline:3d:${application.jobId}:${deadline.toISOString()}`,
        payload: { ...basePayload, text: `${label} closes in ${days} day${days === 1 ? '' : 's'}.` },
        channels,
      });
      generated++;
    }
  }
  return generated;
}

export async function runLadderAlertCycle() {
  const generated = await generateLadderMatchAlerts();
  const reminders = await generateLadderPipelineReminders();
  const delivered = await deliverPendingLadderAlerts();
  return { generated: generated + reminders, ...delivered };
}
