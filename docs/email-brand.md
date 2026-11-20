# Email brand brief

What the admin email designer (DeepSeek or Kimi) is told, and what the template draws. The code is `lib/email/brand.ts` (`BRAND`, `brandBrief()`); this page is the same thing for people. Change both together.

## Logo

A black six-petal line rosette on a white disc: `public/favicon.svg`. Emails use the PNG `public/brand/rmh-studios-mark.png` (144px, drawn at 36px) because most inboxes do not render SVG. The template places it; the model only chooses whether to show it.

There is no other logo. The purple "R" tile (`public/images/icons/icon-*.png`) is the PWA install icon and is not used in email.

## Look: Steel

Flat, neutral, quiet. One typeface, Geist (system sans fallback in inboxes). Content is separated by 1px rules and space. No gradient, glow, shadow or translucency. Corners are 8px. There is no brand colour: the accent is the ink.

| | Page | Card | Ink | Muted | Border |
| --- | --- | --- | --- | --- | --- |
| Light (Day) | `#f0f2f4` | `#ffffff` | `#0b0d10` | `#606873` | `#e3e6e9` |
| Dark (Night) | `#0b0d10` | `#111418` | `#eef1f4` | `#8b949e` | `#22272d` |

Accents: `ink` (default; black or white buttons), `success` (good news about the reader's account), `danger` (a security or breach notice). Nothing else.

## Voice

Short and literal. Say the specific thing. No exclamation marks, no emoji, no hype words ("seamless", "powerful", "unleash"). A button is a verb, or a verb and a noun, in sentence case.

## What the model returns

JSON only, never HTML: theme, accent, logo on/off, eyebrow, preheader, and 3 to 12 blocks (heading, text, button, image, callout, list, divider). The prompt is `EMAIL_DESIGN` in `lib/ai/prompts/index.ts`; the site validates and draws the result (`lib/email/design-render.ts`).

The authority for site colours is `docs/plans/2026-11-11-steel-design-implementation.md`.
