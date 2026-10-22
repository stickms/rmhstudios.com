# On-call guide

Alerts come from the **on-call watchdog** (`deploy/oncall-watchdog/`), a
Cloudflare Worker that runs **off the VPS**, and post to Discord
`#rmh-oncall`.

## Who is on call

Whoever holds the `@oncall` Discord role. Rotate by moving the role; no code
or config changes. Set `#rmh-oncall` to **All Messages** notifications and
allow notifications from the server, or a page can arrive silently.

## Severity

| Sev | Set by | What happens | Response |
|---|---|---|---|
| **Sev1** | A human only (🔺 Escalate) | `@oncall` (+ escalation role) re-pinged every 10 min until acked | All hands, now |
| **Sev2** | Automated alarms: **the page** | `@oncall` pinged 24/7, re-pinged every 10 min until ✅ Acknowledge | Ack within 15 min, mitigate ASAP |
| **Sev3** | Automated | Posted, no ping | Next business day |
| **Sev4** | Automated | Posted, no ping | This sprint |
| **Sev5** | Automated | Posted, no ping | Informational |

## When you are paged

1. **Acknowledge** (✅). Only `@oncall` members can, and it stops the re-pings.
2. Open the **📖 Runbook** button on the alert and follow the first step.
3. Bigger than you, or more than one person needed? **🔺 Escalate to Sev1**.
   That pages everyone and clears your ack so it keeps paging until someone
   takes it.
4. Mitigate first (roll back, restart), investigate after.
5. The alert resolves itself when its check recovers; the reply under it says
   how long it lasted.

## Alarms

| ID | Sev | What |
|---|---|---|
| [A01](A01.md) | 2 | Site down (external check) |
| [A02](A02.md) | 2 | `/api/ready` failing (database / Redis behind the site) |
| [A03](A03.md) | 2 | Status service stale, or the VPS heartbeat lost |
| [A04](A04.md) | 2 | Nightly database backup missed (26h) |
| [A06](A06.md) | 2 | Postgres connections near the limit / web DB pool saturated |
| [A08](A08.md) | 2 | Web 5xx error rate high |
| [A09](A09.md) | 2 | Web latency high (p95) |
| [A11](A11.md) | 2 | Background (Go) worker down / crash-looping |
| [A13](A13.md) | 2 | Disk almost full (92%) |
| [A14](A14.md) | 2 | Host memory exhausted / kernel OOM kill |
| [A15](A15.md) | 2 | Economy job failing / outbox delivery stuck |
| [A16](A16.md) | 2 | Jobs worker silent |
| [A17](A17.md) | 2 | Stripe webhook failing |
| [A19](A19.md) | 2 | Tomorrow's daily puzzles missing |
| [STATUS](status-incident.md) | 2 / 3 | An automatic status-page incident (component down / degraded) |
| [D01](D01.md) | 2 | Deploy rollback **failed** |
| [D02](D02.md) | 3 | Deploy auto-rolled back |
| [D03](D03.md) | 3 | Deploy failed |
| [D04](D04.md) | 3 | Deploy died without reporting |
| [BACKUP](BACKUP.md) | 3 | A backup run failed |
| [B01](B01.md) | 3 | Disk filling up (85%) |
| [B02](B02.md) | 3 | Heap pressure |
| [B03](B03.md) | 3 | Event loop lag |
| [B05](B05.md) | 3 | Container unhealthy / restarted outside a deploy |
| [B06](B06.md) | 3 | Background job stale |
| [B07](B07.md) | 3 | Discord bot disconnected |
| [B13](B13.md) | 3 | Background job failing / backlog |
| [B14](B14.md) | 3 | Process errors spiking |
| [B16](B16.md) | 3 | Host health check not running |
