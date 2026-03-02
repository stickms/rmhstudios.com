/**
 * Athora — Content Moderation
 *
 * Basic content filtering for chat messages.
 * Production should use an external moderation API.
 */

const URL_REGEX = /https?:\/\/[^\s]+/gi;
const REPEATED_CHARS_REGEX = /(.)\1{8,}/;

interface ModerationResult {
  allowed: boolean;
  reason?: string;
}

export async function moderateContent(text: string): Promise<ModerationResult> {
  // Empty check
  if (!text.trim()) {
    return { allowed: false, reason: "Empty message" };
  }

  // Length check
  if (text.length > 2000) {
    return { allowed: false, reason: "Message too long" };
  }

  // Spam detection: excessive URLs
  const urls = text.match(URL_REGEX);
  if (urls && urls.length > 3) {
    return { allowed: false, reason: "Too many links" };
  }

  // Spam detection: repeated characters
  if (REPEATED_CHARS_REGEX.test(text)) {
    return { allowed: false, reason: "Spam detected" };
  }

  // All caps check (if message is long enough)
  if (text.length > 20 && text === text.toUpperCase() && /[A-Z]/.test(text)) {
    return { allowed: false, reason: "Please don't use all caps" };
  }

  return { allowed: true };
}

/**
 * Rate limiting for moderation (in-memory, per-user)
 */
const userMessageCounts = new Map<
  string,
  { count: number; resetAt: number }
>();

export function checkMessageRateLimit(
  userId: string,
  maxPerMinute: number = 30
): boolean {
  const now = Date.now();
  const entry = userMessageCounts.get(userId);

  if (!entry || now > entry.resetAt) {
    userMessageCounts.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= maxPerMinute) {
    return false;
  }

  entry.count++;
  return true;
}
