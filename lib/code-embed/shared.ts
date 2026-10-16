import { z } from 'zod';

/** Per-field and total size limits for a runnable post embed (F14). */
export const EMBED_FIELD_MAX = 10_000;
export const EMBED_TOTAL_MAX = 24_000;

export const codeEmbedSchema = z
  .object({
    html: z.string().max(EMBED_FIELD_MAX).default(''),
    css: z.string().max(EMBED_FIELD_MAX).default(''),
    js: z.string().max(EMBED_FIELD_MAX).default(''),
  })
  .refine((e) => e.html.length + e.css.length + e.js.length > 0, { message: 'Snippet is empty' })
  .refine((e) => e.html.length + e.css.length + e.js.length <= EMBED_TOTAL_MAX, {
    message: 'Snippet is too large',
  });

export type CodeEmbed = z.infer<typeof codeEmbedSchema>;

/**
 * No network of any kind (no default-src means no fetch/XHR/WebSocket/frames/
 * images from a URL), inline script and style only, data:/blob: media.
 */
const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; " +
  "media-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'";

/** Keep user text from closing our own `<style>`/`<script>` wrappers early. */
const closeSafe = (s: string, tag: 'style' | 'script') =>
  s.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

/**
 * The document handed to `<iframe srcdoc sandbox="allow-scripts">`. The CSP meta
 * is the first element, so nothing the author writes can run before it applies.
 */
export function buildSrcdoc(e: CodeEmbed): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>html{background:#fff;color:#111}body{margin:0;padding:8px;font-family:system-ui,sans-serif}${closeSafe(e.css, 'style')}</style>` +
    `</head><body>${e.html}<script>${closeSafe(e.js, 'script')}</script></body></html>`
  );
}
