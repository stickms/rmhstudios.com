/**
 * The rules a designed email must keep, whatever the model returned. Pure and
 * client-safe; the server runs it on every design it accepts (from the AI, and
 * again on test, preview and send).
 *
 *  - **Links:** a button may point only at rmhstudios.com (or a subdomain), or
 *    at a URL that appears word for word in the admin's own message. A model
 *    cannot invent a destination, and a mailing cannot be turned into a
 *    phishing link.
 *  - **Pictures:** an image block may name only a picture the admin attached,
 *    once. Attached pictures the design leaves out are added at the end, so
 *    none silently disappear.
 *  - **Never empty:** if nothing usable is left, the message body becomes the
 *    one text block.
 */
import { SITE_URL } from '@/lib/seo';
import type { EmailDesign, EmailDesignBlock } from '@/lib/email/campaign-schema';

const SITE_HOST = new URL(SITE_URL).hostname;

/** Bare http(s) URLs in a piece of text, as the plain renderer links them. */
export function urlsIn(text: string): string[] {
  return [...text.matchAll(/\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g)].map((m) => m[0]);
}

/** The URL a button may use, or null when it may not. */
export function allowedButtonUrl(raw: string, messageUrls: readonly string[]): string | null {
  const url = raw.trim();
  if (url.startsWith('/') && !url.startsWith('//')) return `${SITE_URL}${url}`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase();
  if (host === SITE_HOST || host.endsWith(`.${SITE_HOST}`)) return parsed.toString();
  return messageUrls.includes(url) ? url : null;
}

export function sanitizeDesign(
  design: EmailDesign,
  ctx: { body: string; imageCount: number },
): EmailDesign {
  const messageUrls = urlsIn(ctx.body);
  const usedImages = new Set<number>();
  const blocks: EmailDesignBlock[] = [];

  for (const block of design.blocks) {
    if (block.type === 'button') {
      const url = allowedButtonUrl(block.url, messageUrls);
      if (url) blocks.push({ ...block, url });
      continue;
    }
    if (block.type === 'image') {
      if (block.image < ctx.imageCount && !usedImages.has(block.image)) {
        usedImages.add(block.image);
        blocks.push(block);
      }
      continue;
    }
    // Two rules in a row, or a rule at either end, is decoration with nothing to divide.
    if (block.type === 'divider' && (blocks.length === 0 || blocks.at(-1)?.type === 'divider')) continue;
    blocks.push(block);
  }
  while (blocks.at(-1)?.type === 'divider') blocks.pop();

  for (let i = 0; i < ctx.imageCount; i++) {
    if (!usedImages.has(i)) blocks.push({ type: 'image', image: i });
  }

  const hasWords = blocks.some((b) => b.type === 'text' || b.type === 'heading' || b.type === 'callout');
  if (!hasWords && ctx.body.trim()) blocks.unshift({ type: 'text', text: ctx.body.trim() });

  return { ...design, blocks: blocks.slice(0, 20) };
}
