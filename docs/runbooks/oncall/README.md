# On-call guide

Alerts come from the **on-call watchdog** (`deploy/oncall-watchdog/`), a Cloudflare Worker that runs **off the VPS**,
and post to Discord `#rmh-oncall`.

## Who is on call

Whoever holds the `@oncall` Discord role. Rotate by moving the role; no code or config changes. Set `#rmh-oncall` to
**All Messages** notifications and allow notifications from the server, or a page can arrive silently.

## Severity

| Sev      | Set by                         | What happens                                                       | Response                         |
| -------- | ------------------------------ | ------------------------------------------------------------------ | -------------------------------- |
| **Sev1** | A human only (🔺 Escalate)     | `@oncall` (+ escalation role) re-pinged every 10 min until acked   | All hands, now                   |
| **Sev2** | Automated alarms: **the page** | `@oncall` pinged 24/7, re-pinged every 10 min until ✅ Acknowledge | Ack within 15 min, mitigate ASAP |
| **Sev3** | Automated                      | Posted, no ping                                                    | Next business day                |
| **Sev4** | Automated                      | Posted, no ping                                                    | This sprint                      |
| **Sev5** | Automated                      | Posted, no ping                                                    | Informational                    |

## Cutting a ticket yourself

Seen something on-call should handle? Type `/page` anywhere in the Discord server: severity, title, and what you saw.
SEV2 pages `@oncall` immediately; SEV1 also pages the escalation role. It shows in `#rmh-oncall` and on `/admin/alarms`,
and `@oncall` closes it with **Resolve**.

## The admin panel

Every alert in `#rmh-oncall` has an **🛠️ Open in panel** button that lands on that alarm's card in `/admin/alarms`
(works on a phone). The panel shows open and resolved alarms (14 days of history, searchable) and does what the Discord
buttons do, and the Discord alert updates to match:

- **Acknowledge**, **Escalate** and **Resolve** (the watchdog owns the state; the reply in Discord names you as "(admin
  panel)").
- **Per-alarm actions**, shown only on the alarms they fit and always behind a confirm:

| Action              | Alarms          | What it does                                                                                            |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| Re-run deploy       | D01 D02 D03 D04 | Starts `deploy.yml` on `main` again. Needs `ONCALL_GITHUB_TOKEN` (Actions: write). Not offered for D05. |
| Requeue dead events | A15 B13         | Requeues every dead outbox event (the same action as `/admin/outbox`).                                  |
| Retry failed jobs   | A16 B06 B13     | Retries up to 100 newest failed jobs in each queue that has failures (as `/admin/jobs`).                |

Each action is an admin-only API call, rate limited, and written to the audit log (`oncall.*`). Add a new one in
`lib/oncall/remediations.ts` (menu) and `lib/oncall/remediate.server.ts` (what it does). If the site is down, use the
Discord buttons and the runbook; they do not depend on it.

## When you are paged

1. **Acknowledge** (✅). Only `@oncall` members can, and it stops the re-pings.
2. Open the **📖 Runbook** button on the alert and follow the first step.
3. Bigger than you, or more than one person needed? **🔺 Escalate to Sev1**. That pages everyone and clears your ack so
   it keeps paging until someone takes it.
4. Mitigate first (roll back, restart), investigate after.
5. The alert resolves itself when its check recovers; the reply under it says how long it lasted.

## Alarms

Threshold alarms over the metrics history (A08, A09, M01–M03, B02, B03) are declared in `lib/ops/alarm-rules.ts` and can
be overridden or muted on `/admin/alarms` → Alarm rules.

| ID                           | Sev   | What                                                          |
| ---------------------------- | ----- | ------------------------------------------------------------- |
| [A01](A01.md)                | 2     | Site down (external check)                                    |
| [A02](A02.md)                | 2     | `/api/ready` failing (database / Redis behind the site)       |
| [A03](A03.md)                | 2     | Status service stale, or the VPS heartbeat lost               |
| [A04](A04.md)                | 2     | Nightly database backup missed (26h)                          |
| [A06](A06.md)                | 2     | Postgres connections near the limit / web DB pool saturated   |
| [A08](A08.md)                | 2     | Web 5xx error rate high                                       |
| [A09](A09.md)                | 2     | Web latency high (p95)                                        |
| [A13](A13.md)                | 2     | Disk almost full (92%)                                        |
| [A14](A14.md)                | 2     | Host memory exhausted / kernel OOM kill                       |
| [A15](A15.md)                | 2     | Economy job failing / outbox delivery stuck                   |
| [A16](A16.md)                | 2     | Jobs worker silent                                            |
| [A17](A17.md)                | 2     | Stripe webhook failing                                        |
| [A19](A19.md)                | 2     | Tomorrow's daily puzzles missing                              |
| [M01](M01.md)                | 3     | API response time high                                        |
| [M02](M02.md)                | 3     | Real-user page loads slow (LCP / TTFB)                        |
| [M03](M03.md)                | 3     | LLM slow or failing                                           |
| [STATUS](status-incident.md) | 2 / 3 | An automatic status-page incident (component down / degraded) |
| [D01](D01.md)                | 2     | Deploy rollback **failed**                                    |
| [D02](D02.md)                | 2     | Deploy auto-rolled back                                       |
| [D03](D03.md)                | 2     | Deploy failed                                                 |
| [D04](D04.md)                | 2     | Deploy died without reporting                                 |
| [D05](D05.md)                | 2     | Release auto-rolled back on alarms (post-deploy guard)        |
| [BACKUP](BACKUP.md)          | 3     | A backup run failed                                           |
| [B01](B01.md)                | 3     | Disk filling up (85%)                                         |
| [B02](B02.md)                | 3     | Heap pressure                                                 |
| [B03](B03.md)                | 3     | Event loop lag                                                |
| [B05](B05.md)                | 3     | Container unhealthy / restarted outside a deploy              |
| [B06](B06.md)                | 3     | Background job stale                                          |
| [B07](B07.md)                | 3     | Discord bot disconnected                                      |
| [B13](B13.md)                | 3     | Background job failing / backlog                              |
| [B14](B14.md)                | 3     | Process errors spiking                                        |
| [B16](B16.md)                | 3     | Host health check not running                                 |
