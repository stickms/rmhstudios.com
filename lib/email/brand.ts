/**
 * RMH Studios' brand, as an email can use it. Client-safe and pure.
 *
 * Two readers: the AI designer (`brandBrief()` is put in its prompt, so DeepSeek
 * or Kimi designs with the real logo, colours, type and voice), and the email
 * renderer (`lib/email/design-render.ts`), which draws every designed email
 * from these values. The model chooses among them; it never supplies markup.
 *
 * The colours are the site's Steel tokens (`app/globals/tokens-themes.css`,
 * Day and Night); there is no brand colour beyond ink. The same brief, in
 * prose for people, is `docs/email-brand.md`: change the two together. Email
 * clients cannot read CSS variables, so the values are written out here.
 */

export const BRAND = {
  name: 'RMH Studios',
  /**
   * The site's mark (`public/favicon.svg`): a black six-petal line rosette on
   * a white disc. PNG, because most email clients do not render SVG; 144px,
   * shown at 36px so it is sharp on high-density screens. There is no other
   * logo: the purple "R" tile the PWA icons use is not the brand.
   */
  logoPath: '/brand/rmh-studios-mark.png',
  logoAlt: 'RMH Studios',
  /** Geist is the site's face; email clients fall back to the system sans. */
  fontStack: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  monoStack: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  themes: {
    /** Steel Day. */
    light: {
      page: '#f0f2f4',
      card: '#ffffff',
      ink: '#0b0d10',
      muted: '#606873',
      border: '#e3e6e9',
      subtle: '#fafafa',
    },
    /** Steel Night. */
    dark: {
      page: '#0b0d10',
      card: '#111418',
      ink: '#eef1f4',
      muted: '#8b949e',
      border: '#22272d',
      subtle: '#161a1f',
    },
  },
  /**
   * The accents a design may use. Ink is the site's own accent ("the accent is
   * the ink"), and there is no brand colour beyond it; the other two are the
   * Steel status colours, for a notice that should read as good or urgent news.
   */
  accents: {
    ink: {
      light: '#0b0d10',
      dark: '#eef1f4',
    },
    success: {
      light: '#167d3a',
      dark: '#3fb26b',
    },
    danger: {
      light: '#c40016',
      dark: '#f2555a',
    },
  },
  /** Corner radius of buttons, pictures and callouts (the site's 8px). */
  radius: 8,
} as const;

export type BrandTheme = keyof typeof BRAND.themes;
export type BrandAccent = keyof typeof BRAND.accents;

export const BRAND_ACCENTS = Object.keys(BRAND.accents) as BrandAccent[];
export const BRAND_THEMES = Object.keys(BRAND.themes) as BrandTheme[];

/** The brand as the AI designer reads it. */
export function brandBrief(): string {
  const { light, dark } = BRAND.themes;
  return [
    `Brand: ${BRAND.name}, a website of browser games and apps with a social feed.`,
    'Logo: a black six-petal line rosette on a white disc (the site favicon). The template draws it in the header; you only choose whether to show it. Never describe, recolour or replace it, and never mention a purple "R" tile: that is not our logo.',
    'Look ("Steel"): flat, neutral and quiet. One typeface (Geist). Content separated by thin rules and space, not boxes. No gradients, glows, shadows or translucency. There is no brand colour: the accent is the ink (black on light, white on dark). Corners are 8px.',
    `Light theme: page ${light.page}, card ${light.card}, ink ${light.ink}, muted ${light.muted}. Dark theme: page ${dark.page}, card ${dark.card}, ink ${dark.ink}, muted ${dark.muted}.`,
    'Accents: "ink" (default: black or white buttons), "success" (good news about the reader\'s account), "danger" (a security or breach notice). Nothing else; do not ask for purple, gradients or custom colours.',
    'Voice: short and literal. Say the specific thing. No exclamation marks, no emoji, no hype words like "seamless", "powerful" or "unleash". A button label is a verb, or a verb and a noun, in sentence case.',
  ].join('\n');
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on `background`. */
export function inkOn(background: string): string {
  return contrast(background, '#ffffff') >= contrast(background, '#0b0d10') ? '#ffffff' : '#0b0d10';
}
