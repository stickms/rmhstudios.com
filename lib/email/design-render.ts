/**
 * Draw a designed email (`EmailDesign`) as HTML an inbox will show the same
 * everywhere: a 600px table layout, inline styles only, no web fonts required,
 * a "bulletproof" table-cell button, and the brand kit's values
 * (`lib/email/brand.ts`). Pure and client-safe; the server renders every
 * message, test and preview with it.
 *
 * Everything a model or an admin wrote is escaped here. The design only ever
 * chooses among this file's own blocks and the brand's colours.
 */
import {
  BRAND,
  contrast,
  inkOn,
} from '@/lib/email/brand';
import {
  escapeHtml,
  linkify,
  personalise,
  type RenderedEmail,
} from '@/lib/email/campaign-render';
import type {
  EmailDesign,
  EmailDesignBlock,
} from '@/lib/email/campaign-schema';

export interface DesignRenderInput {
  subject: string;
  design: EmailDesign;
  name?:
    | string
    | null;
  reason: string;
  unsubscribeUrl:
    | string
    | null;
  settingsUrl: string;
  /** Absolute https URLs, in the order the design's image blocks index them. */
  imageUrls: readonly string[];
  /** Absolute URL of the logo PNG. */
  logoUrl: string;
}

function paragraphsOf(
  text: string,
): string[] {
  return text
    .replace(
      /\r\n?/g,
      '\n',
    )
    .trim()
    .split(
      /\n{2,}/,
    )
    .filter(
      (
        p,
      ) =>
        p.trim(),
    );
}

export function renderDesignedEmail(
  input: DesignRenderInput,
): RenderedEmail {
  const {
    design,
  } =
    input;
  const theme =
    BRAND
      .themes[
      design
        .theme
    ];
  const font =
    BRAND.fontStack;
  // The accent for this theme, unless it would not stand out against the card:
  // then the ink, which always does.
  const wanted =
    BRAND
      .accents[
      design
        .accent
    ][
      design
        .theme
    ];
  const accent =
    contrast(
      wanted,
      theme.card,
    ) >=
    3
      ? wanted
      : theme.ink;
  const onAccent =
    inkOn(
      accent,
    );
  const name =
    input.name?.trim() ||
    'there';
  const say =
    (
      text: string,
    ) =>
      personalise(
        text,
        name,
      );
  const subject =
    say(
      input.subject,
    )
      .replace(
        /[\r\n]+/g,
        ' ',
      )
      .trim();

  const textHtml =
    (
      text: string,
      size = 16,
    ) =>
      paragraphsOf(
        say(
          text,
        ),
      )
        .map(
          (
            p,
          ) =>
            `<p style="margin:0 0 16px;font-family:${font};font-size:${size}px;line-height:1.6;color:${theme.ink}">${p
              .split(
                '\n',
              )
              .map(
                (
                  line,
                ) =>
                  linkify(
                    line,
                    theme.ink,
                  ),
              )
              .join(
                '<br>',
              )}</p>`,
        )
        .join(
          '',
        );

  const row =
    (
      inner: string,
      pad = '0 32px',
    ) =>
      `<tr><td style="padding:${pad}">${inner}</td></tr>`;

  const block =
    (
      b: EmailDesignBlock,
    ): {
      html: string;
      text: string;
    } => {
      switch (
        b.type
      ) {
        case 'heading':
          return {
            html: row(
              `<h2 style="margin:8px 0 12px;font-family:${font};font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:${theme.ink}">${escapeHtml(say(b.text))}</h2>`,
            ),
            text: say(
              b.text,
            ),
          };
        case 'text':
          return {
            html: row(
              textHtml(
                b.text,
              ),
            ),
            text: say(
              b.text,
            ).trim(),
          };
        case 'button':
          return {
            html: row(
              `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td bgcolor="${accent}" style="border-radius:${BRAND.radius}px;background:${accent}"><a href="${escapeHtml(b.url)}" style="display:inline-block;padding:12px 22px;font-family:${font};font-size:15px;font-weight:500;line-height:1.2;color:${onAccent};text-decoration:none;border-radius:${BRAND.radius}px">${escapeHtml(say(b.label))}</a></td></tr></table>`,
            ),
            text: `${say(b.label)}: ${b.url}`,
          };
        case 'image': {
          const url =
            input
              .imageUrls[
              b
                .image
            ];
          if (
            !url ||
            !/^https:\/\//.test(
              url,
            )
          )
            return {
              html: '',
              text: '',
            };
          return {
            html: row(
              `<img src="${escapeHtml(url)}" alt="" width="536" style="display:block;width:100%;max-width:536px;height:auto;margin:0 0 24px;border:1px solid ${theme.border};border-radius:${BRAND.radius}px">`,
            ),
            text: '',
          };
        }
        case 'callout':
          return {
            html: row(
              `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr><td style="padding:16px 20px;border-left:3px solid ${accent};background:${theme.subtle};border-radius:0 ${BRAND.radius}px ${BRAND.radius}px 0">${
                b.title
                  ? `<p style="margin:0 0 6px;font-family:${font};font-size:15px;font-weight:600;line-height:1.4;color:${theme.ink}">${escapeHtml(say(b.title))}</p>`
                  : ''
              }${textHtml(b.text, 15).replace(/margin:0 0 16px/g, 'margin:0')}</td></tr></table>`,
            ),
            text: [
              b.title
                ? say(
                    b.title,
                  )
                : '',
              say(
                b.text,
              ),
            ]
              .filter(
                Boolean,
              )
              .join(
                '\n',
              ),
          };
        case 'list':
          return {
            html: row(
              `<ul style="margin:0 0 20px;padding:0 0 0 20px;font-family:${font};font-size:16px;line-height:1.6;color:${theme.ink}">${b.items
                .map(
                  (
                    item,
                  ) =>
                    `<li style="margin:0 0 6px">${linkify(say(item), theme.ink)}</li>`,
                )
                .join(
                  '',
                )}</ul>`,
            ),
            text: b.items
              .map(
                (
                  item,
                ) =>
                  `- ${say(item)}`,
              )
              .join(
                '\n',
              ),
          };
        case 'divider':
          return {
            html: row(
              `<div style="height:1px;line-height:1px;background:${theme.border};margin:8px 0 24px">&nbsp;</div>`,
            ),
            text: '',
          };
      }
    };

  const parts =
    design.blocks.map(
      block,
    );

  const header =
    [
      design.logo
        ? `<img src="${escapeHtml(input.logoUrl)}" width="36" height="36" alt="${escapeHtml(BRAND.logoAlt)}" style="display:block;border:0;border-radius:18px">`
        : '',
      design.eyebrow
        ? `<p style="margin:${design.logo ? '16px' : '0'} 0 0;font-family:${font};font-size:13px;font-weight:600;line-height:1.3;color:${accent === theme.ink ? theme.muted : accent}">${escapeHtml(say(design.eyebrow))}</p>`
        : '',
    ].join(
      '',
    );

  const footerLinks =
    [
      `<a href="${escapeHtml(input.settingsUrl)}" style="color:${theme.muted};text-decoration:underline">Email settings</a>`,
      ...(input.unsubscribeUrl
        ? [
            `<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${theme.muted};text-decoration:underline">Unsubscribe</a>`,
          ]
        : []),
    ].join(
      ' &middot; ',
    );

  // The preheader: inbox preview text, hidden in the opened message.
  const preheader =
    design.preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${escapeHtml(say(design.preheader))}</div>`
      : '';

  const html =
    [
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${design.theme}"><title>${escapeHtml(subject)}</title></head>`,
      `<body style="margin:0;padding:0;background:${theme.page}">`,
      preheader,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.page}"><tr><td align="center" style="padding:32px 12px">`,
      `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${theme.card};border:1px solid ${theme.border};border-radius:${BRAND.radius}px">`,
      header
        ? row(
            header,
            '32px 32px 8px',
          )
        : row(
            '',
            '24px 32px 0',
          ),
      parts
        .map(
          (
            p,
          ) =>
            p.html,
        )
        .join(
          '',
        ),
      row(
        `<div style="height:1px;line-height:1px;background:${theme.border};margin:8px 0 16px">&nbsp;</div><p style="margin:0 0 4px;font-family:${font};font-size:12px;line-height:1.5;color:${theme.muted}">${escapeHtml(input.reason)}</p><p style="margin:0;font-family:${font};font-size:12px;line-height:1.5;color:${theme.muted}">${footerLinks}</p>`,
        '0 32px 28px',
      ),
      '</table>',
      `<p style="margin:16px 0 0;font-family:${font};font-size:12px;line-height:1.5;color:${theme.muted}">${escapeHtml(BRAND.name)}</p>`,
      '</td></tr></table></body></html>',
    ].join(
      '',
    );

  const text =
    [
      subject,
      '',
      parts
        .map(
          (
            p,
          ) =>
            p.text,
        )
        .filter(
          Boolean,
        )
        .join(
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
