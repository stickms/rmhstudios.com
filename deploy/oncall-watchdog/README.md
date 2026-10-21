# rmh on-call watchdog

A Cloudflare Worker that pages `@oncall` in Discord `#rmh-oncall`. It runs
**off the VPS** on purpose: the in-house status service lives on the box it
monitors, so the box dying was the one outage nothing would report.

| Path | Caller | Gate |
|---|---|---|
| cron, every minute | Cloudflare | — (probes `/`, `/api/ready`, status freshness; heartbeats; re-pages) |
| `POST /interactions` | Discord (Ack / Escalate buttons) | Discord Ed25519 signature; click allowed only for `@oncall` members in the on-call channel |
| `POST /v1/alert`, `POST /v1/heartbeat/<name>`, `GET /v1/alarms` | the VPS | HMAC-SHA256 signature over timestamp + nonce + method + path + body with `ONCALL_SIGNING_SECRET`; ±5 min window; each nonce accepted once (replay-proof). Fails closed if the secret is unset — see `src/signing.ts` |

It is deployed to its own Cloudflare account on a `workers.dev` URL, not on
the `rmhstudios.com` zone — on-call only needs it to be off the VPS. Set
`ONCALL_URL` to that URL wherever a sender needs it.

Severity follows the Sev1–5 policy: **Sev2 is the page** (mentions `@oncall`,
re-mentions every 10 min until someone presses ✅ Acknowledge). Sev1 is only
ever a human pressing 🔺 Escalate. Sev3–5 post without a mention.

All state (alarms, acks, probe counters, heartbeats) is in one SQLite-backed
Durable Object, so a click and a cron tick can never lose each other's write.

## Alarm API (`POST /v1/alert`)

```json
{ "state": "firing", "id": "A05", "instance": "primary", "sev": 2,
  "title": "Postgres down", "detail": "SELECT 1 failed twice", "source": "status",
  "runbook": "A05" }
```

`state: "resolved"` with the same `id` (+ `instance`) clears it. Re-sending
`firing` while it is open updates it in place — no duplicate page. `sev: 1` is
rejected (humans escalate). Heartbeats (`status`, `pg-backup`) only arm after
their first check-in, so silence can't page before the sender exists.

## One-time setup

Do these **in this order** — the gates are proven closed before anything real
is sent to them.

1. **Discord app** (developer portal → New Application `RMH Oncall`): note the
   Application ID and Public Key (not secret); Bot → Reset Token (**secret** —
   never paste it anywhere but step 4). OAuth2 URL Generator → scope `bot`,
   permissions View Channel / Send Messages / Read Message History / Embed
   Links → add it to the server. Make sure it can post in `#rmh-oncall`.
2. **Fill the vars** in `wrangler.toml`: `DISCORD_APPLICATION_ID`,
   `DISCORD_PUBLIC_KEY`, `ONCALL_CHANNEL_ID` (Developer Mode → right-click the
   channel → Copy ID), optionally `ESCALATION_ROLE_ID`.
3. **Signing secret** — one random value shared by the Worker and the VPS:
   ```bash
   openssl rand -hex 32    # store it in a password manager; never in git or chat
   ```
   It goes into `wrangler secret put ONCALL_SIGNING_SECRET` (step 4) and the
   VPS `.env.production` as `ONCALL_SIGNING_SECRET=…`.
4. **Deploy + secrets** (from the repo root):
   ```bash
   npx wrangler@4 login
   npx wrangler@4 deploy --config deploy/oncall-watchdog/wrangler.toml
   npx wrangler@4 secret put DISCORD_BOT_TOKEN     --config deploy/oncall-watchdog/wrangler.toml
   npx wrangler@4 secret put ONCALL_SIGNING_SECRET --config deploy/oncall-watchdog/wrangler.toml
   npx wrangler@4 secret put ONCALL_WEBHOOK_URL    --config deploy/oncall-watchdog/wrangler.toml   # fallback
   ```
5. **Verify the gates reject unsigned callers — before anything else:**
   ```bash
   # Must be 401 {"error":"missing or malformed signature headers"}
   # (a 503 "signing secret not configured" means step 4's secret is missing).
   curl -si -X POST https://rmh-oncall-watchdog.<subdomain>.workers.dev/v1/alert -d '{}' | head -1
   # Must be 401 "invalid request signature".
   curl -si -X POST https://rmh-oncall-watchdog.<subdomain>.workers.dev/interactions -d '{}' | head -1
   # Anything else must 404.
   curl -si https://rmh-oncall-watchdog.<subdomain>.workers.dev/ | head -1
   ```
6. **Point Discord at it:** developer portal → General Information →
   Interactions Endpoint URL = `https://rmh-oncall-watchdog.<subdomain>.workers.dev/interactions` →
   Save (Discord verifies the signature check live; it refuses to save if it
   fails).
7. **Send a test page** (reads `ONCALL_SIGNING_SECRET` from the env or `.env.production`):
   ```bash
   deploy/oncall-watchdog/scripts/test-alert.sh firing   # pages @oncall with Ack/Escalate buttons
   deploy/oncall-watchdog/scripts/test-alert.sh resolved
   ```

## Deploys after the first

`.github/workflows/oncall-watchdog.yml` tests every PR that touches this
directory and deploys on merge to `main`. It needs two repo (or
`oncall-watchdog` environment) secrets — named apart from the site's own
`CLOUDFLARE_API_TOKEN`, which belongs to a different account:

- `ONCALL_CLOUDFLARE_API_TOKEN` — Cloudflare → My Profile → API Tokens →
  *Edit Cloudflare Workers* template, scoped to the watchdog's account.
- `ONCALL_CLOUDFLARE_ACCOUNT_ID` — Workers & Pages → Account details → Account ID.

CI never sets Worker secrets; those stay as put by hand in step 4.

## Operating notes

- Logs: `npx wrangler@4 tail --config deploy/oncall-watchdog/wrangler.toml`.
- Current alarms: `GET /v1/alarms` (signed, like every /v1 call).
- Rotating the signing secret: `wrangler secret put` the new value and update
  `.env.production` together; requests signed with the old one fail until both match.
- If the bot token breaks, alerts still arrive through the fallback webhook
  (plain message, no buttons) — ack in the dashboard instead.
- Who's on call is just who holds the `@oncall` role — rotate by moving it.
