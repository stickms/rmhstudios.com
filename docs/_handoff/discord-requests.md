# Discord Activity agent — requests outside its file ownership

From the wave implementing `X8, X9, X10` of
[`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md).

Everything below is a change in a file this agent does **not** own. None of it
is required for the shipped work to function — each item is written so the
feature degrades rather than breaks without it, and the degradation is stated.
The client side (`components/slice-it/SliceItDiscordActivity.tsx`) already
does its half of every item here; these are the other halves.

---

## 1. `server/socket-server/handlers/slice-it.ts` — a guest seat, keyed by socket

**Why.** `X10`. `identity()` requires `socket.data.userId`, which the hub's
auth middleware only ever sets from a validated Better Auth session token
(`server/socket-server/index.ts`, the "soft auth" middleware). A Discord
Activity guest has no such session, so **every** `slice:*` handler that calls
`identity()` — `create`, `join`, `quickplay` — replies `auth_required` for
them today, regardless of `linkedUserId`. `LobbyPlayer.userId` and
`Seat.userId` are also typed as a required `string`, so a guest seat is not
just unauthenticated, it is unrepresentable.

**Change**, in three parts:

1. `lib/slice-it/net/events.ts` — `LobbyPlayer.userId` becomes
   `string | null`, and a seat gets an optional `guest` block:

   ```ts
   export interface LobbyPlayer {
     // …
     /** Null for a guest seat — see `guest` below. */
     userId: string | null;
     guest?: {
       /** Discord display name, shown as-is. Never written to any table. */
       name: string;
       /** Discord CDN avatar URL. Referenced, never copied into our storage. */
       avatarUrl: string | null;
     };
   }
   ```

   `LobbyPlayerZ` needs the matching relaxation (`userId: z.string().nullable()`,
   `guest: z.object({ name: z.string(), avatarUrl: z.string().nullable() }).optional()`).

2. `server/socket-server/handlers/slice-it.ts` — a second identity path for a
   socket that authenticated via Discord instead of a site session (see item 3
   below for how that token reaches the hub at all), and the seat key changes
   from "the userId" to "the userId, or a synthetic guest key that does not
   survive reconnect":

   ```ts
   /**
    * Seats are keyed by userId because a reconnect mints a new socket id, and
    * keying on THAT removed players mid-song (see the docblock at the top of
    * this file). A guest has no userId, so their seat is keyed by socket and
    * does NOT get the reconnect story — see `removeSeat`'s grace window, which
    * this key deliberately cannot benefit from. That is a real downgrade and it
    * is the honest one: holding a seat for an identity this file refuses to
    * store would mean storing it.
    */
   function seatKey(who: { userId: string | null; socketId: string }): string {
     return who.userId ?? `guest:${who.socketId}`;
   }
   ```

   Every `lobby.seats.get(...)`/`.set(...)` in the file is keyed by `userId`
   today (`Map<string, Seat>`); switching the map's key to `seatKey(...)`
   output is the mechanical part. The `identity()` function needs a guest
   branch that reads a Discord display name + avatar URL off `socket.data`
   (populated by item 3) instead of requiring `socket.data.userId`.

3. `persistResults` (same file) already skips a standing whose `score <= 0` or
   `!finished`; it needs one more guard — skip any standing whose `userId` is
   null. `SongLeaderboard.userId` is a required FK; there is no row to write.

**Without it.** Exactly today's behavior: a Discord user with no Better Auth
session gets `auth_required` on every multiplayer action and the client falls
back to solo play, which is what `SliceItDiscordActivity.tsx`'s `'solo'` phase
already does. Nothing crashes; multiplayer inside Discord for a guest is simply
unavailable until this lands.

---

## 2. `app/routes/api/slice-it/score.ts` — `auth: 'optional'`, and refuse to store a guest run

**Why.** `X10`. The route's `defineHandler` uses `auth`'s default, which is
`'required'` — a request with no session 401s before the handler body ever
runs. A guest's run is computed correctly client-side but the client already
skips the fetch entirely rather than submit it (see `useSubmitScore.ts`'s
`RunSummary` — this agent left it untouched, per file ownership), so the 401 is
never actually seen. Making the route accept an optional session is what lets
a **partially-working** session (a linked account whose browser genuinely has
no Better Auth cookie inside the Discord iframe — see the note at the bottom of
this file) get a real answer instead of a silent client-side skip.

**Change:**

```ts
POST: defineHandler(
  {
    auth: 'optional',
    body: ScoreSubmissionZ,
    rateLimit: { limit: 20, windowMs: 60_000, prefix: 'slice-score', scope: 'user' },
  },
  async ({ userId, body }) => {
    if (!userId) {
      // Computed, shown, and discarded — no User row, no SongLeaderboard row,
      // no Player upsert. The alternative (a shadow account per guest) holds a
      // third party's name and avatar indefinitely for a data-retention
      // question nobody asked; not storing it is both the simpler code and the
      // correct privacy answer.
      return Response.json({ success: true, ranked: false, stored: false });
    }
    // … existing body, unchanged
  },
),
```

Every other line in the handler already reads `userId` from the destructured
handler args rather than the request, so nothing below the new guard needs to
change.

**Without it.** A guest's score is never POSTed at all — the client-side skip
in `useSubmitScore` is the only reason this is a non-issue today. If some other
caller ever posts to this route without a session, they get a 401 with no
special-casing, same as before this wave.

---

## 3. `server/socket-server/handlers/slice-it.ts` — `slice:create` should accept a preferred code

**Why.** `X9`. `SliceItDiscordActivity.tsx` derives a stable 6-character code
from `discord.channelId` so a voice channel's lobby needs no code typed. But
`createLobby()` → `slice:create` always mints a random code via `mintCode()`,
with no way to say "use this one." The client works around it today: the first
participant whose join 404s creates a normal (random-coded) lobby, and every
other participant just keeps retrying the *derived* code every 4s until their
retry happens to succeed — which it only does once the room is destroyed and
someone re-derives the same collision, i.e. **never**, in the common case. In
practice today: the launcher gets a working lobby; everyone else sits in
`'waiting-for-host'` retrying a code the server was never asked to assign.

**Change.** Let `slice:create`'s payload carry an optional preferred code,
honoured when free:

```ts
// lib/slice-it/net/events.ts
'slice:create': { c2s: LobbySettingsPatchZ.extend({ code: CodeZ.optional() }) },

// server/socket-server/handlers/slice-it.ts, createLobby()
function createLobby(host, isPublic: boolean, preferredCode?: string): Lobby | null {
  const code =
    preferredCode && preferredCode.length === LOBBY_CODE_LENGTH && !lobbies.has(preferredCode)
      ? preferredCode
      : mintCode();
  if (!code) return null;
  // … unchanged from here
}
```

The client-side change is one line once this ships:
`net.createLobby(false, code)` instead of `net.createLobby(false)`.

**Without it.** The degraded behavior described above: only the launcher's
own session lands in the shared lobby automatically. Everyone else needs the
launcher to read the real code off their screen and (for now) type it — the
same manual fallback multiplayer already has for any invite. `X9`'s Build
explicitly calls this out as the risk to measure before committing further, so
this is expected to be the first thing revisited.

---

## Note, not a request: Better Auth has no session inside the Discord iframe

Worth flagging even though fixing it is a different, larger piece of work than
anything above. `MultiplayerLobby.tsx`'s own gate —
`if (!session) { …sign in… }` — and `net/client.ts`'s `connectSliceIt()`
(`authClient.getSession()`, throws `Not authenticated` if empty) both depend on
a Better Auth session cookie. Discord Activities are served through Discord's
own proxy origin (`https://<app-id>.discordsays.com`, not `rmhstudios.com`), so
a cookie scoped to `rmhstudios.com` is not sent on a request from that origin
under normal browser rules — independent of whether the Discord account is
linked. `/api/discord/token.ts` returns `{ access_token, linkedUserId }` and
mints no site session, so today this affects **every** Discord Activity user,
linked or not: `SliceItDiscordActivity.tsx`'s `multiplayerAvailable` probe
(`connectSliceIt()`, wrapped in try/catch) is expected to fail for nearly
everyone until something bridges the two. That bridge — likely a short-lived
token exchange that mints a real Better Auth session for a linked Discord user
opening the Activity — is out of scope for this wave; items 1–3 above are
useful independently of it (they are what makes a *guest* seat function once
someone opens the socket at all, whether that is via the bridge or via item 2's
Discord-token auth path on the hub).

Two smaller, unrelated things noticed while building the gateway, both in
`app/routes/__root.tsx` (owned by neither this wave's agents nor named in the
plan, so flagged rather than fixed):

- The Discord minimal-`head()` branch hardcodes `title: 'RMHBox'` for every
  `/discord/*` route, including the new gateway and Slice It.
- The Activity-iframe redirect-to-`/discord/*` effect hardcodes its fallback
  target as `/discord/rmhbox`. Now that `/discord` (this wave's gateway) exists,
  that should probably retarget to `/discord` so a stray in-Activity navigation
  lands on the picker instead of skipping straight to RMHBox.
