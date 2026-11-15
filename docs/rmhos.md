# rmhOS

rmhOS is a full-screen app at `/rmhos` that boots a real Linux desktop (a 32-bit x86 machine, IceWM on Alpine Linux)
inside the visitor's browser tab. It runs in an emulator ([v86](https://github.com/copy/v86), WebAssembly) on the
visitor's own device: the site serves files, signs people in and relays their network traffic, and it never runs a
visitor's code on a server. The design and its owner decisions are in
[`superpowers/specs/2026-11-14-rmhos-design.md`](superpowers/specs/2026-11-14-rmhos-design.md) (its "Owner amendments"
section wins over the text under it); this page is the runbook.

> **State of play.** Networking is **off in production** until three things exist: the egress firewall unit is
> installed on the VPS (see [The sandbox](#the-sandbox)), `RMHOS_NET_TICKET_SECRET` is set in the production env file
> (see [Generate and rotate the ticket secret](#generate-and-rotate-the-ticket-secret)), and the owner has chosen the
> policies in [Decisions to make before enabling](#decisions-to-make-before-enabling). The page itself **cannot boot**
> until an image has been published and its values pasted into `features/rmhos/engine/image-manifest.ts` (see
> [Publish a new image version](#publish-a-new-image-version)). Until then the catalog card says "Coming soon":
> `features/rmhos/catalog.ts` has `status: 'Coming soon'`, and it must go back to `'Beta'` in the same commit that pins
> the first published image (regenerate the catalog snapshot with
> `pnpm exec vitest run lib/__tests__/catalog-contract.test.ts -u`, and `pnpm docs:site` for the site reference).

## The three moving parts

| Part          | Where                                                                                              | What it does                                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The page      | `features/rmhos/` (`engine/`, `ui/`, `api/`), route `app/routes/rmhos.tsx`                         | Downloads the image, runs v86, hands the guest the visitor's identity over a serial line, keeps the home folder in IndexedDB, shows the toolbar. `GET /api/rmhos/session` returns the Linux user name and a relay ticket. |
| The image     | `scripts/rmhos/` (kernel config, patches, rootfs overlay, Dockerfile), published to R2/CDN         | A kernel + root filesystem + BIOS files built from pinned inputs (not bit-for-bit reproducible: Alpine packages float within the release) + a post-boot snapshot (`state.zst`) so a session starts in about 3 s instead of about 15 to 30 s. |
| The relay hub | `server/rmhos-net/` (one Node process, port 7009, path `/rmhos-net/`), compose service `rmhos-net` | One WebSocket per user carrying Wisp streams to the internet under a policy; DNS over HTTPS (`POST /rmhos-net/dns-query`); `GET /rmhos-net/status`. The only thing in the feature that touches the network.               |

The catalog entry is `features/rmhos/catalog.ts` (id `rmhos`, `authGate: true`, status Beta). The i18n namespace is
`c-rmhos`; its keys are added by hand to every `locales/<lng>/c-rmhos.json` (`pnpm i18n:extract` does not scan
`features/`, and running it rewrites thousands of locale files; do not).

## Run it locally

```bash
pnpm install
pnpm rmhos:image            # kernel + rootfs + snapshot into public/rmhos-dev (git-ignored; needs Docker, 15 to 25 min cold)
pnpm rmhos:smoke            # boots it headless: cold boot, restore, crafted archives, snapshot refusal
pnpm dev                    # vite (7005) + the hubs, including the relay hub (7009); open /rmhos signed in
```

With no CDN base the page loads the image from `/rmhos-dev/`. Behind a TLS-inspecting proxy build with
`RMHOS_BUILD_CA_BUNDLE=<pem>` (the CA is installed inside the build only and never ships); `HTTPS_PROXY` is passed
into the build, and with a loopback proxy the build runs on the host network (`scripts/rmhos/build.sh`).

v86 always builds an `https://` DoH URL, so **DNS cannot work on plain-http localhost**. To see the internet end to
end locally put a TLS front in front of both servers: `testing/e2e/rmhos-tls-front.mjs` (self-signed certificate,
forwards `/rmhos-net/*` including WebSocket upgrades to 7009 and the rest to Vite) and run
`testing/e2e/rmhos-net.mjs`, which is the end-to-end check (header of that file lists the exact commands, including
`BETTER_AUTH_URL=https://localhost:7443` for sign-in). Without TLS the machine still boots and the WebSocket relay
works; only name resolution fails.

## Publish a new image version

The image changes only when `scripts/rmhos/versions.env`, `kernel.config`, `patches/`, the rootfs overlay or the
package list change. A published version is **immutable** (`rmhos/<version>/` on the CDN, `Cache-Control: immutable`,
and `publish-r2.mjs` refuses to overwrite one): tabs keep running the version they loaded until they reload, so old
versions must stay on the CDN (see [Roll back an image](#roll-back-an-image)).

1. **Run the `rmhos-image` workflow** (`.github/workflows/rmhos-image.yml`, manual, **on `main`**). Inputs: `publish`
   (default **false**: build, boot it headless, keep the artifact, upload nothing), `from_run` (publish an earlier
   run's artifact instead of rebuilding) and `force` (overwrite an existing version; repair only). The first step
   checks that a publish runs on `main` and that the repository secrets `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`,
   `S3_SECRET_ACCESS_KEY` and `S3_BUCKET` exist, before the 25 minute build. The build writes the snapshot and
   `manifest.json` (its `version` is a hash over every boot input including the snapshot, so a new image is a new path
   and an old page never mixes files from two builds) and records the commit, the run URL and the date in both
   `manifest.json` and the header of `packages.txt`. The whole image directory is kept as the build artifact
   `rmhos-image-<run id>` for 30 days. A good first pass is `publish=false`, look at the run, then re-run with
   `from_run=<that run id>` and `publish=true`: the same bytes are published, a rebuild would be a different version
   (apk versions float).
2. **The upload** goes to R2 under `rmhos/<version>/`: every file in the manifest (`bzImage`, `rootfs.ext4`,
   `seabios.bin`, `vgabios.bin`, `state.zst`, `packages.txt`, `apk-installed.txt` and the exact kernel tarball
   `linux-<version>.tar.xz`, the last three being the GPL source and records, not boot inputs) as whole buffers, each
   retried 3 times, then `manifest.json` **last**. If `rmhos/<version>/manifest.json` already exists the run stops. If
   an upload fails after a good build, re-run with `from_run`.
3. **Check the CDN before pinning anything** (once per bucket; v86 reads the disk with HTTP Range requests from another
   origin, and a missing header shows up as a page that never boots). In the R2 dashboard, bucket, Settings, CORS
   policy:

   ```json
   [
     {
       "AllowedOrigins": ["https://rmhstudios.com"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["Range", "X-Accept-Encoding"],
       "ExposeHeaders": ["Content-Range", "Content-Length", "Accept-Ranges"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```

   (use the origin users actually browse: the value of `BETTER_AUTH_URL`). Then verify both the preflight and a ranged
   GET against the published version (`cdn.rmhstudios.com` is the host `VITE_CDN_BASE_URL` points at):

   ```bash
   CDN=https://cdn.rmhstudios.com; V=<version>
   curl -s -o /dev/null -D - -X OPTIONS -H 'Origin: https://rmhstudios.com' \
     -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: range' \
     "$CDN/rmhos/$V/rootfs.ext4"
   # expect 200/204, access-control-allow-origin: https://rmhstudios.com, access-control-allow-headers listing range
   curl -s -o /dev/null -D - -r 0-99 -H 'Origin: https://rmhstudios.com' "$CDN/rmhos/$V/rootfs.ext4"
   # expect 206, content-range: bytes 0-99/<size>, accept-ranges: bytes, access-control-allow-origin,
   # access-control-expose-headers containing Content-Range, and NO content-encoding header
   curl -s -o /dev/null -D - -r 0-99 "$CDN/rmhos/$V/state.zst"   # 206, content-type: application/zstd, no content-encoding
   ```

   Cloudflare does not cache `.ext4` or `.zst` by default (they are not on its default extension list), so add a Cache
   Rule for the hostname: URI path starts with `/rmhos/`, Eligible for cache, Edge TTL "use cache-control header if
   present" (the objects carry `immutable`). The files are well under Cloudflare's per-object cache limit (the rootfs is
   about 290 MB). Production must also be **built with `VITE_CDN_BASE_URL` set** (`https://cdn.rmhstudios.com`; it is
   a build argument, `.env.example`): without it the page asks for `/rmhos-dev/`, which `.dockerignore` keeps out of
   the app image.
4. **Paste the pin.** The last step of the workflow, and `publish-r2.mjs`, print a ready-to-paste TypeScript block
   (`scripts/rmhos/print-pin.mjs`, also runnable on any image directory: `node scripts/rmhos/print-pin.mjs public/rmhos-dev`)
   for the published-image constant `PUBLISHED_IMAGE` in `features/rmhos/engine/image-manifest.ts`. Paste it over the
   constant.
5. **Flip the catalog to Beta** in the same commit (`features/rmhos/catalog.ts`, see the state-of-play note), commit,
   and let the deploy ship it. Until this commit deploys, the site keeps booting the previous version.
6. **Look at it.** Open `/rmhos` signed in, in Day and in Night, wait for the desktop, check that it paints and that the
   toolbar says the network is on. The headless smoke waits for the agent's "X server is running" line and fails on
   "is not running", but it cannot see the screen, and a different apk build than the one you last looked at can
   differ. Open the published `packages.txt` (About links it) and check its header names the commit you expect.

## Environment variables

| Variable                                              | Read by       | Default                         | Meaning                                                                                                                                                  |
| ----------------------------------------------------- | ------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RMHOS_NET_TICKET_SECRET`                             | web and hub   | none (required for networking)  | HMAC key for relay tickets, at least 32 characters (`openssl rand -hex 32`), used for nothing else. Unset or shorter: the web tier reports networking off and the hub refuses to start with a clear line. See [Generate and rotate the ticket secret](#generate-and-rotate-the-ticket-secret). |
| `RMHOS_NET_ENABLED`                                   | web and hub   | on                              | `0` switches networking off: the session says disabled (toolbar "Network off", no WebSocket is opened) and the hub answers 503. Takes effect on restart. See [Switch the relay off now](#switch-the-relay-off-now). |
| `RMHOS_NET_ACCESS`                                    | web           | `all`                           | Who gets a ticket: `all` (every signed-in account), `members` (an active paid membership, `getUserTier` above `free`), `verified` (email verified). Any other value fails closed to `members`. A suspended or banned account never gets one. An account that does not qualify gets `net: { enabled: false, reason: 'not-eligible' }`. |
| `RMHOS_NET_MIN_ACCOUNT_AGE_DAYS`                      | web           | `0`                             | Accounts younger than this many days do not qualify (`not-eligible`), in every mode. `0` = no minimum.                                                    |
| `RMHOS_NET_PORT`                                      | hub           | `7009`                          | Listen port.                                                                                                                                             |
| `RMHOS_NET_DENIED_PORTS`                              | hub           | `25,465,587,2525`               | TCP ports the relay refuses (mail). An empty or unparseable list falls back to the default, never to "deny nothing". Ignored while `RMHOS_NET_ALLOWED_PORTS` is set. |
| `RMHOS_NET_ALLOWED_PORTS`                             | hub           | unset                           | When set, ONLY these TCP ports are allowed and the deny-list is ignored. Set but with no valid port: nothing is allowed (fails closed). The DoH upstream is exempt. |
| `RMHOS_NET_MAX_STREAMS`                               | hub           | `64`                            | Concurrent streams per connection.                                                                                                                       |
| `RMHOS_NET_BYTES_PER_SECOND`                          | hub           | 2 MiB                           | Per-user token bucket (up and down together).                                                                                                            |
| `RMHOS_NET_BYTES_PER_DAY`                             | hub           | 2 GiB                           | Per-user UTC-day budget; past it new streams are refused and open ones closed.                                                                           |
| `RMHOS_NET_MAX_DESTINATIONS_PER_10MIN`                | hub           | `300`                           | Scan brake: distinct (address, port) pairs one user may open per sliding 10 minutes; further new destinations are closed `throttled`. Repeats of a known destination do not count. |
| `RMHOS_NET_MAX_SESSIONS`                              | hub           | `200`                           | Concurrent relay sessions on the hub. The next one is closed with WebSocket code 4009 and `GET /rmhos-net/status` says `full: true`. A user replacing their own session is not counted twice. |
| `RMHOS_NET_GLOBAL_BYTES_PER_SECOND`                   | hub           | 20 MiB                          | One token bucket shared by every user, on top of the per-user one.                                                                                       |
| `RMHOS_NET_GLOBAL_BYTES_PER_DAY`                      | hub           | 100 GiB                         | Hub-wide UTC-day budget. When it is spent every stream is closed `throttled` and new CONNECTs are refused until UTC midnight.                           |
| `RMHOS_NET_DENY_USERS`                                | hub           | empty                           | Comma-separated user ids refused at start (a restart is needed to change it). Prefer the file below.                                                     |
| `RMHOS_NET_DENY_FILE`                                 | hub           | `/deny/users.txt` in compose    | File of user ids (one per line, `#` comments) re-read on SIGHUP and every 60 s. Compose mounts `deploy/rmhos-net/deny/` read-only at `/deny`. A denied user's live session is closed with 4003 and new tickets get 403. See [Cut off one user](#cut-off-one-user). |
| `RMHOS_NET_DOH_UPSTREAM`                              | hub           | `https://1.1.1.1/dns-query`     | The one DoH resolver the hub forwards guest DNS to. Must be https; its address is policy-checked like any destination.                                   |
| `RMHOS_NET_CORS_ORIGIN`                               | hub           | empty                           | Allowed origin when the page and the hub are on different origins (dev only).                                                                            |
| `VITE_RMHOS_NET_URL`                                  | web (runtime) | the site origin + `/rmhos-net/` | Dev only. Read by the session API at runtime (not at build) and wins over everything: leave it unset in production. Otherwise `BETTER_AUTH_URL`'s origin with the scheme swapped to ws(s). |
| `PORT_RMHOS_NET`                                      | `deploy.sh`   | `7009`                          | Loopback port the deploy health-checks.                                                                                                                  |
| `RMHOS_EGRESS_IPV6_SUBNET` | `deploy/rmhos-net/egress-firewall.sh` | unset | IPv6 prefix of the `rmhos-egress` network when Docker IPv6 is on there; the firewall then drops its private ranges too. The compose network pins `enable_ipv6: false`. |
| `RMHOS_EGRESS_SNAT_TO` | `deploy/rmhos-net/egress-firewall.sh` | unset | Public IPv4 to source relay traffic from instead of the host's main address (needs a second address on the host); see [Whose address](#whose-address-and-what-the-logs-are-for). |
| `RMHOS_SMOKE_CASES`, `RMHOS_SMOKE_CMDLINE_EXTRA`, `RMHOS_SMOKE_VERBOSE`, `RMHOS_SMOKE_BIG` | `pnpm rmhos:smoke` | all seven cases, none, off, off | Run a subset (`3,4`), append to the cold boot's kernel command line, echo serial0, add the 100 MB home case. |
| `RMHOS_BUILD_CA_BUNDLE`, `RMHOS_OUT_DIR`, `RMHOS_DIR` | image scripts | see `scripts/rmhos/*.sh`        | Extra CA for the build, output directory, and image directory for the smoke test.                                                                        |

## The relay policy

The relay is on unless `RMHOS_NET_ENABLED=0`, and needs `RMHOS_NET_TICKET_SECRET`. It never forwards for an anonymous
visitor (no valid ticket, no socket). For a signed-in user:

- **TCP only.** Ports: every port except the deny-list (default 25, 465, 587, 2525), or, when
  `RMHOS_NET_ALLOWED_PORTS` is set, only those. UDP is closed; DNS goes through DoH. See
  [Decisions to make before enabling](#decisions-to-make-before-enabling) for the profiles and what each breaks.
- **Public addresses only.** Literal addresses and every address a name resolves to must be public: loopback,
  private, link-local, CGNAT, multicast, metadata (169.254.169.254) and IPv6 equivalents are refused with close reason
  `blocked`; a name that resolves to a mix is refused (rebinding). `server/rmhos-net/private-ip.ts` is its own copy of
  the address test, so the hub bundle carries no site code.
- **Caps per user:** 64 streams per connection, 30 CONNECTs per 10 s, 8 concurrent lookups, bytes per second and per
  day as above, at most 300 distinct (address, port) destinations per sliding 10 minutes (the scan brake: further new
  destinations are closed `throttled`), bounded queues in both directions (a client that ignores flow-control credit is
  closed, one that respects it is paused).
- **Caps for the whole hub:** at most 200 concurrent sessions (the 201st is closed with 4009 and the status says
  `full`), a shared 20 MiB/s bucket, and a shared 100 GiB per UTC day (spent: every stream is closed and new CONNECTs
  refused until UTC midnight). All tunable, see the table.
- **Who:** `RMHOS_NET_ACCESS` (all, members, verified) and a minimum account age are enforced where the database is, in
  `/api/rmhos/session`, which also refuses a ticket to a suspended or banned account. An account that does not
  qualify gets `net: { enabled: false, reason: 'not-eligible' }` and the page says why.
- **Memory bounds** (the container has 256 MB and restart policy `no`): the largest Wisp frame accepted is 64 KiB (v86
  sends frames of at most the guest MTU, 1500 bytes; larger ones close the socket with 1009). A connection holds at most
  about **21 MiB**. Guest to remote: the accounted queue (1 MiB per stream, 8 MiB per connection, then the connection is
  closed with 4008) + up to 64 KiB in each of 64 upstream socket write buffers (a write never takes a buffer past that
  mark). Remote to guest: one 64 KiB chunk per stream waiting for the WebSocket + what a paused upstream socket still
  holds readable (about one more 64 KiB per stream) + the WebSocket's send buffer (1 MiB mark: when
  `ws.bufferedAmount` is over it the connection's upstream sockets are paused and retried every 100 ms; that already
  existed). Kernel socket buffers are outside the count.
  **Process-wide backstop:** a 250 ms timer (only; data events merely mark the hub "dirty", so a quiet hub does not walk
  its streams) sums all of that for every live connection, and while the total is over **48 MiB** it closes the
  **strictly heaviest** connection with 4008. There is no cleverer victim rule on purpose: preferring a connection
  by how it behaved (who grew last, who is quiet) can be steered by an attacker holding several connections just under a
  legitimate one. An exact tie sheds the newest connection. Arithmetic, which does not assume the V8 heap stays small:
  the container has 256 MiB (`mem_limit`); the compose command caps the heap at 128 MiB (`--max-old-space-size=128`);
  the counted buffers are Buffers, outside the heap, and understate RSS (small frames pin pooled 8 KiB slabs, kernel
  socket buffers are not counted); so 128 heap + 48 counted + about 30 for Node itself outside the heap leaves about
  50 MiB for kernel socket memory, slab overhead and what arrives between two checks (a user is metered at 2 MiB/s by
  default). 48 MiB is also two worst-case connections.
- **Switching it off:** see [Switch the relay off now](#switch-the-relay-off-now).

## Switch the relay off now

Stop the hub (sockets close at once; the toolbar shows "Network unavailable"; machines keep running), and stop the
recovery timer if you installed it, or it would start the hub again:

```bash
cd /home/rmhstudios/rmhstudios.com      # the checkout deploy.sh runs from (where the unit files point)
sudo systemctl disable --now rmhos-net-recover.timer 2>/dev/null || true
docker compose -p rmhstudios-prod --env-file .env.production --profile rmhos-net stop rmhos-net
```

To keep it off across deploys and make the page say "Network off" without ever opening a socket, also set
`RMHOS_NET_ENABLED=0` (or delete `RMHOS_NET_TICKET_SECRET`) in `.env.production` and let the **next deploy** pick it up.
Do not run `docker compose ... up -d web` for this: the web tier is deliberately outside compose (`deploy.sh` brings
everything up with `--scale web=0` and deploys web blue/green through `deploy/hotswap-web.sh`), and `up -d web`
recreates the container in place, the multi-second gap behind an earlier Cloudflare 520. Hand-running the hotswap
script is not documented here because it needs the environment `deploy.sh` exports. Until that deploy, with the hub
stopped the page still offers networking and the toolbar shows "Network unavailable". A deploy does not start the hub
while `RMHOS_NET_TICKET_SECRET` is missing; with only `RMHOS_NET_ENABLED=0` it starts the hub, which refuses every
connection with 503.

## Ticket lifecycle

A relay ticket is `userId.expiry.signature` (HMAC-SHA256, 60 s expiry), minted by `GET /api/rmhos/session`. v86 takes
its relay URL and DoH URL once, when the machine is built, and reuses them for the whole session (it reconnects the
WebSocket with the same URL every 10 s and sends every DNS query to the same DoH URL), so a bare 60 s ticket would
fail DNS after a minute and could never reconnect. The hub therefore keeps a per-server table of tickets it has seen
(`server/rmhos-net/tickets.ts`):

- A ticket must be **first presented** (WebSocket upgrade, DoH query or status request) within its 60 s. The page
  fetches the session just before it builds the machine, after the emulator module has loaded, and fetches again if
  more than about 45 s have passed (a slow state download, a cold-boot fallback).
- Once seen, a ticket is accepted again for reconnects and DNS while its signature verifies, it was used within the
  last **15 minutes** (a WebSocket upgrade, a DoH query, any relayed byte for that user and every answered ping
  refresh it) and it is less than **12 hours** old. Otherwise 401. **A status request does not count as use**: polling
  alone cannot keep a ticket alive.
- **A live socket ends with its ticket.** Whenever a ticket stops being valid (12 h reached, idle expiry, evicted by the
  table cap) the user's socket is closed with code **4001** and its streams are torn down: on the hub's ping interval
  (30 s) for age and idle, immediately for eviction. A connected tab answers pings, so in practice only the 12 h cap
  ends an open session. v86 then reconnects with the same URL and is refused; the next status poll gets 401, the toolbar
  shows "Network unavailable" and the page says "Your network session ended. Restart rmhOS to reconnect." Superseding by a
  newer ticket still closes the older socket with 4000.
- **One ticket per user:** presenting a newer ticket removes the older one and closes that user's older socket (close
  code 4000). An older ticket cannot displace a newer one.
- The table holds at most 10 000 tickets (the one idle longest goes first, and its socket is closed), is pruned every 10 minutes and lives only
  in the hub's memory: **restarting the hub invalidates every ticket**; a page then needs a reload (a new session
  request) to get network back. A deploy restarts the hub only when it changed, see
  [Deploys, and what ends users' sessions](#deploys-and-what-ends-users-sessions).
- **The ticket is a bearer credential for the life of the session.** Whoever holds it can spend that user's relay
  allowance (under that user's caps) until it ends (idle, 12 h, replaced). Where it can appear:
  - the relay WebSocket URL and the DoH URL (`?ticket=…`) on our own origin (or `VITE_RMHOS_NET_URL`), so in
    **Cloudflare's edge and access logs** (Cloudflare terminates TLS in front of Apache) and in whatever Cloudflare
    analytics keep request URLs;
  - **Apache's access log: no**, `/rmhos-net/` is logged with `combined_noquery` (no query string)
    (`deploy/apache/rmhstudios.conf`); but **Apache's ErrorLog** can echo the request URL on a proxy error (hub down, a
    refused upgrade), so treat the error log as sensitive;
  - the **browser's devtools network panel** and any browser extension that can read requests (the session response
    carries it too, `no-store`);
  - the hub never logs it, and it is never in server-rendered HTML (the session query is client-only and not
    dehydrated).
  It does **not** reach browser history (the URLs are made by script, as a WebSocket and `fetch` calls; no navigation
  ever loads them) and it does not appear in a `Referer` (a same-origin `fetch` sends the page URL `/rmhos`, a WebSocket
  handshake sends `Origin`, neither includes the request URL).
- `GET /rmhos-net/status?ticket=…` returns `{ connected, streams }` for that ticket's own user (same ticket check as
  DoH, but it does not refresh the ticket) and is limited to 12 requests per user per minute (429). The page polls it
  once when the desktop is ready and every 15 s while the tab is visible to drive the toolbar: `on`, `connecting`, or
  `error` (three failed polls in a row, 30 s disconnected, or an immediate 401). A 429 counts as no information and
  visibility changes trigger at most one extra poll per 5 s. With networking disabled the toolbar
  says "Network off" and nothing is polled or opened.
- DoH is limited by: the 16 queries in flight per user, a budget of 600 queries per user per minute (429), the same
  daily and per-second byte meter as relayed streams, 4 KiB per query, one fixed upstream.

## The sandbox

The hub dials the internet for strangers, so it is isolated from the rest of the VPS:

- **Container:** its own image entry (`dist-server/server/rmhos-net/index.cjs`, which bundles no Prisma and no Better
  Auth code), non-root `65534:65534`, `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, `pids_limit 256`,
  `mem_limit 256m`, `cpus 0.5`, `tmpfs /tmp`. It has no `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET` or S3 keys;
  its only secret is `RMHOS_NET_TICKET_SECRET`. It is the only member of the `rmhos-egress` Docker network, so it
  shares no network with any other service (IPv6 is pinned off on it: `enable_ipv6: false`). It publishes on loopback
  only; Apache maps `/rmhos-net/` to it. Its one mount is `deploy/rmhos-net/deny/`, read-only, at `/deny` (the
  deny-list); its log driver is journald.
  `server/rmhos-net/__tests__/compose-sandbox.test.ts` pins all of this.
- **Host firewall:** `deploy/rmhos-net/egress-firewall.sh` puts drops on the `DOCKER-USER` chain for packets from the
  `rmhos-egress` subnet to every private, loopback, link-local, CGNAT and metadata range and to the host itself, so
  the isolation holds even if the application check were bypassed. It needs root, and the CD deploy is sandboxed
  (no privilege), so the rules are installed **once, by the owner, as a systemd unit**:

  ```bash
  # on the VPS, as root; first edit ExecStart's repo path to where deploy.sh runs from
  sudo cp deploy/systemd/rmhos-net-firewall.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now rmhos-net-firewall.service
  systemctl status rmhos-net-firewall.service      # active (exited)
  sudo iptables -S RMHOS-EGRESS                    # the drop list
  ```

  The unit runs before `docker.service`, so the rules exist after a reboot before any container does. Re-run it
  (`systemctl restart`) after editing the script.

- **The deploy probe:** `deploy.sh` runs `deploy/rmhos-net/probe-firewall.sh`: a throwaway container on the
  `rmhos-egress` network makes three connections and **all three** must come out right: the *sentinel*
  `192.0.2.1:9` (TEST-NET-1, never routed) must be **refused**, which only the `REJECT --reject-with tcp-reset` rule
  that `egress-firewall.sh` puts first in `RMHOS-EGRESS` can do, and only for a packet that really travelled
  `FORWARD` to `DOCKER-USER` to `RMHOS-EGRESS`; a *control* (the same address, port 10, which falls through to the
  chain's drop) must **time out**, so a router or proxy that refuses everything cannot fake the sentinel; and the host's
  gateway must **time out** (the INPUT drop). A timeout alone proves nothing: any host with a default-drop INPUT
  policy (ufw) times out with none of our rules installed. `egress-firewall.sh` also fails loudly if `FORWARD` does not
  reach `DOCKER-USER` while Docker is running (Docker with `"iptables": false`, or an iptables front end Docker does not
  use). Only then does the deploy start the hub (compose profile `rmhos-net`, restart policy `no`). If the probe fails
  the deploy prints `rmhOS network relay NOT started: egress firewall not proven` with the install commands above,
  leaves the hub stopped and carries on; the site itself is unaffected. The same happens when
  `RMHOS_NET_TICKET_SECRET` is not in the env file or is under 32 characters. **Networking therefore stays off in
  production until the unit is installed and the secret is set.**
- **Re-proving while the hub runs:** because the restart policy is `no`, the hub stays down after a crash until it is
  brought back through the probe, and a firewall flushed under a running hub (a firewalld or `netfilter-persistent`
  reload, a manual `iptables -F`) must not leave it relaying. `deploy/rmhos-net/recover.sh` therefore **always runs the
  probe**: proof fails and the hub is running, it **stops the hub** and exits non-zero; proof fails and the hub is down,
  it stays down; proven and healthy, it does nothing (a running hub is never recreated); proven and down, it starts it.
  **Without a full deploy**, as the user that runs `deploy.sh`:

  ```bash
  cd /home/rmhstudios/rmhstudios.com
  bash deploy/rmhos-net/recover.sh
  ```

  To have this happen by itself, install the optional units (edit the paths and user first):
  `sudo cp deploy/systemd/rmhos-net-recover.{service,timer} /etc/systemd/system/ && sudo systemctl daemon-reload &&
  sudo systemctl enable --now rmhos-net-recover.timer`, then run it once by hand to see it work:
  `sudo systemctl start rmhos-net-recover.service; journalctl -u rmhos-net-recover -n 20`. It runs every two minutes.
  `docker-compose.yml` names the hub's container, network and image after `COMPOSE_PROJECT_NAME`; the deploy workflow
  sets it, and `recover.sh` and the probe default it to `PROJECT_NAME` (`rmhstudios-prod`) so a systemd run finds the
  same hub.
- **Health:** the hub answers `GET /health` (`/rmhos-net/health` through Apache); `deploy.sh` checks it. The Go `status` service does not watch it yet.

## Whose address, and what the logs are for

Traffic leaves from the VPS's own IP address, so abuse complaints and IP reputation land on us, and the same address
is the one the site uses for its own outbound calls (Stripe, Discord, OAuth). **Whether to accept that is an owner
decision.** The options:

1. **Accept it** (the default). The mitigations are the mail-port block, the byte, rate and scan limits, the per-day
   budget, the deny-list and the log below.
2. **A separate egress address.** Add a second public IPv4 to the host, then set `RMHOS_EGRESS_SNAT_TO=<that IPv4>` in
   `/etc/default/rmhos-net-firewall` (the firewall unit reads it) and `sudo systemctl restart
   rmhos-net-firewall.service`: relay traffic from the `rmhos-egress` subnet is source-NATed to it, before Docker's own
   masquerade rule. Complaints and blocklisting then land on that address, not on the one Cloudflare hides. IPv4 only;
   unset means off.
3. **A forward proxy somewhere else** that the hub dials through. Not implemented: the hub would need an HTTP
   CONNECT client in `relay.ts` and a policy for resolving through it.

The hub writes one JSON line on stdout per event. Compose sends them to **journald** with the tag `rmhos-net`
(`logging: driver: journald`, `tag: rmhos-net`), so the record survives the container being recreated (a deploy that
changes the hub) and `container prune`, which `json-file` logs do not. `docker compose logs rmhos-net` still works.
Every line has `t` (epoch milliseconds) and `ts` (the same instant as ISO text):

- `rmhos-net.session` `{ userId, state: "open" | "closed" | "refused", ip, code?, reason? }` for each relay socket.
  `ip` is the visitor's address from `CF-Connecting-IP`, then the first `X-Forwarded-For` hop, then the socket's own
  address: those headers are only trusted because the hub's port is published on `127.0.0.1` behind Apache and
  Cloudflare, and the comment on `clientIp` in `relay.ts` says the same. `refused` with `reason: "full"` is the session cap.
- `rmhos-net.stream` `{ state: "open" | "close", userId, host, address, port, localPort, ... }`. **Open** is logged
  when the upstream connection is established, so a stream that is still open at a crash, or hours long, has a record.
  `host` is what the guest sent (v86 sends IPs; a custom client can send a name), `address` the **resolved address
  actually dialled**, `localPort` the hub's own source port on that upstream socket (the usual disambiguator in an abuse
  report). **Close** adds `up`, `down` (bytes each way), `ms` and `reason`, the Wisp close reason (`voluntary`,
  `blocked`, `throttled`, `refused`, `timeout`, `unreachable`, `networkError`); blocked and throttled attempts are
  logged too (with no `address` when it was refused before dialling).
- `rmhos-net.deny` when a deny-list reload added users; `rmhos-net.listening` at start.

Retention is journald's: set `SystemMaxUse` (and, if you want a time limit, `MaxRetentionSec`) in
`/etc/systemd/journald.conf`, then `sudo systemctl restart systemd-journald`. One account scanning at the allowed rate
writes a few hundred thousand lines a day (order of 100 MB), so `SystemMaxUse=2G` keeps weeks of ordinary traffic and
days of a worst-case day-by-day abuser; the line rate per user is already capped by the scan brake. Reading the journal
needs root or membership of the `systemd-journal` group. If the VPS's Docker daemon cannot use journald (the container
then fails to start with `failed to initialize logging driver`, and the deploy says the hub did not start healthy), switch
the service to `driver: syslog` with `syslog-address: unixgram:///dev/log` and the same tag (journald or rsyslog
receives it; the queries below are unchanged), or to rsyslog writing `/var/log/rmhos-net.log`. journald was chosen
because the host already runs systemd units (`deploy/systemd/`), every other compose service's `json-file` log is
container-bound, and this one is the evidence. It could not be exercised in the development sandbox (no journald there).

### Queries

All three need `jq`; run them as root or in the `systemd-journal` group. `-o cat` prints just our JSON line.

```bash
# Who is online now (the last session event per user is "open"; sessions end after 12 h at most)
journalctl -t rmhos-net -o cat --since "13 hours ago" \
  | jq -r 'select(.evt=="rmhos-net.session") | [.userId,.state,.ip] | @tsv' \
  | awk -F'\t' '{s[$1]=$2; ip[$1]=$3} END{for(u in s) if(s[u]=="open") print u, ip[u]}'

# Every stream of one user today
journalctl -t rmhos-net -o cat --since today \
  | jq -c 'select(.evt=="rmhos-net.stream" and .userId=="USER_ID")'

# Who connected to address Y around time T (a complaint: Y is the remote, T is when it saw us)
journalctl -t rmhos-net -o cat --since "2026-11-14 13:55" --until "2026-11-14 14:10" \
  | jq -c 'select(.evt=="rmhos-net.stream" and .address=="Y")'
```

## Decisions to make before enabling

The mechanisms exist and are env-tunable; **the values are the owner's.** The defaults keep today's behaviour except
where noted.

| Decision | Switch | Default | Notes |
| -------- | ------ | ------- | ----- |
| Who gets the network | `RMHOS_NET_ACCESS` = `all` / `members` / `verified`, `RMHOS_NET_MIN_ACCOUNT_AGE_DAYS` | `all`, `0` | Accounts are cheap (email and password, or Discord/GitHub). `members` is a paid membership (`getUserTier` above `free`). `verified` needs `emailVerified`; verification only happens when a mail transport is configured, so check it works before choosing it. |
| Global capacity | `RMHOS_NET_MAX_SESSIONS`, `RMHOS_NET_GLOBAL_BYTES_PER_SECOND`, `RMHOS_NET_GLOBAL_BYTES_PER_DAY` | 200, 20 MiB/s, 100 GiB | The container has 256 MB and 0.5 CPU: raise the session cap only with the container's limits. Each byte crosses the VPS NIC twice. |
| Ports | `RMHOS_NET_DENIED_PORTS` or `RMHOS_NET_ALLOWED_PORTS` | deny `25,465,587,2525` | See the profiles below. |
| Scan brake | `RMHOS_NET_MAX_DESTINATIONS_PER_10MIN` | 300 | On by default. An honest browsing session opens tens of distinct destinations; a port scan opens thousands. |
| Whose address | `RMHOS_EGRESS_SNAT_TO` | off | See [Whose address](#whose-address-and-what-the-logs-are-for). |

Port profiles:

- **Default** (deny mail only): everything else works (SSH, git over ssh, IRC, databases, game servers). One account can
  brute force SSH, RDP or databases on third parties at the CONNECT rate (3 a second) and scan up to the brake.
- **Conservative: `RMHOS_NET_ALLOWED_PORTS=80,443`.** Only the web. Breaks `ssh`, `git@github.com:` clones (HTTPS clones
  work), IRC, FTP, databases, anything not on 80 or 443. The DoH upstream is exempt, so DNS keeps working.
- **Middle: the default deny-list plus `22,23,445,1433,3306,3389,5432,5900,6379,6667,27017`**
  (`RMHOS_NET_DENIED_PORTS=25,465,587,2525,22,23,445,1433,3306,3389,5432,5900,6379,6667,27017`). Blocks the usual
  brute-force and exposed-service targets while leaving the rest of the internet; breaks ssh, IRC, and database clients.

## Generate and rotate the ticket secret

`RMHOS_NET_TICKET_SECRET` signs and verifies relay tickets: at least **32 characters**; the web tier answers "network
off" and the hub exits with `RMHOS_NET_TICKET_SECRET must be at least 32 characters` for anything shorter, and the
deploy does not start the hub for an empty, quoted-empty or short value.

```bash
openssl rand -hex 32          # 64 hex characters: put it in .env.production as RMHOS_NET_TICKET_SECRET=<value>
```

It is in every `env_file` service's environment (the file is shared), but only the session API and the hub read it.
**Rotating** it ends every live network session, because every ticket in the hub's memory was signed with the old one.
Order: (1) edit `.env.production`; (2) **deploy** (a push to `main`, or re-run the Deploy workflow): the web tier
hot-swaps first and mints tickets with the new secret, and the hub step of the same deploy recreates the hub because the
secret is part of its fingerprint, a minute or two later (in that window a new ticket is refused by the old hub, and a
page reload fixes it); (3) users see "Your network session ended. Restart rmhOS to reconnect." and reload.

## Cut off one user

The hub has no database; it has a deny-list. To cut one account off **now**, on the VPS, in the checkout `deploy.sh`
runs from:

```bash
cd /home/rmhstudios/rmhstudios.com
echo USER_ID >> deploy/rmhos-net/deny/users.txt && chmod 644 deploy/rmhos-net/deny/users.txt   # the RMH account id (user.id)
docker compose -p rmhstudios-prod --env-file .env.production --profile rmhos-net kill -s SIGHUP rmhos-net   # re-read now (else within 60 s)
journalctl -t rmhos-net -o cat --since "5 min ago" | grep -E 'rmhos-net.deny|"state":"closed"'               # the deny line, then their socket closing
```

Their live session is closed with code 4003 (the page shows the network ended), new tickets get 403, and the entry
stays until you delete the line. Also suspend the account through the admin tools (a `bannedUntil` in the future):
`/api/rmhos/session` then mints them no ticket at all, and the page shows "Network off". Nobody else is affected and the
hub is not restarted. `RMHOS_NET_DENY_USERS` (comma-separated, read at start) is the same list in the environment; use the
file, since the environment needs a restart. Removing a line lifts the block at the next reload.

## Abuse complaint walkthrough

1. **Get the facts from the complaint:** the remote address (ours is the source: the VPS address, or
   `RMHOS_EGRESS_SNAT_TO` if set), the time with its time zone, and the remote port.
2. **Find the stream:**
   `journalctl -t rmhos-net -o cat --since "<T minus 10 min>" --until "<T plus 10 min>" | jq -c 'select(.evt=="rmhos-net.stream" and .address=="<ADDR>" and .port==<PORT>)'`.
   Match on `address` (the resolved address actually dialled) and, if the complaint has our source port, `localPort`.
   The `userId` on the line is the RMH account id (`user.id` in the database).
3. **Everything that user did:** the second query above, and their session lines for the client address (`ip`), to see
   whether other accounts share it (sock puppets).
4. **Cut them off** with [Cut off one user](#cut-off-one-user), and suspend the account through the admin tools.
5. **If it is wider than one account**, stop the relay for everyone with [Switch the relay off now](#switch-the-relay-off-now),
   and decide the policies in [Decisions to make before enabling](#decisions-to-make-before-enabling) before turning it
   back on.
6. The logs carry no payloads. Keep them for as long as your retention policy for operational logs says, and no longer
   (journald's `SystemMaxUse` and `MaxRetentionSec`).

## Deploys, and what ends users' sessions

The hub keeps tickets and meters in memory, so **any restart of the hub ends every user's network session** (they see
"Your network session ended. Restart rmhOS to reconnect." and reload), and resets every user's daily byte meter and
rate windows. Because the image tag moves on every push, compose would recreate the hub on every deploy. `deploy.sh`
therefore recreates it **only when what it runs changed**: a fingerprint of the hub bundle and the `ws` it loads (in the new
image), the Node version, and the hub's resolved compose configuration (every `RMHOS_NET_*` value, the secret included) is
stamped on the container as the label `rmhos.hub-fingerprint`. The deploy log says one of:

- `rmhOS relay hub unchanged (...); left running, network sessions are not interrupted`: nothing it runs changed, the
  probe still passed and `/health` answers.
- `rmhOS relay hub (re)started ... Users' network sessions ended`: it changed (or was down), so it was recreated.
- `rmhOS network relay NOT started`: the probe failed (a running hub is stopped, changed or not).

So **a deploy that changes `server/rmhos-net/`, `features/rmhos/engine/constants.ts`, `net-ticket.server.ts`, the compose
service or a `RMHOS_NET_*` value ends every network session**; do those at a quiet hour. A deploy that changes only the
page or the rest of the site does not.

## Roll back an image

Revert the commit that pinned the new image (`git revert <sha>` of the commit that edited `PUBLISHED_IMAGE` in
`features/rmhos/engine/image-manifest.ts`; if it also flipped the catalog, that comes back too) and push to `main`: the
deploy ships the old pin. It takes a deploy, not a CDN change. **Do not delete old versions from R2**: a tab runs the
version it loaded until it reloads, and a rollback needs the old one present. Keep every published version at least a
week after it was last pinned, and never delete the pinned one or the one before it. A home saved by a newer image
restores on an older one as long as the home archive format (a tar of the home folder) is unchanged, which it has been
by design.

## Image refresh dates

**Alpine 3.22 reaches end of support in May 2027.** Before then, bump `ALPINE_VERSION`, the minirootfs version and sha256 in
`scripts/rmhos/versions.env` and the pinned base-image digest in `scripts/rmhos/Dockerfile`, rebuild and publish
(and check `packages.list`: package names change between releases). The kernel (`6.12.y`) should be bumped to the
newest `6.12` release at the same time for security fixes (`KERNEL_VERSION` and `KERNEL_SHA256` from kernel.org's
`sha256sums.asc`; `features/rmhos/ui/about-facts.ts` and `NOTICE.md` must say the same version:
`features/rmhos/__tests__/image-versions.test.ts` fails until they do).

## Verifying the firewall

By hand on the VPS, after installing the unit: `sudo iptables -S RMHOS-EGRESS` (the sentinel `REJECT` line is first after the
established-accept), `sudo iptables -S FORWARD | grep DOCKER-USER` (it must show the jump), `sudo iptables -S DOCKER-USER`
(`-s 172.31.86.0/24 -j RMHOS-EGRESS` first) and `sudo ufw status` if ufw is installed. Then `bash deploy/rmhos-net/probe-firewall.sh`
as the deploy user. The real script and probe were run in the development sandbox (root, nf_tables, a Docker daemon, a
scratch compose project with `node:24-alpine` tagged as the app image, `iptables-save` restored exactly afterwards):
no rules gave "not proven" (control answered), our rules gave "proven" (sentinel refused, control and gateway timed out), and a
host with a default-drop INPUT rule for the subnet but **without** our chain gave "not proven". That sandbox
answers every forwarded connection itself, which is why the control exists: it is what makes the proof independent of
the network in front of the host.

## The home folder

The home folder lives **in the browser only**: an archive in IndexedDB on that device, saved every 5 minutes and on the
Save button (and offered at unload). No server has a copy, there is no quota beyond the 128 MB home tmpfs and the
browser's own storage limit, and files do not follow the account to another device. **Clearing site data deletes it.**
A private window or a browser that blocks storage keeps files for the page's lifetime only (the toolbar says so).
Everything outside the home folder resets on every boot. Tell users to use Download backup (a `.tar.gz`) before they
clear site data or switch browsers, and Restore backup to bring one back; the toolbar offers both.

**Sizes and times** (smoke case 10, `RMHOS_SMOKE_BIG=1`, a 96 MiB home of 5016 files, 16 of them 5 MiB, in the headless
emulator on a 4-core sandbox): RESTORE answers in about 8 s and SAVE in about 38 s (SAVE is the slow one because the
desktop is running and the emulated CPU is shared). The host's timeouts are 120 s each, so a full 128 MB home fits on a
machine like that with room to spare, and a phone several times slower would not; a timeout shows the "handshake" screen
(restore) or "not saved" (save) and the data in IndexedDB stays safe. The RESTORE path reads the archive once. GNU tar
exits 1 when a file changed while it was read, which is normal with a desktop writing in the home; the agent treats exit
1 as saved and only exit 2 as "not saved".

## Licence obligations and where each is met

| Obligation                                                                                    | Where it is met                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Linux (GPL-2.0): corresponding source and the licence stated; no source tree committed        | The About dialog and `features/rmhos/NOTICE.md` name the licence and link the exact upstream tarball (`linux-6.12.117.tar.xz`) with its sha256, and **the same tarball is published beside the image** (`rmhos/<version>/linux-6.12.117.tar.xz`, in the manifest, not a boot input); our `kernel.config` and `patches/` are in `scripts/rmhos/`; the build downloads the tarball and refuses a hash mismatch; `manifest.json` and the `packages.txt` header record the commit that built the image; `pnpm rmhos:image` rebuilds the shipped kernel. |
| Alpine userland (mostly MIT, BSD, GPL, LGPL): list of what is shipped, its licences, and the source | `packages.txt` and `apk-installed.txt` (Alpine's package database: per package version, licence `L:`, checksum `C:`, origin `o:`) are generated by the build and published beside the image; `NOTICE.md` has a **written offer** (three years, through the repository issue tracker or the contact address in the site Terms, section 12) for the corresponding source at the exact listed versions, because Alpine mirrors replace package versions in place, and a third-party licences section. |
| SeaBIOS (LGPL-3.0)                                                                            | Stated in About and `NOTICE.md`; the BIOS files come from Alpine's `seabios-bin` and `seavgabios-bin` packages, listed in `packages.txt`.                                                                                                                                                                                |
| v86 (BSD-2-Clause): keep the copyright notice and licence                                     | Stated in About and `NOTICE.md` with a link; the npm package carries its own licence file.                                                                                                                                                                                                                               |
| "Linux" used descriptively, not as the product name                                           | The product is rmhOS; the copy says "built on the Linux kernel". `uname -r` ends in `-rmhos`.                                                                                                                                                                                                                            |
| No third-party logos in the app or its art                                                    | The boot logo is our own monogram (no mascot). The three catalog images in `public/images/games/` are flat placeholders, made by hand: no generator in the repo produces app card art generically (`scripts/game-art/rmhmusic.mjs` is RMH Music's own); replace them with real art before launch.                        |

A test keeps the About dialog's facts equal to `NOTICE.md` (`features/rmhos/ui/__tests__/about-facts.test.ts`).

## Tests

- Hub: `pnpm exec vitest run server/rmhos-net` (policy, Wisp, meter, relay integration, limits, ticket book, ticket
  lifecycle on a live hub with an injected clock, status endpoint, sandbox pins, "imports nothing from the site").
- Page and engine: `pnpm exec vitest run features/rmhos`.
- Image: `pnpm rmhos:smoke` (cases 1 to 9; `RMHOS_SMOKE_BIG=1` adds case 10, a 100 MB home timed for RESTORE and SAVE),
  `pnpm rmhos:selftest`; the publish scripts and workflow: `pnpm exec vitest run features/rmhos/__tests__`.
- Deploy and firewall scripts: `pnpm exec vitest run deploy/__tests__ lib/__tests__/deploy-orchestration.test.ts`.
- End to end through the real hub: `testing/e2e/rmhos-net.mjs` (see its header; needs a built image, Chromium, Docker
  Postgres for sign-in and a TLS front).
