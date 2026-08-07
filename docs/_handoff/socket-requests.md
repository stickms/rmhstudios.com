# Socket / Discord-identity agent — requests outside its file ownership

From the wave implementing `X9`, `X10` and `N1` of
[`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md)
— the server half of items 1 and 3 in
[`discord-requests.md`](discord-requests.md).

Same convention as the other files here: each item is a change in a file this
agent does **not** own, each states the degradation if it never lands, and
nothing shipped depends on any of them to *function*.

**Item 1 is the exception worth reading first.** It is one line, and without it
none of the server work in this wave is reachable from the product.

---

## 1. `components/slice-it/SliceItDiscordActivity.tsx` — hand the socket the Discord token (ONE line, blocking)

**Why.** The hub now accepts a Discord Activity token as a second credential
(`server/socket-server/index.ts`), and `lib/slice-it/net/client.ts` now sends
one — but only if somebody gives it one. `connectSliceIt()` is called with no
arguments from this component (line ~169), and the token lives in
`discord.accessToken`, which only this component has.

So today: the hub can seat a guest, the client can ask it to, and nothing
introduces the two. `connectSliceIt()` still finds no Better Auth session inside
the iframe, still throws `Not authenticated`, and the component still falls
through to `'solo'` — exactly as before this wave.

**Change**, in the effect at step 1, before `net.connectSliceIt()`:

```tsx
useEffect(() => {
  let cancelled = false;
  // The hub verifies this token against Discord and derives the user from
  // Discord's answer — it is a credential, not a claim about who we are.
  net.setDiscordAuth({ accessToken: discord.accessToken, channelId: discord.channelId });
  net
    .connectSliceIt()
    // … unchanged
  return () => {
    cancelled = true;
    net.setDiscordAuth(null);
  };
}, [discord.accessToken, discord.channelId]);
```

`setDiscordAuth` is already exported from `lib/slice-it/net/client.ts` and is a
no-op everywhere else, so this cannot affect the standalone `/slice-it` page.

**Without it.** Today's behaviour exactly: every Discord Activity player, linked
or guest, gets `auth_required` and plays solo. The server work is correct and
unreachable.

---

## 2. `components/slice-it/SliceItDiscordActivity.tsx` — pass the derived code to `createLobby` (ONE line)

**Why.** `X9`, and the second half of
[`discord-requests.md`](discord-requests.md) item 3, which is now served:
`slice:create` accepts a preferred code, honours it when free, and answers the
new `code_taken` error when someone already holds it.

**Change.** At the `not_found` branch (line ~211):

```tsx
if (isLauncher) {
  net.createLobby(false, code); // was: net.createLobby(false)
}
```

and, ideally, treat `code_taken` as "somebody beat me to it" rather than as a
pairing failure — it is the *good* outcome of a race, and a join succeeds
immediately after it:

```tsx
if (lobbyError === 'code_taken') {
  net.joinLobby(code);
  return;
}
```

**Without it.** The launcher creates a random-coded lobby, every other
participant retries the derived code forever, and only the launcher ends up in a
working room — the degraded behaviour `discord-requests.md` item 3 describes.
`code_taken` falls through to the generic `pairingErrorNote()` default and reads
as "couldn't join the group lobby — playing solo", which is survivable but
wrong.

---

## 3. `server/rmhbox/auth.ts` — verify the Discord token's *audience* (security)

**Why.** Not a Slice It issue; noticed while writing the equivalent path for the
games hub, and it applies to rmhbox as it stands today.

`validateDiscordToken()` verifies a Discord access token by calling
`GET /users/@me` with it. That confirms the token is a valid Discord token and
tells you whose it is — but **not which application it was issued for**. Any
Discord OAuth token in existence, minted by any third-party app for any purpose,
passes that check. rmhbox then resolves it to a linked site account and seats
them, or mints a transient `discord:<id>` identity. In other words: a token
harvested by an unrelated Discord app is a valid rmhbox login.

**Change.** Call `GET /oauth2/@me` instead, and check the audience:

```ts
const res = await fetch('https://discord.com/api/v10/oauth2/@me', {
  headers: { Authorization: `Bearer ${discordToken}` },
});
if (!res.ok) return null;
const info = await res.json();
// The token was minted for *our* application, not merely by Discord.
if (info?.application?.id !== config.DISCORD_ACTIVITY_CLIENT_ID) return null;
// Bonus: the token's own absolute expiry, so the auth cache can honour it
// instead of relying on its TTL alone.
if (Date.parse(info?.expires ?? '') <= Date.now()) return null;
const discordUser = info.user; // present with the `identify` scope
```

This is what `server/socket-server/index.ts` `verifyDiscordActivityToken()` does,
and it is also *one* outbound call instead of two — `/oauth2/@me` returns the
application, the expiry and the user together. rmhbox's config would need
`DISCORD_ACTIVITY_CLIENT_ID` added (the socket hub's `config.ts` now has it; the
value is already in `.env.example` and reaches every container through
`env_file`, so this is a config-object line, not a deploy change).

**Without it.** rmhbox keeps today's behaviour, which has been live for a while
and is not known to have been exploited — but the games hub and rmhbox now
verify Discord tokens to visibly different standards, and the weaker one is the
hard-auth hub.

---

## 4. `components/slice-it/MultiplayerSidebar.tsx` + `MultiplayerLobby.tsx` — the spectator view and the guest badge

**Why.** `N1`'s server half shipped: `slice:spectate` seats a watcher in a
`slice:<code>:spec` room that receives `slice:lobby`, `slice:countdown`,
`slice:start`, the `volatile` `slice:scores` tick, `slice:results`,
`slice:pause` and `slice:resume` — everything a player sees except the ability
to affect it. `net.spectateLobby(code)` is exported and typed. There is no
renderer.

Likewise `LobbyPlayer.guest` is now populated for guest seats (`{ name,
avatarUrl }`, present exactly when `userId` is null), and nothing renders it —
`MultiplayerLobby.tsx` shows the name and avatar, which is correct but does not
distinguish a guest from an account.

**Change.** A spectator mode in the sidebar (no ready button, no modifier
controls, no chat send — a spectator has no seat, so every one of those is
already refused server-side and should not be offered), and a "Guest" badge on
roster rows where `player.guest` is set. `SliceItDiscordActivity.tsx`'s
`IdentityChip` already has the badge styling to copy.

**Without it.** Spectating is reachable only from code, and a guest is
indistinguishable from an account holder in the lobby roster. Neither breaks
anything; both are just invisible.

---

## 5. `docs/slice-it.md` §Multiplayer — three paragraphs now out of date

**Why.** That section is the reference for this subsystem and currently states
seats are keyed by `userId` full stop, which is no longer the whole truth.

**Change.** Under §Seats, after the existing paragraph:

> A **guest** — a Discord Activity player with no linked site account — has no
> `userId`, so their seat is keyed by socket and does **not** survive a
> reconnect. That is the one way guests are second-class, and it follows from
> the key: holding a seat for an identity the server refuses to store would mean
> storing it. Nothing about a guest is persisted — no `User` row, no
> `SongLeaderboard` row; `persistResults` skips them explicitly.

And a new §Spectators noting the `:spec` room and that spectators are outside
`MAX_LOBBY_PLAYERS`, the ready check and the set of players a match waits for.
§Disconnects' two-window table could use a third row: "Guest — none — seat
released immediately."

**Without it.** The doc describes the pre-guest server. It is the file agents
are told to read for this subsystem, so it will mislead one.

---

## 6. `app/routes/api/slice-it/score.ts` — still wants `auth: 'optional'`

Not this agent's item — it is
[`discord-requests.md`](discord-requests.md) item 2 — but re-flagged because it
is now reachable in a way it was not before. With item 1 above landed, a guest
genuinely plays a multiplayer match inside Discord, and `useSubmitScore` is the
only thing keeping a guest's POST off that route. The route still 401s a
sessionless request. Item 2's guard (`if (!userId) return … stored: false`) is
what makes that answer honest rather than accidental.

The socket-side equivalent **is** done: `persistResults` skips any standing with
a null `userId`, and
`lib/slice-it/__tests__/handler.test.ts` › guests › "writes no leaderboard row
for a guest" holds it there.
