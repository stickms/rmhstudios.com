# Parity, QOL & Customization — Implementation Spec (Sixteen Features)

**Document type:** Product + engineering design → **implementation-ready spec**
**Prepared:** 2026-07-20 (rev 3 — fully specced for implementing agents:
per-feature data models, API tables, file lists, acceptance criteria, mobile
behavior, and Liquid Glass tier assignments)
**Branch:** `claude/site-features-docs-hsb5f1`
**Companion docs:**
[`2026-07-19-platform-expansion-design.md`](./2026-07-19-platform-expansion-design.md)
(arcade, creator studio, spaces, parties, events, replays, marketplace,
digest, concierge, onboarding, stat cards),
[`2026-07-15-cross-system-feature-ideas.md`](./2026-07-15-cross-system-feature-ideas.md)
(tournaments, wagers, predictions, coin bridge, AI residents, live-ops),
[`../coins.md`](../coins.md) (economy foundation),
[`../design-language.md`](../design-language.md) (token contract),
[`../page-consistency.md`](../page-consistency.md) (page checklist),
[`../mobile-friendliness-audit.md`](../mobile-friendliness-audit.md) (the
mobile lessons §2.6 codifies).

> **How to read this.** This is a spec an implementing agent can execute
> feature-by-feature without re-deriving conventions. §0–§1 give the why and
> the verified ground truth. **§2 is the implementation contract** — global
> rules (file placement, API shape, i18n, mobile baseline, testing, rollout
> recipe) that every feature section assumes; read it once, then any feature
> section is self-contained. Features are grouped in four pillars:
>
> - **A. Parity must-haves** (§3–§8) — table stakes from Twitter/Bluesky,
>   YouTube/Spotify, Steam, and Reddit.
> - **B. Social & presence** (§9–§12) — making the people on the site
>   visible to each other.
> - **C. QOL & user customization** (§13–§17) — the settings/appearance/
>   layout pillar (the largest).
> - **D. Cross-cutting** (§18) — search.
>
> Every feature section follows one shape: _Concept → Why it fits → What
> exists / the gap → Data model → Server & API → Files → UI (desktop) →
> **Mobile spec** → Economy → Acceptance criteria → Risks → Effort._
> Gap claims were verified against `prisma/schema.prisma`, `app/routes/`,
> `lib/`, and `components/` on 2026-07-20. If something below appears to
> already exist when you read this, trust the code (docs trust order) and
> treat that part as done.

---

## 0. Thesis

The platform now has more **novel** systems than most competitors — a coin
economy with wagers and prediction markets, a P2P cosmetic marketplace, live
Spaces, a cross-game arcade loop. What it is missing is the **boring
layer**: the affordances users have been trained to expect by every large
platform they already use. Nobody churns because we lack prediction markets;
people churn because they can't find a post they saved last week, can't
resume a video, can't quiet notifications overnight, and can't make the UI
comfortable on their own eyes.

Parity features are also the cheapest features we will ever build: their
design space is fully explored (we copy the converged pattern), their
backing data often already exists (`SongPlay`, `RMHarkView`,
`RmhTubeUserStats`, `RMHarkBookmark`), and their retention effect is
well-documented industry-wide. The rule throughout: **copy the converged UX,
back it with the tables we already have where possible, and route every new
coin flow through the existing `CoinTransaction` ledger.**

---

## 1. Ground truth — what already exists (verified 2026-07-20)

Delta over the 2026-07-19 inventory (which remains accurate); only rows
relevant to this doc are listed.

| System                     | Where                                                                                                          | State                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Bookmarks                  | `RMHarkBookmark` (flat, unique `(userId, rmheetId)`), `/bookmarks`                                             | Shipped — **posts only, no folders, no cross-content saves**.                                                |
| Play/view logs             | `SongPlay` (per-user per-song counts), `RmhTubeUserStats` (aggregates), `RMHarkView`, `BuildView`              | Shipped as analytics — **no user-facing history page, no resume positions, no pause/clear controls**.        |
| Notification prefs         | `NotificationPreference` — six booleans + `emailDigest`                                                        | Shipped — **no per-channel matrix, no quiet hours, no batching** (quiet hours exist only in `LadderUserPrefs`). |
| Notification delivery      | `lib/notifications.server.ts` (`createNotification`, best-effort, Redis unread counter), `lib/push/send.server` | Shipped — creation is scattered across call sites; no single dispatch gateway.                               |
| Appearance prefs           | `AppearancePreference` (`style`, `accent`, `reduceTransparency`) + `/api/preferences/appearance` partial upsert | Shipped, cross-device synced; the schema comment explicitly reserves "density, font scale, …" for §13.       |
| Muted words                | `/api/preferences/muted-words` → `UserProfile.mutedWords`, filtered in `lib/feed/timeline.ts`                  | Shipped — the template for reader-level content controls (§17 extends it).                                   |
| Data portability           | `/api/account/export`, `/api/account/delete`, `DeleteAccountPanel`                                             | Shipped — new personal-data tables in this doc **must be added to the export** (§2.8).                       |
| Command palette, shortcuts | `components/site/CommandPalette.tsx`, `KeyboardShortcuts.tsx`, `command-palette-bus.ts`                        | Shipped.                                                                                                     |
| Post audiences             | `RMHarkAudience`: `PUBLIC / FOLLOWERS / PRIVATE / SUPPORTERS`, one shared feed predicate + embed/OG guards     | Shipped — **no close-friends circle**.                                                                       |
| Presence                   | `lib/presence.server.ts` heartbeat; party system (`hooks/useParty.ts`)                                         | Shipped — **presence is a boolean; no activity payload, no friends surface**.                                |
| Status                     | —                                                                                                              | **Absent.**                                                                                                  |
| Cosmetics & shop           | `ShopItemKind` (`THEME PET NAME_COLOR BADGE BANNER POST_FLAIR AVATAR_FRAME`), `UserInventory`, `MarketListing` | Shipped — themes are already a sellable item kind. **No user-authored cosmetics.**                           |
| Game meta-content          | `BuildComment`/`BuildLike` on User Builds                                                                      | Shipped for builds — **no per-game reviews/ratings/guides for the ~20 first-party games**.                   |
| Wishlist patterns          | `HomeFavorite`/`HomeWatch` (+ alert sweep), `LadderWatchlistEntry`                                             | Proven twice — **nothing for shop items, market cosmetics, or builds**.                                      |
| Awards on posts            | Tips (`TIP` ledger rows with `entityType`/`entityId`), reactions                                               | Adjacent shipped — **no public paid badge on content**.                                                      |
| Saved searches             | `LadderSavedSearch`                                                                                            | Ladder-only — `/search` exists with basic cross-entity matching.                                             |
| Sidebar / home layout      | `lib/sidebar-data.ts` (server loader over `lib/games.ts` + `lib/apps.ts`), `useRecents`, `navStore`            | Shipped — **no pin/hide/reorder, no widget layout control**.                                                 |
| Theme runtime              | `stores/themeStore.ts` (`SITE_STYLES`, `THEME_BG`, preview), no-flash inline script in `__root.tsx`, self-heal in `Providers.tsx` | Shipped — themes are static catalog entries; the runtime can only apply known ids.               |

**Consequences:**

- History (§5) and Saves (§4) are mostly _surfacing_ work over existing rows
  plus small new tables.
- The appearance schema was explicitly future-proofed for §13.
- Awards (§7), Theme Studio (§14), and Wishlists (§8) each open a coin
  **sink**, which the economy needs as arcade/quest **sources** keep growing.

---

## 2. Implementation contract (read once — every feature assumes it)

### 2.1 Stack & file placement

TanStack Start (file-based routing) + Vite 8 + React 19 + Nitro SSR —
**not Next.js**. Aliases: `@/lib`, `@/components`, `@/hooks`, `@/app`,
`@/stores`.

| What                  | Where                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Page routes           | `app/routes/_site/<name>.tsx` (sidebar shell) — everything in this doc is `_site/`; nothing here is full-screen.        |
| API routes            | `app/routes/api/<name>.ts` — `.ts` with `server.handlers`; pages are `.tsx` with `component`. Never mix.                |
| Route naming          | `foo.$bar.tsx` → `/foo/$bar`; `index.tsx` = directory index; `route.tsx` = directory layout with `beforeLoad` gates.    |
| Server-only logic     | `lib/<feature>/*.server.ts` (Vite stubs `.server` out of the client bundle — **never import from client code**).        |
| Client-safe logic     | `lib/<feature>/*.ts` (catalogs, zod schemas, pure functions shared with the client).                                    |
| Components            | `components/<feature>/*.tsx`; shared primitives in `components/ui/`.                                                    |
| Stores / hooks        | `stores/*.ts` (Zustand), `hooks/use*.ts`.                                                                               |
| Schema                | `prisma/schema.prisma` (+ generated migration).                                                                         |

After adding/renaming a route file, run `pnpm dev` or `pnpm build` once to
regenerate `routeTree.gen.ts`. **Never edit `routeTree.gen.ts` by hand.**

### 2.2 Database changes

1. Add models/fields to `prisma/schema.prisma`, matching house style:
   `@@map("snake_case_table")`, explicit `@@index`, `onDelete` on every
   relation, `@db.VarChar(n)` on bounded strings.
2. `pnpm exec prisma migrate dev --name <feature-slug>` (creates the
   migration and regenerates the client). Production applies migrations via
   `prisma migrate` in the deploy pipeline — never `db push` semantics in a
   committed change.
3. Data backfills (e.g. §4's bookmark migration) go **inside the generated
   migration SQL**, idempotent, so prod picks them up in the same deploy.
4. Every new table keyed by `userId` gets `onDelete: Cascade` to `User` so
   account deletion keeps working without touching `/api/account/delete`.

### 2.3 API handler shape (copy exactly)

Canonical order — session → rate limit → validate → act — as in
`app/routes/api/preferences/muted-words.ts` (the model file for this doc):

```ts
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const schema = z.object({ /* … */ });

export const Route = createFileRoute('/api/example')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 20, windowMs: 60_000, prefix: 'example',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
          const body = await request.json().catch(() => null);
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          // … act using parsed.data + session.user.id
          return Response.json({ ok: true });
        } catch (error) {
          console.error('example error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
```

Rules: statuses 400/401/403/404/429/500 as above; GET handlers may skip the
rate limit but never the session check (unless explicitly public);
admin = `(session.user as { isAdmin?: boolean }).isAdmin`; the rate limiter
is in-memory per-process with a global multiplier — pick limits per route
(each feature section states its `prefix`/`limit`). Partial-upsert
preference endpoints follow `/api/preferences/appearance`: *field omitted =
unchanged; explicit `null` = reset to default; unknown ids rejected via a
`Set` built from the code catalog.*

Page loaders use `createServerFn({ method: 'GET' }).validator(…).handler(…)`
and `Route.useLoaderData()`; auth-gate pages with
`throw redirect({ to: '/login', search: { callbackURL } })` in `beforeLoad`;
`throw notFound()` for missing entities.

### 2.4 Design language & primitives

Every color/radius/shadow via `--site-*` token utilities
(`bg-site-surface`, `text-site-text-muted`, `rounded-site`,
`shadow-site`/`shadow-site-sm`, …) — **no hardcoded hex/oklch, no
`rounded-lg`, no custom shadows or font families** in site UI; verify on
`default`, `light`, and `high-contrast` themes. Use `PageLayout` from
`components/feed/PageLayout.tsx` for every page (props: `title`,
`rightSidebar`, `headerExtra`, `headerRight`, `wide`, `backTo`,
`breadcrumbs`). Available primitives in `components/ui/`: `Button`
(CVA — variants incl. `accent`/`accent-outline`/`accent-ghost`/`danger`,
`loading` prop for in-flight state), `IconButton` (icon-only, requires
`label`), `Card` (+ Header/Title/Description/Content/Footer),
`Dialog`/`ConfirmDialog` (+ `useConfirm`), `Input`, `Textarea`, `Select`
(styled native), `Label`, `Switch`, `Slider`, `Badge`, `EmptyState`,
`Skeleton` (`shimmer` variant for hero placeholders), `Spinner`, `Tooltip`,
`Pagination`, `Breadcrumbs`, `BackToTop`, `NotificationBadge`, `UserAvatar`,
`OptimizedImage`/`BlurImage`, `AnimatedCount`, `CopyButton`/`useClipboard`,
`ViewTransitionLink`, and the glass primitives in `liquid-glass.tsx`. Icons:
lucide (`aria-hidden` on decorative, `.rtl-flip` on directional). Emoji:
`TwemojiProvider`. Toasts: sonner (`import { toast } from 'sonner'` — the
`<Toaster>` is already mounted). Confirms: `useConfirm`, never
`window.confirm`. Motion: the tokens/variants in `lib/motion.ts`
(`fade`, `fadeRise`, `scaleIn`, `popIn`, `overlay`, `modalContent`,
`staggerContainer`/`staggerItem`, `transition`) — not ad-hoc
`duration`/`ease`; framer-motion respects OS reduced-motion globally via
`<MotionConfig>`, and `hooks/useReducedMotion` covers JS animations CSS
can't reach (§13 extends that hook — use it, never the raw media query).
Add `data-slot="…"` to any new shared primitive.

### 2.4a Liquid Glass is mandatory — pick the tier by role (not by looks)

Liquid Glass is the **material system**, expressed as an elevation ladder of
explicit CSS classes in `app/globals.css` placed *on* each surface. Every new
surface in this doc **must** carry the correct tier — this is as binding as
the token rule. `high-contrast`, `prefers-reduced-transparency`,
`html.reduce-transparency` (the §13 user toggle), and `html.perf-lite` all
degrade these classes to opaque automatically, so **never branch per-theme**;
just apply the tier and let the cascade handle fallback.

| Tier                       | Class                                              | This doc's surfaces                                                                                                                                                     |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1 — fill** (no blur)    | `.glass-fill` (the `Card` default)                 | **All repeated/list content**: `ListCard`, `SavedItemCard`, `HistoryRow`, `ReviewCard`, `ThemeShopCard`, `WishlistCard`, grouped notification rows, friends-rail rows, profile-module cards, search result cards. **Blur budget = 0 on repeated items — never put a backdrop tier on a list row.** |
| **L2 — pane** (blur+noise) | `.glass-pane` (`Card` with the `pane` prop)        | **Singular panels**: game-hub header, guide reader body, theme-editor preview pane, appearance panel sections, creator/studio section cards, list/space hero headers, the empty-state hero of each new page. Budgeted (≤8 backdrop-filters per viewport). |
| **L3 — chrome**            | `.glass-chrome` (+ `--aside`)                      | Persistent chrome only — already owned by the shell (`PageLayout` sticky header, sidebar, `MobileNav`, mobile dock). New pinned strips (§9 mobile friends strip, §3 home tab row, §15 mobile widget stack header) attach to / mimic this tier and condense on scroll via `[data-scrolled]`. |
| **L4 — overlay**           | `.glass-overlay` + `.glass-scrim`                  | **All floating UI**: every picker/editor **sheet** in this doc, popovers, menus, the award/theme/status/folder/circle sheets, command-palette entries. |
| **inset**                  | `.glass-inset`                                      | Recessed wells: every `Input`/`Textarea`/`Select`/search field/target-price field (the primitives already apply it — don't re-skin). |
| modifiers                  | `.glass-interactive` + `data-glass-light=""`; `.glass-refract` | `.glass-interactive` on tappable L1/L2 cards (hover tint-raise, press flex, pointer-tracked specular light) — use on hub cards, theme-shop cards, list cards. `.glass-refract` **≤2 per page, hero/chrome only, never in scroll containers** — reserve for a page hero, e.g. the game-hub art header or the theme-studio preview frame. |

Hard rules (from the redesign spec): never put a backdrop tier
(`.glass-pane/chrome/overlay`) on an **ancestor of a `position:fixed`
element** — `backdrop-filter` creates a containing block; use
`.glass-chrome--aside` (blurs on `::before`) for fixed chrome. Keep
≤8 backdrop-filters per viewport and **zero** on repeated list items. The
theme-editor preview pane (§14) renders sample **glass** components (an
L1 card, an L2 pane, an L4 overlay swatch) so authors tune the glass tint
tokens (`--site-glass-*`) live, not just flat colors.

**Shared groundwork task G1 (build once, first wave):** extend
`components/ui/dialog.tsx` with a `sheet` presentation — on viewports
`< 768px` the dialog renders as a **bottom sheet**: `.glass-overlay`
material + `.glass-scrim` backdrop (inheriting the exact glass Dialog uses
today), pinned to the bottom edge, `max-height: 85dvh`, internal
`overflow-y: auto`, drag-handle bar, `padding-bottom:
env(safe-area-inset-bottom)`, focus-trapped, closes on
swipe-down/backdrop/Escape, enter/exit via `lib/motion.ts`'s
`modalContent`/`overlay` variants. Desktop keeps the centered
`.glass-overlay` dialog. Every "picker/sheet/editor sheet" named in this doc
is this one component. (Also discharges mobile-audit findings F3/F7 for new
surfaces by construction.)

**Shared groundwork task G2:** a `SortableList` helper
(`components/ui/sortable-list.tsx`): drag-to-reorder on pointer devices
(framer-motion `Reorder`, `lib/motion.ts` timing), **always** paired with
per-row ▲/▼ `IconButton`s (44 px) so touch and keyboard users can reorder
without drag. Rows are `.glass-fill` `Card`s. Used by §4 (folders), §12,
§15.

**Shared groundwork task G3 (`WidgetFrame`, first wave):** a shared
`.glass-fill` card frame with header + `EmptyState`-backed zero state, used
by both §12 profile modules and §15 home widgets so every modular block
shares one glass surface, one empty state, and one skeleton.

### 2.5 i18n, SEO, a11y

- All user-facing strings via `t('key', { defaultValue: '…' })`. Page-level
  namespaces are `locales/en/<feature>.json`, component-level ones
  `c-<feature>.json` (each feature section names its namespace). After
  adding strings run `pnpm i18n:extract`. English is authoritative; RTL
  (ar/ur/fa) must not break — use logical CSS properties
  (`ms-*`/`me-*`/`ps-*`), never `left/right` paddings, in new components.
- Per-route `head()` with `buildMeta({ title, description, path })` +
  `buildCanonical(path)` from `@/lib/seo`. JSON-LD only via
  `jsonLdScript()` + builders from `@/lib/schema` where a section calls for
  it. User-preference and settings pages get `robots: noindex` meta.
- A11y: Radix/native primitives, visible focus rings are global, every
  icon-only button gets `aria-label`, dialogs/sheets trap focus, live
  regions (`aria-live="polite"`) for async confirmations, jsx-a11y lint
  must stay warning-clean relative to base.

### 2.6 Mobile baseline (applies to every feature; per-feature specs add to it)

The `_site` shell provides: a fixed **bottom `MobileNav`** bar, a
**push-drawer sidebar** (`MobileMenuButton`), and `MobileHeader`; pages
render inside the mobile shell's inner scroller (PageLayout's sticky header
already handles both scroll roots). Codified from
`docs/mobile-friendliness-audit.md`:

1. **Touch targets ≥ 44×44 px** for every interactive element (compact
   density §13 may shrink padding, never target size).
2. **Text inputs ≥ 16 px font-size** (iOS auto-zoom); numeric fields set
   `inputMode="numeric"`.
3. **Never raw `100vh`/`100vw`** — use `dvh`/`%`; fixed bottom elements pad
   `env(safe-area-inset-bottom)` (audit F4/F10).
4. **No hover-only or long-press-only affordances.** Every action reachable
   by hover/context-menu on desktop needs a visible tap path on mobile
   (usually the card/post **overflow menu** or an explicit secondary
   button). Long-press may *accelerate*, never *gate*.
5. **Wide content scrolls in its own `overflow-x-auto` wrapper** (tables,
   tab rows, chip rows); the page never scrolls horizontally. Tab/chip rows
   use `snap-x` and fade-edge affordances.
6. **Dialogs become bottom sheets** via G1 (§2.4); tall content scrolls
   internally.
7. **Drag interactions ship with tap alternatives** via G2 (§2.4).
8. **Test viewports:** 375×667 and 390×844 (portrait), plus one landscape
   pass; verify with the drawer open and with the on-screen keyboard up for
   any form.
9. Right-rail content (`PageLayout.rightSidebar`) is hidden on mobile —
   any feature that puts *functionality* (not just discovery) in the rail
   must state its mobile placement in its Mobile spec.

### 2.7 Notifications, jobs, realtime — house modules

- In-app notifications: `createNotification` from
  `lib/notifications.server.ts` (best-effort; never let it fail the parent
  action; it maintains the Redis unread counter). Push:
  `sendPushToUser` from `lib/push/send.server`. §16 wraps both in a
  dispatch gateway — features landing **after** §16 must call the gateway.
- Background jobs: pg-boss via `lib/jobs/boss.server.ts` (graceful inline
  fallback); register new workers where the existing engagement/sweep jobs
  register. Delayed jobs are supported (used by §16 quiet hours).
- Realtime: `lib/realtime-bus.server.ts` + the Socket.io hub
  (`server/socket-server/`); feed SSE via `useFeedSSE`.

### 2.8 Privacy & data-portability duties

Every new table holding user-generated/behavioral data (`SavedItem`,
`HistoryEntry`, `UserList*`, `CloseFriend`, `FeedSignal`, `WishlistEntry`,
`SavedSearch`, status fields, layout/preference rows) must be added to the
`/api/account/export` payload in the same PR that creates it. Deletion is
covered by the `onDelete: Cascade` rule in §2.2.

### 2.9 Testing & verification (per feature, before commit)

- **Unit tests (Vitest, `pnpm exec vitest run`):** pure logic — zod
  catalogs, normalizers, operator parser (§18), contrast guard (§13/§14),
  grouping keys (§16). Place `*.test.ts` beside the module or under
  `testing/`, following the nearest existing example.
- **Predicate tests:** any feature touching feed visibility (§3, §11, §17)
  adds audience regression tests: for each `RMHarkAudience` value ×
  (author, follower, supporter, circle-member, stranger), assert
  visibility on the new surface **and** on embeds/OG.
- **Checks:** `pnpm exec tsc --noEmit`, `pnpm lint` (no new warnings),
  `pnpm i18n:extract` committed, `pnpm build` passes.
- **Manual pass:** the feature's Acceptance criteria, on desktop + the two
  §2.6 viewports, on `default`, `light`, and `high-contrast` themes, and
  once with **Reduce transparency** on (glass → opaque, §2.4a) and reduced
  motion on — new glass surfaces must stay legible and correctly bordered in
  the degraded state, since `high-contrast`/`reduce-transparency`/`perf-lite`
  all collapse the material.

### 2.10 Standard delivery recipe (per feature)

1. Schema + migration (§2.2) → 2. `lib/<feature>/` server logic + catalogs
→ 3. API routes (§2.3) → 4. Components (`components/<feature>/`) → 5. Page
route(s) + loader + `head()` → 6. Sidebar/nav/entry-point wiring → 7. i18n
extract → 8. Tests (§2.9) → 9. Acceptance pass. Commits stay
feature-scoped; one feature = one PR unless a section says otherwise.

---

# Pillar A — Parity must-haves

## 3. Feature 1 — Lists & custom feeds

### Concept

User-curated **Lists** of accounts (Twitter Lists / Bluesky's converged
pattern): create a list ("Game devs", "Close reads"), add any accounts, and
read that list as its own chronological timeline. Lists are private by
default, link-shareable (`UNLISTED`), or `PUBLIC` (phase 2). The owner can
**pin** lists, which surface as swipeable tabs on the home feed after the
existing tabs.

### Why it fits

The feed is the front door and power users can't carve it. List timelines
are the cheapest possible feed: `authorId IN (…)`, chronological, no
ranking. `Follow`, the feed pipeline (`lib/feed/timeline.ts`),
`FeedColumn`'s tab row, and virtualization all exist.

### What exists / the gap

Gap is the list noun, membership, one feed branch, and tab integration.

### Data model

```prisma
enum ListVisibility {
  PRIVATE
  UNLISTED // link-shareable
  PUBLIC   // discoverable (phase 2 — do not expose in v1 UI)
}

model UserList {
  id         String         @id @default(cuid())
  ownerId    String
  name       String         @db.VarChar(50)
  bio        String?        @db.VarChar(200)
  visibility ListVisibility @default(PRIVATE)
  pinned     Boolean        @default(false)
  createdAt  DateTime       @default(now())

  owner   User             @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  members UserListMember[]

  @@index([ownerId])
  @@map("user_list")
}

model UserListMember {
  listId  String
  userId  String
  addedAt DateTime @default(now())

  list UserList @relation(fields: [listId], references: [id], onDelete: Cascade)
  user User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([listId, userId])
  @@index([userId]) // "lists you're on"
  @@map("user_list_member")
}
```

Code constants in `lib/lists/constants.ts`: `MAX_LISTS = 20`,
`MAX_MEMBERS = 500`, `MAX_PINNED = 5`.

### Server & API

| Endpoint                            | Methods      | Notes                                                                                       |
| ----------------------------------- | ------------ | ------------------------------------------------------------------------------------------- |
| `/api/lists`                        | GET, POST    | GET: caller's lists + member counts. POST: create (zod: `name` 1–50, `bio` ≤200). `prefix: 'lists'`, limit 30/min. |
| `/api/lists/$id`                    | GET, PATCH, DELETE | GET honors visibility (owner \| UNLISTED link \| PUBLIC). PATCH: name/bio/visibility/pinned. |
| `/api/lists/$id/members`            | GET, PUT, DELETE | PUT/DELETE body `{ userId }` (owner only). A member may DELETE **themselves** from someone else's list ("remove me"). |
| `/api/feed` (existing)              | GET          | New `list=<id>` param → chronological branch: membership subquery, **same audience/block/mute predicates as the following feed via the shared helper** — do not write fresh predicates. |

Being added to a list is **never** notified (harassment-audit lesson);
"Lists you're on" appears in Settings → Privacy with per-row "remove me".

### Files

- **Create:** `lib/lists/constants.ts`, `lib/lists/lists.server.ts`
  (CRUD + membership + visibility checks);
  `app/routes/api/lists/index.ts`, `app/routes/api/lists/$id.ts`,
  `app/routes/api/lists/$id.members.ts`;
  `app/routes/_site/lists/index.tsx`, `app/routes/_site/lists/$id.tsx`;
  `components/lists/ListCard.tsx`, `ListEditorSheet.tsx`,
  `AddToListSheet.tsx` (from profile overflow), `ListMemberRow.tsx`.
- **Modify:** `lib/feed/timeline.ts` (list branch), `FeedColumn` tab row
  (pinned-list tabs), profile overflow menu (Add/remove from list),
  Settings → Privacy ("Lists you're on"), `/api/account/export`.
- **i18n:** `locales/en/lists.json`.

### UI (desktop)

`/_site/lists` — grid of `ListCard`s + create button (`PageLayout`,
`backTo="/"`). `/_site/lists/$id` — list header (name, bio, member facepile,
edit for owner) above a standard `FeedColumn` timeline. `AddToListSheet`:
checkbox rows of the caller's lists with inline "new list" row. Home feed:
pinned lists render as extra tabs after Following.

### Mobile spec

- Home tab row (existing tabs + pinned lists) lives in an
  `overflow-x-auto snap-x` strip with fade edges (§2.6.5); active tab
  auto-scrolls into view on mount.
- `AddToListSheet` and `ListEditorSheet` are G1 bottom sheets; checkbox
  rows are 48 px tall.
- Member management rows: avatar + name + trailing 44 px remove
  `icon-button` — no swipe-to-delete dependency.
- List header collapses (bio behind "more") so the timeline starts within
  the first viewport.

### Economy integration

None — deliberately plumbing.

### Acceptance criteria

- [ ] Creating > `MAX_LISTS` lists or adding > `MAX_MEMBERS` members
      returns 400 with a toast; limits enforced server-side.
- [ ] A `FOLLOWERS`-audience post from a listed non-followed author does
      **not** appear in the list timeline (predicate test §2.9 passes for
      all audience values).
- [ ] `UNLISTED` list URL works signed-out read-only; `PRIVATE` returns
      404 to non-owners.
- [ ] Pinning ≤5 lists shows them as home tabs in `sortOrder`; unpinning
      removes the tab without reload.
- [ ] Being added to a list produces no notification; "Lists you're on"
      shows it and "remove me" works.
- [ ] Mobile: tab strip scrolls horizontally with no page-level horizontal
      scroll; sheets respect safe-area and keyboard.

### Risks / open questions

`PUBLIC` visibility ships schema-ready but UI-gated until a moderation pass
(list names/bios become reportable `ContentReport` targets first).

### Effort

**M (≈1–1.5 wk).**

---

## 4. Feature 2 — Unified Saves: folders + save-anything

### Concept

One **Saved** hub replacing the flat posts-only bookmarks page: anything —
post, build, song, video, library document, news article, replay, market
listing — saves into user folders ("Read later", "Base designs"). One tap =
default "Saved" folder; a visible secondary affordance opens the folder
picker (§2.6.4 — no long-press gating).

### Why it fits

Five surfaces have five save buttons and five inboxes. The polymorphic
`entityType`/`entityId` convention already exists in the coin ledger;
reuse it.

### Data model

```prisma
model SaveFolder {
  id        String   @id @default(cuid())
  userId    String
  name      String   @db.VarChar(40)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  user  User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  items SavedItem[]

  @@index([userId, sortOrder])
  @@map("save_folder")
}

model SavedItem {
  id         String   @id @default(cuid())
  userId     String
  folderId   String?  // null = default "Saved"
  entityType String   @db.VarChar(24) // see SAVE_ENTITY_TYPES
  entityId   String
  createdAt  DateTime @default(now())

  user   User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder SaveFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)

  @@unique([userId, entityType, entityId])
  @@index([userId, folderId, createdAt(sort: Desc)])
  @@map("saved_item")
}
```

`lib/saves/types.ts`: `SAVE_ENTITY_TYPES = ['rmhark','build','song',
'tube_video','library_doc','news','replay','listing'] as const` — zod-
validated everywhere; `MAX_FOLDERS = 20`.

**Migration (same migration file):** `INSERT INTO saved_item (id, user_id,
entity_type, entity_id, created_at) SELECT id, user_id, 'rmhark',
rmheet_id, created_at FROM rmheet_bookmark ON CONFLICT DO NOTHING;`. The
`/bookmarks` route and its API stay for one release reading from
`saved_item`, then drop table + route (follow-up task noted in the PR).

### Server & API

| Endpoint                  | Methods           | Notes                                                                                     |
| ------------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| `/api/saves`              | GET, POST, DELETE | POST/DELETE body `{ entityType, entityId, folderId? }` (idempotent both ways). GET: `?folder=&type=&cursor=` paginated. `prefix: 'saves'`, 60/min. |
| `/api/saves/folders`      | GET, POST         | POST zod: name 1–40.                                                                       |
| `/api/saves/folders/$id`  | PATCH, DELETE     | PATCH: rename / `sortOrder`. DELETE moves items to default (`folderId: null`), never deletes items. |

Hydration in `lib/saves/hydrate.server.ts`: group the page's items by
`entityType`, one batched query per type present, **through each entity's
existing list-query helper** so audience/visibility rules apply; items whose
target is gone or no longer visible return a `tombstone: true` entry.
Saving never notifies the author.

### Files

- **Create:** `lib/saves/types.ts`, `lib/saves/hydrate.server.ts`;
  `app/routes/api/saves/index.ts`, `…/saves/folders.ts`,
  `…/saves/folders.$id.ts`; `app/routes/_site/saves/index.tsx`;
  `components/saves/SaveButton.tsx`, `FolderPickerSheet.tsx`,
  `SavedItemCard.tsx` (thin switch over existing per-type cards),
  `TombstoneCard.tsx`.
- **Modify:** `app/routes/_site/bookmarks.tsx` → redirect to `/saves`;
  post/card overflow menus on posts, builds, songs (wave-1 surfaces) to
  render `SaveButton`; `/api/account/export`; sidebar entry
  (`lib/sidebar-data.ts` consumer) renamed Bookmarks → Saved.
- **i18n:** `locales/en/saves.json`.

### UI (desktop)

`/_site/saves`: left folder rail (G2 `SortableList` for reordering),
type-filter chips, card grid. `SaveButton` states: unsaved / saved
(filled icon); click toggles save to default folder + sonner toast with a
**"Move to folder…"** action button; an adjacent caret (in overflow menus)
opens `FolderPickerSheet` directly.

### Mobile spec

- Folder rail becomes a horizontal chip row above the grid (scrollable,
  §2.6.5); grid is 1-column cards.
- `FolderPickerSheet` is a G1 bottom sheet; the toast "Move" action is the
  primary mobile path to the picker (visible, not long-press).
- Tombstones and per-item remove use the card overflow menu (44 px).
- Folder reorder uses G2 ▲/▼ buttons inside a "Manage folders" sheet.

### Economy integration

None; saves feed the digest email and Jump-back-in widget (§15) as
candidate signals.

### Acceptance criteria

- [ ] Backfill migration moves every existing bookmark; `/bookmarks`
      redirects; old save states render identically in `/saves`.
- [ ] Save/unsave is idempotent (double-POST → one row, 200 both times).
- [ ] Deleting a folder re-homes its items to default; count preserved.
- [ ] A saved post whose audience the viewer loses renders as tombstone,
      not content (predicate test).
- [ ] Save actions work on posts, builds, songs in wave 1; each surface's
      button reachable without hover.
- [ ] Mobile: no horizontal page scroll; picker sheet usable with keyboard
      open (folder-name inline create).

### Risks / open questions

Polymorphism = no FK integrity — accepted (ledger precedent); tombstones
mitigate. Per-surface adoption beyond wave 1 is incremental follow-up PRs.

### Effort

**M (≈1.5–2 wk)** incl. migration + three surfaces; +S per later surface.

---

## 5. Feature 3 — History & resume everywhere

### Concept

A **History** page (watched / listened / played / read filters) plus
**resume**: RMHTube and RMHMusic continue where you left off; games with
sessions surface "continue" cards; library documents restore scroll
position. Converged privacy contract: pause history, clear all, per-item
remove — surfaced both on the page and in Settings → Privacy.

### Why it fits

YouTube/Netflix/Spotify trained everyone; the raw events are already
recorded (`SongPlay`, `RmhTubeUserStats`, `RMHarkView`, per-game saves) but
at the wrong grain and with no user-facing surface.

### Data model

```prisma
model HistoryEntry {
  id         String   @id @default(cuid())
  userId     String
  entityType String   @db.VarChar(24) // 'tube_video' | 'song' | 'game' | 'library_doc' | 'news'
  entityId   String
  position   Int?     // seconds (media) | percent*100 (docs) | null (games)
  duration   Int?     // for progress bars
  updatedAt  DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, entityType, entityId]) // history = most recent per item
  @@index([userId, updatedAt(sort: Desc)])
  @@map("history_entry")
}
```

`UserProfile` gains `historyPaused Boolean @default(false)`. Retention:
pg-boss weekly sweep deletes rows `updatedAt < now() - 180d`
(`HISTORY_RETENTION_DAYS = 180` in `lib/history/constants.ts`).

### Server & API

| Endpoint                     | Methods | Notes                                                                                                             |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `/api/history/beat`          | POST    | Body `{ entityType, entityId, position?, duration? }` (zod: position 0–86 400×2, duration ≥ position). Upsert. Silently no-ops (200) when `historyPaused`. `prefix: 'history'`, 120/min (heartbeats are chatty by design). |
| `/api/history`               | GET, DELETE | GET `?type=&cursor=` (day-grouped client-side). DELETE = clear-all (confirm-dialog client-side).               |
| `/api/history/$id`           | DELETE  | Remove one entry.                                                                                                  |
| `/api/preferences/privacy` (existing surface) | —  | `historyPaused` toggle rides the existing privacy-settings save path.                            |

Client reporter: `hooks/useHistoryBeat.ts` — `useHistoryBeat(entityType,
entityId, { getPosition, getDuration })`; sends at most every **15 s**
while playing/scrolling, once on pause/unmount (via `sendBeacon` fallback),
never for signed-out users. Resume rule (media surfaces): seek to
`position` when `position > 30s` **and** `position/duration < 0.95`.
Hydration reuses `lib/saves/hydrate.server.ts`'s pattern (shared helper,
same visibility guards, tombstones skipped silently here — history just
omits them).

### Files

- **Create:** `lib/history/constants.ts`, `lib/history/history.server.ts`
  (upsert + guards + sweep registration), `hooks/useHistoryBeat.ts`;
  `app/routes/api/history/beat.ts`, `…/history/index.ts`,
  `…/history/$id.ts`; `app/routes/_site/history.tsx`;
  `components/history/HistoryRow.tsx`, `ContinueShelf.tsx`.
- **Modify:** RMHTube player + RMHMusic player mount `useHistoryBeat` and
  the resume seek; library document reader (scroll position);
  Settings → Privacy (pause + clear + link); `/api/account/export`;
  home widget registration for Continue shelf (lands with §15's registry —
  until then, render on RMHTube/RMHMusic landing pages only).
- **i18n:** `locales/en/history.json`.

### UI (desktop)

`/_site/history`: filter chips, day-grouped rows (thumbnail, title, app
badge, progress bar, timestamp, remove ✕), header actions Pause/Resume and
Clear all (`confirm-dialog`). `ContinueShelf`: horizontal card strip with
progress bars, "resume" primary action.

### Mobile spec

- Rows are 64 px min-height with a trailing 44 px ✕; no swipe-gesture
  requirement.
- Filter chips in a scrollable snap strip; day headers sticky within the
  page scroller.
- `ContinueShelf` is `overflow-x-auto snap-x` with 160 px cards; shelf
  scrolls, page doesn't (§2.6.5).
- Clear-all confirm is a G1 sheet.

### Economy integration

None — deliberately outside the reward loop (idle-playback farming).

### Acceptance criteria

- [ ] Playing ≥15 s of an RMHTube video creates/updates exactly one row;
      re-opening the video resumes within ±5 s (when >30 s and <95 %).
- [ ] Pause stops new rows server-side (beats return 200, table
      unchanged); clear-all empties and the page shows the empty state.
- [ ] Paywalled/`PRIVATE` items the viewer can no longer access do not
      render in history.
- [ ] Signed-out browsing produces zero beats.
- [ ] Export includes history; account deletion cascades it.
- [ ] Mobile: shelf and chips scroll without page-level horizontal
      overflow; heartbeat also fires on tab-hide (visibilitychange).

### Risks

Write volume: one indexed upsert per active-media user per 15 s — fine at
current scale; if it grows, batch beats client-side first (30 s cadence)
before any infra change.

### Effort

**M (≈1.5 wk)** for table, page, RMHTube+RMHMusic; games/library follow.

---

## 6. Feature 4 — Game hubs: reviews, ratings & player guides

### Concept

Each first-party game gets a **hub page** `/games/$gameId`: star **rating**
(one per user, editable), **reviews** (≤2 000 chars, helpful-votes,
helpful-first sort), and **player guides** — long-form markdown with
revisions, coin-tippable. A `/games` directory gains rating badges and
sort-by-rating. Play routes stay top-level full-screen; the hub wraps and
deep-links into them.

### Why it fits

~20 games, zero player-generated meta-content — strategy evaporates into
Discord. Every ingredient exists: markdown pipeline (blog), revisions
precedent (`RMHarkEdit`, `BuildVersion`), comment/like precedent
(`BuildComment`), tips by `entityType`, `ContentReport` moderation,
`lib/games.ts` registry.

### Data model

```prisma
model GameReview {
  id        String   @id @default(cuid())
  userId    String
  gameId    String   @db.VarChar(40) // key from lib/games.ts
  stars     Int      // 1..5, zod-enforced
  body      String?  @db.VarChar(2000)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user  User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  votes GameReviewVote[]

  @@unique([userId, gameId])
  @@index([gameId, createdAt(sort: Desc)])
  @@map("game_review")
}

model GameReviewVote {
  reviewId String
  userId   String
  helpful  Boolean

  review GameReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  user   User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([reviewId, userId])
  @@map("game_review_vote")
}

model GameGuide {
  id        String   @id @default(cuid())
  authorId  String
  gameId    String   @db.VarChar(40)
  title     String   @db.VarChar(120)
  body      String   // markdown, current revision
  published Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  author    User                @relation(fields: [authorId], references: [id], onDelete: Cascade)
  revisions GameGuideRevision[]

  @@index([gameId, published, updatedAt(sort: Desc)])
  @@map("game_guide")
}

model GameGuideRevision {
  id        String   @id @default(cuid())
  guideId   String
  body      String
  note      String?  @db.VarChar(120)
  createdAt DateTime @default(now())

  guide GameGuide @relation(fields: [guideId], references: [id], onDelete: Cascade)

  @@index([guideId, createdAt(sort: Desc)])
  @@map("game_guide_revision")
}
```

### Server & API

| Endpoint                     | Methods            | Notes                                                                                     |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `/api/games/$id/reviews`     | GET                | `?sort=helpful\|recent&cursor=`; includes caller's own review first when present.          |
| `/api/games/$id/review`      | PUT, DELETE        | Upsert/delete own. **Play-gate:** server checks the game's player-model row or result history via `lib/games/meta.server.ts:hasPlayed(userId, gameId)`; 403 `{ error: 'Play the game first' }` otherwise. `prefix: 'game-review'`, 10/min. |
| `/api/reviews/$id/vote`      | POST, DELETE       | Body `{ helpful: boolean }`; own review unvotable (400).                                   |
| `/api/games/$id/guides`      | GET                | Published only (author sees own drafts).                                                   |
| `/api/guides`                | POST               | Create draft. `prefix: 'guides'`, 10/hour.                                                 |
| `/api/guides/$id`            | GET, PUT, DELETE   | PUT with changed `body` appends a `GameGuideRevision` (cap 50, oldest pruned). Markdown sanitized by the blog pipeline — never raw HTML. |
| `/api/guides/$id/publish`    | POST               | Flips `published`; title/body re-validated.                                                |

Aggregates: `lib/games/meta.server.ts:getRatingAgg(gameId)` — avg + count
via the in-memory `cached()` helper (60 s TTL, same pattern as
`lib/sidebar-data.ts`); the directory reads all aggregates in one grouped
query. Reviews and guides register as reportable `ContentReport` entity
types; admin "freeze reviews" per game = code-level `frozenReviewGames`
set in `lib/games/meta.server.ts` (constant, admin-editable later).

### Files

- **Create:** `lib/games/meta.server.ts` (`hasPlayed`, `getRatingAgg`,
  freeze set); `app/routes/api/games/$id.reviews.ts`,
  `…/games/$id.review.ts`, `…/reviews/$id.vote.ts`,
  `…/games/$id.guides.ts`, `…/guides/index.ts`, `…/guides/$id.ts`,
  `…/guides/$id.publish.ts`; `app/routes/_site/games/index.tsx`,
  `app/routes/_site/games/$gameId.tsx`,
  `app/routes/_site/games/$gameId.guides.$guideId.tsx`;
  `components/games/GameHubHeader.tsx`, `StarRating.tsx` (input +
  display), `ReviewCard.tsx`, `ReviewComposer.tsx`, `GuideReader.tsx`,
  `GuideEditor.tsx` (textarea + live preview through the existing
  markdown renderer), `RevisionHistorySheet.tsx`.
- **Modify:** `lib/games.ts` consumers that render the games directory
  (rating badge + sort); `ContentReport` entity-type unions + report
  sheet; tips `entityType` union gains `'guide'`; sidebar games group
  links to `/games`.
- **i18n:** `locales/en/games-hub.json`.
- **SEO:** hub pages emit `jsonLdScript(videoGameSchema(...))` with
  `aggregateRating` from the agg; guides emit `articleSchema`.

### UI (desktop)

Hub: art header, rating summary + tap-to-rate stars, Play CTA
(deep link to the top-level game route), leaderboard snippet (existing
component), top reviews + composer, guides list. Guide reader:
library-style typography, byline, tip button, revision history. Directory:
card grid with rating badges and `sort=rating|name|popular`.

### Mobile spec

- Hub header collapses to art-strip + title + sticky Play CTA; sections
  stack (rating → play → reviews → guides).
- `StarRating` input stars are 44 px hit areas with a slider fallback for
  fine motor (`role="slider"` semantics either way).
- `ReviewComposer` and `GuideEditor` open as full-height G1 sheets; the
  editor's Write/Preview toggle is a segmented control (no side-by-side
  panes on mobile); the format toolbar sits sticky above the keyboard.
- Guide tables/code blocks render in `overflow-x-auto` wrappers (§2.6.5 —
  markdown renderer already does this for blog; verify, don't rebuild).
- Directory grid: 2-col at ≥390 px, 1-col below.

### Economy integration

Guide tips are ordinary `TIP` rows (`entityType: 'guide'`) → flow into
creator earnings with zero changes to `earnings.server.ts`.

### Acceptance criteria

- [ ] Review upsert enforces play-gate (403 without a play record) and
      1–5 stars; one review per user per game.
- [ ] Helpful-sort orders by helpful-vote count; own-review voting blocked.
- [ ] Guide save with changed body creates a revision; history sheet lists
      and renders any revision read-only.
- [ ] Unpublished guides invisible to non-authors (404 by id).
- [ ] Tipping a guide credits the author's derived earnings.
- [ ] Reviews and guides reportable; report reaches the admin queue.
- [ ] Rating aggregate on the directory updates within the cache TTL.
- [ ] Mobile: editor usable with keyboard open; no horizontal page scroll
      in guide bodies with tables.

### Risks

Review-bombing (play-gate + unique + rate limit + freeze flag = v1
answer). The guide reader's typography is design work — budget it.

### Effort

**L (≈2–3 wk).** The largest feature here and the strongest games play.

---

## 7. Feature 5 — Post awards

### Concept

Reddit-style **awards**: spend coins to pin a public award (Bronze /
Silver / Gold + seasonal designs) on a post, comment, build, or guide. The
badge renders on the content; the recipient gets a coin share; the giver
is credited or anonymous. Tips are private income; awards are **public
recognition** — a status purchase that beautifies content and net-burns
coins.

### Data model

```prisma
model ContentAward {
  id         String   @id @default(cuid())
  awardId    String   @db.VarChar(32) // key in lib/awards/catalog.ts
  giverId    String
  anonymous  Boolean  @default(false)
  hidden     Boolean  @default(false) // recipient hid it
  entityType String   @db.VarChar(24) // 'rmhark' | 'comment' | 'build' | 'guide'
  entityId   String
  createdAt  DateTime @default(now())

  giver User @relation(fields: [giverId], references: [id], onDelete: Cascade)

  @@index([entityType, entityId])
  @@index([giverId, createdAt(sort: Desc)])
  @@map("content_award")
}
```

`lib/awards/catalog.ts` (client-safe): `{ id, name, art (static asset),
priceCoins, recipientShare }` — e.g. bronze 100/60 %, silver 250/60 %,
gold 500/60 %; seasonal entries carry `availableUntil`.

### Server & API

`/api/awards` — **POST** `{ awardId, entityType, entityId, anonymous? }`
(`prefix: 'awards'`, 20/min): resolve catalog entry + entity + recipient
(author lookup per entityType via a `lib/awards/resolve.server.ts` map);
single Prisma transaction — balance check → `TIP` ledger row for
`recipientShare` (sender = giver, recipient = author, `entityType`/
`entityId` as tips do today) → `PURCHASE` row for the platform cut →
`ContentAward` insert; then best-effort `createNotification` (type
`system`, "Your post received a Gold award"). **GET**
`?entityType=&entityId=` — grouped `{ awardId, count }[]` + first 3 givers
(anonymous rows excluded from names, included in counts).
**POST `/api/awards/$id/hide`** — recipient-only toggle of `hidden`.

Award summaries hydrate onto feed posts alongside reaction summaries
(extend the existing reaction-summary batch in `lib/feed` — one more
grouped query, same shape).

### Files

- **Create:** `lib/awards/catalog.ts`, `lib/awards/resolve.server.ts`;
  `app/routes/api/awards/index.ts`, `…/awards/$id.hide.ts`;
  `components/awards/AwardPickerSheet.tsx`, `AwardBadgeRow.tsx`,
  `AwardedBySheet.tsx`.
- **Modify:** post/comment overflow menus + build/guide action rows
  ("Give award"); `PostCard` renders `AwardBadgeRow`; feed hydration;
  wallet page txn labels (awards render as their catalog name).
- **i18n:** `locales/en/c-awards.json`.

### UI (desktop)

Picker: catalog grid (art, name, price), anonymous toggle, wallet balance
footer, confirm. Badge row: top-3 award icons × counts, "+N"; click opens
Awarded-by (respecting anonymity). Refund policy line in the picker:
"Awards on removed content are not refunded."

### Mobile spec

- Picker is a G1 bottom sheet: 3-col art grid (≥44 px cells), sticky
  footer with balance + confirm button padded for safe-area.
- Badge row wraps to one line max with "+N" overflow; tap targets ≥44 px
  via padded chips.
- "Give award" lives in the overflow menu on mobile (no hover reveal).

### Economy integration

First significant **recognition sink**: `recipientShare < 100 %` net-burns
supply; no new `CoinTxnType`, so earnings derivation and admin audit stay
untouched. Coin-supply dashboards pick the flows up automatically.

### Acceptance criteria

- [ ] Insufficient balance → 400, no rows written (transaction atomicity
      test).
- [ ] Ledger shows exactly two rows per award (share TIP + cut PURCHASE)
      with correct amounts.
- [ ] Anonymous awards count publicly but never expose the giver
      (including via the Awarded-by sheet and export).
- [ ] Recipient hide removes the badge from all renders without refund.
- [ ] Awards on content that gets removed/hidden disappear with it.
- [ ] Notification arrives (and respects §16's matrix once that ships).
- [ ] Mobile: sheet grid + sticky footer usable at 375 px with keyboard
      closed; wallet footer never overlaps home indicator.

### Risks

Ironic-award harassment → positive-only catalog + recipient hide. Seasonal
art is content ops, not code.

### Effort

**S–M (≈1 wk).**

---

## 8. Feature 6 — Wishlists & follow-alerts (shop, market, builds)

### Concept

**Wishlist** on shop items and market cosmetics + **follow-alerts**: notify
when a wishlisted shop item goes on sale/returns, when a `MarketListing`
appears at/below a target price, or when a followed creator publishes a
build. Public-by-default on the profile (opt-out) — which quietly powers
gifting.

### Data model

```prisma
model WishlistEntry {
  id          String   @id @default(cuid())
  userId      String
  entityType  String   @db.VarChar(24) // 'shop_item' | 'market_cosmetic' | 'creator_builds'
  entityId    String   // catalog key | itemId | creatorId
  targetPrice Int?     // coins; market alerts only
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, entityType, entityId])
  @@index([entityType, entityId]) // reverse index: who wants this?
  @@map("wishlist_entry")
}
```

`UserProfile` gains `wishlistPublic Boolean @default(true)`.

### Server & API

- `/api/wishlist` — GET (own, grouped by type), POST `{ entityType,
  entityId, targetPrice? }`, DELETE `{ entityType, entityId }`
  (idempotent). `prefix: 'wishlist'`, 60/min.
- `/api/users/$id/wishlist` — GET, honors `wishlistPublic` (404 when
  private).
- Matching (the `HomeWatch` pattern): new-`MarketListing` creation and
  shop rotation/sale transitions enqueue `wishlist.match` (pg-boss) with
  the entity key; the worker (`lib/wishlist/alerts.server.ts`) reads the
  reverse index, filters `targetPrice`, dedupes per user×entity×day
  (job `singletonKey`), and notifies via `createNotification` + push
  (through §16's gateway once it ships; Events & live category).
- Gifting hook: the existing gift flow accepts `?fromWishlist=1` so gift
  moments can say "granted a wish".

### Files

- **Create:** `lib/wishlist/alerts.server.ts` (+ job registration);
  `app/routes/api/wishlist/index.ts`, `app/routes/api/users/$id.wishlist.ts`;
  `app/routes/_site/wishlist.tsx`; `components/wishlist/WishButton.tsx`,
  `WishlistCard.tsx`, `TargetPriceSheet.tsx`.
- **Modify:** shop item cards, market listing pages, creator/build pages
  (mount `WishButton`); market-listing create path + shop rotation path
  (enqueue match job); profile page (Wishlist shelf behind the flag,
  gift CTA); Settings → Privacy (`wishlistPublic`); `/api/account/export`.
- **i18n:** `locales/en/wishlist.json`.

### UI (desktop)

`WishButton`: heart-bookmark icon toggle on cards (visible, not
hover-revealed). `/_site/wishlist`: grouped sections, target-price editor
per market entry, remove per row. Profile shelf: compact item strip +
"gift this" CTA for viewers with balance.

### Mobile spec

- `WishButton` is part of each card's visible action row (44 px), never
  hover-only.
- `TargetPriceSheet` (G1): numeric input `inputMode="numeric"`
  `pattern="[0-9]*"`, ≥16 px font (audit F2), quick-pick chips (listing
  price −10 %/−25 %).
- Wishlist page sections collapse (accordion) with counts; cards 1-col.
- Profile shelf is a horizontal snap strip.

### Economy integration

Demand-side accelerant for existing sinks (shop/market/gifting); no new
ledger semantics.

### Acceptance criteria

- [ ] Wishlist add/remove idempotent; unique constraint holds.
- [ ] A new market listing at ≤ targetPrice notifies exactly once per
      user per day per entity (dedupe test).
- [ ] Private wishlist 404s for other viewers and hides the shelf.
- [ ] Alert respects notification prefs (and quiet hours post-§16).
- [ ] Gift flow started from a wishlist marks the moment as
      wishlist-granted.
- [ ] Mobile: price input doesn't trigger iOS zoom; sections scroll
      vertically only.

### Risks

Alert spam on hot cosmetics — the dedupe key is the mitigation; watch
opt-out rates (KPI §21).

### Effort

**S–M (≈1 wk).**

---

# Pillar B — Social & presence

## 9. Feature 7 — Rich presence & the Friends rail

### Concept

Presence grows from boolean to **activity**: "In a Void Breaker match",
"Listening in Jazz Room", "Live in a Space", "Idle". A **Friends rail**
shows mutuals online, what they're doing, and one-tap context actions:
_join_ (party invite), _watch_ (spectate), _hop in_ (room/space join).
Steam's friends list + Discord's sidebar — the strongest "site is alive"
surface that isn't a feed. **Privacy is the design center.**

### Data model

Presence activity stays in the existing ephemeral presence store (expires
with the heartbeat) — no new table. Activity is set **server-side only**
by the surfaces the user is in; never client-asserted. `UserProfile`
gains:

```prisma
  presenceVisibility String  @default("mutuals") @db.VarChar(12) // 'mutuals' | 'followers' | 'nobody'
  presenceDetail     Boolean @default(true) // false → online/offline only
```

Activity vocabulary (client-safe, `lib/presence-types.ts`):

```ts
export type PresenceActivity =
  | { kind: 'game'; gameId: string; label: string }        // label from lib/games.ts
  | { kind: 'music_room' | 'tube_room'; roomId: string; label: string }
  | { kind: 'space'; spaceId: string; label: string };
```

### Server & API

- `lib/presence.server.ts` gains `setActivity(userId, activity | null)`;
  call sites: socket-server game handlers (match join/leave), RMHTube/
  RMHMusic room join/leave, Space join/leave — ~10 touch points, each a
  one-line add in code that already runs on those transitions. Activity
  clears with the heartbeat expiry (no leak on crash).
- `/api/friends/active` — GET: mutuals ∩ online, each entry filtered
  through the **target's** `presenceVisibility`/`presenceDetail`; response
  `{ user, activity | null, joinable: { kind, id } | null }`; cached 15 s
  per viewer (in-memory `cached()`), `prefix: 'friends-active'`, 30/min.
- Live updates: `presence:changed` on the socket for users in the
  viewer's current rail payload only (subscribe with the visible id set;
  server intersects against visibility before emitting).
- Join actions call the **existing** party/room/space join APIs — the rail
  adds zero join logic.

### Files

- **Create:** `lib/presence-types.ts`;
  `app/routes/api/friends/active.ts`;
  `components/site/FriendsRail.tsx`, `FriendsSheet.tsx`,
  `ActivityLine.tsx` (shared by rail, profile, hover card).
- **Modify:** `lib/presence.server.ts`; the ~10 join/leave call sites
  (list them in the PR description as a checklist); home page
  `rightSidebar` (rail); `CommandPalette` ("Friends" action opening the
  sheet); Settings → Privacy (visibility + detail controls near DM
  privacy); profile header (ActivityLine under the same rules).

### UI (desktop)

Rail card in the home right rail: online mutuals sorted
(in-something first), avatar + name + `ActivityLine` + trailing context
button (Join/Watch/Hop in). Empty state: "No friends online" +
invite-link CTA (referrals exist).

### Mobile spec

- Right rail is hidden on mobile (§2.6.9) — the mobile surface is a
  **compact avatar strip** pinned above the home feed (top 5 online
  mutuals as 44 px avatars with activity dots + a "+N" pill) opening
  `FriendsSheet` (G1, full list, same rows and context actions).
- The strip renders only when ≥1 mutual is online (zero-height otherwise;
  no empty-state noise on mobile).
- Context actions in the sheet are full-width row buttons (not
  hover-revealed).
- Socket updates animate respectfully: no layout shift of the feed below
  (fixed strip height), `useReducedMotion` disables the pulse dot.

### Economy integration

None directly; lifts party/spectate/room entry.

### Acceptance criteria

- [ ] Activity set on join and cleared on leave/disconnect for each touch
      point (checklist in PR verified).
- [ ] `presenceVisibility='nobody'` removes the user from every rail;
      `presenceDetail=false` shows online-only with no activity, in both
      REST payload and socket events.
- [ ] Non-mutuals never appear regardless of settings (default scope).
- [ ] Join button lands in the correct game lobby/room/space.
- [ ] Rail updates via socket within one heartbeat of a friend starting a
      match; no polling besides the 15 s-cached GET on mount.
- [ ] Mobile strip appears/disappears without shifting the feed; sheet
      lists everyone the desktop rail would.

### Risks

Default `mutuals` is the safe scope (Discord-like); a public "who's in
this game" surface is explicitly out of scope here.

### Effort

**M (≈1.5 wk)** — touch points + rail/strip.

---

## 10. Feature 8 — Custom status & now-playing

### Concept

Short **custom status** (emoji + ≤80 chars, expiry 30 m/1 h/today/until
cleared) on profile, hover cards, DMs, Friends rail. Optional
**auto now-playing**: with rich presence active and opt-in, the status
mirrors it ("♪ Neon Nights — RMHMusic").

### Data model

On `UserProfile`:

```prisma
  statusEmoji   String?   @db.VarChar(16)
  statusText    String?   @db.VarChar(80)
  statusExpires DateTime?
  statusAuto    Boolean   @default(false)
```

Expiry enforced at read time (`expires < now()` ⇒ render nothing); weekly
pg-boss sweep nulls stale columns.

### Server & API

`/api/profile/status` — PUT `{ emoji?, text?, expiresIn?: '30m'|'1h'|
'today'|null, auto? }`, DELETE (clear). Text runs through the same
moderation helper bios use. `prefix: 'status'`, 20/min. Status joins the
`lib/user-display.server.ts` payload (one more selected column set) so
every avatar/name surface renders it without new queries; `statusAuto`
resolution happens at display time: if no manual status and presence
reports an activity (per §9's visibility rules), synthesize the
now-playing line.

### Files

- **Create:** `app/routes/api/profile/status.ts`;
  `components/profile/StatusEditorSheet.tsx`, `StatusBadge.tsx`.
- **Modify:** `lib/user-display.server.ts` (+ its store/types);
  profile header, hover card, DM conversation header, `FriendsRail`
  rows (render `StatusBadge`); profile menu entry ("Set a status");
  emoji rendering via the existing `TwemojiProvider`.
- **i18n:** `locales/en/c-status.json` (incl. preset statuses:
  "🎮 Grinding the pass", "📚 Studying", "🎧 Vibing").

### UI (desktop)

`StatusEditorSheet`: emoji button (Twemoji picker), text input with
80-char counter, expiry segmented control, presets row, auto toggle
(visible only when presence detail is on), Clear.

### Mobile spec

- Editor is a G1 bottom sheet; text input ≥16 px (audit F2); counter
  visible above the keyboard.
- Presets are one tap (chip row, scrollable).
- `StatusBadge` truncates with `text-ellipsis` at one line everywhere;
  full text on profile only.

### Acceptance criteria

- [ ] Status renders on all four surfaces from the user-display payload
      (no N+1 queries — verify the select).
- [ ] Expiry hides at read time even before the sweep runs.
- [ ] Moderated term in text → 400 with the standard message.
- [ ] Auto now-playing appears only when §9 visibility would show the
      activity, and manual status always wins.
- [ ] Clearing works from editor and profile menu.
- [ ] Mobile: sheet + keyboard usable; presets reachable without
      scrolling the sheet.

### Effort

**S (≈2–3 d).**

---

## 11. Feature 9 — Close Friends circle

### Concept

One private **Close Friends** circle per user; posts (and moments) can
target it (`RMHarkAudience.CIRCLE`). Circle posts show a green avatar
ring + chip to circle members. Membership is silent and never publicly
visible.

### Data model

```prisma
model CloseFriend {
  ownerId  String
  memberId String
  addedAt  DateTime @default(now())

  owner  User @relation("CircleOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  member User @relation("CircleMember", fields: [memberId], references: [id], onDelete: Cascade)

  @@id([ownerId, memberId])
  @@index([memberId]) // viewer-side feed predicate
  @@map("close_friend")
}
```

`RMHarkAudience` gains `CIRCLE`. `MAX_CIRCLE = 150` (code constant).

### Server & API

- `/api/circle` — GET (members, owner only), PUT `{ userIds: string[] }`
  (full-set replace, like muted-words; zod ≤150; every id must be an
  account the owner follows or that follows them — validated in one
  query). `prefix: 'circle'`, 20/min.
- Feed predicate: `audience = 'CIRCLE' ⇒ EXISTS close_friend(ownerId =
  authorId, memberId = viewerId)` — added **inside the shared audience
  helper** in `lib/feed`, which automatically covers timeline, profile,
  list timelines (§3), saves/history hydration (§4/§5), embeds, and OG
  (they all consume the helper; the §2.9 predicate matrix gains a
  `CIRCLE` row).
- No notifications for add/remove, ever.

### Files

- **Create:** `app/routes/api/circle.ts`;
  `components/circle/CircleManagerSheet.tsx` (searchable follower
  picker), `CircleChip.tsx`.
- **Modify:** `RMHarkAudience` enum + the audience helper + composer
  audience picker (option "Close friends · N", with the one-line
  screenshot caveat copy); `PostCard` (green ring + chip when
  `audience === 'CIRCLE'` and viewer is member/author);
  Settings → Privacy (entry point to the manager).
- **i18n:** `locales/en/c-circle.json`.

### Mobile spec

- Audience picker rows are 48 px; the picker itself is already a
  sheet-style control — verify against G1, migrate if bespoke.
- `CircleManagerSheet`: G1 full-height, search input pinned top (≥16 px),
  results virtualized beyond 100, checkbox rows 48 px, sticky Save with
  safe-area padding.
- Green ring is a 2 px token-colored ring (`--site-success` family) that
  survives `high-contrast`.

### Acceptance criteria

- [ ] `CIRCLE` post invisible to non-members on every surface in the
      §2.9 matrix, including embeds/OG.
- [ ] PUT replaces the set atomically; ids outside the follow graph → 400.
- [ ] No notification rows created on membership changes.
- [ ] Removing a member immediately hides past `CIRCLE` posts from them.
- [ ] Composer shows live member count; caveat copy present once.
- [ ] Export includes the user's own circle (owner side only — never
      "circles you're in").

### Effort

**S (≈3–4 d)** thanks to the audience machinery.

---

## 12. Feature 10 — Profile v2: modular showcase

### Concept

Profiles become **composable**: pick, order, and configure up to 6
**modules** — Featured posts, Achievement showcase, Build shelf, Stat
card, Status/now-playing, Wishlist, Supporting shelf, Guides, Pet
habitat. The default module set reproduces today's layout exactly, so
unedited profiles don't change.

### Data model

```prisma
model ProfileLayout {
  userId    String   @id
  modules   Json     @default("[]") // ordered [{ kind, config }]
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("profile_layout")
}
```

`lib/profile/modules.ts` (client-safe) is the schema of record: the module
catalog (`kind`, label, per-kind zod config — e.g. `featured_posts:
{ postIds: string[] ≤3 }`, `achievements: { ids: string[] ≤3 }`), the
default set, and `parseLayout()` which zod-validates and **drops unknown
kinds/fields at read time** (forward-safe, §2 preference-JSON rule).

### Server & API

`/api/profile/layout` — GET (own), PUT (full array ≤6, validated by
`parseLayout`). `prefix: 'profile-layout'`, 20/min. The profile route's
loader reads the layout, then batches data **per present kind** through
each source's existing list helper (posts, achievements, builds…) — one
query per kind, same visibility rules as the source pages (a private
wishlist module simply renders for the owner only, reusing §8's flag).

### Files

- **Create:** `lib/profile/modules.ts`;
  `app/routes/api/profile/layout.ts`;
  `components/profile/modules/` (one renderer per kind — thin wrappers
  over existing cards/tiles), `ProfileEditorMode.tsx`,
  `ModulePickerSheet.tsx`, `ModuleConfigSheet.tsx`. Module cards use the
  shared **G3 `WidgetFrame`** (`.glass-fill`, §2.4a) so profile modules and
  §15 home widgets share one glass surface + empty state + skeleton.
- **Modify:** `app/routes/_site/profile/$id.tsx` (loader batching +
  module rendering + "Edit profile layout" for the owner);
  `/api/account/export`.
- **i18n:** `locales/en/c-profile-modules.json`.

### UI (desktop)

Owner edit mode: modules gain drag handles (G2 `SortableList`),
add/remove via `ModulePickerSheet`, per-module gear →
`ModuleConfigSheet`. Renderers must show `WidgetFrame`'s empty state
gracefully (new accounts).

### Mobile spec

- Modules stack 1-col in order (they are the mobile profile).
- Edit mode reorders via G2 ▲/▼ buttons (drag optional); the editor
  never requires drag on touch.
- Picker/config sheets are G1; config forms follow audit F2 input rules.
- Each module caps its own height with internal "show all" links —
  profiles stay scannable, never infinite.

### Acceptance criteria

- [ ] Unedited profiles render byte-identical module set to today's
      layout (snapshot comparison).
- [ ] PUT rejects >6 modules, unknown kinds, invalid configs; stored
      unknowns (simulated) are dropped silently on read.
- [ ] Loader issues ≤1 data query per present module kind (log/inspect).
- [ ] Modules honor source visibility (private wishlist hidden from
      visitors; `CIRCLE` posts never leak into Featured for
      non-members).
- [ ] Profile SSR p95 within +10 % of baseline at 6 modules.
- [ ] Mobile: reorder possible with buttons only; empty states render at
      375 px without overflow.

### Effort

**M–L (≈2 wk)** — editor is the work; renderers are recomposition.

---

# Pillar C — QOL & user customization

## 13. Feature 11 — Appearance & accessibility suite

### Concept

Settings → Appearance grows into a **comfort panel**: font scale
(87.5 / 100 / 112.5 / 125 %), density (Cozy/Compact), readable
(dyslexia-friendly) body font, **custom accent** color with an automatic
AA contrast guard, an account-level reduce-motion toggle feeding
`useReducedMotion`, plus the existing theme/accent/`reduceTransparency`
controls in one place. All synced via `AppearancePreference` — whose
schema comment already reserves exactly these knobs.

### Data model

New nullable fields on `AppearancePreference` (null = built-in default):

```prisma
  fontScale    Int?    // 875 | 1000 | 1125 | 1250 (per-mille, no floats)
  density      String? @db.VarChar(8) // 'cozy' | 'compact'
  readableFont Boolean @default(false)
  customAccent String? @db.VarChar(7) // '#rrggbb'; wins over `accent` preset
  reduceMotion Boolean @default(false)
```

### Server & API

Extend `/api/preferences/appearance`'s zod schema (partial-upsert
contract per §2.3): `fontScale` ∈ {875,1000,1125,1250}, `density` enum,
`customAccent` `/^#[0-9a-f]{6}$/i` **validated through the contrast guard
server-side too** (reject colors that can't be nudged into compliance).
GET returns the new fields with the same null semantics.

Contrast guard — `lib/appearance/contrast.ts` (client-safe, unit-tested):
given a hex, compute WCAG relative luminance; derive the accent trio
(base/hover/foreground) with the same math `ACCENT_PRESETS` uses; if
contrast vs `--site-surface` (per active theme) < 4.5:1, nudge lightness
stepwise toward compliance and return `{ adjusted, hex }` so the UI can
say "adjusted for readability".

### Application (runtime)

- `stores/themeStore.ts` gains the five fields + setters (mirroring
  `reduceTransparency`'s shape); `Providers.tsx` applies them:
  `fontScale` → `document.documentElement.style.fontSize = '<scale/10>%'`
  (the whole UI is rem-based); `density` → `data-density="compact"` on
  `<html>`; `readableFont` → `html.readable-font` class; `customAccent` →
  sets the accent CSS custom properties from the guard's trio;
  `reduceMotion` → `hooks/useReducedMotion` returns
  `mediaQuery || store.reduceMotion`.
- `app/globals.css`: `[data-density="compact"]` remaps the spacing tokens
  the feed/table/sidebar surfaces consume (a scoped token pass — padding
  and gap tokens only, **never** font-size or touch-target size);
  `.readable-font` swaps the body font stack to the bundled face.
- No-flash: extend the inline theme script in `__root.tsx` to apply
  fontScale/density/readable/reduce-motion classes from the localStorage
  mirror before first paint (it already does this for theme/accent —
  same mechanism, same key).
- Readable font: subset woff2 in `public/fonts/` (license-checked,
  OpenDyslexic or Atkinson Hyperlegible — **decide at implementation,
  Atkinson preferred** for licensing and glyph coverage), loaded only
  when the class is present (`@font-face` + class-scoped `font-family`).

### Files

- **Create:** `lib/appearance/contrast.ts` (+ `contrast.test.ts`);
  `public/fonts/<readable>.woff2`;
  `components/settings/AppearancePanel.tsx` (consolidated panel).
- **Modify:** `prisma/schema.prisma`; `/api/preferences/appearance`;
  `stores/themeStore.ts`; `components/Providers.tsx`;
  `app/routes/__root.tsx` (inline script); `app/globals.css` (density
  tokens + readable-font); `hooks/useReducedMotion.ts`; the settings
  route hosting today's theme picker (consolidate into the panel).
- **i18n:** `locales/en/settings-appearance.json`.

### UI (desktop)

One panel, grouped: Theme (existing gallery w/ preview) · Accent (presets
+ custom swatch opening a color input with live guard feedback) · Text
(scale segmented control with live preview sentence) · Density · Comfort
(readable font, reduce motion, reduce transparency). Every control
applies **instantly** (store) and persists (API) — the appearance
pattern already shipped.

### Mobile spec

- Segmented controls ≥44 px; the color picker uses native
  `<input type="color">` plus a hex field (`inputMode` text,
  autocapitalize off, ≥16 px).
- **Interaction with audit F2:** inputs must never render <16 px CSS —
  at `fontScale=875` the input font-size gets a `max(16px, 1em)` clamp
  (add to the shared input primitive once).
- Compact density preserves 44 px touch targets by construction (only
  padding/gap tokens shrink — enforce in review).
- Live preview must not jump the scroll position when scale changes
  (apply to `<html>`, let the browser reflow — verify the settings
  page itself stays readable at 125 % on 375 px).

### Economy integration

None — **comfort settings are never paywalled** (policy, §20.4).

### Acceptance criteria

- [ ] Each knob applies instantly, persists, survives reload without
      flash (localStorage mirror verified with network disabled), and
      syncs to a second device via the API.
- [ ] `contrast.test.ts`: known-bad hex is adjusted to ≥4.5:1 on all
      six `SITE_STYLES`; known-good passes through unchanged.
- [ ] Reduce motion disables framer transitions site-wide via the hook
      (spot-check feed, dialogs, celebration effects).
- [ ] Readable font swaps body text only; headings unchanged; no FOUT
      on toggle (font preloaded on settings page).
- [ ] `fontScale=1250` on 375 px: no horizontal scroll on feed,
      settings, or a game hub page; `875` keeps inputs ≥16 px.
- [ ] Compact density: touch targets still ≥44 px (audit spot-check).
- [ ] jsx-a11y clean; panel usable with keyboard only.

### Risks

Compact density is a genuine design pass over feed/tables/sidebar — scope
to those; everything else inherits Cozy until touched.

### Effort

**M (≈1–1.5 wk)**, dominated by the density token pass + guard tests.

---

## 14. Feature 12 — Theme Studio & the theme economy

### Concept

**Theme Studio** (a Creator Studio tab): build a site theme from the
token palette — surfaces, accent, glass opacity, radius — with live
preview, save privately, apply, and **publish**: a published theme
becomes a shop cosmetic others buy with coins, revenue through the
creator earnings pipeline.

### Why it fits

Themes are already first-class economy objects (`ShopItemKind.THEME`,
inventory, equip) and `MarketListing` shipped. Missing: supply. UGC
themes are pure data — zero media moderation weight — on the platform's
most distinctive surface.

### Data model

```prisma
enum UserThemeStatus {
  DRAFT
  PUBLISHED
  DELISTED
}

model UserTheme {
  id         String          @id @default(cuid())
  authorId   String
  name       String          @db.VarChar(40)
  tokens     Json            // { v: 1, ...closed key set } — lib/themes/tokens.ts
  status     UserThemeStatus @default(DRAFT)
  priceCoins Int?            // null while draft; 200–5000 published
  sales      Int             @default(0)
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt

  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([status, sales(sort: Desc)])
  @@index([authorId])
  @@map("user_theme")
}
```

Ownership = `UserInventory` rows, `kind: THEME`,
`itemId: "user:<themeId>"` — the equip flow needs no changes.
**Immutability rule:** once `PUBLISHED`, `tokens` are frozen (PUT rejects
token edits; author may delist or change price). Delisting hides from
the shop but the row remains readable, so owners' themes keep resolving —
no snapshot table needed.

### Token format & safety

`lib/themes/tokens.ts` (client-safe): versioned **closed key set**
(`v: 1`) — a fixed list of `--site-*` color tokens + numeric knobs
(glass opacity 0–1, radius px bounded). Zod validates keys exhaustively
(`.strict()`), values are colors/numbers only — **never CSS strings**, so
a published theme cannot inject styles or content. `themeStore` gains
`applyTokenMap(map)`, used identically for built-ins and user themes;
the no-flash script handles user themes by mirroring the applied map to
localStorage on equip.

**Publish gate** (`lib/themes/validate.ts`, shares §13's contrast
module): every text/surface token pair must pass AA (4.5:1); name
moderation via the standard text helper; failures return structured
errors the editor renders inline. Fail closed.

### Server & API

| Endpoint                   | Methods          | Notes                                                                     |
| -------------------------- | ---------------- | -------------------------------------------------------------------------- |
| `/api/themes`              | GET, POST        | GET: own themes; POST create draft. `prefix: 'themes'`, 30/min.            |
| `/api/themes/$id`          | GET, PUT, DELETE | PUT: tokens (drafts only), name, price. DELETE drafts only; published → delist. |
| `/api/themes/$id/publish`  | POST             | Runs the gate; sets `PUBLISHED` + price (zod 200–5000).                     |
| `/api/themes/$id/buy`      | POST             | Single transaction: balance → `PURCHASE` ledger row (recipient = author, storefront-sale semantics so earnings pick it up) → `UserInventory` upsert → `sales++`. Buying own/already-owned → 400. |
| `/api/themes/shop`         | GET              | `?sort=top\|new&cursor=` — `PUBLISHED` only, for the shop shelf.            |

### Files

- **Create:** `lib/themes/tokens.ts`, `lib/themes/validate.ts`
  (+ tests); `app/routes/api/themes/…` (five files per the table);
  `app/routes/_site/studio/themes.tsx` (or a tab within the existing
  creator-studio route — follow its internal nav pattern);
  `components/themes/ThemeEditor.tsx`, `TokenControlGroup.tsx`,
  `ThemePreviewPane.tsx` (sample feed card + buttons + dialog rendered
  with the draft map), `ThemeShopCard.tsx` (live mini-swatch),
  `PublishChecklistSheet.tsx`.
- **Modify:** `stores/themeStore.ts` (`applyTokenMap`), `Providers.tsx`
  + `__root.tsx` mirror; shop page ("Community themes" shelf via
  `/api/themes/shop`); inventory/equip surface (resolve `user:` ids);
  profile module catalog (§12: "Themes by me").
- **i18n:** `locales/en/theme-studio.json`.

### UI (desktop)

Editor: grouped controls left (Surfaces / Accent / Glass / Shape),
sticky live preview right; contrast lint inline per pair; Save draft /
Apply to my account / Publish… (checklist sheet: gate results, price
input, terms line).

### Mobile spec

- Editor stacks: **preview sticky top** (collapsed ~200 px, expandable),
  controls scroll beneath — editing on a phone must be genuinely usable,
  not a desktop consolation.
- Color controls: native `<input type="color">` + hex field (16 px,
  `autocapitalize="off"`); numeric knobs use `slider` primitive with
  44 px thumbs + value stepper buttons.
- Publish checklist is a G1 sheet; price input `inputMode="numeric"`.
- Shop shelf cards: 2-col ≥390 px; mini-swatch is a static render
  (no live theme application on scroll — perf).

### Economy integration

New creator category + real sink; platform cut mirrors the storefront
constant. Prices bounded 200–5 000 to keep the launch market sane.

### Acceptance criteria

- [ ] `.strict()` zod rejects unknown token keys and non-color/number
      values; a crafted `url(...)`/`; injection` string never reaches CSS
      (unit test).
- [ ] Publish gate blocks a failing pair with a field-level error; a
      passing theme publishes and appears in the shop shelf.
- [ ] Published tokens immutable (PUT → 400); delist hides from shop but
      owners still equip/render it.
- [ ] Buy transaction: exact ledger rows, inventory row, `sales`
      increment — atomic under a forced mid-transaction failure test.
- [ ] Author earnings reflect sales in the derived view with no
      `earnings.server.ts` change.
- [ ] Equipping a user theme survives reload flash-free on both scroll
      roots and in `high-contrast` OS mode.
- [ ] Mobile: full create→publish flow completable at 375 px.

### Risks

Taste floor: the gate enforces *legible*, not *good* — sales sort
quality; names reportable. Token-map `v` field is the migration path if
the token contract evolves.

### Effort

**L (≈2–3 wk).** Editor + gate are the work; commerce reuses everything.

---

## 15. Feature 13 — Home dashboard & sidebar customization

### Concept

Two layout controls, one philosophy — *your daily surfaces, your order*:

1. **Home widgets:** the home right rail (desktop) / pre-feed stack
   (mobile) becomes a user-ordered widget list: Today's Arcade,
   Streak/wheel, Continue watching (§5), Friends (§9), Ladder digest,
   Live now, Community events, Wallet snapshot. Defaults reproduce
   today's layout.
2. **Sidebar pinning:** pin/hide/reorder apps within the sidebar's
   groups; hidden items live under "More". Applies identically to the
   mobile drawer.

### Data model

```prisma
model LayoutPreference {
  userId    String   @id
  sidebar   Json     @default("{}") // { pinned: string[], hidden: string[] }
  homeStack Json     @default("[]") // ordered widget kinds; [] = default stack
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("layout_preference")
}
```

Separate from `AppearancePreference` deliberately (looks vs where;
different churn). `lib/home-widgets.ts`: widget catalog (kind, label,
data loader key, default order) + `parseLayoutPref()` dropping unknown
ids at read (forward-safe). This row also carries §17's two scalar prefs
(`feedDefaultTab`, `blurSensitive`) — one preferences row, three
consumers.

### Server & API

`/api/preferences/layout` — GET/PUT (partial-upsert per §2.3;
`prefix: 'layout'`, 30/min). Served with the shell: the `_site` loader
(or home loader) includes the parsed row so first paint respects it —
plus the localStorage mirror for flash-free rendering (appearance
pattern).

### Files

- **Create:** `lib/home-widgets.ts`;
  `app/routes/api/preferences/layout.ts`;
  `components/home/WidgetStack.tsx`, `WidgetEditSheet.tsx` (reusing the
  G3 `WidgetFrame` + G2 `SortableList`);
  `components/site/SidebarEditMode.tsx`.
- **Modify:** home route (render `WidgetStack` from the pref); the
  sidebar component rendered by `_site.tsx` (edit mode + pin/hide/
  reorder application over `lib/sidebar-data.ts`'s groups); mobile
  drawer (same data — no separate implementation); widgets themselves
  register in the catalog (Arcade/Streak/etc. wrap their existing
  components).
- **i18n:** `locales/en/c-layout.json`.

### UI (desktop)

Sidebar: pencil affordance at group headers → edit mode (pin toggles +
G2 reorder + eye-to-hide), exits on blur/Escape. Home: "Edit layout" in
the rail header → `WidgetEditSheet` (visible widgets with ▲/▼ + hidden
widgets to add).

### Mobile spec

- The mobile widget stack renders **above the feed** as compact,
  individually-collapsible cards (collapsed state = header row 48 px);
  collapsed/expanded state persists per widget in `homeStack` config.
- Default mobile stack is intentionally short (Arcade, Streak,
  Continue) — the full catalog is opt-in, so the feed stays above the
  fold; the edit sheet is the same G1 sheet.
- Sidebar customization applies to the drawer verbatim (one data
  source); the drawer's "More" section keeps hidden apps reachable
  (§2.6 — never strand a surface).
- All reordering via G2 buttons; widget collapse animations gated by
  `useReducedMotion`.

### Economy integration

None. Layout is comfort — never purchasable slots (§20.4).

### Acceptance criteria

- [ ] Unset row renders today's exact default rail/stack and sidebar.
- [ ] Pin/hide/reorder persists, mirrors flash-free on reload, and
      applies to desktop sidebar + mobile drawer identically.
- [ ] Unknown widget/app ids in stored JSON are dropped silently
      (simulate a removed app).
- [ ] Hidden apps remain reachable under "More" and via command
      palette/URL.
- [ ] Home widget data loads **only** for widgets in the user's stack
      (no hidden-widget queries — inspect loader).
- [ ] Mobile: feed's first post visible within one viewport with the
      default stack collapsed; edit flow completable with buttons only.

### Effort

**M (≈1 wk).**

---

## 16. Feature 14 — Notification center v2: channels, quiet hours, batching

### Concept

Rebuild notification *preferences* around the converged matrix:
**category × channel** (in-app / push / email), **quiet hours**
(start–end + timezone; push held and delivered as one morning summary),
and **batching** ("12 people liked your post"). Categories: `social`
(likes/reposts), `replies` (replies & mentions), `follows`, `economy`
(tips/awards/sales/wagers), `events` (RSVP'd events, spaces, wishlist
alerts), `system`.

### Why it fits

Six booleans predate the platform's volume; RMHLadder already proved the
full pattern in-house (`LadderUserPrefs`: quiet hours, channels, digest
scheduling). This promotes it platform-wide and gives §7/§8/§18 a
correct landing lane.

### Data model

```prisma
model NotificationPreference {
  userId      String  @id
  matrix      Json    @default("{}") // { [category]: { inapp, push, email } }; missing = category default
  quietStart  Int?    // minutes from midnight, user tz
  quietEnd    Int?
  tz          String? @db.VarChar(40) // IANA
  emailDigest Boolean @default(false) // unchanged

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("notification_preference")
}
```

**Migration maps old booleans:** `likes/reposts→social`,
`comments→replies`, `follows→follows`, `mentions→replies`,
`system→system+economy`; each `false` writes `{ inapp: false, push:
false }` for its category into `matrix`; then drop the boolean columns.
`Notification` gains `groupKey String? @db.VarChar(80)` +
`@@index([userId, groupKey])`. Category defaults + zod live in
`lib/notify/categories.ts` (client-safe; email defaults **off** except
`system`).

### The dispatch gateway

`lib/notify/dispatch.server.ts` — the single entry every notifier is
refactored onto:

```ts
export async function dispatch(userId: string, input: {
  category: NotifyCategory;
  type: NotificationType;          // existing enum
  payload: NotificationPayload;    // what createNotification takes today
  groupKey?: string;               // e.g. `like:rmhark:${postId}:${dayKey}`
  push?: { title: string; body: string };
  email?: { subject: string; render: () => Promise<string> };
}): Promise<void>
```

Behavior: resolve matrix (missing category → defaults) → in-app via
`createNotification` (with `groupKey`) → push via `sendPushToUser`
**unless** now ∈ quiet hours (then enqueue a pg-boss job with
`startAfter = quietEnd` under singleton key `quiet:{userId}:{dayKey}`
that sends one summary push: "You have N notifications") → email only
for email-enabled categories (Resend, reusing the module the weekly
digest uses). Best-effort like today: never throws into the caller.

**Refactor inventory:** `grep -rn "createNotification(" lib app/routes
server` — every call site moves to `dispatch` with an assigned category
(the PR description carries the checklist; RMHLadder's own dispatcher
stays separate by design).

Batching is delivery-time: the notifications list/badge queries collapse
rows on `(userId, groupKey)` — latest row wins, count aggregated;
rows without `groupKey` render as today. The Redis unread counter counts
**groups** (adjust `getUnreadNotificationCount`'s COUNT to
`COUNT(DISTINCT COALESCE(groupKey, id))`).

### Server & API / Files

- `/api/preferences/notifications` — GET/PUT (zod from
  `lib/notify/categories.ts`; quiet minutes 0–1439; tz validated against
  `Intl.supportedValuesOf('timeZone')`). `prefix: 'notif-prefs'`, 20/min.
- **Create:** `lib/notify/categories.ts`, `lib/notify/dispatch.server.ts`
  (+ tests for matrix resolution, quiet-window math incl. cross-midnight
  windows, group collapsing); `app/routes/api/preferences/notifications.ts`;
  `app/routes/_site/settings/notifications.tsx`;
  `components/notifications/GroupedNotificationRow.tsx`.
- **Modify:** every `createNotification` call site → `dispatch`;
  `Notification` schema; notifications page/API (grouped rendering,
  facepile via `resolveUser` batch); `NotificationPreference` migration.
- **i18n:** `locales/en/settings-notifications.json`.

### UI (desktop)

Settings → Notifications: one row per category × three switches, quiet
hours range + tz select (default from
`Intl.DateTimeFormat().resolvedOptions().timeZone`), digest toggle.
Notification list: grouped rows with facepiles ("A, B and 10 others
liked…"), expandable.

### Mobile spec

- The matrix is **not a table** on mobile: per-category accordion —
  header (category name + summary line "In-app · Push") expanding to
  three full-width switch rows (48 px).
- Quiet hours use native `<input type="time">` (16 px, correct mobile
  pickers); tz is the `select` primitive.
- Grouped rows: facepile capped at 3 avatars; expansion is tap (44 px
  row), not hover.
- Summary push deep-links to `/notifications`.

### Acceptance criteria

- [ ] Migration: a user with `likes=false` ends with
      `social.{inapp,push}=false` and unchanged behavior for the rest;
      boolean columns dropped.
- [ ] Matrix off-switch suppresses exactly that channel×category
      (integration test through `dispatch` per category).
- [ ] Quiet hours: push during window → no immediate push, one summary
      at `quietEnd` (incl. a 22:00–07:00 cross-midnight case);
      in-app rows unaffected.
- [ ] 12 likes on one post in a day → one grouped row, count 12, badge
      increments once per group.
- [ ] Zero call sites still import `createNotification` outside
      `dispatch.server.ts` (grep gate in the PR).
- [ ] Mobile: accordion fully operable; time inputs open native pickers.

### Effort

**M–L (≈2 wk)**, dominated by call-site migration. **Lands before §7/§8
alert features go loud** (wave ordering, §19).

---

## 17. Feature 15 — Feed controls: algorithm transparency & tuning

### Concept

The converged reader-control set: **sticky default tab** (choose
Following/chronological as your default — never silently reset),
**"Show fewer like this"** (per-author demotion with visible effect),
**topic tuning** (follow/mute hashtags), and **sensitive/spoiler
labeling** (author marks; readers choose blur defaults; courtesy
labeling, distinct from moderation).

### Data model

```prisma
model FeedSignal {
  userId    String
  kind      String   @db.VarChar(16) // 'less_author' | 'mute_tag' | 'follow_tag'
  targetId  String   @db.VarChar(64) // authorId | tag (lowercase, no '#')
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, kind, targetId])
  @@map("feed_signal")
}
```

`RMHark` gains `sensitive Boolean @default(false)` +
`spoilerOf String? @db.VarChar(80)`. Reader scalars (`feedDefaultTab`,
`blurSensitive Boolean @default(true)`) live on §15's
`LayoutPreference` row (one prefs row, shared mirror). `less_author`
decay: rows >90 d old ignored by ranking and swept.

### Server & API

- `/api/feed/signal` — POST/DELETE `{ kind, targetId }` (idempotent
  upsert/delete; `prefix: 'feed-signal'`, 60/min).
- `lib/feed/timeline.ts`: ranked feed applies `less_author` as a
  demotion multiplier and `mute_tag` as a filter (join on
  `PostHashtag`); the **Following tab applies filters only** — its
  chronology is the contract. Signals load with the muted-words list
  (same cached read, same invalidation hook).
- Composer accepts `sensitive`/`spoilerOf` (zod); embed + OG renderers
  serve the blurred variant for sensitive media (same guard chain as
  audiences).
- Settings surface lists every stored signal with remove — all signals
  inspectable and reversible (the transparency half).

### Files

- **Create:** `app/routes/api/feed/signal.ts`;
  `components/feed/SensitiveOverlay.tsx`;
  `app/routes/_site/settings/content.tsx` (muted words move here too —
  redirect from their current spot, one content-controls home).
- **Modify:** `lib/feed/timeline.ts`; post overflow menu ("Show fewer
  from @x", "Mute #tag" — with undo toast); composer (spoiler toggle +
  optional label field); `PostCard` media (blur + reveal); feed tab
  state (`feedStore` reads `feedDefaultTab`); embed/OG guards;
  `/api/account/export` (signals).
- **i18n:** `locales/en/c-feed-controls.json`.

### UI (desktop)

Overflow actions with immediate visible effect (demoted post collapses
with "Fewer like this — undo"). Blur: media blurred with label chip
("Spoiler: Altair S2 finals"), click reveals per-post; per-account
default in Settings → Content.

### Mobile spec

- All controls live in the existing post overflow sheet (no new gesture
  surface); undo via toast action.
- Blur reveal target is the **full media area**, not a small button;
  reveal state persists for the session per post.
- Settings → Content lists are simple stacked rows (search over them
  when >25 entries); chips row for muted tags scrolls horizontally.
- Sticky-tab choice = radio rows in Settings → Content **and**
  long-form: the tab row itself never needs precision input.

### Acceptance criteria

- [ ] Chosen default tab is active on every fresh load/session until
      changed (no silent reset — regression test on the store init).
- [ ] `less_author` demotes in ranked feed, never filters Following;
      `mute_tag` filters both; both listed and removable in settings.
- [ ] Sensitive media blurred in feed, embeds, and OG image; reveal
      works; `blurSensitive=false` accounts see media directly with the
      label chip only.
- [ ] Signals expire from ranking at 90 d (unit test the cutoff) and
      appear in the export.
- [ ] Demotion ships behind a per-user flag; session-depth telemetry
      comparison exists before default-on (KPI §21).
- [ ] Mobile: reveal by tapping media; overflow sheet actions 48 px.

### Effort

**M (≈1–1.5 wk).**

---

# Pillar D — Cross-cutting

## 18. Feature 16 — Universal search v2: filters, recents & saved searches

### Concept

`/search` becomes the junction: **type tabs** (All / People / Posts /
Games / Builds / Music / Videos / Library / News / Market), **operators**
(`from:@user`, `in:community`, `has:media`, `before:`/`after:`),
**recent searches** (local, clearable), and **saved searches** with
optional weekly new-result alerts — `LadderSavedSearch` promoted
site-wide.

### Data model

```prisma
model SavedSearch {
  id        String    @id @default(cuid())
  userId    String
  query     String    @db.VarChar(200) // raw query incl. operators
  types     Json      @default("[]")   // entity-type chips
  alerts    Boolean   @default(false)
  lastRunAt DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("saved_search")
}
```

Recents: client-side localStorage via `command-palette-bus` (shared with
the palette; private by construction; "clear" wipes the key).

### Server & API

- `lib/search/parse.ts` (client-safe, unit-tested): tokenizer → `{ text,
  operators }`; unknown operators degrade to plain text (never error);
  grammar documented in the file header and mirrored in the UI
  cheatsheet. Operators map to **indexed columns that exist** (author,
  community, media join, `createdAt`); combined operator count capped
  at 4 (400 beyond).
- `/api/search` (existing route, extended) — `?q=&types=&cursor=`;
  every entity's results come from that entity's **existing list-query
  helper** (visibility/audience/block rules for free); Postgres
  FTS/`pg_trgm` per the scalability audit — **no new search infra**.
  `prefix: 'search'`, 30/min.
- `/api/search/saved` — GET/POST; `/api/search/saved/$id` —
  PATCH (alerts toggle) / DELETE. Cap 25 saved searches.
- Alerts: weekly pg-boss job per alert-enabled row → run query bounded
  `createdAt > lastRunAt` → if hits, one bundled notification through
  §16's gateway (`events` category, deep link to the search) → update
  `lastRunAt`.

### Files

- **Create:** `lib/search/parse.ts` (+ `parse.test.ts`),
  `lib/search/alerts.server.ts` (job);
  `app/routes/api/search/saved.ts`, `…/saved.$id.ts`;
  `components/search/SearchTabs.tsx`, `FilterChips.tsx`,
  `OperatorCheatsheet.tsx`, `SavedSearchRail.tsx`, `RecentSearches.tsx`.
- **Modify:** `/api/search` + `/_site/search.tsx` (tabs, chips, rails);
  `/api/account/export` (saved searches).
- **i18n:** `locales/en/search.json`.

### UI (desktop)

Search input (sticky), tab row, filter chips, results per active tab
(each type's existing card), saved-search rail left (star-to-save with
alert bell toggle), recents beneath the input when empty, cheatsheet in
the empty state.

### Mobile spec

- Input sticky top (16 px font — audit F2); tab row `overflow-x-auto
  snap-x` with fade edges; **filters open in a G1 bottom sheet** (chips
  don't stack on 375 px).
- Saved-search rail becomes a horizontal strip under the input; recents
  as tappable rows (48 px) with per-row ✕.
- Cheatsheet is a collapsible section, collapsed by default on mobile.
- Keyboard "search" action submits; results maintain scroll position on
  back-navigation (existing `useScrollRestoration`).

### Economy integration

Market tab + saved searches = power-user demand tool ("`frame` under 500
coins" alert) — intentionally overlapping §8; wishlist is the one-tap
version.

### Acceptance criteria

- [ ] `parse.test.ts` covers each operator, quoted text, unknown
      operators (degrade), and the 4-operator cap.
- [ ] `from:`/`in:`/`has:media`/`before:`/`after:` filter correctly on
      Posts; types param scopes tabs; every result respects source
      visibility (spot predicate tests for audience'd posts and private
      builds).
- [ ] Saved search round-trips exactly (raw query + chips); cap 25.
- [ ] Weekly alert fires only on new-since-`lastRunAt` results, once,
      through the gateway.
- [ ] Recents are local-only (no network writes), clearable.
- [ ] p95 search latency within budget on seeded data (`EXPLAIN` the
      4-operator worst case; no seq scans on large tables).
- [ ] Mobile: no horizontal page scroll; filter sheet + keyboard usable.

### Effort

**M–L (≈2 wk).**

---

## 19. Prioritization

Sequenced for dependency and compounding value (~a person-month per wave
at the stated efforts):

| Wave  | Features                                                                                       | Rationale                                                                                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | **G1 + G2 + G3 groundwork** (§2.4/§2.4a) · §13 Appearance suite · §4 Unified Saves · §5 History · §10 Status | Daily-comfort wins, no economy risk; G1 (glass sheet), G2 (sortable), G3 (`WidgetFrame`) unblock every later sheet/reorder/module. Appearance first — the schema already promised it. |
| **2** | §16 Notifications v2 · §3 Lists · §11 Close Friends · §15 Layout customization                  | The "respects you" wave. §16 lands **before** wave 3 so alert-emitting features launch on the matrix. §11 rides §3's predicate-test matrix.                          |
| **3** | §9 Presence + Friends rail · §7 Post awards · §8 Wishlists · §18 Search v2                      | Social liveness + the two demand-side economy features; search once lists/guides/themes exist to find. §10's auto now-playing activates fully here.                 |
| **4** | §6 Game hubs · §14 Theme Studio · §12 Profile v2                                                | The three L-sized creator/curation flagships — each depends on earlier waves (tip lanes, saves, `WidgetFrame`, G2) and each opens a UGC category.                   |

Severable pressure valves: §10, §11, §15 can slip without weakening their
waves. Within every feature, follow the §2.10 recipe; one feature = one
PR.

---

## 20. Cross-cutting constraints (binding for every feature)

1. **Conventions are law** — §2 in full: API order, `--site-*` tokens,
   **Liquid Glass tier on every surface (§2.4a)**, `PageLayout`, i18n +
   extract, `head()` SEO, a11y, `useReducedMotion`, §2.6 mobile baseline,
   §2.9 checks. A feature isn't done until its Acceptance criteria pass on
   desktop + both mobile viewports + the three named themes + the
   reduce-transparency degraded state.
2. **Visibility guards are shared, never re-implemented.** Lists, saves,
   history, search, profile modules, and embeds all read content through
   the same audience/block/mute helpers; every new read surface runs the
   §2.9 predicate matrix (now including `CIRCLE`).
3. **One ledger.** Awards, theme sales, and guide tips are existing
   `CoinTxnType` rows; `earnings.server.ts` and the admin audit trail
   stay truthful with zero changes. No new enum values are proposed —
   treat wanting one as a design smell.
4. **Comfort is never paywalled.** Appearance/accessibility knobs, layout
   control, and notification control are free, forever. Cosmetics
   (themes, skins, frames) are the monetizable layer.
5. **Privacy defaults conservative.** Presence: mutuals; list membership:
   silent but auditable ("remove me"); history: pausable/clearable;
   circle: invisible; wishlist: the one public-by-default (it exists to
   be seen), flagged. Every new personal-data table joins
   `/api/account/export` in its own PR (§2.8).
6. **Preference JSON is validated and forward-safe.** Every Json column
   (layout, matrix, modules, tokens, homeStack) is zod-validated against
   a code catalog, `.strict()` where closed, unknown keys dropped at
   read, versioned where migration is plausible (theme tokens `v: 1`).
7. **No new infrastructure.** Postgres/Prisma, pg-boss, the Node socket
   hub, Resend, Web Push — as deployed today. Search stays on Postgres
   per the scalability audit.
8. **New write paths are budgeted.** The history heartbeat (§5) and
   presence fan-out (§9) are the only new sustained loads — both bounded
   (15 s throttle; mutual-scoped emits) and measured before default-on.

---

## 21. KPI appendix

| Feature              | Primary KPI                                                 | Guardrail                                          |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Appearance suite     | % of WAU with ≥1 non-default comfort setting                | No CLS/Lighthouse regression on themed pages       |
| Saves                | D7 return rate of savers vs non-savers                      | Save-to-revisit ratio                              |
| History & resume     | Resume-tap rate on continue shelves                         | Heartbeat write p95                                |
| Lists                | % of feed sessions on a list tab                            | Report rate on list names                          |
| Game hubs            | Guides published / games covered; review coverage           | Review report rate; play-gate rejection rate       |
| Awards               | Coin burn/week via awards; awarded-post share rate          | Award-driven complaint rate                        |
| Wishlists            | Wishlist→purchase/gift conversion                           | Alert opt-out rate                                 |
| Presence rail        | Join/watch actions per rail impression                      | Presence-visibility downgrades                     |
| Status               | % of WAU with a status set                                  | Status report rate                                 |
| Close Friends        | Circle posts per posting user; circle sizes                 | —                                                  |
| Profile v2           | % of profiles edited; profile dwell time                    | Profile SSR p95                                    |
| Theme Studio         | Published themes; theme sales/week                          | Contrast-gate failure rate (editor UX signal)      |
| Layout customization | % of WAU with custom layout, retained 30 d                  | "Lost app" support signals                         |
| Notifications v2     | Push opt-out rate (should **fall**); quiet-hours adoption   | Notification CTR under batching                    |
| Feed controls        | Sticky-Following adoption; signals per user                 | Session depth on demotion cohort                   |
| Search v2            | Result-click (success) rate; saved-search alert CTR         | Search p95 latency                                 |

---

*Prepared 2026-07-20 (rev 2). Gap claims and named modules verified
against `prisma/schema.prisma`, `app/routes/`, `lib/`, `components/`,
`stores/`, and `hooks/` on this date. If anything above appears to exist
when you read this, trust the code and treat that part as done (docs
trust order).*
