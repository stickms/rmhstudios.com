import { createHmac, timingSafeEqual } from 'node:crypto';

export type NewsApprovalAction = 'approve' | 'reject';
const MAX_AGE_SECONDS = 24 * 60 * 60;
const payload = (action: NewsApprovalAction, slug: string, issuedAt: number) => `${action}\n${issuedAt}\n${slug}`;

export function createNewsApprovalToken(action: NewsApprovalAction, slug: string, issuedAt = Math.floor(Date.now() / 1000)): string {
  const secret = process.env.NEWS_APPROVAL_SECRET;
  if (!secret) throw new Error('NEWS_APPROVAL_SECRET is required');
  return `${issuedAt}.${createHmac('sha256', secret).update(payload(action, slug, issuedAt)).digest('hex')}`;
}

export function verifyNewsApprovalToken(action: NewsApprovalAction, slug: string, token: string): boolean {
  const secret = process.env.NEWS_APPROVAL_SECRET;
  const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(token);
  if (!secret || !match) return false;
  const issuedAt = Number(match[1]);
  const age = Math.floor(Date.now() / 1000) - issuedAt;
  if (!Number.isSafeInteger(issuedAt) || age < -300 || age > MAX_AGE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(payload(action, slug, issuedAt)).digest();
  const supplied = Buffer.from(match[2], 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export const newsActionHeaders = (contentType = 'text/html; charset=utf-8'): HeadersInit => ({
  'Content-Type': contentType,
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

export function newsConfirmationHtml(action: NewsApprovalAction, slug: string, token: string): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Confirm ${action}</title></head><body><main><h1>Confirm ${action}</h1><p>Article: <strong>${escape(slug)}</strong></p><p>This link expires after 24 hours and does not change state until you confirm.</p><form method="post"><input type="hidden" name="slug" value="${escape(slug)}"><input type="hidden" name="token" value="${escape(token)}"><button type="submit">Confirm ${action}</button></form></main></body></html>`;
}
