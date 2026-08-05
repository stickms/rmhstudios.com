/**
 * New-device sign-in alerts (B11).
 *
 * When someone else signs into your account, the only thing that helps is being
 * told *while it is happening*. Everything else in the security surface —
 * session lists, revoke buttons, passkeys — is reactive: it works if you go
 * looking. Nobody goes looking.
 *
 * ── Why the fingerprint is deliberately coarse ─────────────────────────────
 * `deviceFingerprint` returns "Chrome on macOS", not a hash of the full
 * User-Agent plus screen metrics. That is not laziness, it is the design:
 *
 *  - The question this feature asks the user is "**is this familiar to you?**"
 *    A high-entropy fingerprint answers a different question ("is this the same
 *    physical machine?") that the user cannot verify and that changes on every
 *    browser update — so it fires on Chrome 141 → 142 and trains the user to
 *    ignore the alert, which is strictly worse than not sending one.
 *  - A stable cross-site device identifier is a tracking primitive. Building one
 *    to protect users from surveillance is a poor trade, and storing it makes it
 *    something that can leak.
 *
 * The cost is real and accepted: two people on Chrome/macOS behind the same
 * account look identical here, so a co-worker on the same setup would not
 * trigger an alert. The IP is hashed alongside (via `lib/hash-ip.server`) so
 * abuse correlation still has something to work with, without storing addresses.
 *
 * ── Geolocation ────────────────────────────────────────────────────────────
 * There is no geo-IP provider in this stack and this module does not add one.
 * The alert says location unavailable rather than guessing — "signed in from
 * Ashburn, VA" derived from a datacenter IP is worse than silence, because the
 * user reasons about it as evidence.
 *
 * `onSessionCreated` is exported for the auth layer to call; it is NOT wired
 * into `lib/auth.ts` here (see the call-site note on the function).
 */

import { prisma } from '@/lib/prisma.server';
import { hashIp } from '@/lib/hash-ip.server';
import { getClientIp } from '@/lib/rate-limit';
import { dispatch } from '@/lib/notify/dispatch.server';
import { sendEmail } from '@/lib/email/send.server';
import { SITE_URL } from '@/lib/seo';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { parseLocaleCookie, resolveLocale } from '@/lib/i18n/resolve';

/* -------------------------------------------------------------------------- */
/* Fingerprint (pure)                                                          */
/* -------------------------------------------------------------------------- */

/** Label used when the User-Agent tells us nothing. Never an empty string —
 *  the column is queried by equality, and `null`/`''` would collapse every
 *  unidentifiable client into "already seen". */
export const UNKNOWN_DEVICE = 'Unknown device';

/** `Session.deviceFp` is `@db.VarChar(80)`. */
const MAX_FP_LENGTH = 80;

/**
 * Browser families, **most specific first**. Order is the entire correctness of
 * this table: Edge's UA contains `Chrome/` and `Safari/`, Chrome's contains
 * `Safari/`, and every iOS browser contains `Safari/` because they are all
 * WebKit underneath. A reordering silently relabels a third of real traffic.
 */
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bEdg(?:A|iOS|e)?\//i, 'Edge'],
  [/\bOPR\/|\bOpera(?:GX|Mini)?[/ ]/i, 'Opera'],
  [/\bSamsungBrowser\//i, 'Samsung Internet'],
  [/\bVivaldi\//i, 'Vivaldi'],
  [/\bBrave\//i, 'Brave'],
  [/\bDuckDuckGo\//i, 'DuckDuckGo'],
  [/\bFirefox\/|\bFxiOS\//i, 'Firefox'],
  [/\bCriOS\/|\bChrome\/|\bChromium\//i, 'Chrome'],
  [/\bSafari\//i, 'Safari'],
];

/**
 * Operating systems, also most specific first. iOS advertises "like Mac OS X",
 * Android advertises "Linux", and ChromeOS advertises "X11" — so the generic
 * entries must come last or they swallow the specific ones.
 */
const PLATFORMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\biPhone\b/i, 'iPhone'],
  [/\biPad\b/i, 'iPad'],
  [/\bAndroid\b/i, 'Android'],
  [/\bCrOS\b/i, 'ChromeOS'],
  [/\bWindows\b/i, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/i, 'macOS'],
  [/\bLinux\b|\bX11\b/i, 'Linux'],
];

function matchTable(ua: string, table: ReadonlyArray<readonly [RegExp, string]>): string | null {
  for (const [pattern, label] of table) {
    if (pattern.test(ua)) return label;
  }
  return null;
}

/**
 * Coarse, human-readable device label from a User-Agent string.
 *
 * PURE and total: any input — `null`, `''`, 4 KB of binary, a UA crafted to look
 * like a sentence — returns a short printable label and never throws. It is a
 * unit-testable function over a string rather than over a `Request` precisely so
 * the table above can be exercised against real User-Agents in CI.
 *
 * @example deviceFingerprint(chromeMacUa) // "Chrome on macOS"
 * @example deviceFingerprint('')          // "Unknown device"
 */
export function deviceFingerprint(userAgent: string | null | undefined): string {
  if (typeof userAgent !== 'string') return UNKNOWN_DEVICE;
  // Collapse whitespace and strip control characters before matching: the value
  // is stored and rendered into an email, and a UA header is attacker-supplied.
  // The control-character class IS the point of this line, hence the disable.
  const ua = userAgent
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!ua) return UNKNOWN_DEVICE;

  const browser = matchTable(ua, BROWSERS);
  const platform = matchTable(ua, PLATFORMS);

  const label =
    browser && platform ? `${browser} on ${platform}` : (browser ?? platform ?? UNKNOWN_DEVICE);
  return label.slice(0, MAX_FP_LENGTH);
}

/** `deviceFingerprint` over a request's `User-Agent` header. */
export function deviceFingerprintFromRequest(request: Request): string {
  return deviceFingerprint(request.headers.get('user-agent'));
}

/* -------------------------------------------------------------------------- */
/* Alerting                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Query param the alert email appends to `/settings/security`, naming the
 * session to revoke. The security page can read it to pre-select that row; the
 * link is safe to be a GET because it only *targets* a revoke, it does not
 * perform one — a one-click GET that destroys a session is a CSRF hole and a
 * gift to every link-prefetching mail client.
 */
export const SESSION_ALERT_REVOKE_PARAM = 'revoke';

/** Minimal structural view of a freshly created session row. */
export interface CreatedSession {
  id: string;
  userId: string;
}

/**
 * A brand-new account's first session is not a "new device" — it is the sign-up.
 * Alerting on it emails a welcome-adjacent security warning about the browser
 * the user is looking at, which reads as a bug. Only suppressed when the account
 * itself is this young, so a genuinely dormant account signing in from a fresh
 * browser still alerts.
 */
const SIGNUP_GRACE_MS = 5 * 60 * 1000;

export interface SessionAlertResult {
  deviceFp: string;
  /** Whether this device had been seen on the account before. */
  known: boolean;
  /** Whether an alert was actually sent (false for known devices and sign-ups). */
  alerted: boolean;
}

/**
 * Stamp a new session with its device fingerprint + hashed IP and, when the
 * device is unfamiliar, tell the owner.
 *
 * **Call site (not wired here — `lib/auth.ts` is out of scope for this change):**
 * Better Auth's `databaseHooks.session.create.after` is the right seam —
 *
 * ```ts
 * databaseHooks: {
 *   session: {
 *     create: {
 *       after: async (session, ctx) => {
 *         if (ctx?.request) void onSessionCreated(session, ctx.request);
 *       },
 *     },
 *   },
 * },
 * ```
 *
 * `void` it: the alert is best-effort and must never sit in front of the
 * sign-in response. Everything below is wrapped so a failure cannot reject.
 */
export async function onSessionCreated(
  session: CreatedSession,
  request: Request,
): Promise<SessionAlertResult> {
  const deviceFp = deviceFingerprintFromRequest(request);
  const result: SessionAlertResult = { deviceFp, known: true, alerted: false };

  try {
    const ipHash = hashIp(getClientIp(request));

    // Has this account ever had a session on this device family? Excluding the
    // row we are about to stamp, which would otherwise always match itself.
    const prior = await prisma.session.findFirst({
      where: { userId: session.userId, deviceFp, id: { not: session.id } },
      select: { id: true },
    });
    const known = prior !== null;
    result.known = known;

    if (known) {
      // Familiar device: record the fingerprint/IP for the session list and stop.
      // `alertedAt` stays null — nothing was sent, and a truthful column is what
      // makes "at most once per device" auditable later.
      await stampSession(session.id, { deviceFp, ipHash });
      return result;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true, createdAt: true },
    });

    const isSignup =
      !!user &&
      Date.now() - user.createdAt.getTime() < SIGNUP_GRACE_MS &&
      (await prisma.session.count({
        where: { userId: session.userId, id: { not: session.id } },
      })) === 0;

    if (!user || isSignup) {
      await stampSession(session.id, { deviceFp, ipHash });
      return result;
    }

    // Stamp BEFORE sending. If the send throws, the device is still recorded as
    // alerted — one missed email beats an alert loop that re-fires on every
    // session refresh from a device whose mail delivery is failing.
    await stampSession(session.id, { deviceFp, ipHash, alertedAt: new Date() });
    result.alerted = true;

    const locale = requestLocale(request);
    const strings = await alertStrings(locale, deviceFp);

    // In-app + push, ignoring quiet hours. This is the case `critical` exists
    // for: an unrecognised sign-in held until 07:00 is eight hours of access.
    await dispatch({
      userId: session.userId,
      category: 'system',
      type: 'SYSTEM',
      entityType: 'security',
      entityId: session.id,
      preview: strings.preview,
      link: revokeLink(session.id),
      urgency: 'critical',
    });

    if (user.email) {
      await sendEmail({
        to: user.email,
        subject: strings.subject,
        html: alertHtml(strings, deviceFp, session.id),
        text: alertText(strings, deviceFp, session.id),
      });
    }

    return result;
  } catch (err) {
    // Never break sign-in over a notification.
    console.error('[session-alert] onSessionCreated failed:', err);
    return result;
  }
}

async function stampSession(
  id: string,
  data: { deviceFp: string; ipHash: string; alertedAt?: Date },
): Promise<void> {
  // The session may already be gone (immediate sign-out, or a test double) —
  // `updateMany` degrades to a no-op where `update` would throw P2025.
  await prisma.session.updateMany({ where: { id }, data });
}

function revokeLink(sessionId: string): string {
  return `${SITE_URL}/settings/security?${SESSION_ALERT_REVOKE_PARAM}=${encodeURIComponent(sessionId)}`;
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

interface AlertStrings {
  subject: string;
  heading: string;
  intro: string;
  deviceLabel: string;
  locationLabel: string;
  locationUnknown: string;
  cta: string;
  reassure: string;
  preview: string;
}

function requestLocale(request: Request): Locale {
  try {
    return resolveLocale({
      cookie: parseLocaleCookie(request.headers.get('cookie')),
      acceptLanguage: request.headers.get('accept-language'),
    });
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * The alert copy, in the signer-in's language.
 *
 * i18next is imported dynamically: this module is reachable from the auth path,
 * and a static import would drag the react-i18next instance + core catalogs into
 * every sign-in. `preloadLocale` is awaited first because `getServerI18n` reads
 * a *warm* cache synchronously (see `lib/i18n/resources.server.ts`) — without it
 * a non-English recipient silently gets the English `defaultValue`.
 */
async function alertStrings(locale: Locale, deviceFp: string): Promise<AlertStrings> {
  const fallback: AlertStrings = {
    subject: 'New sign-in to your RMH Studios account',
    heading: 'New sign-in detected',
    intro: 'Your account was just signed into from a device we have not seen before.',
    deviceLabel: 'Device',
    locationLabel: 'Location',
    locationUnknown: 'Not available',
    cta: 'Review and sign out this device',
    reassure: 'If this was you, no action is needed.',
    preview: `New sign-in from ${deviceFp}`,
  };

  try {
    const [{ getServerI18n }, { preloadLocale }] = await Promise.all([
      import('@/lib/i18n/instances'),
      import('@/lib/i18n/resources.server'),
    ]);
    if (locale !== DEFAULT_LOCALE) await preloadLocale(locale);
    const t = getServerI18n(locale).t;
    return {
      subject: t('settings-notifications:device-alert-subject', {
        defaultValue: 'New sign-in to your RMH Studios account',
      }),
      heading: t('settings-notifications:device-alert-heading', {
        defaultValue: 'New sign-in detected',
      }),
      intro: t('settings-notifications:device-alert-intro', {
        defaultValue: 'Your account was just signed into from a device we have not seen before.',
      }),
      deviceLabel: t('settings-notifications:device-alert-device', { defaultValue: 'Device' }),
      locationLabel: t('settings-notifications:device-alert-location', {
        defaultValue: 'Location',
      }),
      locationUnknown: t('settings-notifications:device-alert-location-unknown', {
        defaultValue: 'Not available',
      }),
      cta: t('settings-notifications:device-alert-cta', {
        defaultValue: 'Review and sign out this device',
      }),
      reassure: t('settings-notifications:device-alert-reassure', {
        defaultValue: 'If this was you, no action is needed.',
      }),
      preview: t('settings-notifications:device-alert-preview', {
        device: deviceFp,
        defaultValue: 'New sign-in from {{device}}',
      }),
    };
  } catch {
    return fallback;
  }
}

/**
 * The device label is derived from an attacker-controlled `User-Agent` header
 * and is rendered into an HTML email, so it is escaped at the boundary rather
 * than trusted because `deviceFingerprint` "only returns known labels" — that
 * invariant is one careless table entry away from being false.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function alertHtml(strings: AlertStrings, deviceFp: string, sessionId: string): string {
  const link = revokeLink(sessionId);
  // Inline styles only — email clients strip <style> and know nothing about the
  // --site-* token layer.
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">',
    `<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(strings.heading)}</h1>`,
    `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(strings.intro)}</p>`,
    '<table style="width:100%;border-collapse:collapse;margin:0 0 20px">',
    `<tr><td style="padding:6px 0;color:#555">${escapeHtml(strings.deviceLabel)}</td>`,
    `<td style="padding:6px 0;text-align:right"><strong>${escapeHtml(deviceFp)}</strong></td></tr>`,
    `<tr><td style="padding:6px 0;color:#555">${escapeHtml(strings.locationLabel)}</td>`,
    `<td style="padding:6px 0;text-align:right">${escapeHtml(strings.locationUnknown)}</td></tr>`,
    '</table>',
    `<p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px">${escapeHtml(strings.cta)}</a></p>`,
    `<p style="margin:0;color:#666;font-size:13px">${escapeHtml(strings.reassure)}</p>`,
    '</div>',
  ].join('');
}

function alertText(strings: AlertStrings, deviceFp: string, sessionId: string): string {
  return [
    strings.heading,
    '',
    strings.intro,
    '',
    `${strings.deviceLabel}: ${deviceFp}`,
    `${strings.locationLabel}: ${strings.locationUnknown}`,
    '',
    `${strings.cta}: ${revokeLink(sessionId)}`,
    '',
    strings.reassure,
  ].join('\n');
}
