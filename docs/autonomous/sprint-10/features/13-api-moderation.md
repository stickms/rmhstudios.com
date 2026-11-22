# 13 — Moderate a community through the developer API

Surface: `/api/v1/communities/{slug}/modqueue*`, `/api/v1/communities/{slug}/sanctions*`, scope `manage:moderation`, the
API docs and SDK. Wave 3. No new namespace: the one interface string (the explicit-scope line in the key pickers) goes
in the pickers' existing `f-devplatform` namespace.

## User story

As a moderator of a busy community, I want a bot I run to read my community's mod queue, approve or remove held posts
with a rule cited, and time out or ban a member under the community's rules, through the API, so that our moderation
tooling works at night without sharing my password with a script.

## Requirements elicitation

- **What exists (verified):**
  - The mod queue: `listModItems(communityId, view)` and `resolveModItem(...)` (`lib/communities/automod.server.ts`),
    served at `GET /api/communities/$slug/modqueue` and `POST /api/communities/$slug/modqueue/$itemId`
    (`lib/communities/api/communities.$slug.modqueue*.server.ts`), both behind `requireMod`
    (`lib/communities/guard.server.ts`). **Part of the decision lives in the route**: approving a held post enqueues its
    post alerts (`enqueuePostAlert`), and a removal records the rule citation (`recordCitation`) and notifies the author
    (`createNotification`, `removalNoticeText`).
  - Sanctions (sprint 06 01): `sanction(input)`, `lift(...)`, `listSanctions(...)` (`lib/communities/bans.server.ts`),
    with the mod log, notices and `BAN_ENFORCEMENT_PATHS`.
  - The API has community reads and posting (sprint 07 11, `read:communities`, `write:communities`) and no moderation.
- **Decisions:**
  - **Scope `manage:moderation`** ("Moderate communities where you are a moderator: the mod queue and timeouts and
    bans"). Every call also requires that the key owner is a moderator of that community **now** (checked per request
    with `requireMod`'s rule, not cached on the key).
  - **Granted explicitly only (validation pass 2).** `hasScope` (`lib/api/scopes.ts`) lets `*` and `manage:*` satisfy
    every `manage:` scope, so without a change every existing wildcard key of every moderator would gain the power to
    ban members the day this ships, without its owner choosing that. `ScopeDetail` gains an optional `explicit?: true`;
    `hasScope` ignores `*` and the action wildcard for a scope marked `explicit` (it must be listed literally on the
    key); `manage:moderation` is the only scope marked. The key-creation UI shows it unticked inside a wildcard
    selection with the line "Not included in “All”: choose it on its own", and the changelog and
    `docs/developer-api/scopes.md` say so. Existing scopes' behaviour is unchanged (the scopes test asserts every other
    scope still matches its wildcards).
  - **Endpoints** (route files, `withDeveloperApi`):
    - `GET /api/v1/communities/{slug}/modqueue?view=pending|log&cursor=` — items with the held post's text through the
      API serialiser (so content warnings, GIF descriptions, quiz answers and quiet counts apply as for any reader; a
      moderator sees held text, which is what the queue is for).
    - `POST /api/v1/communities/{slug}/modqueue/{itemId}` — `{ decision: approve | remove, rule_id?, message? }`.
    - `GET /api/v1/communities/{slug}/sanctions?active=true` — current timeouts and bans.
    - `POST /api/v1/communities/{slug}/sanctions` — `{ handle, kind: timeout | ban, duration?, rule_id?, reason? }`
      within the site's limits; `DELETE /api/v1/communities/{slug}/sanctions/{id}` — lift.
  - **One decision path.** The approve and remove side effects move from the site route into `decideModItem(...)` in a
    new `lib/communities/mod-decisions.server.ts`, called by both the site route and the API; the site's behaviour is
    unchanged (asserted by its existing tests).
  - **The mod log** records API actions as the moderator, exactly like site actions, plus `via: 'api'` in the entry's
    detail for the moderators' log (not the public log).
  - **Limits:** the write class, and at most 120 decisions and 30 sanctions per key per hour.
  - **Webhooks:** none (pushing other members' content to third-party URLs is the consent question sprint 07 recorded).

## Functional requirements

1. FR-1 `decideModItem` extracted and adopted by the site route (no behaviour change).
2. FR-2 The five handlers in route files, zod-validated, keyset pagination, the v1 error envelope (`not_moderator` 403,
   `item_resolved` 409, `rule_not_found` 400, `sanction_refused` 409 with the site's reason); every new error code is
   added to `ERROR_TYPES` and the status map in `lib/api/errors.ts` (an unknown code falls back to `api_error`).
3. FR-3 `lib/api/v1/moderation.server.ts` serialising items and sanctions; held posts through
   `lib/api/serializers.server.ts`.
4. FR-4 Scope, registry, `NULLABLE`, changelog (anchors), `docs/developer-api/scopes.md`, SDK and docs regenerated.
5. FR-5 The new reader file in `CONTENT_WARNING_READ_PATHS`, `QUIET_COUNT_READ_PATHS`, `GIF_ALT_READ_PATHS`,
   `QUIZ_READ_PATHS` (or their exempt maps, honestly: "delegates to the API serialiser" only if it does).

## Non-functional requirements

- **Security:** the scope is explicit-only (above); the moderator check runs on every request; a demoted moderator's key
  stops working at once; a private community's queue is reachable only by its moderators (the same check); nothing
  accepts a moderator id from the body; a sanction follows the site's rules exactly (`sanction` in
  `lib/communities/bans.server.ts`: moderators act on members, only the owner sanctions a moderator, nobody sanctions
  the owner).
- **Correctness:** additive; existing v1 paths unchanged; the SDK diff changes no existing field.

## Data model and API

- No schema change. New `lib/communities/mod-decisions.server.ts`, `lib/api/v1/moderation.server.ts`,
  `lib/api/v1/moderation-schema.ts`, route files under `app/routes/api/v1/communities/$slug/` (`modqueue.ts`,
  `modqueue/$itemId.ts`, `sanctions.ts`, `sanctions/$id.ts`).
- Edits: `lib/communities/api/communities.$slug.modqueue.$itemId.server.ts` (calls `decideModItem`),
  `lib/communities/modlog.ts` (the `via` detail, never in the public log), the four post read-path registries,
  `lib/api/scopes.ts` (the anchor, plus `explicit` on `ScopeDetail` and in `hasScope`: wave 3 has no other API feature),
  the key-creation scope pickers (`components/developer/KeysManager.tsx`, `TestKeyCreator.tsx`: the unticked explicit
  scope), `lib/api/registry.ts`, `scripts/generate-sdk.ts`, `docs/developer-api/{changelog,scopes}.md`.

## Testing requirements

- Main suite `lib/api/v1/__tests__/moderation-api.test.ts`: a non-moderator's key is 403; a demoted moderator's key is
  refused on the next call; approve enqueues alerts; remove with a rule records the citation and notifies; a resolved
  item is 409; a moderator's key cannot sanction another moderator, an owner's can, nobody can sanction the owner; scope
  enforced; a key holding `*` or `manage:*` but not `manage:moderation` gets 403 `insufficient_scope`.
- `lib/api/__tests__/scopes*.test.ts`: `explicit` scopes ignore wildcards; every other scope still matches `*` and its
  action wildcard.
- Main suite `lib/communities/__tests__/mod-decisions.test.ts`: the site route and the API produce the same side effects
  for the same decision.
- The existing modqueue route tests stay green; the four read-path registry tests; route table; SDK generation.

## Acceptance criteria

- [ ] A moderator's key with `manage:moderation` lists held posts and approves one; its post alerts go out.
- [ ] Removing with a rule cited notifies the author naming the rule, as on the site.
- [ ] Timing a member out through the API stops them posting, with the site's refusal text.
- [ ] A key whose owner stopped being a moderator gets 403.

## Out of scope

Editing AutoMod rules, community settings or flairs through the API, the site-wide report queue, webhooks for moderation
events.
