# Status page (status.rmhstudios.com)

The standalone Go service in `go-services/internal/status` (binary
`go-services/cmd/status`, port 7008, Compose service `status`). It probes every
surface of the platform every 15 seconds, keeps the history, and serves the
dashboard, the incident and maintenance record, and a set of machine-readable
APIs. It is its own process on purpose: it has to be up when everything else
isn't.

## How the numbers are computed

- **A check** is one probe of one service: `up`, `degraded` (answered, but
  wrong content, a 4xx/5xx, or over its latency budget) or `down` (no
  answer). `unknown` (not configured) is never recorded.
- **Uptime** is `up ÷ (up + degraded + down)` over a window. **Availability**
  counts a degraded answer as answered. Checks taken inside a maintenance
  window are recorded separately and count toward neither.
- **Windows**: 1h comes from the raw ring of recent checks (exact); 24h from
  the hourly buckets; 7d/30d/90d from the daily rollups. The number under each
  strip is the whole retained hourly window (90h by default) — the same number
  `/api/status` serves as `uptimePct`.
- **Bars** are classified by the *share* of their checks that failed
  (`BarSeverity` in `view.go`): none → green; under 2% → green with a warning
  cap (a *blip* — at most 4 of the 240 checks in an hour); 10% or more hard-down
  → red (*major*); anything else → amber (*partial*). Before this, a bar went
  red if a single check in it failed, so a service at 99.4% uptime — one stray
  timeout an hour — rendered as a wall of red. The strip and the percentage
  now say the same thing.
- **Strips are aligned to the wall clock**: slot *n* is always "n hours ago",
  so a gap in the prober's own history shows as an empty slot rather than
  quietly compressing time.
- **Incidents** open automatically when a failure streak reaches
  `STATUS_INCIDENT_OPEN_AFTER` checks (default 2, i.e. 30s) and are dated from
  the first failed check; `STATUS_INCIDENT_CLOSE_AFTER` good checks resolve
  them. Shorter streaks are counted as *blips*.
- **Percentiles**: exact (nearest-rank) over the last hour's raw checks;
  estimated from a 14-bin latency histogram over 24h, clamped to the observed
  min/max.

### The 0% Sitemap

`/sitemap.xml` became a **sitemap index** (`<sitemapindex>`, see
`app/routes/sitemap[.]xml.ts`) when it outgrew a single `<urlset>`, but the
probe kept asserting `<urlset`. Every check failed the content assertion, so
the tile sat at "Degraded" with 0.00% uptime while the sitemap was served
correctly. The target now uses `ExpectAny: ["<sitemapindex", "<urlset"]`, and
`TestSitemapProbeAcceptsTheIndex` pins it.

## Persistence

All three files live in `STATUS_DATA_DIR` (`/app/db` in Compose) and are
written atomically (temp file + rename):

| File | Contents |
| --- | --- |
| `status-history.json` | Hourly buckets. Still readable by the old Node service: every field added since (`latN`, `latSum`, `latMin`, `latMax`, `latHist`, `maint`) is optional. |
| `status-extended.json` | Daily rollups, the recent-check ring, per-service counters. Saved once a minute and on shutdown. On first boot without it, the daily view is rebuilt from the hourly history. |
| `status-incidents.json` | Incidents, maintenance windows, announcements. Saved on every change. |

## Managing incidents and maintenance

Set `STATUS_ADMIN_TOKEN` to enable the write API. Without it every
`/api/admin/*` route answers 404. All bodies are JSON; times are Unix
milliseconds.

```bash
TOKEN=…; S=https://status.rmhstudios.com

# Declare an incident (impact: none|minor|major|critical)
curl -sX POST $S/api/admin/incidents -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Sign-in errors","impact":"minor","components":["Website"],"body":"Investigating."}'

# Post an update (state: investigating|identified|monitoring|resolved)
curl -sX POST $S/api/admin/incidents/<id>/updates -H "Authorization: Bearer $TOKEN" \
  -d '{"state":"resolved","body":"Fixed by rotating the OAuth secret."}'

# Attach a postmortem, or edit title/impact/components
curl -sX PATCH $S/api/admin/incidents/<id> -H "Authorization: Bearer $TOKEN" \
  -d '{"postmortem":"Root cause: …"}'

# Schedule maintenance (omit components for a platform-wide window)
curl -sX POST $S/api/admin/maintenance -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Postgres upgrade","components":["Database"],"startsAt":1761100000000,"endsAt":1761103600000}'
curl -sX POST $S/api/admin/maintenance/<id>/cancel -H "Authorization: Bearer $TOKEN"

# Banner (level: info|warning|critical; link: https:// or a path)
curl -sX POST $S/api/admin/announcements -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"Scheduled maintenance tonight","level":"warning"}'

# Check webhook delivery
curl -sX POST $S/api/admin/test-webhook -H "Authorization: Bearer $TOKEN"
```

`DELETE` exists for incidents, maintenance windows and announcements, for
removing mistakes rather than rewriting history.

## Public endpoints

| Path | What |
| --- | --- |
| `/` | The dashboard |
| `/history` (`?component=slug`) | Incident and maintenance archive by month |
| `/incidents/{id}` | One incident: timeline, affected components, postmortem |
| `/report` (`?month=YYYY-MM`) | Monthly uptime report against the SLO target |
| `/embed`, `/embed.js` | Iframe widget; script that renders a status pill into `[data-rmh-status]` |
| `/api/status` | Node-compatible current status (unchanged shape) |
| `/api/slo` | Error budgets and burn rates |
| `/api/dashboard` (`?compact=1`) | Everything the page shows |
| `/api/services`, `/api/services/{slug}` | Per-service windows, latency, probe detail, history |
| `/api/uptime` | Multi-window uptime, per service and platform |
| `/api/history` (`?range=hourly\|daily\|recent&service=slug`), `/api/history.csv` | History, as JSON or CSV |
| `/api/incidents` (`?status=open\|resolved&component=slug`), `/api/incidents/{id}` | Incidents |
| `/api/maintenance`, `/api/announcements` | Windows and banners |
| `/api/v2/{status,summary,components,incidents,scheduled-maintenances}.json`, `/api/v2/incidents/unresolved.json`, `/api/v2/scheduled-maintenances/{upcoming,active}.json` | Statuspage.io-compatible API |
| `/metrics` | Prometheus exposition |
| `/badge.svg`, `/badge/{slug}.svg` (`?style=uptime&window=7d&label=…`) | SVG badges |
| `/feed.rss`, `/feed.atom`, `/maintenance.ics` | Feeds and the maintenance calendar |

Public reads send `Access-Control-Allow-Origin: *`; responses are gzipped for
clients that accept it.

## Configuration

See the *Status Page* block in `.env.example`. The new variables are
`STATUS_MAX_DAYS`, `STATUS_RECENT_SAMPLES`, `STATUS_INCIDENT_OPEN_AFTER`,
`STATUS_INCIDENT_CLOSE_AFTER`, `STATUS_PAGE_URL`, `STATUS_PAGE_NAME`,
`STATUS_ADMIN_TOKEN`, `STATUS_WEBHOOK_URLS`, `STATUS_WEBHOOK_SECRET` and
`STATUS_ANNOUNCEMENT[_LEVEL|_LINK]`. The Compose service reads them from
`.env.production` through `env_file`.

## Feature catalogue

What the October 2026 overhaul added, for reference when changing any of it.

**Correctness** — 1. Sitemap probe accepts the sitemap index · 2. Bars
classified by share of failed checks (blip / partial / major) · 3. Strips
aligned to wall-clock slots.

**Tracking** — 4. Per-bucket latency mean/min/max · 5. Per-bucket latency
histogram · 6. 90 days of daily rollups · 7. Daily backfill from existing
hourly history · 8. Ring of the last 240 raw checks · 9. Request timing phases
(DNS, connect, TLS, server wait, transfer) · 10. Connection-reuse detection ·
11. TLS certificate expiry, issuer, subject and version · 12. HTTP protocol,
response size and content type · 13. Status-class counters · 14. Failure
categories (timeout, DNS, refused, reset, TLS, network, 5xx, 4xx, content,
slow, probe error) · 15. `ExpectAny` multi-marker content assertions ·
16. Success/failure streaks with start times · 17. Last up, last failure (with
reason), last state change · 18. State-change log and flap detection ·
19. Blip counter · 20. Monitored-since and lifetime check count · 21. Extended
state persistence · 22. Prober self-monitoring.

**Statistics** — 23. Uptime over 1h/24h/7d/30d/90d · 24. Availability beside
strict uptime · 25. Estimated downtime per window · 26. Partial-window flag ·
27. Exact p50/p95/p99 over the last hour · 28. Estimated percentiles over 24h ·
29. Apdex · 30. Latency trend (1h vs 24h) · 31. Uptime delta (24h vs the 24h
before) · 32. MTTR (per service and platform) · 33. MTBF · 34. Per-tier
rollups · 35. Platform-wide uptime windows · 36. Error budget expressed as
time of failure left.

**Incidents** — 37. Automatic detection with a debounce · 38. Automatic
resolution with duration and failed-check count · 39. Automatic escalation
from degraded to outage · 40. Impact derived from state and tier ·
41. Declared (manual) incidents · 42. Investigating / identified / monitoring
/ resolved lifecycle · 43. Update timelines · 44. Affected components ·
45. Postmortems · 46. Persistence · 47. Incident pages · 48. Monthly archive ·
49. Archive filter by component.

**Maintenance and announcements** — 50. Scheduled windows · 51. Automatic
scheduled → in progress → completed · 52. Cancel, edit and post updates ·
53. "Maintenance" component state · 54. Excluded from uptime, error budgets and
incident detection · 55. In-progress banner and live countdowns · 56. iCal
feed · 57. Scheduled announcement banners · 58. Static banner from env ·
59. Dismissible banners.

**Notifications** — 60. Outbound webhooks for incidents, maintenance and
announcements · 61. Native Discord embeds · 62. Native Slack messages ·
63. HMAC-signed generic JSON · 64. Non-blocking queue with one retry ·
65. Test-delivery endpoint · 66. Opt-in browser notifications on state
change · 67. In-page toasts on state change.

**APIs** — 68. `/api/dashboard` · 69. `/api/services[/{slug}]` ·
70. `/api/uptime` · 71. `/api/history` · 72. CSV export · 73. `/api/incidents`
with filters · 74. `/api/maintenance` · 75. `/api/announcements` ·
76–80. Statuspage v2 status, summary, components (with groups), incidents and
scheduled maintenances · 81. Prometheus `/metrics` · 82. Status badges ·
83. Uptime badges · 84. RSS · 85. Atom · 86. CORS on public reads · 87. Gzip ·
88. Token-guarded admin API.

**Dashboard** — 89. Live refresh in place (globe, scroll and open panels
survive) · 90. Live / paused / offline indicator with backoff · 91. Pause,
resume and refresh now · 92. Next-update countdown and "updated … ago" ·
93. Refresh paused in background tabs · 94. KPI tiles · 95. Ongoing-incident
banners · 96. Tier chips · 97. 90-hour ↔ 90-day history toggle · 98. Bar
tooltips with checks, uptime and latency · 99. Per-card latency sparkline with
failure ticks · 100. Card chips (incident, flapping, TLS expiry, failing
streak, maintenance) · 101. Per-card stat row · 102. Expandable details ·
103. Uptime-by-window table · 104. Latency chart (mean, p95, budget line) ·
105. Latency distribution · 106. Request-timing bar · 107. Status-class bar ·
108. Failures by cause · 109. Recent checks log · 110. Incident list with
filters · 111. Maintenance section · 112. 90-day platform calendar ·
113. 24h latency heatmap · 114. Response-time leaderboard · 115. Error-budget
meters · 116. Monitoring-health panel · 117. Subscribe & integrate section
with copyable snippets · 118. Search · 119. Issues-only filter · 120. Sort ·
121. Collapsible tiers · 122. Expand/collapse all · 123. Theme switch
(auto / light / dark, no flash) · 124. UTC ↔ local time · 125. Compact
density · 126. Keyboard shortcuts and help · 127. Status-coloured favicon and
issue count in the title · 128. Deep links with highlight and copy-link ·
129. Copy status summary · 130. Print / save-as-PDF stylesheet.

**Pages** — 131. Monthly uptime report with met/missed and daily strips ·
132. Iframe widget · 133. `embed.js` · 134. Web-app manifest · 135.
`robots.txt` · 136. Skip link and labelled controls throughout.
