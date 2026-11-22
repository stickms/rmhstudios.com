# RMH Vibes modernization — design

Date: 2026-11-17. Owner request: "fully update and modernize the vibe-making process" — live page generation, vibes in
the feed, Discord (RMH Bot + Embedded App SDK Activity with parity to RMHBox). Plan:
`docs/superpowers/plans/2026-11-17-rmh-vibes-modernization.md`.

## Why

Making a vibe today is a black box (thinking text and a file list, then the page appears at the very end), every edit
regenerates the whole project, anyone can overwrite anyone's page, and a finished vibe has nowhere to live except a
link: it is not in the feed and not in Discord.

## Where it starts (facts, 2026-11-17)

- Generation: `lib/rmhvibe/vibe.server.ts#generateVibeStream` streams Kimi/DeepSeek output in the
  `SLUG/TITLE/DESCRIPTION/DEPS` + `===FILES===` + `--- file: x ---` format, `vibe-bundle.server.ts#buildVibeHtml`
  bundles it with esbuild into one HTML document, stored on `VibePage.html` and an immutable `VibePageVersion`. A
  missing relative import fails the whole bundle.
- Viewer: `app/routes/v.$slug.tsx` renders `srcDoc` in `sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock"`
  (opaque origin). Customize
  =
  full regeneration with the whole conversation history. No owner: "anyone can customize — last write wins".
- Sandbox: no network except the site origin (`/api/vibe/ai`, `/api/vibe/pkg/*`) and esm.sh; storage is an in-memory
  shim.
- Feed: no vibe link. The closest precedent is the F14 runnable code embed (`RMHark.hasEmbed` + `PostCodeEmbed`,
  click-to-run `RunnableEmbed`).
- Discord: RMH Bot is a gateway bot in the `jobs` worker (`server/discord-bot/`), slash commands in `interactions.ts`.
  Activities live at `/discord` (picker `ACTIVITY_GAMES`: rmhbox, slice-it, lights-out) with one SDK handshake
  (`useDiscordSdk`); the socket hub soft-auths a Discord access token (`verifyDiscordActivityToken`) as a linked user or
  a `discordGuest`.

## Goals

1. **Live build** — the page renders while it is being written: each completed file is bundled into a preview, unwritten
   modules show as labelled placeholders, with a progress/code side panel.
2. **Edits that don't start over** — edits return only changed files and are merged onto the stored project; click an
   element to target an edit; runtime errors offer "Fix it"; model-declared tweak knobs (sliders/colours) change a page
   without regenerating.
3. **Ownership and remix** — a signed-in creator owns their vibe; anyone else's "customize" is a remix (a new page with
   a link back), never an overwrite.
4. **Shared state** — a small key-value store per vibe (`RMHVibe.store`) so vibes can hold counters, votes and
   leaderboards; a compact **widget** kind made for feed cards.
5. **Vibes in the feed** — attach a vibe to an RMHark; the feed shows a click-to-run card.
6. **RMH Bot `/vibe`** — build a vibe from Discord with live progress, then Open / Play in Discord / Customize buttons.
7. **Vibes Activity** — a fourth Activity in the `/discord` picker: everyone in the voice channel plays the same vibe;
   parity with RMHBox (layout/PIP handling, rich presence with party size, voice-channel scoping, connecting/error UI,
   host controls) plus Slice It's back-to-picker and linked/guest identity, and an invite button; multiplayer vibes via
   `RMHVibe.room`.

## Non-goals / anti-goals

- No change to the bundler's package registry or the hosted-package build.
- No AI-budget metering of generation in this round (the code never metered it; recorded as follow-up).
- No message-content thread conversations for the bot (needs a privileged intent); edits go through a button + modal.
- Anti-goal: a vibe auto-running in the feed. Steel R5/B3 (nothing moves at rest, one WebGL context on the site tier)
  means a vibe runs only after a click, like F14.
- Anti-goal: widening the vibe sandbox (no `allow-same-origin`, no cookies, no new network origins). Everything new
  reaches the page through a `postMessage` bridge to its host.

## Key decisions (owner delegated the how)

- **Host bridge.** A vibe never calls new APIs itself. The host (viewer, feed card, Activity) injects a small runtime
  (`window.RMHVibe`) before render and answers its `postMessage` requests: store ops, room ops, tweaks, element picking,
  error reports. The host already has the user's session (or Discord token), so no CORS, no cookies in the sandbox, and
  old pages gain the API without regeneration.
- **Preview by stubbing.** Completed files are bundled with an esbuild plugin that turns any missing/pending relative
  module into a placeholder component exporting the names its importers use.
- **Edit protocol.** Whole-file replacement of changed files plus `--- delete: path ---`, merged onto the version's
  stored `project` JSON. Falls back to full regeneration for legacy versions with no recoverable project.
- **Ownership.** `ownerId` nullable (legacy and signed-out pages are unowned); editing in place iff
  `userId === ownerId`; otherwise remix. Remixes record `parentPageId`/`parentVersionId`.
- **Feed attachment** follows the `has*` boolean + 1:1 table pattern (`RMHark.hasVibe` + `PostVibeEmbed`, pinned to a
  version).
- **Activity sandbox networking.** Inside Discord every request must go through the `discordsays.com` proxy; the
  Activity host rewrites the stored HTML's site origin to the proxy origin and `https://esm.sh` to `/.proxy/esm` (a
  Developer Portal URL mapping the owner adds). Vibes that depend on esm.sh fallback packages may not fully load in
  Discord — documented limitation.
- **Activity room** is a hand-wired socket-server handler keyed by the Activity `instanceId`, using the hub's existing
  Discord token soft-auth. Host
  =
  first member; host picks the vibe.
- **Bot ↔ Activity hand-off.** "Play in Discord" records `(channelId, slug)` and answers with `LAUNCH_ACTIVITY`; the
  Activity preselects the latest launch for its channel.

## Left to the builder

Visual layout details inside the full-screen app tier, exact copy (short, literal, through `t()`), throttle intervals
within the ranges the plan gives, and test file placement per repo conventions.
