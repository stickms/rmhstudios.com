# rmhOS — design

Date: 2026-11-14. Status: approach chosen by the owner; the detailed calls below marked **(call)** are the author's and
are open to correction.

## Owner amendments, 2026-11-14 (these override the text below)

The owner reviewed the plan and changed three things; a fourth (the ticket lifecycle) was fixed on the controller's
ruling while the network was first tried end to end.

1. **The home folder is stored in the browser only.** No server copy, no `RmhosHome` table, no S3 object, no upload or
   download endpoint, no quota, no two-device conflict. The archive lives in IndexedDB on the device; files do not
   follow the account to another device. The only limit is the 128 MB home tmpfs and the browser's own storage quota (a
   failed write shows "Browser storage is full").
2. **Internet is on by default and wider.** `RMHOS_NET_ENABLED` defaults to on (`0` switches it off). Every TCP port is
   allowed except a deny-list: 25, 465, 587, 2525 (mail submission and relay). UDP stays closed apart from DNS, which is
   still DoH through the hub.
3. **The relay is fully sandboxed from the rest of the VPS.** It must not be able to reach, read or affect anything else
   we run:
   - its own container, on its own Docker network (`rmhos-egress`) that no other service joins; it is not on the
     `common` network and has no `DATABASE_URL`, no `REDIS_URL`, no `BETTER_AUTH_SECRET`, no S3 keys;
   - its only secret is `RMHOS_NET_TICKET_SECRET`, a key used for nothing else, shared with the web tier to sign tickets
     (without it the web tier reports networking off and the hub refuses to start);
   - `user: "65534:65534"`, `read_only: true`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`,
     `pids_limit: 256`, `mem_limit: 256m`, `cpus: 0.5`, `tmpfs: /tmp`;
   - a host firewall rule set (`deploy/rmhos-net/egress-firewall.sh`, installed once by the owner as the root systemd
     unit `deploy/systemd/rmhos-net-firewall.service`; `deploy.sh` cannot take privilege, so it only probes from a
     throwaway container and starts the hub when the drop is proven) on the `DOCKER-USER` chain that drops packets from
     the `rmhos-egress` subnet to every private, loopback, link-local, CGNAT and metadata range and to the host itself,
     so the block holds even if the application check is bypassed;
   - the application-level address check stays (defence in depth);
   - the hub imports nothing from `lib/` except pure modules: the private- address test is copied into
     `server/rmhos-net/private-ip.ts` with its own tests so the hub bundle carries no site code. What this does not
     solve: traffic still leaves from the VPS's IP address, so abuse complaints and IP reputation land on us. The rate
     and volume caps, the mail-port block and the per-user stream log are the mitigation; moving egress to a separate
     address is a later, optional step.

4. **Relay ticket lifecycle (controller ruling, Task 10).** The first design had a 60 s ticket baked into the relay URL
   and the DoH URL when the machine starts. v86 reuses those URLs for its whole life: it reconnects the WebSocket with
   the same URL every 10 s and sends every DNS query to the same DoH URL. DNS therefore returned 401 about a minute into
   a session and a dropped socket could never reconnect. The hub now treats a ticket as a session credential:
   - A ticket is still an HMAC over `userId.expiry` (60 s) and must be FIRST presented, on a WebSocket upgrade, a DoH
     query or a status request, within that window. The hub then records it in a per-server table
     (`server/rmhos-net/tickets.ts`).
   - A recorded ticket is accepted again, for WebSocket reconnects, DoH and status, after its 60 s are up, while its
     signature verifies, it was used within the last 15 minutes (sliding: a WebSocket upgrade, a DoH query, any relayed
     stream activity for that user and every answered ping refresh it; a status request does not) and it is under 12
     hours old (hard cap). Otherwise 401.
   - A live socket ends with its ticket: when a ticket stops being valid for any reason other than a newer ticket (12 h
     reached, idle expiry, evicted by the table cap) the user's socket is closed with code 4001 and its streams torn
     down, within one ping interval (30 s) for age and idle and at once for eviction. The page learns from the status
     endpoint's 401: toolbar "Network unavailable" and a notice to restart rmhOS.

   - One live ticket per user: first presenting a newer ticket removes the older one and closes that user's older socket
     with code 4000. An older ticket cannot displace a newer one.
   - The table is per `createRelayServer` instance, capped at 10 000 entries (the oldest `lastSeen` goes first) and
     pruned on the hub's prune interval. The DoH in-flight counter is per instance too.
   - The page asks for the session (and so the ticket) when `createVm` has loaded the emulator and is about to build the
     machine, not at page load, and again before a cold-boot rebuild if the first ticket is more than 45 s old. It adds
     no reconnection logic: v86's own reconnect is enough.
   - **The ticket is a bearer credential for the life of the session** (up to 12 h while used). It appears in the relay
     WebSocket URL and the DoH URL, both on our own origin (or `VITE_RMHOS_NET_URL`); Apache logs `/rmhos-net/` requests
     without the query string (`combined_noquery`), the hub never logs it, and it is never in server-rendered HTML (the
     session query is client-only, `no-store`, not dehydrated). Anyone who copies it can use that user's relay
     allowance, under that user's caps, until it goes idle; a restart of the hub invalidates every recorded ticket (a
     page then needs a reload for a new one).
5. **Network status in the toolbar.** v86 reports no connection event, so the hub answers
   `GET /rmhos-net/status?ticket=…` with `{ connected, streams }` for that ticket's user only (same ticket check as DoH,
   but it never refreshes the ticket, and it is limited to 12 requests per user per minute; DoH has its own budget of
   600 per minute). The page asks once when the desktop is ready and every 15 s while the tab is visible: `off` when the
   session says networking is disabled; `on` while the hub says connected; `error` after three failed polls in a row or
   30 s of `connected: false`; `connecting` otherwise.

## Intent

A signed-in visitor opens `/rmhOS` and gets a real Linux machine, branded rmhOS, running inside the browser tab: a
graphical desktop, internet access, and a home folder that follows their RMH account across devices. They are logged in
to the machine as their RMH identity.

## What the owner decided

- A full-screen app at `/rmhOS`.
- A real Linux kernel, rebranded rmhOS ("fully clone Linux").
- Graphical desktop, internet access, persistent files.
- The RMH login is the Linux user.
- Approach A: an emulator in the visitor's browser (not VMs on our server, not a proprietary engine).
- Implementation is done by Sonnet subagents, after a written plan.

## Goals

1. `/rmhOS` boots to a usable desktop in under 15 s on a desktop-class device with a warm cache, under 45 s cold.
2. The shell prompt and home folder carry the visitor's RMH handle.
3. Files in the home folder survive a reload and appear on another device.
4. `curl https://example.com` works inside the machine when networking is on.
5. The kernel and system identify as rmhOS (`uname -r`, `/etc/os-release`, hostname, boot text).
6. We comply with the GPL: everything needed to rebuild the kernel we ship is in the repo or linked from the app.

## Non-goals

- 64-bit guests, GPU acceleration, sound, USB.
- A good experience on phones (it loads; a notice says a keyboard is needed).
- Running a modern web browser inside the guest at usable speed.
- Sharing a machine between users, or multiplayer.
- Persisting anything outside the home folder. The system resets every boot.

## Anti-goals

- **No Linux source tree in this repository.** Not as a clone, submodule or subtree. The kernel is 1.5 GB as a snapshot;
  the browser needs only a ~10 MB built image. We pin a version and keep our config and patches.
- **No open proxy.** The relay never forwards for an anonymous visitor, never reaches a private address, and can be
  switched off without a deploy.
- **No server-side execution of user code.** The machine runs on the visitor's device only.
- No Steel site-tier styling inside the app, and no app styling leaking out: this is a full-screen app on the `--app-*`
  contract (plan rule L8).

## Approaches considered

|                    | A. In-browser emulator (chosen) | B. VMs on our server                          | C. CheerpX/WebVM       |
| ------------------ | ------------------------------- | --------------------------------------------- | ---------------------- |
| Runs a real kernel | yes                             | yes                                           | no (syscall emulation) |
| Cost per session   | CDN bytes only                  | RAM and CPU on the VPS                        | CDN bytes only         |
| Speed              | slow                            | native                                        | medium                 |
| Licence            | BSD-2 (v86) + GPL-2 guest       | open                                          | proprietary, paid      |
| Risk               | relay abuse                     | strangers' root shells on the production host | vendor                 |

A was picked: it is the only one that is a real kernel, costs nothing per user and keeps untrusted code off the server.

## Architecture

```
browser tab (/rmhos)                                   server
┌──────────────────────────────────────────┐
│ RmhosShell (AppShell, --app-* palette)   │   GET /api/rmhos/session ──► web SSR
│  ├─ BootScreen / Toolbar / Screen        │   GET/PUT /api/rmhos/home ─► web SSR ─► S3/R2
│  └─ engine/                              │
│      vm.ts        v86 wrapper            │   wss /rmhos-net/ ─────────► rmhos-net hub (7009)
│      agent.ts     serial protocol        │        Wisp streams            └─► internet (filtered)
│      home-sync.ts archive ⇄ IDB ⇄ API    │   POST /rmhos-net/dns-query ─► hub ─► upstream DoH
│                                          │
│  v86 (WASM) ── bzImage + rootfs + state ◄┼── CDN: /rmhos/<imageVersion>/…
└──────────────────────────────────────────┘
```

### 1. The machine

- **Emulator:** npm `v86` pinned at `0.5.473` (BSD-2-Clause). It needs no `SharedArrayBuffer`, so no COOP/COEP headers
  are added. The CSP already has `'wasm-unsafe-eval'` and `worker-src 'self' blob:`.
- **Guest:** 32-bit x86. **(call)** 640 MB RAM, 8 MB VGA memory, 1024×768×32.
- **Kernel:** upstream Linux `6.12.y` LTS (the exact `y` and its sha256 are recorded in `scripts/rmhos/versions.env`
  when the image is first built), built for i386 from `kernel.org` with our config fragment and patches:
  `CONFIG_LOCALVERSION="-rmhos"`, `CONFIG_DEFAULT_HOSTNAME="rmhos"`, the rmhOS boot logo, and built-in (not modular)
  drivers for what v86 emulates: PIIX ATA, ext4, VESA framebuffer, virtio-pci, virtio-net, 9p over virtio, 8250 serial,
  PS/2 keyboard and mouse. No module loading.
- **Userland:** Alpine Linux 3.22 x86. **(call)** desktop is IceWM with PCManFM (files), a terminal, a text editor, an
  image viewer and a light browser (NetSurf), chosen because heavier desktops are unusable at v86 speed.
  `/etc/os-release` says `NAME="rmhOS"`, `ID=rmhos`, `ID_LIKE=alpine`. Hostname `rmhos`. The login user has passwordless
  `doas`; root in a browser-local VM grants nothing the relay does not already filter.
- **Delivery:** three files under `<cdn>/rmhos/<imageVersion>/`: `bzImage`, `rootfs.ext4` (read by HTTP Range, only
  touched blocks are fetched), and `state.zst` (a snapshot taken after boot, with the guest agent waiting, so a session
  starts from a restored snapshot instead of a cold boot). A manifest in the repo pins the version, sizes and sha256 of
  each. Budgets: `bzImage` ≤ 12 MB, `rootfs.ext4` ≤ 400 MB, `state.zst` ≤ 80 MB. Without a snapshot (or if it fails to
  load) the app cold-boots.
- **Built by:** `scripts/rmhos/build.sh` inside Docker, run by a manually dispatched GitHub workflow that uploads the
  three files to R2. Nothing binary is committed. In dev, `pnpm rmhos:image` builds the same files into the git-ignored
  `public/rmhos-dev/`, and the manifest falls back to that path when `VITE_CDN_BASE_URL` is unset.

### 2. Identity

- The page requires a session (redirect to `/login` with `callbackURL=/rmhos`), like `/rmhtype`.
- Linux username
  =
  `toLinuxUsername(handle ?? username)`: lowercased, every character outside `[a-z0-9_-]` replaced by `_`, a leading
  non-letter prefixed with `u`, truncated to 31 characters; empty or reserved (`root`, `daemon`, `bin`, `sys`, `adm`,
  `nobody`, `guest`) becomes `rmh`. uid and gid 1000.
- The host sends the name to a small agent in the guest over the second serial port once the machine is up; the agent
  creates the user, restores the home folder and starts the desktop as that user. No password exists.

### 3. Home folder

- `/home/<user>` is a 128 MB tmpfs in the guest.
- **Save:** the agent tars the home folder into a 9p share, the host reads the tar, gzips it, stores it in IndexedDB and
  uploads it. **Restore** is the reverse.
- Save triggers: the Save button, every 5 minutes, guest shutdown, and tab hide (best effort). An archive whose sha256
  equals the last saved one is not uploaded.
- **(call)** Quota: 100 MB per user, measured on the gzipped archive. Over quota the save is refused with a visible
  message and the previous archive is kept.
- **Server:** one object per user at `rmhos/home/<userId>.tar.gz` through `lib/storage/s3.server`, and one `RmhosHome`
  row (`userId`, `version`, `sizeBytes`, `sha256`, `updatedAt`).
- **Two devices:** an upload carries the `version` it was based on. If the server's is newer the upload is rejected
  (409) and the user chooses "Keep this device's files" (force) or "Load the saved files" (restart with the server
  copy). Nothing is merged.

### 4. Internet

Browsers cannot open sockets, so the guest's traffic leaves through us.

- v86's in-browser network stack terminates the guest's TCP and speaks **Wisp v1** (many TCP streams over one WebSocket)
  to a new Node hub, `server/rmhos-net` on port 7009, proxied at `/rmhos-net/`. We write the Wisp server ourselves on
  `ws` (the existing implementations are AGPL).
- DNS: the guest's queries become DNS-over-HTTPS requests to `POST /rmhos-net/dns-query` on the same hub, which forwards
  them to an upstream resolver. This keeps the CSP `connect-src` unchanged.
- **Auth:** `GET /api/rmhos/session` returns a ticket, an HMAC-SHA256 over `userId.expiry` keyed from
  `BETTER_AUTH_SECRET`, valid 60 s, passed as `?ticket=`. The hub verifies it without a database.
- **Policy (all (call), all env-tunable):**
  - Off unless `RMHOS_NET_ENABLED=1`. Off means the session API says so and the UI shows "Network off"; nothing else
    changes.
  - One connection per user; a new one closes the old.
  - At most 64 open streams per connection.
  - TCP only. Destination ports 80, 443, 8080, 8443 (`RMHOS_NET_ALLOWED_PORTS`). Mail and SSH are therefore closed.
  - The hub resolves the name itself, refuses any address `isPrivateIp` rejects (loopback, RFC 1918, link-local, CGNAT,
    metadata), and connects to the address it checked.
  - 2 MB/s per user and 2 GB per user per UTC day, counted in memory.
  - One log line per closed stream: user id, host, port, bytes each way, duration, close reason.
- The relay is the one part of this feature with real abuse potential; that is why it ships disabled and why its policy
  is conservative.

### 5. The app

- `features/rmhos/` (`kind: 'app'`, `delivery: 'shell'`, `basePath: '/rmhos'`), route file `app/routes/rmhos.tsx`. The
  feature id must be lowercase (`/^[a-z0-9-]+$/`) and every route file in the repo is lowercase; TanStack Router matches
  paths case-insensitively, so `/rmhOS` resolves to the same page. A test pins that.
- Catalog card: id `rmhos`, order 130, status `Beta`, `authGate: true`.
- i18n namespace `c-rmhos`.
- Screens: boot (download and boot progress), the machine's screen, and a toolbar with Save, Restart, Fullscreen,
  network status and About (licence notice and source links). Errors: image failed to load, save refused, version
  conflict, network unavailable.
- Leaving the page with unsaved changes asks first (`beforeunload`).

### 6. Licence

- `features/rmhos/NOTICE.md` and the About dialog state: the kernel is Linux (GPL-2.0), the exact upstream tarball URL
  and sha256, and that our config and patches are in `scripts/rmhos/`; userland is Alpine packages, listed with versions
  in a generated `packages.txt` shipped beside the image; the emulator is v86 (BSD-2-Clause).
- "Linux" is used descriptively ("rmhOS is built on the Linux kernel"), never as the product name.

## Constraints from the repo

- API endpoints are contracts + `implement()` in `features/rmhos/api/`, registered through `pnpm api:routes`; no raw
  `fetch('/api/…')`.
- All strings through `t()`, namespace registered in `lib/i18n/config.ts`.
- App tier styling only (`--app-*`, `AppShell`); lucide icons; sonner toasts.
- A new hub touches: `package.json` scripts, `tsconfig.server.json`, `Dockerfile`, `docker-compose.yml`, `deploy.sh`,
  the Apache vhost, `go-services/cmd/status` (NOT done: the status service does not watch the hub; see docs/rmhos.md),
  `.env.example`.
- `pnpm check:consistency` passes on every commit.

## Left to the builder

- The exact Alpine package list and IceWM theme.
- Kernel config beyond the options named above.
- Screen scaling behaviour on small viewports.
- Whether the snapshot is taken before or after the X server starts (whichever restores reliably).

## Open for the owner

1. The relay port list. 80/443 only makes `apk add`, `curl`, `git` over HTTPS work; SSH and anything else would need
   widening.
2. The 100 MB quota, and whether members get more.
3. Whether rmhOS is for every signed-in user or members only.
