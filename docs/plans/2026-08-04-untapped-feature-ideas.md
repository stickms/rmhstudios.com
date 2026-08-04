# Untapped Feature Ideas — 2026-08-04 (round two)

**Document type:** Feature generation, second pass
**Prepared:** 2026-08-04, after `591279e5`
**Companion to:** [`2026-08-04-competitive-feature-gaps.md`](./2026-08-04-competitive-feature-gaps.md)
**Method:** Same as the companion — every absence asserted here was grepped for against the tree
before it was written down, and line/model anchors are given so claims can be re-checked rather
than re-derived.

> **What this document is for.** Six prior plan docs plus the companion have specced roughly 78
> features. This one goes looking in the places all seven have a blind spot for. Three stand out:
>
> 1. **The app tier is unspecced.** Every doc so far treats "apps" as RMHTube, RMHMusic and
>    RMHStudy. `lib/apps.ts` lists **twelve**, and RMHType, RMHLadder, RMHHomes, RMHCode,
>    RMHCalculator and the rideshare surface have never appeared in a plan document — despite
>    RMHLadder alone owning **26 Prisma models** — more than the social feed's 15, and the
>    largest subsystem in the schema.
> 2. **The messenger stopped in about 2015.** DMs cannot be edited, unsent, or deleted, and
>    that is table stakes in every messenger a user has on their phone.
> 3. **There is no undo anywhere.** Deleted posts are soft-deleted and retained — and no code
>    path anywhere gives them back.
>
> Nothing here duplicates the 07-15, 07-19, 07-20, 07-31, 08-03 or companion documents. Where a
> feature touches one of theirs, the overlap is named.

---

## Priority summary

Effort: **S** ≤ 2 days · **M** ≤ 2 weeks · **L** > 2 weeks.

| #      | Feature                                              | Compared against           | Sev      | Effort |
| ------ | ---------------------------------------------------- | -------------------------- | -------- | ------ |
| **I1** | **Recycle bin — restore deleted posts and comments** | Gmail, Drive, Discord      | **High** | **S**  |
| **H1** | **Edit, unsend and delete for direct messages**      | every modern messenger     | **High** | **M**  |
| **L1** | AI alt-text suggestions at upload                    | Facebook, LinkedIn         | High     | S      |
| **J1** | Domain-verified profile links (`rel=me`)             | Bluesky, Mastodon          | High     | S      |
| **G1** | RMHType: per-key analytics, custom tests, replays    | Monkeytype                 | High     | M      |
| **I2** | Bulk content management                              | Twitter/X, Bluesky, Redact | Med      | S      |
| **G2** | RMHLadder: autofill + interview prep                 | Simplify, Teal, Huntr      | Med      | L      |
| **H3** | Custom emoji and stickers                            | Discord, Slack             | Med      | M      |
| **K1** | Speedrun categories with replay-verified runs        | speedrun.com               | Med      | M      |
| **G3** | RMHHomes: commute-time and affordability filters     | Zillow, Redfin             | Med      | M      |
| **H2** | Voice messages                                       | WhatsApp, Discord          | Med      | M      |
| **I3** | Account recovery beyond a single email               | Apple, Google, Discord     | Med      | M      |
| **J2** | Impersonation reporting + handle-change history      | X, Instagram               | Low      | S      |

---

# Pillar I — The safety net that isn't there

## I1 — A recycle bin: restore deleted posts and comments — **S, do this first**

### Why this is first

It is the cheapest feature in either document and the only one where **the data is already
being kept and thrown away by policy rather than by design**.

`RMHark` and `RMHarkComment` are the only two models in a 250-model schema with a `deletedAt`
column (verified by scanning every model). Deletion sets it; the timeline filters on
`deletedAt: null`. So the post is still in the database, fully intact, with its media, its
reactions and its thread — and there is **no code path anywhere that can give it back**. Grepping
the API surface for restore/undelete/recycle/trash returns nothing but unrelated matches.

That is the worst of both worlds: the storage cost of retention with none of the benefit, and a
user who mis-taps Delete on a thread they spent an hour writing has lost it while it sits on disk.

### Competitor anchor

Gmail (30 days), Google Drive (30), Discord (message delete is instant but the client confirms),
Notion (30), Slack. The pattern is universal enough that its absence reads as a bug.

### Design

**No schema change for posts and comments.** The column exists; this is a query, a route and a
page.

```ts
// lib/trash/trash.server.ts
export const TRASH_WINDOW_DAYS = 30;

export async function listTrash(userId: string, cursor?: string): Promise<TrashPage>;
/** Clears deletedAt after re-checking every constraint that applied at create time. */
export async function restore(userId: string, kind: 'post' | 'comment', id: string): Promise<void>;
/** Hard-delete now, on request — the escape hatch for "I meant that". */
export async function purge(userId: string, kind: 'post' | 'comment', id: string): Promise<void>;
```

**Restore is not simply `deletedAt = null`.** The checks that make this a real feature rather
than a footgun:

- **The parent may be gone.** A comment whose post was hard-deleted, or a quote-repost whose
  original is deleted, restores to a broken object. Restore must verify the parent chain and
  refuse with a specific reason ("the post this replied to no longer exists").
- **Counters were decremented on delete.** `likeCount`, `replyCount`, the hashtag counts in
  `PostHashtag` and the hot counters in `lib/hot-counters.server.ts` all moved. Restore has to
  re-increment through the same paths, inside a transaction, or the numbers drift.
- **Moderation must not be reversible by the author.** A post removed by a moderator or by
  `lib/moderation/auto-moderate.server.ts` must be non-restorable. Since `deletedAt` alone cannot
  distinguish "I deleted this" from "you were removed", this needs **one small schema change
  after all**: a `deletedBy` discriminator.

```prisma
model RMHark {
  // … existing …
  deletedAt DateTime?
  /** 'author' | 'moderator' | 'system'. Only 'author' is restorable. */
  deletedBy String?   @db.VarChar(12)
}
```

- **The 30-day sweep must actually run.** Today nothing purges soft-deleted rows at all, so the
  table grows forever. A pg-boss job in `lib/jobs/` hard-deletes past the window and, crucially,
  releases the attached `Media` rows so storage is reclaimed — which makes this feature a **net
  storage win** rather than a cost.

### Server & API

```
GET    /api/trash            → paginated, auth required          (rateLimit: 'read')
POST   /api/trash/restore    → { kind, id }                      (rateLimit: 'write')
DELETE /api/trash/$kind/$id  → purge now                         (rateLimit: 'write')
```

All via `defineHandler` per CLAUDE.md §3. Ownership is checked server-side on every call — the id
is attacker-supplied and a restore of someone else's deleted post is the obvious attack.

### UI

- **`/settings/content` gains a Trash section** (that namespace, `settings-content`, was one of
  the 18 registered in the companion's §0(a), so its strings translate normally now).
- Each row: excerpt, deleted-at, days remaining, Restore, Delete forever.
- **An undo toast at the moment of deletion** — sonner, 10 seconds, "Deleted · Undo". This is
  where most of the value lands; the trash page catches the rest. Respect `useReducedMotion`.

### Acceptance criteria

- Restoring a post returns it to the author's timeline, to followers' timelines, and to its
  hashtags, with counts matching pre-delete values exactly (property test).
- A moderator-removed post is never restorable and the API refuses it with a typed error.
- A comment whose parent is hard-gone refuses with a specific reason, not a generic 400.
- The sweep job hard-deletes past 30 days and releases the media rows; a test asserts no
  orphaned `Media` remains.

### Risks

Restoring content someone reported in the interim. Mitigate by re-running the auto-moderation
check on restore rather than trusting the original verdict.

---

## I2 — Bulk content management — **S**

### The gap

Every content action is one-at-a-time. There is no way to delete a run of old posts, unfollow a
list of accounts, clear watch history in bulk, or empty bookmarks. A user with 4,000 posts who
wants a clean slate has 4,000 taps, which in practice means they abandon the account instead —
the thing an account-recovery feature exists to prevent.

### Competitor anchor

X's bulk-delete third-party ecosystem exists precisely because the platform never shipped it.
Bluesky, Reddit (via tooling) and the Redact/Cyd class of apps are the comparison. Shipping it
first-party is also a **privacy posture**: the alternative is users handing their credentials to
a third party to do it.

### Design

A single job-backed bulk operation model, because a 4,000-row delete must not run in a request:

```prisma
model BulkOperation {
  id         String   @id @default(cuid())
  userId     String
  kind       String   @db.VarChar(24) // 'delete-posts'|'unfollow'|'clear-history'|'clear-bookmarks'
  filter     Json     // { before?, olderThanDays?, minLikes?, onlyReplies?, tag? }
  status     String   @default("PENDING") @db.VarChar(12)
  total      Int      @default(0)
  processed  Int      @default(0)
  createdAt  DateTime @default(now())
  finishedAt DateTime?
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt(sort: Desc)])
  @@map("bulk_operation")
}
```

- **Preview before commit.** The UI shows an exact count and a sample of ten matches before the
  operation is confirmable. A bulk delete with a surprising blast radius is the failure mode.
- **Deletes go through I1's soft delete**, so bulk delete is undoable for 30 days. The two
  features are worth far more together than apart, which is why I2 follows I1 immediately.
- **Rate-limited and one-at-a-time per user**, processed in chunks by a pg-boss worker with
  progress written back to `processed`.
- Filters worth having on day one: older than N days, before a date, fewer than N likes,
  replies only, by hashtag.

### Acceptance criteria

- Preview count matches the number actually processed.
- A bulk delete of 5,000 posts does not hold a request open or exceed the memory budget.
- Cancelling mid-run stops cleanly and leaves already-processed rows in their new state.
- Bulk-deleted posts appear in Trash and restore individually.

---

## I3 — Account recovery beyond a single email — **M**

### The gap

Auth is Better Auth with Discord/Google/GitHub, email+password, and passkeys
(`lib/auth.ts`), plus active-session management. Recovery, though, is a single email address. If
that address is gone — a university account that expired, a provider that closed the account —
there is no path back to an account holding coins, a membership, purchase history and a
storefront. There is no recovery-code flow (the companion's §1 notes TOTP + recovery codes is
still open from 08-03 §D1), no trusted contacts, and no support-assisted recovery record.

### Design

Three independent paths, cheapest first:

1. **Recovery codes** — ten single-use codes, shown once, hashed at rest (Argon2 via the existing
   password hasher). This is the 80% fix and it lands with 08-03 §D1's TOTP work; do them together.
2. **A second verified email or phone**, purely for recovery, never for notification.
3. **Trusted contacts** (Facebook's design, and the most interesting): nominate 3 accounts; a
   recovery request notifies them; 2 of 3 approvals within 72 hours grants a time-boxed reset
   link. Requires a mandatory delay and a notification to every existing session and to the
   primary email, or it becomes a social-engineering vector rather than a recovery path.

```prisma
model RecoveryCode {
  id        String    @id @default(cuid())
  userId    String
  codeHash  String
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@map("recovery_code")
}

model TrustedContact {
  id         String   @id @default(cuid())
  userId     String
  contactId  String
  confirmedAt DateTime?
  createdAt  DateTime @default(now())
  @@unique([userId, contactId])
  @@map("trusted_contact")
}

model RecoveryRequest {
  id         String   @id @default(cuid())
  userId     String
  status     String   @default("PENDING") @db.VarChar(12)
  approvals  Int      @default(0)
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  @@index([userId, createdAt(sort: Desc)])
  @@map("recovery_request")
}
```

**Security constraints that are not optional:** every recovery action writes to `AdminAuditLog`;
a successful recovery invalidates every existing session and every API key
(`DeveloperApiKey`); a 72-hour hold applies before a recovered account can move coins, change
payout details or file a `RedemptionRequest` — otherwise account recovery becomes the cheapest
route to the economy.

---

# Pillar H — The messenger stopped in 2015

## H1 — Edit, unsend and delete for direct messages — **M, and overdue**

### The gap, stated exactly

`DirectMessage` (`prisma/schema.prisma`) is:

```
id · conversationId · senderId · content · gifUrl · imageUrls · read · createdAt
```

There is **no `editedAt`, no `deletedAt`, and no `updatedAt`**. So a direct message on this
platform is permanent and unalterable from the moment Send is pressed. A typo is forever. A
message sent to the wrong conversation is forever. An address, a phone number or a password
pasted into the wrong window is forever, and the only remedy is to delete the whole account.

`GroupMessage` is the same shape and has the same problem.

### Competitor anchor

Unsend/delete-for-everyone: WhatsApp, Signal, Messenger, Telegram, Discord, Instagram, iMessage.
Edit: Telegram, Discord, Slack, iMessage, WhatsApp. There is no comparable product without this.
It is also a **privacy expectation**, not a convenience: "I sent that to the wrong person" is the
single most common reason anyone reaches for it.

### Design

```prisma
model DirectMessage {
  // … existing …
  editedAt  DateTime?
  deletedAt DateTime?
  /** 'sender' — the only value today; reserved so moderation can differ later. */
  deletedBy String?   @db.VarChar(12)
}
```

- **Edit** within 15 minutes of sending, sender only. Renders with an "edited" marker, exactly as
  `RMHarkEdit` already does for posts — **and the precedent matters**: posts keep an edit history
  (`RMHarkEdit`), so DMs should not silently rewrite. Keep the prior text server-side for the
  moderation window, exposed to neither party, purged with the message.
- **Unsend (delete for everyone)** at any time, sender only. Tombstones rather than removing the
  row: the recipient sees "This message was deleted", which is what stops unsend being a tool for
  gaslighting — the conversation still shows that something was there.
- **Delete for me** hides it for one side only, which needs a per-user hide rather than a column
  on the shared row:

```prisma
model DirectMessageHide {
  messageId String
  userId    String
  createdAt DateTime @default(now())
  @@id([messageId, userId])
  @@map("direct_message_hide")
}
```

- **Realtime.** Both actions must reach the other client immediately or the feature is a lie —
  the recipient keeps reading a message the sender has retracted. Emit over the existing
  socket path (`lib/message-events.ts`, `lib/messages.server.ts`) alongside the send event, and
  make the client handle `message:edited` / `message:deleted` on a conversation it may not have
  open (update the conversation-list preview too, which is the bit that is easy to miss).
- **Reports survive deletion.** A `ContentReport` against a message must keep the content
  available to moderators after an unsend, or unsend becomes the way to erase evidence.

### Acceptance criteria

- An unsend reaches an open recipient client in under a second and updates the conversation-list
  preview as well as the thread.
- A reported message stays visible to moderators after unsend.
- Edit is refused after 15 minutes and refused for non-senders, server-side.
- Deleting for me leaves the other side untouched.
- Group messages behave identically.

### Effort

**M.** The schema is small; the realtime and conversation-list propagation is where the work is.

---

## H2 — Voice messages — **M**

### The gap

DMs carry text, one GIF and up to four images. No audio, and no file attachments of any kind.

### Design

- Record with `MediaRecorder` (Opus in WebM; AAC fallback for Safari), 5-minute cap, waveform
  drawn from the analyser during capture.
- Upload through the existing `Media` model and quota path, so SSRF guards, quota and the
  media-classification work (08-03 §D4) all apply without new plumbing.
- `DirectMessage` gains `audioUrl` + `audioDurationMs` + `audioPeaks Float[]` (a downsampled
  waveform, so the bubble renders without fetching the audio).
- **Accessibility is the interesting part, and the reason to do it properly.** A voice message
  is unreadable to a deaf recipient and un-skimmable to everyone. The site already has a DeepSeek
  integration (`lib/ai/text.server.ts`); transcription is a different model class, so either
  budget for one or **ship a mandatory "add a text note" field for the sender**. Do not ship
  voice-only with no path to text.
- Playback: variable speed, resume position, and never autoplay.

---

## H3 — Custom emoji and stickers — **M**

### The gap

`lib/emoji/` is a static `shortcodes.json` with an inserter and a matcher — standard Unicode
emoji only. There is no custom emoji anywhere: not per-user, not per-community, not as a
membership perk. Reactions across the site (`RMHarkReaction`, `DirectMessageReaction`,
`GroupMessageReaction`, `DoctrineReaction`) are all Unicode.

### Competitor anchor

Discord and Slack, where custom emoji is the single strongest identity mechanic a community has —
an in-joke rendered 400 times a day. It is also, not incidentally, the thing people pay for:
Discord's Nitro sells custom emoji everywhere as its headline.

### Design

```prisma
model CustomEmoji {
  id          String   @id @default(cuid())
  /** Shortcode without colons; unique per scope. */
  name        String   @db.VarChar(32)
  scope       String   @db.VarChar(12) // 'community' | 'user'
  scopeId     String
  mediaId     String
  createdById String
  status      String   @default("PENDING") @db.VarChar(12) // moderation
  usageCount  Int      @default(0)
  createdAt   DateTime @default(now())
  @@unique([scope, scopeId, name])
  @@index([scope, scopeId])
  @@map("custom_emoji")
}
```

- **Moderation is the whole risk.** A custom emoji is a user-uploaded image rendered inline at
  small size in other people's conversations — the classic vector for slurs-as-images. This
  should not ship before 08-03 §D4 (upload-time media classification); until then, community
  emoji are owner-uploaded only and reportable, and there is no per-user emoji.
- **Rendering** extends the existing shortcode matcher, resolving `:name:` against the
  community-then-user scope. Size cap 128×128, animated allowed but **frozen under
  `useReducedMotion`** — an animated emoji is exactly the kind of continuous motion the design
  language already stands against.
- **Economy tie-in**: emoji slots per community scale with the community's tier, and a personal
  emoji slot is a natural membership perk — which connects it to `CreatorTier` without inventing
  a new payment surface.
- **Accessibility**: every custom emoji carries mandatory alt text, and the plain-text
  representation is always the `:shortcode:`, so a screen reader and a copy-paste both degrade to
  something meaningful.

---

# Pillar G — The app tier nobody has specced

## G1 — RMHType: per-key analytics, custom tests, replays — **M**

### The gap

`RmhTypeProfile` stores aggregates only: `bestWpm`, `avgWpm`, `bestAccuracy`, `avgAccuracy`,
`totalCharsTyped`, `totalTimeMs`, streaks — keyed by a three-value `difficulty`. Per-match rows
(`RmhTypeMatchPlayer`) hold the same shape at match granularity.

What is missing is everything that makes a typing site something you return to daily: **which
keys you are slow on**. There is no per-character timing anywhere, no custom text, no replay, no
language selection, no punctuation/numbers toggle.

### Competitor anchor

Monkeytype is the whole market here and it is free, open-source and extremely well known to
exactly the audience this site has. Its retention comes from: per-key heatmaps, per-finger
breakdowns, custom tests, quotes, code-typing modes, a huge language list, and replayable tests.
RMHType currently competes on multiplayer alone.

### Design

**Per-key analytics.** Capture per-keystroke timing client-side and submit an aggregate, not a
keylog — this distinction is the security review:

```prisma
model RmhTypeKeyStat {
  userId       String
  /** Single character, normalised. Never a sequence — a bigram log is a keylog. */
  key          String   @db.VarChar(4)
  layout       String   @db.VarChar(16) // qwerty | azerty | dvorak | colemak
  attempts     Int      @default(0)
  errors       Int      @default(0)
  totalMs      Int      @default(0)
  updatedAt    DateTime @updatedAt
  @@id([userId, key, layout])
  @@map("rmhtype_key_stat")
}
```

Aggregate only, per key, never ordered — so the table cannot reconstruct typed text. Say that in
the schema comment, because the next reader will (rightly) ask.

**UI:** a keyboard heatmap coloured by ms-per-key and error rate, using the **colour-vision-safe
palette that already ships** (`lib/appearance/prefs.ts`) — a red/green heatmap is the canonical
accessibility failure and the site already solved it. Plus a "practice your worst keys" mode that
generates a test weighted toward the slowest keys, which is the feature that turns analytics into
a reason to come back.

**Custom tests:** paste text, pick a length, choose punctuation/numbers, pick a language word
list (the site ships 16 locales' worth of vocabulary already), and a code mode. Custom tests are
excluded from global leaderboards and marked as such.

**Replays:** RMHType is the ideal replay candidate — a keystroke stream is tiny. Reuse
`GameReplay` (`game: 'rmhtype'`, `data: { seed, keystrokes }`), which brings the existing
`/replays/$id` route, the embed route and the companion's B1 clips for free.

**Wager relevance:** RMHType is the one `authoritative: true` entry in
`lib/wager/eligible-games.ts` — the only game whose staked result cannot be forged. Per-key
analytics and replays make that trust story concrete and are worth prioritising for that reason
alone.

---

## G2 — RMHLadder: application autofill and interview prep — **L**

### The gap

RMHLadder is the largest subsystem on the site by model count — **26 Prisma models**, against 15
for the whole `RMHark` social feed — covering
scraping (`LadderSource`, `LadderScrapeRun`, adapters for Ashby/Greenhouse/Lever/SmartRecruiters),
classification, matching (`LadderJobMatch`, `LadderRelevanceRule`), resumes with versions and
reviews, alerts, saved searches and a full application tracker (`LadderApplication` carries
status, resume version, cover letter, referral name, interview dates, follow-up dates, outcome).

**Discovery and tracking are done and done well. The middle is missing:** the actual applying.
A user finds a job here, tracks it here, and in between re-types their name, email, work history
and the same three essay answers into a Greenhouse form, by hand, for the fortieth time.

### Competitor anchor

Simplify, Teal and Huntr are entire companies built on this one step, and their whole product is
autofill plus tailoring. The scraping infrastructure that is hard for them is already built here.

### Design — three pieces, decreasing certainty

1. **Structured profile → application answer bank (M, do first).** `LadderJobProfile` exists;
   extend it into a canonical answer set: work authorisation, sponsorship, notice period,
   salary expectation, EEO answers, the five essay questions every ATS asks. Then generate a
   **per-application prefilled packet** the user copies field by field. Unglamorous, entirely
   within our own product, and removes most of the retyping.

2. **ATS deep links + field mapping (M).** The adapters already know which ATS a job came from
   (`LadderSource`). Greenhouse, Lever and Ashby have predictable field names, so a per-ATS
   mapping produces either a prefilled URL or a copy-paste block ordered to match the form.
   No extension, no automation, no ToS question.

3. **A browser extension for true autofill (L, and gated).** This is what Simplify actually is.
   It is a separate release train, a store review process, a new permission surface — and
   automating third-party form submission has ToS implications per ATS. **Recommendation: build
   1 and 2, and treat 3 as a separate product decision rather than a feature.** Most of the value
   is in 1.

**Interview prep (M), the other half.** `LadderApplication.interviewDates` exists and nothing
uses it beyond storage. Given a tracked application and a scraped job description, generate a
prep sheet: likely questions for the role, the user's own STAR stories from their answer bank
matched to the posting, company facts from the listing, and a countdown. `lib/ai/text.server.ts`
is already wired to DeepSeek and its prompts already treat user content as data — follow that
prompt-injection posture exactly, since a scraped job description is untrusted input.

**Guardrails:** never auto-submit anything; the user presses the final button on the employer's
site. Salary expectations and EEO answers are sensitive personal data — they belong in the
existing export/delete flows (`api/account/export.ts`, `delete.ts`) from day one.

---

## G3 — RMHHomes: commute time and affordability — **M**

### The gap

`HomeListing` has `lat`/`lng`, `priceCents`, `beds`, `baths`, `sqft`, `amenities`,
`petsAllowed`, `availableFrom`, plus favourites, watches and scraped sources. Filtering is
therefore by price and attributes — the 2005 feature set.

The two questions people actually rent and buy on are missing: **"how long is my commute?"** and
**"can I afford it?"**.

### Design

**Commute-time search.** The user saves named places ("work", "campus" — the rideshare module
already has a `RideSavedPlace` model to follow, and arguably to share). A pg-boss job computes an
isochrone-style travel-time estimate per listing per saved place and caches it:

```prisma
model HomeCommute {
  listingId String
  placeId   String
  mode      String @db.VarChar(8) // 'drive' | 'transit' | 'bike' | 'walk'
  minutes   Int
  computedAt DateTime @default(now())
  @@id([listingId, placeId, mode])
  @@index([placeId, mode, minutes])
  @@map("home_commute")
}
```

Precomputed, not per-request: the filter is then a plain indexed range query and the map stays
fast. `lib/maplibre.ts` already ships, so the rendering side exists. A routing provider is the
one external dependency — go through `lib/ssrf-guard.server` and cache aggressively, since
listing coordinates rarely move.

**Affordability.** Pure client-side arithmetic, no new data: income → the 30%-of-gross rule, or
for purchases a full payment breakdown (principal, interest, tax estimate, insurance) with a
down-payment and rate input. Then a **"show me what I can afford"** toggle that filters the map.
Keep the income figure in `localStorage` only and say so in the UI — it is the most sensitive
number a housing product can ask for and there is no reason to store it server-side.

**Also worth having, cheap:** price-history on a listing (the scrape runs already re-visit
listings, so recording `priceCents` changes over time is nearly free) and a "price dropped"
trigger on the existing `HomeWatch` model.

---

# Pillar J — Identity and trust

## J1 — Domain-verified profile links — **S**

### The gap

Profile links are a `{ label, url }` pair validated by `profileLinkSchema`
(`lib/profile-schema.ts:47`) and stored as a **JSON blob** on `UserProfile.links`
(`prisma/schema.prisma:1825`) — so they are shaped, but they are not rows and they carry no
state. Anyone can put `nytimes.com` on their profile and nothing distinguishes it from someone
who owns the domain. Grepping for `rel=me` or any link-verification concept returns nothing.

### Competitor anchor

Mastodon's `rel="me"` verification and Bluesky's domain handles are both **free, decentralised
and unforgeable**, and both are now the expected answer to "is this really them?" — as opposed to
a paid checkmark, which the industry spent 2023 proving means nothing.

### Design

The whole feature is a fetch and a string match:

1. User adds `https://example.com` to their profile and clicks Verify.
2. We fetch it **through `lib/ssrf-guard.server`** (mandatory — this is a user-supplied URL, the
   exact case CLAUDE.md §8 names) with a small byte cap and a short timeout.
3. We look for `<a rel="me" href="https://rmhstudios.com/u/<handle>">` or a `<link rel="me">`.
4. On match, store `verifiedAt` and render a check beside that link only — **never a badge on the
   account**. The claim is "this person controls this domain", not "this person is important".
5. Re-verify on a schedule; drop the mark silently when it stops matching.

```prisma
model ProfileLink {
  id         String    @id @default(cuid())
  userId     String
  url        String    @db.VarChar(300)
  label      String?   @db.VarChar(60)
  position   Int       @default(0)
  verifiedAt DateTime?
  lastCheckedAt DateTime?
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, position])
  @@map("profile_link")
}
```

That is a real migration, not a field addition: links live in a JSON column today, and
verification state needs a row it can be stamped on, indexed by and re-checked from. Promoting
them is worth doing regardless — a JSON blob cannot answer "which accounts claim this domain?",
which is the query an impersonation investigation (J2) actually runs.

**The reciprocal half:** emit `rel="me"` on outbound profile links so verification works in the
other direction and a Mastodon profile can verify against an RMH profile. That is what makes this
participate in an existing web of trust instead of being a private badge.

**Rate limits matter here** — verification is an outbound fetch triggered by user input, i.e. an
SSRF and an amplification vector at once. Cap per user per hour, and never follow redirects to
private ranges (the guard handles this; do not bypass it).

---

## J2 — Impersonation reporting and handle-change history — **S**

### The gap

`ContentReport` covers content. There is no report category for "this account is pretending to be
someone", which is a different investigation (compare two accounts, not judge one post) and needs
different evidence. Separately, `handle.server.ts` allows handle changes and **nothing records
them**, so an account can build trust as `@alice`, hand the handle over, and the history is gone.

### Design

- A `HandleChange` row per change (old, new, timestamp), with the last few surfaced on the profile
  under "previously known as" for 30 days after a change. Cheap, and it defeats the most common
  impersonation play.
- A dedicated impersonation report flow that captures the impersonated account, so the moderation
  queue gets a comparison view rather than a free-text note.
- A cooldown on handle changes (one per 30 days) and a block on immediately reclaiming a handle
  released in the last 30 days.

---

# Pillar K — Competitive play

## K1 — Speedrun categories with replay-verified runs — **M**

### The gap

`GameReplay` stores deterministic `{seed, inputs}` replays with a `version` for playback
compatibility, `durationMs`, and a per-game score index. Leaderboards
(`lib/leaderboard.server.ts`) rank by score, globally or among friends.

There is no notion of a **category** — "any%", "no-shards", "hardcore" — and no
verification workflow. Grepping for speedrun returns one unrelated comment.

### Why it fits here specifically

Deterministic replays are the hard part of a speedrun leaderboard and they already exist. Most
speedrun communities run on video review and trust; a platform that can **re-simulate the run
from its inputs** can verify automatically, which is a genuinely better product than
speedrun.com rather than a copy of it.

### Design

```prisma
model SpeedrunCategory {
  id        String  @id @default(cuid())
  game      String  @db.VarChar(32)
  slug      String  @db.VarChar(32)
  name      String  @db.VarChar(60)
  rules     String  @db.VarChar(2000)
  /** Ranked by time, or by score within a time cap. */
  metric    String  @db.VarChar(12) // 'time' | 'score'
  active    Boolean @default(true)
  @@unique([game, slug])
  @@map("speedrun_category")
}

model SpeedrunEntry {
  id         String   @id @default(cuid())
  categoryId String
  userId     String
  replayId   String   @unique
  timeMs     Int
  score      Int?
  /** pending → verified | rejected, by the re-simulation worker. */
  status     String   @default("pending") @db.VarChar(10)
  rejectReason String? @db.VarChar(200)
  verifiedAt DateTime?
  createdAt  DateTime @default(now())
  @@index([categoryId, status, timeMs])
  @@map("speedrun_entry")
}
```

**The verifier is the feature.** A worker replays the stored inputs through the game's headless
logic at its recorded `version` and checks that the final state matches the claimed result. Games
whose logic is already extracted and tested — Dream Rift, Kowloon Knockout, Laundry Sort and
CookGame all have deterministic test suites under `lib/` — can support this immediately; others
fall back to `pending` and a manual queue rather than pretending.

**Version drift is the honest hard part.** A game update invalidates old replays. Handle it the
way speedrun communities already do: leaderboards are **per game version**, with an
"all versions" view that labels each run's version rather than silently mixing them.

**Ties to existing systems:** categories give tournaments (`Tournament`) something to be a
tournament _of_; a verified world record is a `SharedMoment`; a run is clippable via the
companion's B1.

---

# Pillar L — AI the site already pays for

## L1 — AI alt-text suggestions at upload — **S, highest ratio in this document**

### The gap

`imageAlts` exists on posts and scheduled posts and is threaded through the feed types, so the
site **can** carry per-image alt text. It is entirely manual, which means in practice it is
mostly empty, which means the feed is substantially unreadable to screen-reader users despite the
plumbing being in place.

### Competitor anchor

Facebook has shipped automatic alt text since 2016; LinkedIn, Instagram and X all generate
suggestions. This is the single highest-leverage accessibility feature available to a site that
already has an image pipeline and an LLM budget.

### Design

- On upload, queue a suggestion job. When it returns, **prefill the alt field and mark it as a
  suggestion** — visibly, with a one-tap Accept and an always-editable box.
- **Never auto-apply silently.** A wrong alt text is worse than none, because it is confidently
  wrong to the one user who cannot check it. The human stays in the loop; the machine removes the
  blank-page problem.
- Vision is a different model class from `lib/ai/text.server.ts`'s DeepSeek text endpoint, so this
  needs either a vision-capable model or an image-captioning service, plus a budget decision —
  `ImageGenBudget` already exists as the precedent for metering this kind of spend, so follow it.
- Prompt for **description, not interpretation** ("a tabby cat asleep on a keyboard", not "a
  funny cat"), cap at ~125 characters, and return empty rather than guessing for images the model
  is unsure about.
- Extend to the OCR case: if an image is mostly text, transcribe it, which is the highest-value
  variant and the one screenshot-heavy feeds need most.

### Acceptance criteria

- Alt text is never written to a post without an explicit user action.
- Suggestion failure is silent and leaves a normal empty field.
- Suggestions are rate-limited and metered against a budget model.
- A suggested-then-accepted alt is indistinguishable in the data from a hand-written one (it is
  the user's text once they accept it).

---

# Sequencing

**The first week, in order:** I1 (recycle bin) → L1 (alt-text suggestions) → J1 (`rel=me`).
All three are S, none needs design review, and each closes a gap that reads as a missing basic
rather than a missing feature. I1 in particular is a query and a page over data already retained.

**Then the messenger:** H1 before H2 and H3. Edit/unsend is the one people notice is missing; the
other two are additive. H3 must wait for 08-03 §D4 (media classification) regardless.

**Then pick a lane:**

- **Apps** — G1 (RMHType) first: it is the smallest of the three, it has a clear competitor to
  measure against, and it strengthens the one authoritative wager game. G3 next. G2's parts 1–2
  are high value; part 3 is a separate product decision.
- **Trust** — I3 alongside 08-03 §D1 (TOTP), since recovery codes are the same work.
- **Games** — K1, once the companion's A1 metadata is in the UI, because a speedrun category is
  most discoverable from a game hub that already has facets.

**Cross-document note:** I2 (bulk management) should land immediately after I1, and both should
land before any push on growth, because "I can undo this" and "I can clean this up" are what make
an account feel safe to invest in.

---

# Checked and found present

- **Read state on DMs** — `DirectMessage.read`, so read receipts exist. Editing does not.
- **Message reactions** — `DirectMessageReaction`, `GroupMessageReaction`, `RMHarkReaction`.
- **Application tracking** — `LadderApplication` is thorough (status, resume version, cover
  letter, referral, interview dates, follow-ups, outcome). The gap is the applying, not the
  tracking.
- **Saved places** — `RideSavedPlace` exists in the rideshare module and is the model G3's
  commute feature should reuse rather than reinvent.
- **Creator analytics** — `components/creator-studio/AnalyticsDashboard.tsx` exists; not
  re-proposed here without a closer read of what it already covers.
- **Per-image alt text** — the field and its plumbing ship; only the suggestion is missing.
- **Edit history for posts** — `RMHarkEdit`. This is the precedent H1 follows for DMs.
- **Soft delete** — on `RMHark` and `RMHarkComment` only, and with no restore path, which is
  what I1 is.

---

# Explicitly not proposed

- **A native mobile app, ads, inbound ActivityPub, real-money buy-in** — the companion's and
  07-31's reasoning stands.
- **Full ATS auto-submission (G2 part 3) as a feature.** It is a browser extension: a separate
  release train, a store review, a new permission surface and a per-ATS ToS question. Named in
  G2 so the decision is explicit, not folded into a sprint.
- **Server-side storage of the income figure in G3.** The affordability calculator works entirely
  client-side and there is no product reason to hold the most sensitive number in housing.
- **Bigram or sequence timing in G1.** Per-key aggregates cannot reconstruct typed text; an
  ordered keystroke log can, and no typing statistic is worth shipping a keylogger for.
- **Auto-applied AI alt text.** See L1 — the failure mode lands entirely on the users the feature
  exists to serve.
- **A paid verification badge.** J1 verifies domain control, which is checkable and free. A badge
  that means "paid" is not an identity feature.
