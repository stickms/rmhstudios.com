# RMH Vibes inside a Discord Activity

Inside
an
Activity
every
request
must
go
through
`https://<application-id>.discordsays.com`.
Stored
vibe
HTML
bakes
in
the
site
origin
(CSP
meta,
importmap,
`window.RMHVibeAI`
endpoint)
and
`https://esm.sh`,
so
`lib/rmhvibe/activity-html.ts`
rewrites
them
to
the
proxy
origin
when
the
page
is
served
to
an
Activity.
The
rewrite
applies
only
when
the
proxy
origin
matches
`https://<6-25 digits>.discordsays.com`;
any
other
origin
leaves
the
HTML
unchanged.

## Developer Portal URL mappings

| Prefix        | Target         | Notes                                    |
| ------------- | -------------- | ---------------------------------------- |
| `/`           | the site       | root mapping, serves pages and `/api/**` |
| `/socket/`    | the socket hub | already configured                       |
| `/rmhbox-ws/` | the RMHBox hub | already configured                       |
| `/esm`        | `esm.sh`       | **new, owner action** in the Portal      |

Mappings
other
than
the
root
are
reached
under
`/.proxy/<prefix>`
(the
socket
and
RMHBox
prefixes
are
registered
in
`lib/discord-sdk.ts`
with
a
trailing
slash;
`/esm`
is
entered
in
the
Portal
and
used
by
the
rewrite
as
`/.proxy/esm`),
so
esm.sh
becomes
`https://<application-id>.discordsays.com/.proxy/esm/...`.

## Limitations

- Packages
  served
  by
  esm.sh
  (the
  long-tail
  fallback)
  that
  import
  root-relative
  paths
  (`/v135/...`)
  resolve
  against
  the
  site
  root
  mapping,
  not
  `/esm`,
  and
  may
  not
  load
  inside
  Discord.
  Curated
  hosted
  packages
  (`/api/vibe/pkg/<stem>.js`)
  work.
- Legacy
  pages
  that
  allow
  `https://cdn.jsdelivr.net`
  are
  not
  rewritten:
  there
  is
  no
  mapping
  for
  it,
  so
  those
  scripts
  will
  not
  load
  in
  an
  Activity.

## Token verification and instance membership

Both verifiers of the Activity access token (the web tier's `lib/discord/verify-activity-token.server.ts`, used by the vibe
store route, and the hub's `server/socket-server/discord-activity.ts`) call Discord's `/oauth2/@me` and are hardened so an
unauthenticated caller cannot drive outbound Discord calls:

- A refused token (401, another application, expired) is remembered for 60 s; keys are the sha256 of the token, so no raw bearer
  token is ever a cache key. A network error, timeout, 5xx or 429 says nothing about the token and is never remembered.
- Concurrent verifications of one token share one outbound call (`lib/single-flight.ts`).
- Unseen tokens are limited to 30 per minute per client IP before any call is made (web: `getClientIp`; hub: the handshake IP,
  Cloudflare's header, else the rightmost `X-Forwarded-For`). Over the limit the caller is anonymous, logged once per IP per minute.

The hub keeps the Discord user id Discord returned on `socket.data.discordId`. A Discord-authenticated socket may only join the
vibe room of an instance it is in: `server/socket-server/discord-instance.ts` asks
`GET /applications/{DISCORD_ACTIVITY_CLIENT_ID}/activity-instances/{instanceId}` with `Authorization: Bot $DISCORD_ACTIVITY_BOT_TOKEN`
and checks `users`. Member lists are cached 30 s per instance (a user missing from a list older than 5 s triggers one refresh),
an unknown instance (404) 60 s, the timeout is 5 s, each Discord user gets 20 lookups per minute (past that the join is refused, `BAD_INSTANCE`), and a
failure that says nothing about the caller (network, 5xx, 429, or Discord refusing our bot token, which is logged) lets the join
through without being remembered, so an outage or a misconfigured token never locks every Activity out. `DISCORD_ACTIVITY_BOT_TOKEN` reaches the socket service through
`env_file` like every other variable; with it unset the check is skipped and logged once at boot, so dev keeps working. A socket
signed in with a web session (not through Discord) is not checked: its instance id is unguessable, as before.

A JOIN with a malformed instance id answers `BAD_INSTANCE`, a SEND with a payload that cannot be serialised answers
`BAD_PAYLOAD`, and a JOIN into a full room is refused before the socket leaves its current room.
