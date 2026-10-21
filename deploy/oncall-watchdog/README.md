# rmh on-call watchdog

A Cloudflare Worker that pages `@oncall` in Discord `#rmh-oncall`. It runs
**off the VPS** on purpose: the in-house status service lives on the box it
monitors, so the box dying was the one outage nothing would report.

| Path | Caller | Gate |
|---|---|---|
| cron, every minute | Cloudflare | — (probes `/`, `/api/ready`, status freshness; heartbeats; re-pages) |
| `POST /interactions` | Discord (Ack / Escalate buttons) | Discord Ed25519 signature; click allowed only for `@oncall` members in the on-call channel |
| `POST /v1/alert`, `POST /v1/heartbeat/<name>`, `GET /v1/alarms` | the VPS | Cloudflare Access **service token**, and the Access JWT re-verified in the Worker (fails closed if unconfigured) |

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

Do these **in this order** — the gate is proven closed before anything real
is sent to it.

1. **Discord app** (developer portal → New Application `RMH Oncall`): note the
   Application ID and Public Key (not secret); Bot → Reset Token (**secret** —
   never paste it anywhere but step 4). OAuth2 URL Generator → scope `bot`,
   permissions View Channel / Send Messages / Read Message History / Embed
   Links → add it to the server. Make sure it can post in `#rmh-oncall`.
2. **Fill the vars** in `wrangler.toml`: `DISCORD_APPLICATION_ID`,
   `DISCORD_PUBLIC_KEY`, `ONCALL_CHANNEL_ID` (Developer Mode → right-click the
   channel → Copy ID), optionally `ESCALATION_ROLE_ID`.
3. **Cloudflare Access** (Zero Trust → Access):
   - Service Auth → Service Tokens → create `rmh-oncall-vps`. The Client
     Secret is shown once: it goes only into the VPS `.env.production`
     (`ONCALL_ACCESS_CLIENT_ID` / `ONCALL_ACCESS_CLIENT_SECRET`).
   - Applications → Self-hosted → domain `oncall.rmhstudios.com`, **path
     `v1`** (NOT the whole host — Discord must reach `/interactions`). Policy:
     action **Service Auth**, include → Service Token `rmh-oncall-vps`.
   - Copy the application's **AUD** tag and your team domain
     (`<team>.cloudflareaccess.com`) into `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN`;
     the token's Client ID into `ACCESS_CLIENT_ID`.
4. **Deploy + secrets** (from the repo root):
   ```bash
   npx wrangler@4 login
   npx wrangler@4 deploy --config deploy/oncall-watchdog/wrangler.toml
   npx wrangler@4 secret put DISCORD_BOT_TOKEN  --config deploy/oncall-watchdog/wrangler.toml
   npx wrangler@4 secret put ONCALL_WEBHOOK_URL --config deploy/oncall-watchdog/wrangler.toml   # fallback
   ```
5. **Verify the gate denies anonymous callers — before anything else:**
   ```bash
   # Must be a 302 to *.cloudflareaccess.com or a 403 from Access — NOT a 200/4xx from the Worker.
   curl -si -X POST https://oncall.rmhstudios.com/v1/alert | head -5
   # Must be 401 "invalid request signature".
   curl -si -X POST https://oncall.rmhstudios.com/interactions -d '{}' | head -1
   # Must 404 (no workers.dev URL exists).
   curl -si https://rmh-oncall-watchdog.<account>.workers.dev/ | head -1
   ```
   If the first command reaches the Worker (JSON `{"error": ...}`), the Access
   application isn't covering `/v1` — fix that before continuing.
6. **Point Discord at it:** developer portal → General Information →
   Interactions Endpoint URL = `https://oncall.rmhstudios.com/interactions` →
   Save (Discord verifies the signature check live; it refuses to save if it
   fails).
7. **Send a test page** with the service token:
   ```bash
   deploy/oncall-watchdog/scripts/test-alert.sh firing   # pages @oncall with Ack/Escalate buttons
   deploy/oncall-watchdog/scripts/test-alert.sh resolved
   ```

## Operating notes

- Logs: `npx wrangler@4 tail --config deploy/oncall-watchdog/wrangler.toml`.
- Current alarms: `GET /v1/alarms` with the service token.
- If the bot token breaks, alerts still arrive through the fallback webhook
  (plain message, no buttons) — ack in the dashboard instead.
- Who's on call is just who holds the `@oncall` role — rotate by moving it.
