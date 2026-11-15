# rmhOS

rmhOS is a full-screen app at `/rmhos` that boots a real Linux desktop (a 32-bit x86 machine, IceWM on Alpine Linux)
inside the visitor's browser tab. It runs in an emulator ([v86](https://github.com/copy/v86), WebAssembly) on the
visitor's own device: the site serves files, signs people in and relays their network traffic, and it never runs a
visitor's code on a server. The design and its owner decisions are in
[`superpowers/specs/2026-11-14-rmhos-design.md`](superpowers/specs/2026-11-14-rmhos-design.md) (its "Owner amendments"
section wins over the text under it); this page is the runbook.

> **State of play.** Networking is **off in production** until two things exist: the egress firewall unit is
> installed on the VPS (see [The sandbox](#the-sandbox)) **and** `RMHOS_NET_TICKET_SECRET` is set in the production env
> file. The page itself **cannot boot** until an image has been published and its manifest committed (see
> [Publish a new image version](#publish-a-new-image-version)). Until then the catalog card says "Coming soon":
> `features/rmhos/catalog.ts` has `status: 'Coming soon'`, and it must go back to `'Beta'` in the same commit that pins
> the first published image (regenerate the catalog snapshot with
> `pnpm exec vitest run lib/__tests__/catalog-contract.test.ts -u`, and `pnpm docs:site` for the site reference).

## The three moving parts

| Part          | Where                                                                                              | What it does                                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The page      | `features/rmhos/` (`engine/`, `ui/`, `api/`), route `app/routes/rmhos.tsx`                         | Downloads the image, runs v86, hands the guest the visitor's identity over a serial line, keeps the home folder in IndexedDB, shows the toolbar. `GET /api/rmhos/session` returns the Linux user name and a relay ticket. |
| The image     | `scripts/rmhos/` (kernel config, patches, rootfs overlay, Dockerfile), published to R2/CDN         | A reproducible kernel + root filesystem + BIOS files + a post-boot snapshot (`state.zst`) so a session starts in about 3 s instead of about 15 to 30 s.                                                                   |
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
package list change.

1. Run the **`rmhos-image`** workflow (`.github/workflows/rmhos-image.yml`, manual). It builds the image, boots it
   headless, writes the snapshot and `manifest.json` (its `version` is a hash over every boot input including the
   snapshot, so a new image is a new path and an old page never mixes files from two builds), and uploads to R2 under
   `rmhos/<version>/` (immutable). It needs the repository secrets `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`,
   `S3_SECRET_ACCESS_KEY` and `S3_BUCKET`; they are given to the publish step only.
2. Paste the printed manifest values (version, and size and sha256 of `bzImage`, `rootfs.ext4`, `state.zst`,
   `seabios.bin`, `vgabios.bin`) into `PINNED_IMAGE` in `features/rmhos/engine/image-manifest.ts`.
3. Commit. Until this commit deploys, the site keeps booting the previous version.

The page cannot boot at all until an image version has been published and pinned.

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

- **TCP only**, any port except the deny-list (25, 465, 587, 2525). UDP is closed; DNS goes through DoH.
- **Public addresses only.** Literal addresses and every address a name resolves to must be public: loopback,
  private, link-local, CGNAT, multicast, metadata (169.254.169.254) and IPv6 equivalents are refused with close reason
  `blocked`; a name that resolves to a mix is refused (rebinding). `server/rmhos-net/private-ip.ts` is its own copy of
  the address test, so the hub bundle carries no site code.
- **Caps:** 64 streams per connection, 30 CONNECTs per user per 10 s, 8 concurrent lookups, bytes per second and per
  day as above, bounded queues in both directions (a client that ignores flow-control credit is closed, one that
  respects it is paused).
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
  request) to get network back.
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
  shares no network with any other service. It publishes on loopback only; Apache maps `/rmhos-net/` to it.
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
  `rmhos-egress` network must **time out** (not connect, not be refused) connecting to the host's gateway. Only then
  does it start the hub (compose profile `rmhos-net`, restart policy `no`). If the probe fails the deploy prints
  `rmhOS network relay NOT started: egress firewall not proven` with the install commands above, leaves the hub stopped
  and carries on; the site itself is unaffected. The same happens when `RMHOS_NET_TICKET_SECRET` is not in the env
  file. **Networking therefore stays off in production until the unit is installed and `RMHOS_NET_TICKET_SECRET` is
  set.** Because the restart policy is `no`, the hub stays down after a crash until it is brought back through the probe.
  **Without a full deploy**, as the user that runs `deploy.sh`:

  ```bash
  cd /home/rmhstudios/rmhstudios.com
  bash deploy/rmhos-net/recover.sh     # hub healthy: nothing; else probe the firewall, and only then `compose up -d`
  ```

  which is the same as `ENV_FILE=.env.production PROJECT_NAME=rmhstudios-prod bash deploy/rmhos-net/probe-firewall.sh &&
  docker compose -p rmhstudios-prod --env-file .env.production --profile rmhos-net up -d --no-build rmhos-net`. To have
  this happen by itself after a crash, install the optional units (edit the paths and user first):
  `sudo cp deploy/systemd/rmhos-net-recover.{service,timer} /etc/systemd/system/ && sudo systemctl daemon-reload &&
  sudo systemctl enable --now rmhos-net-recover.timer`. It runs the same script every two minutes, so the hub only ever
  starts behind a proven firewall and only while `RMHOS_NET_TICKET_SECRET` is set.
- **Health:** the hub answers `GET /health` (`/rmhos-net/health` through Apache); `deploy.sh` checks it. The Go `status` service does not watch it yet.

## Whose address, and what the logs are for

Traffic leaves from the VPS's own IP address, so abuse complaints and IP reputation land on us. The mitigations are the
mail-port block, the byte and rate caps, the per-day budget and the stream log. The hub writes one JSON line on stdout
per event (`docker compose -p rmhstudios-prod --env-file .env.production --profile rmhos-net logs rmhos-net`, run in the checkout):

- `rmhos-net.session` `{ userId, state: "open" | "closed" }` for each relay socket.
- `rmhos-net.stream` `{ userId, host, port, up, down, ms, reason }` for each stream when it ends. `host` is the address
  v86 dialled (it resolves names itself through DoH; the log has no DNS query text). `reason` is the Wisp close reason
  (`voluntary`, `blocked`, `throttled`, `refused`, `timeout`, `unreachable`, `networkError`).

**Abuse report procedure.** From the complaint take the time and the remote address (the VPS is the source), find the
`rmhos-net.stream` lines for that address and port in the window, and read the `userId`. That is the RMH account id
(`user.id` in the database): look the account up, then suspend it through the normal admin tools. To cut the relay for
everyone while you investigate, set `RMHOS_NET_ENABLED=0` and restart, or stop the hub container. The logs carry no
payloads. Keep them for as long as your retention policy for operational logs says, and no longer.

## The home folder

The home folder lives **in the browser only**: an archive in IndexedDB on that device, saved every 5 minutes and on the
Save button (and offered at unload). No server has a copy, there is no quota beyond the 128 MB home tmpfs and the
browser's own storage limit, and files do not follow the account to another device. **Clearing site data deletes it.**
A private window or a browser that blocks storage keeps files for the page's lifetime only (the toolbar says so).
Everything outside the home folder resets on every boot. Tell users to use Download backup (a `.tar.gz`) before they
clear site data or switch browsers, and Restore backup to bring one back; the toolbar offers both.

## Licence obligations and where each is met

| Obligation                                                                                    | Where it is met                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Linux (GPL-2.0): corresponding source and the licence stated; no source tree committed        | The About dialog and `features/rmhos/NOTICE.md` name the licence and link the exact upstream tarball (`linux-6.12.117.tar.xz`) with its sha256; our `kernel.config` and `patches/` are in `scripts/rmhos/`; the build downloads the tarball and refuses a hash mismatch; `pnpm rmhos:image` rebuilds the shipped kernel. |
| Alpine userland (mostly MIT, BSD, GPL, LGPL): list of what is shipped and where its source is | `packages.txt` is generated by the build and published beside the image (linked from About); `NOTICE.md` points to the Alpine package index and mirrors.                                                                                                                                                                 |
| SeaBIOS (LGPL-3.0)                                                                            | Stated in About and `NOTICE.md`; the BIOS files come from Alpine's `seabios-bin` and `seavgabios-bin` packages, listed in `packages.txt`.                                                                                                                                                                                |
| v86 (BSD-2-Clause): keep the copyright notice and licence                                     | Stated in About and `NOTICE.md` with a link; the npm package carries its own licence file.                                                                                                                                                                                                                               |
| "Linux" used descriptively, not as the product name                                           | The product is rmhOS; the copy says "built on the Linux kernel". `uname -r` ends in `-rmhos`.                                                                                                                                                                                                                            |
| No third-party logos in the app or its art                                                    | The boot logo is our own monogram (no mascot). The three catalog images in `public/images/games/` are flat placeholders, made by hand: no generator in the repo produces app card art generically (`scripts/game-art/rmhmusic.mjs` is RMH Music's own); replace them with real art before launch.                        |

A test keeps the About dialog's facts equal to `NOTICE.md` (`features/rmhos/ui/__tests__/about-facts.test.ts`).

## Tests

- Hub: `pnpm exec vitest run server/rmhos-net` (policy, Wisp, meter, relay integration, limits, ticket book, ticket
  lifecycle on a live hub with an injected clock, status endpoint, sandbox pins, "imports nothing from the site").
- Page and engine: `pnpm exec vitest run features/rmhos`.
- Image: `pnpm rmhos:smoke`, `pnpm rmhos:selftest`.
- End to end through the real hub: `testing/e2e/rmhos-net.mjs` (see its header; needs a built image, Chromium, Docker
  Postgres for sign-in and a TLS front).
