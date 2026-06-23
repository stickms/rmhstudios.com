# Blue user tags in posts — design

**Date:** 2026-06-20
**Status:** Approved

## Goal

Make `@mention` user tags in post text render in blue so they visually stand out
from the surrounding body text.

## Background

Post body text is rendered by a single shared component,
`components/feed/RMHarkContent.tsx`, used by every surface that displays post
text (feed cards, post detail, comments, quoted/reposted originals). Inside it, a
regex (`TOKEN_REGEX`) tokenizes the text into `@mentions`, `#hashtags`, and URLs:

- `@mentions` currently render as a router `<Link>` styled
  `text-site-accent hover:underline` — the site accent color, which is **purple**
  (`--site-accent: #9b7ad8`).
- `#hashtags` already render in blue: `text-sky-400 hover:text-sky-300`.
- URLs render with `text-site-accent` (purple).

Mentions live inline in the post `content` string and are re-detected by regex at
render time. There is no separate tagged-users table, so changing the color is a
render-only change — no schema, data migration, or compose-side change.

## Change

In `components/feed/RMHarkContent.tsx`, change the mention branch's className from:

```
className="text-site-accent hover:underline"
```

to match the existing hashtag styling:

```
className="text-sky-400 hover:text-sky-300"
```

## Decisions

- **Reuse the existing hashtag blue (`text-sky-400` / hover `text-sky-300`)**
  rather than introducing a new color token. Mentions and hashtags will share the
  same blue, reading consistently as clickable tokens. (Chosen over adding a
  dedicated `--site-mention` token or recoloring the whole site accent.)
- **URLs are unchanged** — they keep `text-site-accent`. Only mentions change.

## Scope

- One file: `components/feed/RMHarkContent.tsx`.
- One className change in the mention-rendering branch.
- Applies everywhere mentions appear, since all post text routes through
  `RMHarkContent`.

## Out of scope

- No changes to mention detection, autocomplete (`MentionTextarea`), server-side
  mention parsing (`lib/feed/mentions.ts`), notifications, or the data model.
- No new theme tokens.

## Testing / verification

Styling-only change with no logic, so there is no meaningful unit test for a
Tailwind class swap. Verification is visual: confirm a post containing an
`@handle` renders the mention in blue (matching hashtags) and that hover still
works.
