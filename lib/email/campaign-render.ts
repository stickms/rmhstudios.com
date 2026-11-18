/**
 * Render an admin campaign into the HTML and plain-text parts of one email.
 * Pure (no Node or Prisma), so the composer could preview with it and the
 * escaping is unit-tested (`campaign-render.test.ts`).
 *
 * The body is plain text an admin typed, never HTML: it is escaped, blank lines
 * become paragraphs, single newlines become line breaks, and bare http(s) URLs
 * become links. `{{name}}` is replaced with the reader's display name.
 * Email clients ignore stylesheets and tokens, so styles are inline.
 */

export interface RenderInput {
  subject: string;
  body: string;
  /** The reader's display name; falls back to "there". */
  name?:
    | string
    | null;
  /** Shown in the footer as the reason for the email. */
  reason: string;
  /** One-click unsubscribe page for the list, or null for a required notice. */
  unsubscribeUrl:
    | string
    | null;
  /** Where "Email settings" in the footer goes. */
  settingsUrl: string;
  /** Absolute URLs of pictures shown under the message (validated as site images upstream). */
  imageUrls?: readonly string[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(
  value: string,
): string {
  return value
    .replace(
      /&/g,
      '&amp;',
    )
    .replace(
      /</g,
      '&lt;',
    )
    .replace(
      />/g,
      '&gt;',
    )
    .replace(
      /"/g,
      '&quot;',
    )
    .replace(
      /'/g,
      '&#39;',
    );
}

const URL_RE =
  /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

/** Escape a line, then turn bare URLs into links (matched on the raw text, so no double escape). */
export function linkify(
  line: string,
  color = '#111',
): string {
  let out =
    '';
  let last = 0;
  for (const match of line.matchAll(
    URL_RE,
  )) {
    const url =
      match[0];
    const at =
      match.index ??
      0;
    out +=
      escapeHtml(
        line.slice(
          last,
          at,
        ),
      );
    out += `<a href="${escapeHtml(url)}" style="color:${color};text-decoration:underline">${escapeHtml(url)}</a>`;
    last =
      at +
      url.length;
  }
  return (
    out +
    escapeHtml(
      line.slice(
        last,
      ),
    )
  );
}

export function personalise(
  text: string,
  name: string,
): string {
  return text.replace(
    /\{\{\s*name\s*\}\}/g,
    name,
  );
}

export function renderCampaignEmail(
  input: RenderInput,
): RenderedEmail {
  const name =
    input.name?.trim() ||
    'there';
  const subject =
    personalise(
      input.subject,
      name,
    )
      .replace(
        /[\r\n]+/g,
        ' ',
      )
      .trim();
  const body =
    personalise(
      input.body,
      name,
    )
      .replace(
        /\r\n?/g,
        '\n',
      )
      .trim();
  const paragraphs =
    body
      .split(
        /\n{2,}/,
      )
      .filter(
        (
          p,
        ) =>
          p.trim()
            .length >
          0,
      );

  const htmlParagraphs =
    paragraphs
      .map(
        (
          p,
        ) =>
          `<p style="margin:0 0 16px;line-height:1.6;font-size:15px">${p
            .split(
              '\n',
            )
            .map(
              (
                line,
              ) =>
                linkify(
                  line,
                ),
            )
            .join(
              '<br>',
            )}</p>`,
      )
      .join(
        '',
      );

  const htmlImages =
    (
      input.imageUrls ??
      []
    )
      .filter(
        (
          url,
        ) =>
          /^https:\/\//.test(
            url,
          ),
      )
      .map(
        (
          url,
        ) =>
          `<p style="margin:0 0 16px"><img src="${escapeHtml(url)}" alt="" width="512" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:8px"></p>`,
      )
      .join(
        '',
      );

  const footerLinks =
    [
      `<a href="${escapeHtml(input.settingsUrl)}" style="color:#555">Email settings</a>`,
      ...(input.unsubscribeUrl
        ? [
            `<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#555">Unsubscribe</a>`,
          ]
        : []),
    ].join(
      ' · ',
    );

  const html =
    [
      '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">',
      `<h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;font-weight:600">${escapeHtml(subject)}</h1>`,
      htmlParagraphs,
      htmlImages,
      '<hr style="border:0;border-top:1px solid #ddd;margin:24px 0 12px">',
      `<p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:#555">${escapeHtml(input.reason)}</p>`,
      `<p style="margin:0;font-size:12px;line-height:1.5;color:#555">${footerLinks}</p>`,
      '</div>',
    ].join(
      '',
    );

  const text =
    [
      subject,
      '',
      paragraphs.join(
        '\n\n',
      ),
      '',
      '--',
      input.reason,
      `Email settings: ${input.settingsUrl}`,
      ...(input.unsubscribeUrl
        ? [
            `Unsubscribe: ${input.unsubscribeUrl}`,
          ]
        : []),
    ].join(
      '\n',
    );

  return {
    subject,
    html,
    text,
  };
}
