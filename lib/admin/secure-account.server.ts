/**
 * Secure a member's account (admin): in one transaction sign it out everywhere, revoke API keys and
 * RMHCode tokens, disable webhooks behind fresh secrets and rotate the calendar feed, without a ban.
 * Passkeys, linked sign-in accounts and the password are never touched (removing one could lock the
 * real owner out); the preview lists them so the member can review them.
 *
 * Limits, also said in the drawer: a deleted session can still read for up to the cookie cache
 * (300 s, writes are refused at once) and an open realtime socket stays up until it reconnects.
 * Signing out everywhere also drops the account's web-push subscriptions. A pending email-change
 * link is not revoked: Better Auth does not key those verifications by user id.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { isDeletedAccount } from '@/lib/account-lifecycle';
import { generateWebhookSecret } from '@/lib/webhooks/signature';
import { dispatch } from '@/lib/notify/dispatch.server';
import { sendOnce } from '@/lib/email/deliveries.server';
import { canEmail } from '@/lib/email/preferences.server';
import { SITE_URL } from '@/lib/seo';
import { DEFAULT_LOCALE } from '@/lib/i18n/config';
import {
  ACCOUNT_SECURED_ENTITY,
  SECURITY_PAGE_PATH,
  type SecureAccountPreview,
  type SecureAccountResult,
  type SecureGroup,
} from '@/lib/admin/secure-account';

export type SecureOutcome<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type Target = {
  id: string;
  isAdmin: boolean;
  banReason: string | null;
};

async function loadTarget(actorId: string, targetId: string): Promise<SecureOutcome<Target>> {
  if (targetId === actorId) {
    return {
      ok: false,
      status: 400,
      error: 'Use your own settings to secure your account',
    };
  }
  const target = await prisma.user.findUnique({
    where: {
      id: targetId,
    },
    select: {
      id: true,
      isAdmin: true,
      banReason: true,
    },
  });
  if (!target)
    return {
      ok: false,
      status: 404,
      error: 'User not found',
    };
  if (isDeletedAccount(target)) {
    return {
      ok: false,
      status: 409,
      error: 'This account has been deleted',
    };
  }
  if (target.isAdmin) {
    return {
      ok: false,
      status: 403,
      error: 'Cannot secure an admin account',
    };
  }
  return {
    ok: true,
    value: target,
  };
}

/** One count query per group, in parallel, plus the read-only sign-in methods. */
export async function previewSecureAccount(
  actorId: string,
  targetId: string,
): Promise<SecureOutcome<SecureAccountPreview>> {
  const loaded = await loadTarget(actorId, targetId);
  if (!loaded.ok) return loaded;
  const now = new Date();
  const [sessions, apiKeys, rmhCodeTokens, webhooks, feed, passkeys, accounts] = await Promise.all([
    prisma.session.count({
      where: {
        userId: targetId,
        expiresAt: {
          gt: now,
        },
      },
    }),
    prisma.developerApiKey.count({
      where: {
        userId: targetId,
        revokedAt: null,
      },
    }),
    prisma.rmhCodeToken.count({
      where: {
        userId: targetId,
        revokedAt: null,
      },
    }),
    prisma.webhookEndpoint.count({
      where: {
        userId: targetId,
        enabled: true,
      },
    }),
    prisma.calendarFeed.count({
      where: {
        userId: targetId,
      },
    }),
    prisma.passkey.findMany({
      where: {
        userId: targetId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    }),
    prisma.account.findMany({
      where: {
        userId: targetId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      select: {
        id: true,
        providerId: true,
        createdAt: true,
      },
    }),
  ]);
  return {
    ok: true,
    value: {
      sessions,
      apiKeys,
      rmhCodeTokens,
      webhooks,
      calendarFeed: feed > 0,
      passkeys: passkeys.map((p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt?.toISOString() ?? null,
      })),
      accounts: accounts.map((a) => ({
        id: a.id,
        providerId: a.providerId,
        createdAt: a.createdAt.toISOString(),
      })),
    },
  };
}

export async function secureAccount(
  actorId: string,
  targetId: string,
  input: {
    groups: SecureGroup[];
    reason: string;
  },
): Promise<SecureOutcome<SecureAccountResult>> {
  const loaded = await loadTarget(actorId, targetId);
  if (!loaded.ok) return loaded;
  const groups = input.groups;
  const has = (g: SecureGroup) => groups.includes(g);
  const reason = input.reason.trim();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const out: SecureAccountResult = {
      at: now.toISOString(),
      groups,
      sessions: 0,
      apiKeys: 0,
      rmhCodeTokens: 0,
      webhooks: 0,
      calendarRotated: false,
    };

    if (has('sessions')) {
      out.sessions = (
        await tx.session.deleteMany({
          where: {
            userId: targetId,
          },
        })
      ).count;
      // Better Auth keys a password reset as `reset-password:<token>` with the user id as the
      // value; a pending link would let whoever holds it back in, so it goes with the sessions.
      // Other verifications are not keyed by the user (an email-change link carries the address
      // in a signed token, not this id), so a pending email change survives; see the feature doc.
      await tx.verification.deleteMany({
        where: {
          value: targetId,
        },
      });
      // A device the account was signed in on keeps its web-push subscription after its session
      // is gone; a compromised one should not go on receiving the member's notifications.
      await tx.pushSubscription.deleteMany({
        where: {
          userId: targetId,
        },
      });
    }
    if (has('tokens')) {
      out.apiKeys = (
        await tx.developerApiKey.updateMany({
          where: {
            userId: targetId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        })
      ).count;
      out.rmhCodeTokens = (
        await tx.rmhCodeToken.updateMany({
          where: {
            userId: targetId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        })
      ).count;
    }
    if (has('webhooks')) {
      // Every endpoint gets a fresh secret (a stolen one verifies nothing); only the ones that were
      // enabled count as revoked, so a second run reports zero.
      const endpoints = await tx.webhookEndpoint.findMany({
        where: {
          userId: targetId,
        },
        select: {
          id: true,
          enabled: true,
        },
      });
      for (const e of endpoints) {
        await tx.webhookEndpoint.update({
          where: {
            id: e.id,
          },
          data: {
            enabled: false,
            secret: generateWebhookSecret(),
            previousSecret: null,
            previousSecretExpiresAt: null,
          },
        });
        if (e.enabled) out.webhooks += 1;
      }
    }
    if (has('calendar')) {
      const { count } = await tx.calendarFeed.updateMany({
        where: {
          userId: targetId,
        },
        data: {
          token: randomBytes(24).toString('base64url'),
          rotatedAt: now,
        },
      });
      out.calendarRotated = count > 0;
    }

    await recordAdminActionIn(tx, actorId, 'user.secure_account', {
      targetType: 'user',
      targetId,
      detail: reason,
    });
    await tx.moderatorNote.create({
      data: {
        subjectId: targetId,
        authorId: actorId,
        body: `Secured account: ${reason}`,
      },
    });
    await tx.securityEvent.create({
      data: {
        userId: targetId,
        kind: 'account_secured_by_admin',
      },
    });
    return out;
  });

  await notifyMember(targetId, result);
  return {
    ok: true,
    value: result,
  };
}

/* -------------------------------------------------------------------------- */
/* After commit: tell the member. Never includes the admin's reason.           */
/* -------------------------------------------------------------------------- */

async function strings(result: SecureAccountResult): Promise<{
  preview: string;
  subject: string;
  body: string;
  cta: string;
}> {
  const fallback = {
    preview: 'Staff signed your account out everywhere and revoked its keys.',
    subject: 'Your RMH Studios account was secured',
    body: 'RMH Studios staff secured your account after a report that it may have been accessed by someone else. What changed: {{list}}. Change your password and remove any passkeys or linked sign-in accounts you do not recognise.',
    cta: 'Review your sign-in methods',
  };
  const list = changedList(result);
  try {
    const [{ getServerI18n }, { preloadLocale }] = await Promise.all([
      import('@/lib/i18n/instances'),
      import('@/lib/i18n/resources.server'),
    ]);
    if (DEFAULT_LOCALE !== 'en') await preloadLocale(DEFAULT_LOCALE);
    const t = getServerI18n(DEFAULT_LOCALE).t;
    return {
      preview: t('admin-secure-account:notice-preview', {
        defaultValue: fallback.preview,
      }),
      subject: t('admin-secure-account:notice-subject', {
        defaultValue: fallback.subject,
      }),
      body: t('admin-secure-account:notice-body', {
        list,
        defaultValue: fallback.body,
      }),
      cta: t('admin-secure-account:notice-cta', {
        defaultValue: fallback.cta,
      }),
    };
  } catch {
    return {
      ...fallback,
      body: fallback.body.replace('{{list}}', list),
    };
  }
}

function changedList(r: SecureAccountResult): string {
  const parts: string[] = [];
  if (r.groups.includes('sessions')) parts.push('signed out of every device');
  if (r.groups.includes('tokens')) parts.push('API keys and RMHCode sign-ins revoked');
  if (r.groups.includes('webhooks')) parts.push('webhooks disabled with new secrets');
  if (r.groups.includes('calendar')) parts.push('calendar link replaced');
  return parts.join(', ');
}

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function notifyMember(userId: string, result: SecureAccountResult): Promise<void> {
  try {
    const s = await strings(result);
    await dispatch({
      userId,
      category: 'system',
      type: 'SYSTEM',
      entityType: ACCOUNT_SECURED_ENTITY,
      entityId: `secured:${result.at}`,
      preview: s.preview,
      link: SECURITY_PAGE_PATH,
      urgency: 'critical',
    });
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        email: true,
      },
    });
    if (user?.email && (await canEmail(userId, 'security'))) {
      const link = `${SITE_URL}${SECURITY_PAGE_PATH}`;
      await sendOnce({
        userId,
        kind: 'security',
        dedupeKey: `security:secured-by-admin:${result.at}`,
        to: user.email,
        subject: s.subject,
        html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(s.subject)}</h1><p style="line-height:1.5">${escapeHtml(s.body)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(s.cta)}</a></p></div>`,
        text: `${s.subject}\n\n${s.body}\n\n${s.cta}: ${link}`,
      });
    }
  } catch (err) {
    console.error('[secure-account] notice failed:', err);
  }
}
