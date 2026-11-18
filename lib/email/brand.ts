/**
 * RMH Studios' brand, as an email can use it. Client-safe and pure.
 *
 * Two readers: the AI designer (`brandBrief()` is put in its prompt, so DeepSeek
 * or Kimi designs with the real logo, colours, type and voice), and the email
 * renderer (`lib/email/design-render.ts`), which draws every designed email
 * from these values. The model chooses among them; it never supplies markup.
 *
 * The colours are the site's Steel tokens (`app/globals/tokens-themes.css`,
 * Day and Night) and the logo's own purple. Email clients cannot read CSS
 * variables, so the values are written out here.
 */

export const BRAND =
  {
    name: 'RMH Studios',
    /** The app icon: a purple rounded square with an ink "R". PNG, because most email clients do not render SVG. */
    logoPath:
      '/images/icons/icon-192.png',
    logoAlt:
      'RMH Studios',
    /** Geist is the site's face; email clients fall back to the system sans. */
    fontStack:
      "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    monoStack:
      "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    /** The logo's purple: the one brand colour beyond ink and neutrals. */
    logoPurple:
      '#9b7ad8',
    themes:
      {
        /** Steel Day. */
        light:
          {
            page: '#f0f2f4',
            card: '#ffffff',
            ink: '#0b0d10',
            muted:
              '#606873',
            border:
              '#e3e6e9',
            subtle:
              '#fafafa',
          },
        /** Steel Night. */
        dark: {
          page: '#0b0d10',
          card: '#111418',
          ink: '#eef1f4',
          muted:
            '#8b949e',
          border:
            '#22272d',
          subtle:
            '#161a1f',
        },
      },
    /**
     * The accents a design may use. Ink is the site's own accent ("the accent is
     * the ink"); the logo purple is the brand's one colour; the rest are the
     * Steel status colours, for a notice that should read as good or urgent news.
     */
    accents:
      {
        ink: {
          light:
            '#0b0d10',
          dark: '#eef1f4',
        },
        purple:
          {
            light:
              '#9b7ad8',
            dark: '#9b7ad8',
          },
        success:
          {
            light:
              '#167d3a',
            dark: '#3fb26b',
          },
        danger:
          {
            light:
              '#c40016',
            dark: '#f2555a',
          },
      },
    /** Corner radius of buttons, pictures and callouts (the site's 8px). */
    radius: 8,
  } as const;

export type BrandTheme =
  keyof typeof BRAND.themes;
export type BrandAccent =
  keyof typeof BRAND.accents;

export const BRAND_ACCENTS =
  Object.keys(
    BRAND.accents,
  ) as BrandAccent[];
export const BRAND_THEMES =
  Object.keys(
    BRAND.themes,
  ) as BrandTheme[];

/** The brand as the AI designer reads it. */
export function brandBrief(): string {
  return [
    `Brand: ${BRAND.name}, a website of browser games and apps with a social feed.`,
    'Logo: a purple (#9b7ad8) rounded square with a black "R". The template places it in the header; you choose whether to show it.',
    'Look ("Steel"): flat, neutral and quiet. One typeface (Geist). Content separated by thin rules and space, not boxes. No gradients, glows or shadows. The accent is the ink; the logo purple is the one brand colour.',
    'Themes: "light" (white card on a pale grey page, near-black ink) or "dark" (near-black card, light ink).',
    'Accents: "ink" (default, black or white buttons), "purple" (the logo colour, for something special: a launch, an event), "success" (good news), "danger" (a security or breach notice).',
    'Voice: short and literal. Say the specific thing. No exclamation marks, no emoji, no hype words like "seamless", "powerful" or "unleash". A button label is a verb, or a verb and a noun, in sentence case.',
  ].join(
    '\n',
  );
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(
  hex: string,
): number {
  const n =
    Number.parseInt(
      hex.slice(
        1,
      ),
      16,
    );
  const channel =
    (
      v: number,
    ) => {
      const c =
        v /
        255;
      return c <=
        0.03928
        ? c /
            12.92
        : ((c +
            0.055) /
            1.055) **
            2.4;
    };
  return (
    0.2126 *
      channel(
        (n >>
          16) &
          255,
      ) +
    0.7152 *
      channel(
        (n >>
          8) &
          255,
      ) +
    0.0722 *
      channel(
        n &
          255,
      )
  );
}

export function contrast(
  a: string,
  b: string,
): number {
  const [
    hi,
    lo,
  ] =
    [
      luminance(
        a,
      ),
      luminance(
        b,
      ),
    ].sort(
      (
        x,
        y,
      ) =>
        y -
        x,
    ) as [
      number,
      number,
    ];
  return (
    (hi +
      0.05) /
    (lo +
      0.05)
  );
}

/** Black or white, whichever reads better on `background`. */
export function inkOn(
  background: string,
): string {
  return contrast(
    background,
    '#ffffff',
  ) >=
    contrast(
      background,
      '#0b0d10',
    )
    ? '#ffffff'
    : '#0b0d10';
}
