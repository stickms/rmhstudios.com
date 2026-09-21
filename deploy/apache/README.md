# `deploy/apache/` — the front door

Apache is the public entry point: TLS is terminated at Cloudflare, Apache
receives the forwarded request, adds the security headers, and proxies to the
Node web container and the realtime hubs.

| File | What it is | Who installs it |
| ---- | ---------- | --------------- |
| `rmhstudios.conf` | The main vhost — security headers, CSP, and every `ProxyPass` (web, `/socket/`, `/rmhbox-ws/`, `/rmhtube-ws/`). | **A human, by hand.** Nothing in the deploy copies it. |
| `status.rmhstudios.com.conf` | The status subdomain's vhost (the Go `status` service on 7008). | A human, by hand. |
| `mpm_event.conf` | Worker/connection tuning. Paired with the Postgres tuning — see `deploy/postgres/`. | A human, by hand. |
| `rmhstudios-web-active.conf.example` | Template for the blue/green port include. | Copied once; **rewritten by every deploy** thereafter. |

## The one thing to know

**A deploy never touches `rmhstudios.conf`.**

`deploy.sh` → `deploy/hotswap-web.sh` writes exactly one Apache file:
`/home/rmhstudios/rmhstudios-web-active.conf`, which contains a single line —

```apache
Define WEB_UPSTREAM_PORT 7015
```

— to flip the vhost between the blue (7005) and green (7015) web containers.
The vhost picks it up through `IncludeOptional` with a 7005 fallback, so a
missing file degrades to the non-hotswap layout rather than failing.

So **any edit to the vhost itself — a header, a CSP directive, a new
`ProxyPass` — is inert until somebody installs it on the host.** Merging the
change to `main` does nothing. This has bitten at least once: a
`Permissions-Policy` line denying `microphone` and `geolocation` to every
origin including our own sat in production breaking voice messages, voice
calls, Massive March squad chat and rideshare location, and the fix living in
this directory did not change that by itself.

## Installing a vhost change

```bash
# On the VPS, from the repo checkout (deploy.sh leaves it at the deployed SHA):
sudo cp deploy/apache/rmhstudios.conf /etc/apache2/sites-available/rmhstudios.conf
sudo apachectl configtest        # ALWAYS. A broken vhost takes the site down.
sudo apachectl graceful          # finishes in-flight requests, then reloads
```

Verify from outside, because a reload that silently kept the old config is the
failure mode worth catching:

```bash
curl -sSI https://rmhstudios.com | grep -i permissions-policy
```

`apachectl graceful` over `restart`: graceful lets existing connections finish,
which matters because the WebSocket hubs are proxied through this vhost and a
hard restart drops every live game.

## How the blue/green reload works

The deploy webhook is sandboxed (`ProtectSystem=strict`, `NoNewPrivileges`), so
it can neither write `/etc` nor `sudo`. That is why the port include lives in
the deploy user's **home** rather than `/etc`, and why the reload is a separate
root-owned watcher rather than something the deploy calls:

```
deploy.sh
  └─ deploy/hotswap-web.sh
       └─ writes /home/rmhstudios/rmhstudios-web-active.conf
            └─ rmhstudios-apache-reload.path  (root-owned systemd watcher)
                 └─ rmhstudios-apache-reload.service → apachectl graceful
```

`hotswap-web.sh` picks the best reload it can get — `apachectl` directly as
root, `sudo -n` if that is granted, otherwise it just writes the file and
leaves it to the path-unit. That last case is the expected one in production.

### The watcher is not in this repository

`rmhstudios-apache-reload.{path,service}` exist **only on the VPS**. Nothing
here defines them, so a rebuilt host would deploy green/blue containers that
Apache never flips to — and the symptom is a deploy that reports success while
serving the old code.

Reconstructed from the contract in `hotswap-web.sh`, they need to do this:

```ini
# /etc/systemd/system/rmhstudios-apache-reload.path
[Unit]
Description=Reload Apache when the active web-upstream port changes
[Path]
PathModified=/home/rmhstudios/rmhstudios-web-active.conf
[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/rmhstudios-apache-reload.service
[Unit]
Description=Graceful Apache reload after a blue/green port flip
[Service]
Type=oneshot
ExecStartPre=/usr/sbin/apachectl configtest
ExecStart=/usr/sbin/apachectl graceful
```

**Diff these against the host before installing them anywhere** — the above is
derived from what `hotswap-web.sh` expects, not copied from the running units,
and a watcher that differs from the real one is worse than a missing README.
Once confirmed, they belong in `deploy/systemd/` beside the backup timer.

## Gotchas

- **`configtest` before every `graceful`.** Apache will happily keep running
  the old config and log the error where nobody looks.
- **No `X-Frame-Options`, on purpose.** The site is embedded as a Discord
  Activity; clickjacking is controlled by the CSP `frame-ancestors` allowlist
  instead. The vhost says so where it matters — do not "fix" it.
- **`Permissions-Policy` is deny-by-default and easy to get backwards.** An
  empty allowlist (`microphone=()`) denies the feature to *every* origin
  including ours; allowing our own origin is `microphone=(self)`.
  `lib/__tests__/permissions-policy.test.ts` cross-checks this line against the
  browser APIs the codebase actually calls, so the header cannot drift away
  from the product again — but that gate runs in CI, and CI cannot tell whether
  the file was installed on the host.
- **The status vhost is separate.** It serves a different subdomain and needs
  none of the main site's permissions; leave its header alone.
