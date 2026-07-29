# Content & creator surfaces

Everything published *to* the site rather than posted *in* the feed: editorial content, the document library, user-submitted builds, and the tools people use to make them.

## Editorial

| Route | What it is |
| ----- | ---------- |
| `/news`, `/news/:slug` | News articles. |
| `/news/rss.xml` | News RSS feed. |
| `/blog/:slug` | A devlog post. |
| `/blog/rss.xml` | Blog RSS feed. |
| `/library`, `/library/:slug` | The document library. `/blog` and `/playlists` both redirect here. |
| `/library/albums/:albumId` | An album. |

`lib/news.ts`, `lib/news-categories.ts` and `lib/news-approval.server.ts` back news (including its review step); `lib/blog.ts` backs the devlog; `lib/library/` and `lib/albums*.ts` back the library. `lib/rss.ts` generates both feeds.

Article pages are **top-level, not under `_site/`** — `blog.$slug.tsx`, `news.$slug.tsx`, `library.$slug.tsx` — so they render full-screen rather than in the sidebar shell. That is deliberate, and it is also why their `head()` blocks carry their own canonical and JSON-LD via `buildMeta`/`buildCanonical` from `lib/seo.ts` and `jsonLdScript()` from `lib/schema.ts`.

Album storage (database plus R2/S3) is documented separately in [`albums-storage.md`](../albums-storage.md).

## Builds

| Route | What it is |
| ----- | ---------- |
| `/builds/:slug` | A build's public page. |
| `/user-builds/:slug` | A user-submitted build. |
| `/user-builds/submit`, `/user-builds/manage` | Submit and manage your own. |

`lib/builds/`, `lib/user-builds-schema.ts` and `lib/user-builds-types.ts` implement these. Builds are also exposed read-only through the public API (`read:builds`) — see the [Content endpoint group](../developer-api/endpoints/content.md).

```{note}
`/user-builds` redirects to `/builds`, which redirects again to `/create`. A
two-hop chain is a smell worth cleaning up eventually, but both hops are
currently load-bearing for existing links — collapse them together or not at
all.
```

## Creator tools

| Route | What it is |
| ----- | ---------- |
| `/create` | Creator Studio. `/creator-studio`, `/builds` and `/personas` all redirect here. |
| `/drafts` | Unpublished work. |
| `/studio` | The studio app (full-screen, sign-in required). |
| `/studio/themes` | Theme Studio — build and publish a site theme. |
| `/v/:slug` | A published RMHVibe page. |
| `/personas/:id` | Chat with an AI persona. |

`lib/creator/`, `lib/studio/`, `lib/rmhvibe/`, `lib/themes/` and `lib/personas/` implement these. `VibePage`/`VibePageVersion` and `UserTheme` are the persistence models.

## AI

AI features run through `lib/ai/` — `text.server.ts` wraps DeepSeek via the `openai` SDK, and `recap.server.ts` / `summarize.server.ts` build on it. `lib/rmhark-ai/` handles AI bot posting, paired with the bot worker.

```{warning}
The prompts in `lib/ai/` deliberately treat user-supplied content as **data,
not instructions** — that is the prompt-injection defence. Preserve that framing
when editing a prompt; the obvious "cleanup" of interpolating user text
straight into an instruction sentence is what removes it.
```

Every AI route is rate-limited (the `ai` policy in `lib/rate-limit.ts`), because these calls cost money per request rather than per user.

## Media

Uploads go through `lib/media/` (upload, attach, quota, sweep, policy) onto `lib/storage/s3.server.ts` — R2/S3 with a local-filesystem fallback when S3 isn't configured, so a dev machine needs no bucket. `lib/storage/keys.ts` builds the object keys and enforces filename safety. Open Graph cards are rendered server-side by `lib/og/post-image.server.tsx` using satori + resvg.

```{important}
Any fetch of a **user-supplied URL** must go through `safeFetch` from
`lib/ssrf-guard.server.ts`, never bare `fetch`. That covers oEmbed, webhook
delivery targets, and anything else where a user picks the host.
```
