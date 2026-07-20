/**
 * Shared transactional email sender (server-only).
 *
 * A thin wrapper over the Resend HTTP API, extracted from the RMHLadder alert
 * dispatcher's inline `sendEmail` so any feature (weekly digest, future
 * notifications) can send an HTML email the same way. Best-effort by design:
 *
 *  - When `RESEND_API_KEY` is unset (dev/local/CI), it LOGS the message and
 *    returns `true` instead of hitting the network, so callers behave the same
 *    with or without a configured provider.
 *  - Any transport/HTTP error is caught and logged; the function returns
 *    `false` rather than throwing, so a single bad address never aborts a batch.
 *
 * The from-address comes from `EMAIL_FROM` (falling back to the Ladder's
 * existing `RESEND_FROM_EMAIL`, then a sensible default).
 */

export interface SendEmailInput {
  /** Recipient email address. */
  to: string;
  subject: string;
  /** Rendered HTML body (email clients ignore <style>/tokens — inline styles only). */
  html: string;
  /** Optional plain-text alternative (recommended for deliverability). */
  text?: string;
  /** Extra headers, e.g. `List-Unsubscribe` / `List-Unsubscribe-Post`. */
  headers?: Record<string, string>;
}

/** Default from-address when neither env var is configured. */
const DEFAULT_FROM = 'RMH Studios <noreply@rmhstudios.com>';

function fromAddress(): string {
  return process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
}

/**
 * Send one email. Resolves `true` when the message was accepted (or logged in
 * dev), `false` on a delivery failure. Never throws.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  // Dev / unconfigured: log instead of sending so local runs and CI don't need
  // a provider, and callers see the same success path.
  if (!apiKey) {
    console.warn(
      `[email] (dev, not sent) to=${input.to} subject=${JSON.stringify(input.subject)}`,
    );
    return true;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`[email] Resend HTTP ${response.status} for ${input.to}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[email] send failed:', error instanceof Error ? error.message : error);
    return false;
  }
}
