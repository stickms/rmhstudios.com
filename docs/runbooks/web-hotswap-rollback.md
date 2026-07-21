# Runbook — roll back a bad web hotswap (blue/green flip-back)

**When to use:** a deploy just promoted a new web color and the freshly-live
container is serving errors (5xx, white screen, broken auth, a bad release you
need off the front door _now_). This is the **inverse** of the forward flip in
[`deploy/hotswap-web.sh`](../../deploy/hotswap-web.sh) — it points Apache back
at the previous color.

> The forward script already self-heals a flip that **fails its own
> verification** (it restarts the old container and reverts the port file before
> it ever finishes — see the "verify the flip landed" block in
> `hotswap-web.sh`). This runbook is for the case the script can't catch: the
> flip _succeeded_, the new color is live and healthy-by-probe, but the release
> is bad. By then the old container has usually been `docker rm`'d, so rolling
> back means bringing the previous image back up, not just flipping a file.

## How the flip works (the two facts you need under pressure)

1. **Which color is live is a single file.** Apache proxies to
   `http://localhost:${WEB_UPSTREAM_PORT}/`, and `WEB_UPSTREAM_PORT` is
   `Define`d in one include:

   ```
   /home/rmhstudios/rmhstudios-web-active.conf      # ACTIVE_CONF
   → Define WEB_UPSTREAM_PORT 7005                  # blue=7005, green=7015
   ```

   Rewriting that file **is** the flip. It lives under the deploy user's home
   (not `/etc`) because the sandboxed webhook can't write `/etc`.

2. **Apache reloads itself when that file changes.** A root-owned systemd
   path-unit (`rmhstudios-apache-reload.path`) watches `ACTIVE_CONF` and runs
   `apachectl graceful` on change. If you're on the box as root you can also
   reload directly. `graceful` finishes in-flight requests on the old worker
   set, so the reload itself never drops a request.

Container names: `${PROJECT_NAME}-web-blue` / `-web-green`
(default `PROJECT_NAME=rmhstudios-prod`). Ports: **blue 7005, green 7015**.

## Steps

### 1 — Identify the live color

```bash
cat /home/rmhstudios/rmhstudios-web-active.conf
#   Define WEB_UPSTREAM_PORT 7015   → GREEN is live, roll back to BLUE (7005)
#   Define WEB_UPSTREAM_PORT 7005   → BLUE  is live, roll back to GREEN (7015)

docker ps --filter name=rmhstudios-prod-web --format '{{.Names}}\t{{.Ports}}\t{{.Status}}'
```

Call the live one `$BAD_PORT` and the rollback target `$GOOD_PORT`
(the other of 7005/7015). Confirm which color is _bad_ from the symptom, not
from memory — the file is the source of truth.

### 2 — Make sure the previous color is actually running

A successful forward flip `docker rm -f`'d the old container. Check, and if it's
gone, bring the **previous** image back up on `$GOOD_PORT`. Point at the image
the previous deploy ran — `…-app:<previous-sha>` if you tag by sha, else the
digest from `docker images`/your registry — **not** `:latest` (that's the bad
release you're rolling away from):

```bash
GOOD_COLOR=blue   GOOD_PORT=7005     # ← set both to the rollback target
PREV_IMAGE='rmhstudios-prod-app:<previous-good-sha-or-digest>'

docker inspect rmhstudios-prod-web-$GOOD_COLOR >/dev/null 2>&1 \
  && docker start rmhstudios-prod-web-$GOOD_COLOR \
  || docker compose -p rmhstudios-prod --env-file .env.production run -d --no-deps \
       --name rmhstudios-prod-web-$GOOD_COLOR \
       -p "127.0.0.1:${GOOD_PORT}:${GOOD_PORT}" \
       -e "PORT=${GOOD_PORT}" -e "HOSTNAME=0.0.0.0" web

# Prove it serves BEFORE moving traffic to it:
curl -fsS -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:${GOOD_PORT}/"   # want 200
docker update --restart unless-stopped rmhstudios-prod-web-$GOOD_COLOR        # survive reboots
```

(This mirrors exactly what `hotswap-web.sh` does to launch a color: `compose run`
so the container inherits the real `web` service config — env_file, extra_hosts,
network — with only `PORT` overridden.)

### 3 — Flip Apache back

Repoint the include at `$GOOD_PORT`, then let (or make) Apache reload:

```bash
printf 'Define WEB_UPSTREAM_PORT %s\n' "$GOOD_PORT" > /home/rmhstudios/rmhstudios-web-active.conf

# As root on the box, reload immediately (skip if you're relying on the path-unit):
apachectl configtest && apachectl graceful
# Under the sandboxed deploy user, DON'T reload by hand — just writing the file
# triggers rmhstudios-apache-reload.path. Give it a few seconds.
```

### 4 — Verify the rollback took

Probe **Apache itself** (`:80` with the real Host header), not just the
container — this proves the proxy is routed to the good color, which is the same
proof the forward script uses:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' -H 'Host: rmhstudios.com' http://127.0.0.1/   # want 200
```

Then a quick smoke on a route that exercises the app (auth/session/DB), e.g. the
feed or `/api/health`, and watch error rates fall on the dashboard. Only once
Apache is confirmed serving via `$GOOD_PORT` should you stop/remove the bad
container:

```bash
docker stop rmhstudios-prod-web-<bad-color>     # keep it around until you're sure
```

## Migration stance — read this before touching the database

**Do not reflexively revert the migration.** The deploy runs
`prisma migrate deploy` _before_ the flip, so by rollback time the new schema is
already applied. Whether the previous web color is safe against it depends on
the migration's shape:

| Migration shape                                                                                                                | Is the previous web color safe against the new schema?                                        | DB action on rollback                  |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Additive** — new nullable column, new table, new index (the vast majority here)                                              | **Yes.** Old code simply ignores the additions.                                               | **None.** Leave the migration applied. |
| **Widening** — enum value added, column made nullable                                                                          | Yes.                                                                                          | None.                                  |
| **Breaking** — column/table dropped or renamed, column made `NOT NULL`, type narrowed, data backfilled-then-old-column-removed | **No** — old code may query a column that's gone or write a shape the new constraint rejects. | Escalate; see below.                   |

**Reverting a migration is the more dangerous move** and is a last resort:
`prisma migrate` has no down-migrations, so it means hand-writing and applying
reverse SQL, and any writes taken since the flip (posts, coins, redemptions)
that depend on the new schema can be **lost or corrupted** by dropping what they
wrote into. For a breaking migration, prefer rolling _forward_ (ship a fix on
the new schema) over reverting. If you must revert:

1. Take a fresh DB snapshot first (`deploy/backup/…`).
2. Put the site in maintenance / stop writes to the affected tables.
3. Hand-write the reverse SQL, apply it, and reconcile with the person who
   authored the migration before bringing traffic back.

If you can't tell which shape a migration is, treat it as **breaking** and
escalate rather than guessing.

## Related

- Forward path & self-verifying flip: [`deploy/hotswap-web.sh`](../../deploy/hotswap-web.sh)
- Apache upstream wiring: `deploy/apache/rmhstudios.conf` (`WEB_UPSTREAM_PORT`)
- Deploy driver: [`deploy.sh`](../../deploy.sh) (Step 4b, "Hotswapping web container")
- Runtime topology: [`docs/architecture.md`](../architecture.md)
