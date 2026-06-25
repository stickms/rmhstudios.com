# RMHVibe — Implementation Spec

## Overview

RMHVibe transforms the RMH Studios homepage into an AI-powered "vibe" platform. Users enter a prompt and get a fully generated, shareable, collaboratively-editable webpage — instantly. Think of it as a public creative scratchpad where any prompt becomes a living page.

---

## 1. Revised Homepage (`/_site/index.tsx`)

Replace the `ComingSoonGate` with a clean, minimal landing page.

### Layout

- Full-viewport centered column, no sidebar chrome needed (the `_site` layout wraps it so the sidebar is still present on desktop)
- **Title**: `RMH Studios` — large, bold, sparse
- **Tagline**: `The everything platform.`
- **Prompt input**: a single wide text input with placeholder `"Where do you want to go?"` and a Submit button (or Enter key)
- On submit → navigate to `/v/new?prompt=<encoded>` which triggers generation

### Behavior

- Input is uncontrolled until submit; no debounce/streaming needed here
- If the user is on mobile, auto-focus the input after mount
- No auth required to generate a vibe page

---

## 2. Database Model

Add to `prisma/schema.prisma`:

```prisma
model VibePage {
  id          String   @id @default(cuid())
  slug        String   @unique  // short URL-safe identifier, e.g. "neon-city-3k"
  prompt      String            // original user prompt
  html        String            // full generated HTML (self-contained, no external deps required)
  conversationHistory Json      // array of { role, content } turns for "customize" follow-ups
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([slug])
  @@map("vibe_page")
}
```

Run migration:
```
npx prisma migrate dev --name add_vibe_page
```

---

## 3. Route Structure

| Path | File | Purpose |
|------|------|---------|
| `/` | `app/routes/_site/index.tsx` | New minimalist homepage |
| `/v/$slug` | `app/routes/v.$slug.tsx` | Renders a saved vibe page |
| `/v/new` | handled inside `v.$slug.tsx` loader OR a dedicated `v.new.tsx` | Triggers generation, then redirects to permanent slug |

### Recommended approach: `v.new.tsx` + `v.$slug.tsx`

- `v.new.tsx` — server-side loader reads `?prompt=`, calls DeepSeek, saves to DB, redirects to `/v/<slug>`
- `v.$slug.tsx` — loads page from DB by slug, renders the HTML + customize toolbar

---

## 4. Slug Generation

Keep slugs short (2–4 words) and human-readable.

**Strategy**: Ask DeepSeek to suggest a slug as part of the same generation call (no extra latency). Fall back to `nanoid(8)` if the suggestion is unusable.

Slug rules:
- Lowercase kebab-case
- Max 32 chars
- No special chars except `-`
- Must be unique — retry with appended random suffix if collision

---

## 5. DeepSeek API Integration

RMH Studios already has the `openai` package (v6) — DeepSeek's API is OpenAI-compatible.

### Client setup (`app/lib/deepseek.ts`)

```ts
import OpenAI from 'openai';

export const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});
```

### Generation server function (`app/lib/vibe.server.ts`)

```ts
export async function generateVibePage(prompt: string, history: Message[] = []) {
  const messages = [
    {
      role: 'system',
      content: VIBE_SYSTEM_PROMPT,
    },
    ...history,
    { role: 'user', content: prompt },
  ];

  const res = await deepseek.chat.completions.create({
    model: 'deepseek-chat',           // fast, cheap
    messages,
    temperature: 1.0,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(res.choices[0].message.content) as {
    slug: string;
    html: string;
  };
}
```

### System prompt

```
You are a creative web designer. Given a user's prompt, generate a complete, self-contained single-page HTML document that visually captures the vibe of their request. 

Rules:
- Use only inline styles and a <style> block — no external stylesheets or scripts
- Make it visually striking: bold typography, colors, layout that fits the theme
- Include real readable content that matches the prompt (text, sections, fake data if helpful)
- Add subtle CSS animations where they enhance the vibe (no JS needed)
- The page should look finished, not like a template
- Respond ONLY with a JSON object: { "slug": "<2-4 word kebab slug>", "html": "<full HTML string>" }
- Keep the slug under 32 chars and relevant to the prompt
- Speed over perfection — it can be customized later
```

---

## 6. `/v/new` Route — Generation Flow

**File**: `app/routes/v.new.tsx`

```
loader:
  1. Read ?prompt from search params
  2. If missing → redirect to /
  3. Call generateVibePage(prompt)
  4. slugify + uniqueness check against DB (retry up to 3x with nanoid suffix)
  5. INSERT VibePage { slug, prompt, html, conversationHistory: [{ role: 'user', content: prompt }, { role: 'assistant', content: html }] }
  6. throw redirect(`/v/${slug}`)
```

While loading (step 1–5), show a loading screen: "Creating your vibe..." with a subtle animation.

Since TanStack Router loaders are async, the loading UI is the route's `pendingComponent`.

---

## 7. `/v/$slug` Route — Vibe Page Viewer

**File**: `app/routes/v.$slug.tsx`

### Loader
- Fetch `VibePage` by slug from DB
- 404 if not found

### Render
- The route renders **outside** the `_site` layout (no sidebar) — it should be a full-screen experience
- Render the stored `html` in a sandboxed `<iframe srcdoc={html}>` — this isolates the generated content from the app's JS/CSS
- On top of the iframe, overlay a **minimal toolbar** (top-right corner, semi-transparent):
  - `✏️ Customize` button — opens a slide-up/slide-over panel with a text input
  - `🔗 Share` button — copies the URL to clipboard
  - `← Back` link — goes to homepage

### Customize flow
1. User types a customization prompt and submits
2. Client calls a server function `customizeVibePage(slug, newPrompt)`
3. Server function:
   - Loads existing `conversationHistory` from DB
   - Appends new user message
   - Calls `generateVibePage` with full history (so DeepSeek understands the context)
   - Updates `VibePage.html` and `conversationHistory` in DB
   - Returns new `html`
4. Client updates the iframe's `srcdoc` with the new HTML
5. The URL doesn't change — same slug, updated content

Anyone can customize — no auth required. Last write wins (optimistic, no locking needed at this scale).

---

## 8. File Map

```
app/
  lib/
    deepseek.ts           # DeepSeek OpenAI-compat client
    vibe.server.ts        # generateVibePage(), customizeVibePage() server fns
  routes/
    _site/
      index.tsx           # NEW: minimalist homepage with prompt input
    v.new.tsx             # loader: generate + save + redirect
    v.$slug.tsx           # viewer: iframe render + customize toolbar
prisma/
  schema.prisma           # add VibePage model
  migrations/
    ..._add_vibe_page/    # generated migration
```

---

## 9. Implementation Order

1. **Prisma** — add `VibePage` model, run migration
2. **DeepSeek client** — `app/lib/deepseek.ts`
3. **Server logic** — `app/lib/vibe.server.ts` with `generateVibePage` and `customizeVibePage`
4. **`/v/new` route** — generation loader + pending/loading UI
5. **`/v/$slug` route** — iframe viewer + customize panel
6. **Homepage** — replace `ComingSoonGate` with prompt input UI

---

## 10. Open Questions / Later

- Rate limiting: for now none — DeepSeek is cheap. Add per-IP limiting if abused.
- Page history: current design overwrites on customize. Could add a `versions Json[]` field later.
- Auth-gated "my pages" dashboard — not in scope for v1.
- The `/v/` subdirectory intentionally uses a flat slug (`/v/neon-city`) not nested paths.
