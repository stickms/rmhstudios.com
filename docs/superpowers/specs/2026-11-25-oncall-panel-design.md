# On-call panel revamp (hybrid)

Approved in conversation 2026-11-25: hybrid approach, build straight after this doc.

## Intent

When an alert pages someone, the admin panel (`/admin/alarms`) should be where they act on it, from a phone. Today the
panel is read-only, forgets resolved alarms after 24 h, shows only a "not configured" notice when the web container has
no watchdog credentials, and the Discord alert never links to it.

## Goals

- The panel acts: **Acknowledge, Escalate to Sev1, Resolve** (alarm state, owned by the watchdog) and **per-alert-type
  remediations** (owned by the site), e.g. a failed or rolled-back deploy can be re-run.
- Discord and the panel stay in sync: an action taken in the panel edits the Discord alert and posts the same reply a
  button click would.
- Every Discord alert has an **Open in panel** link button that deep-links to the alarm (`/admin/alarms?alarm=<key>`).
- Alarm **history** (14 days) with Open / Resolved / All filters and search.
- Mobile first: single column, 44 px targets, actions pinned inside each card, no horizontal scroll.
- Clear connection state: "not configured" / "unreachable" say exactly which env var or check to look at.

## Non-goals / anti-goals

- No remediation that runs from the Worker. The off-box Worker never holds keys to the VPS.
- No remediation without an admin session, a confirm step, and an audit-log row.
- Discord buttons and the runbook keep working with the site down; nothing is moved out of Discord.
- No new alarm rules, no rotation management (rotation stays the `@oncall` role).

## Approaches considered

1. All on the site: dies with the site (alarm A01), drifts from Discord.
2. All in the watchdog: the Worker would hold VPS keys and cannot verify an admin.
3. **Hybrid (chosen):** watchdog owns alarm state, site owns remediations.

## Design

**Watchdog (`deploy/oncall-watchdog`)**

- New signed `POST /v1/alarms/<key>/<ack|escalate|resolve>` with body `{ name }`. The Durable Object calls the same
  engine methods the Discord buttons use. `AlarmRecord.acked/escalated` gain optional `via: 'web'` and `name`; Discord
  renders `**name** (admin panel)` instead of `<@id>` for those. The nonce rule is unchanged.
- Alert message gets a link button **Open in panel** → `${SITE_URL}/admin/alarms?alarm=<key>`.
- Resolved records are kept 14 days (was 24 h) so the panel has history.

**Site**

- `lib/oncall/client.server.ts`: `postJson<T>` that returns the body.
- `POST /api/admin/oncall/alarm` `{ key, action }` → watchdog. Admin only, rate limited, audited (`oncall.<action>`).
- `lib/oncall/remediations.ts` (client safe): registry mapping alarm id → actions (`id`, label, description, danger).
  `lib/oncall/remediate.server.ts`: executors. `POST /api/admin/oncall/remediate` `{ key, action }` re-checks that the
  alarm exists and is firing, that the action is registered for its id, runs it, audits it, returns a message.
  - `deploy.rerun` (D01–D04; not D05, which would re-ship the commit the guard just rolled back): GitHub `workflow_dispatch` of `deploy.yml` on `main`. Needs `ONCALL_GITHUB_TOKEN` (+
    `GITHUB_REPOSITORY`); unavailable without it, and the panel says so.
  - `outbox.requeue-dead` (A15, B13): requeue dead outbox events, every topic.
  - `jobs.retry-failed` (A16, B06, B13): retry recently failed pg-boss jobs.
- `GET /api/admin/oncall` returns `remediations` (each action id with `available` and why not).

**UI (`components/admin/oncall`)**

- Summary strip, then alarm cards: severity, phase, since, source, detail, runbook, **action row** (Acknowledge,
  Escalate, Resolve, remediations). Confirm dialog for Escalate, Resolve and remediations. `?alarm=` scrolls to and
  expands that card. Open/Resolved/All tabs (the shared tab primitive) and a search box. Check-ins, metrics and rules
  stay below.
- Steel design language: rows on rules, no boxes, `t-*` type, i18n via `f-oncall`.

## Left to the builder

Exact copy, which remediations exist beyond the three above (add only when a safe in-process path exists), test layout.
