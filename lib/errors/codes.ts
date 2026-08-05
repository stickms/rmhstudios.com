/**
 * The site's error taxonomy — one code per failure mode, shared by every layer.
 *
 * Before this, an error had three spellings and no machine-readable identity:
 * the site envelope (`{ error: 'Insufficient coins' }` from
 * `lib/api/handler.server.ts`), the developer-API envelope
 * (`{ error: { type, code, message, request_id } }` from `lib/api/errors.ts`),
 * and whatever a socket handler emitted. Client code therefore branched on
 * English *strings*, which meant two things at once: a copy edit could break a
 * client behaviour, and error messages could never be translated — every user
 * on all 16 locales read English failures.
 *
 * A code fixes both. The server sends a stable symbol; the client renders
 * `t(ERROR_CODES[code].i18n)`. The English text here is the fallback used when
 * the `errors` namespace has not loaded yet (or on a server-rendered error
 * page), never the primary source.
 *
 * Client-safe on purpose — this module is imported by components. Keep it free
 * of Prisma, `node:*` and any `.server` import.
 */

/** Every failure the site names. Add here before throwing anything new. */
export const ERROR_CODES = {
  // --- auth / access -------------------------------------------------------
  UNAUTHORIZED: { http: 401, i18n: 'errors:unauthorized', text: 'Sign in to continue' },
  FORBIDDEN: { http: 403, i18n: 'errors:forbidden', text: "You don't have access to this" },
  UPGRADE_REQUIRED: {
    http: 402,
    i18n: 'errors:upgradeRequired',
    text: 'This feature needs a membership',
  },

  // --- input ---------------------------------------------------------------
  INVALID_INPUT: { http: 400, i18n: 'errors:invalidInput', text: 'Check the form and try again' },
  NOT_FOUND: { http: 404, i18n: 'errors:notFound', text: "That doesn't exist (or was removed)" },
  CONFLICT: { http: 409, i18n: 'errors:conflict', text: 'Someone else changed this first' },
  GONE: { http: 410, i18n: 'errors:gone', text: 'That has expired' },

  // --- limits --------------------------------------------------------------
  RATE_LIMITED: { http: 429, i18n: 'errors:rateLimited', text: 'Slow down for a moment' },
  QUOTA_EXCEEDED: { http: 413, i18n: 'errors:quotaExceeded', text: "You're out of storage" },
  QUERY_BUDGET_EXCEEDED: {
    http: 500,
    i18n: 'errors:queryBudget',
    text: 'That request was too expensive to serve',
  },

  // --- economy -------------------------------------------------------------
  INSUFFICIENT_COINS: {
    http: 402,
    i18n: 'errors:insufficientCoins',
    text: "You don't have enough coins",
  },
  STAKE_LIMIT_REACHED: {
    http: 403,
    i18n: 'errors:stakeLimit',
    text: "You've reached the limit you set",
  },

  // --- AI ------------------------------------------------------------------
  AI_UNAVAILABLE: { http: 503, i18n: 'errors:aiUnavailable', text: 'AI features are offline' },
  AI_BUDGET_EXCEEDED: {
    http: 402,
    i18n: 'errors:aiBudget',
    text: "You've used this month's AI allowance",
  },

  // --- dependencies --------------------------------------------------------
  STORAGE_UNAVAILABLE: {
    http: 503,
    i18n: 'errors:storageUnavailable',
    text: 'Uploads are temporarily unavailable',
  },
  INTERNAL: { http: 500, i18n: 'errors:internal', text: 'Something went wrong on our side' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Narrow an arbitrary string to a known code (for parsing a server response). */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in ERROR_CODES;
}

/**
 * A failure with an identity.
 *
 * Throw one anywhere below an API route and `defineHandler` maps it to the
 * right status with the code attached, instead of the blanket 500 an unnamed
 * exception gets. `detail` is interpolated into the translated message, so keep
 * its values safe to show a user — never a database message or a file path.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly detail: Record<string, string | number> | undefined;

  constructor(code: ErrorCode, detail?: Record<string, string | number>) {
    super(ERROR_CODES[code].text);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
  }

  get status(): number {
    return ERROR_CODES[this.code].http;
  }

  /** The site envelope, extended with the code. Shape-compatible with `apiError`. */
  toBody(): { error: string; code: ErrorCode; detail?: Record<string, string | number> } {
    return {
      error: ERROR_CODES[this.code].text,
      code: this.code,
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Resolve a server response body to display text.
 *
 * Pass the app's `t` so the message lands in the reader's language; without it
 * (server rendering, a boundary that has no i18n context) the English fallback
 * is used. Unknown or absent codes fall back to the server's `error` string,
 * which keeps this working against routes that have not adopted codes yet.
 */
export function errorMessage(
  body: unknown,
  t?: (key: string, opts: { defaultValue: string } & Record<string, unknown>) => string,
): string {
  const raw = body as { error?: unknown; code?: unknown; detail?: Record<string, unknown> } | null;
  const code = raw?.code;
  if (isErrorCode(code)) {
    const def = ERROR_CODES[code];
    return t ? t(def.i18n, { defaultValue: def.text, ...(raw?.detail ?? {}) }) : def.text;
  }
  if (typeof raw?.error === 'string' && raw.error) return raw.error;
  return ERROR_CODES.INTERNAL.text;
}
