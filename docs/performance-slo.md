# Performance SLOs and Monitoring

This is the source of truth for build, synthetic, and real-user performance
budgets. Performance measurements are advisory and do not block merges or
deployments.

## Active reports and monitoring

### Candidate bundle budgets

`scripts/ci/bundle-budget.ts` measures Brotli payload sizes from the built Vite
output and reports drift without failing the build.

It runs for production images in the shared `vite-builder` stage in
`Dockerfile`, keeping the measurement next to the exact candidate output without
adding another frontend build to `.github/workflows/deploy.yml`.

Thresholds live in `scripts/ci/perf-budgets.json`. All bands are advisory.

### Live-production synthetic preflight

`.github/workflows/synthetic-perf.yml` probes production every six hours and on
manual dispatch. It is independent of PR and deployment workflows so noisy
third-party-network failures or a slow live site cannot block a fix.

Each configured route gets three Lighthouse runs. The report requires every
route and every metric to have all three samples. Missing or out-of-band data is
reported in the Actions summary; available artifacts are retained for 14 days.

**These are mobile numbers.** `lhci collect` is run with no preset, and
Lighthouse's default is emulated mobile — a Moto-G-class viewport with 4× CPU
throttling and slow-4G network throttling. The bands below are therefore already
the phone case, not an average of all traffic, and they should not be read as
representative of a desktop visitor.

There is deliberately **no desktop counterpart lane**, and the reason is worth
stating so it is not added as an obvious oversight: the mobile ÷ desktop ratio
between two Lighthouse presets is largely a property of *the presets* — the 4×
CPU slowdown and the throttled link are configuration, not measurement — so it
would produce an authoritative-looking number that says almost nothing about
this site. The device comparison that does mean something comes from real users,
via `--by-device` on the RUM reporter above.

Synthetic bands are in `scripts/ci/synthetic-perf-bands.json`:

| Route class |     LCP |    TBT |  CLS |    TTFB | Minimum score |
| ----------- | ------: | -----: | ---: | ------: | ------------: |
| core        | 2500 ms | 300 ms | 0.10 |  800 ms |            80 |
| content     | 3000 ms | 400 ms | 0.15 | 1000 ms |            75 |
| interactive | 3500 ms | 500 ms | 0.20 | 1200 ms |            70 |
| realtime    | 4000 ms | 600 ms | 0.20 | 1500 ms |            65 |

Lighthouse cannot produce a representative INP without real interaction, so the
lab report uses Total Blocking Time as its responsiveness proxy. INP is measured
from real-user data.

The candidate continues to be protected by build correctness and the VPS
blue/green health checks. A post-deploy synthetic rollback loop remains an
operator integration until the webhook can report completion and accept an
authenticated rollback action.

## Real-user monitoring

`lib/rum.ts` sends LCP, INP, CLS, TTFB, and FCP samples to `/api/rum`. The API
validates the metric, derives its route class, reduces the pathname to its first
segment so handles/IDs/slugs are not logged, and emits:

- `[rum:metric]` for every accepted sample, so a log backend can calculate
  percentiles rather than seeing only slow navigations
- `[rum:poor]` for Web Vitals' native poor rating
- `[rum:slo-breach]` when an individual navigation exceeds its route-class band

The shared route-class thresholds are in `lib/rum-slo-bands.json`. Route
classification and threshold lookup are in `lib/rum-slo.ts`.

### The device dimension — read this before trusting a pooled percentile

Every sample also carries a bucketed device context: `formFactor`
(`mobile`/`tablet`/`desktop`), `vw`, `dpr`, `mem`, `cores`, `net`, `saveData`.
See `lib/rum.ts` §Device context for why each field is bucketed the way it is —
the short version is that these are the fields that change a decision, and
nothing finer, because `/api/rum` is anonymous by design.

**A pooled p75 cannot see this site's dominant performance fact.** The load cost
here is overwhelmingly main-thread JavaScript and GPU compositing, and a phone
pays 4–6× for both. Mixed into one population with desktop traffic, a 3× mobile
regression reads as mild drift and passes its band. That is not hypothetical:
six consecutive audits measured only unthrottled desktop Chromium
(`docs/loading-audit-2026-08-11/01-measurements.md` §6) and none of them could
have seen it. Split the report before concluding a route is healthy:

```bash
node scripts/ci/rum-slo-report.mjs --by-device --min-samples=100 web.log
```

`--by-device` adds a Device column and prints the mobile ÷ desktop p75 ratio per
metric. Samples from a client cached before the dimension shipped are bucketed
as `unknown` rather than dropped, so the population never silently shrinks when
the beacon changes. Note that the split divides each row's samples three ways —
lower `--min-samples` accordingly or widen the window.

Aggregate a captured log window locally:

```bash
node scripts/ci/rum-slo-report.mjs --min-samples=100 web.log
```

Use it as a machine gate:

```bash
node scripts/ci/rum-slo-report.mjs \
  --strict \
  --min-samples=100 \
  --p95-multiplier=1.25 \
  web.log
```

The strict report fails when a present route/metric group has fewer than the
minimum samples, p75 exceeds its SLO, or p95 exceeds 125% of the SLO. The script
also accepts structured log lines on stdin and supports `--json`.

Production alerting still needs the container log stream forwarded to a central
backend. Alert on aggregate windows, not a single `[rum:slo-breach]` event.

## CDN and host drift

### Cloudflare cache rules

Apply the committed cache rules once with a scoped token:

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... \
  bash deploy/apply-cloudflare-cache-rules.sh
```

Verify exact semantic drift without writing:

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... VERIFY_ONLY=1 \
  bash deploy/apply-cloudflare-cache-rules.sh
```

The scheduled synthetic workflow runs this verification when both repository
secrets are configured. If they are absent, the job emits an explicit notice
instead of pretending drift was checked.

### VPS tuning

Review the committed values against host RAM and connection demand, then apply:

```bash
sudo bash deploy/apply-perf-tuning.sh
```

Verify the installed files and live PostgreSQL/Apache settings without writing:

```bash
VERIFY_ONLY=1 sudo bash deploy/apply-perf-tuning.sh
```

Capture equal traffic windows before and after applying:

1. Save the synthetic workflow summary and Lighthouse artifacts.
2. Export at least 100 `[rum:metric]` samples per important route/metric group.
3. Run `rum-slo-report.mjs` on both windows and retain its JSON output.
4. Record error rate, web-container restarts, PostgreSQL saturation, and Apache
   busy workers for the same timestamps.

Do not claim a host-tuning win without those before/after artifacts.

## Rollback policy

The blue/green hotswap already rolls back automatically when the new web
container is unhealthy or Apache does not serve through the new port.

For performance regressions after a healthy swap, roll back when either is true
for two consecutive comparable windows with at least 100 samples per affected
group:

- p75 exceeds the route-class budget
- p95 exceeds 125% of the route-class budget

A synthetic breach of 25% or more on the newly deployed version is also a
rollback signal after one confirmation run.

Rollback command and verification:

1. Run `./deploy.sh production <previous-sha>` on the VPS.
2. Re-run the synthetic workflow.
3. Recompute the equivalent RUM window.
4. Keep the rollback until both synthetic and RUM bands recover.

The percentile evaluator is repository code; unattended performance rollback is
not active because this repo has no authenticated central-metrics query or
rollback webhook. Wiring those two external pieces is required before CI can
safely automate the command above.

## Executable rollout checklist

- [x] Report candidate bundle size inside the shared image graph.
- [x] Add advisory scheduled synthetic probes outside PR traffic.
- [x] Emit complete structured RUM samples and percentile reports.
- [x] Add exact Cloudflare drift detection.
- [x] Add read-only VPS tuning verification.
- [ ] Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` in production.
- [ ] Apply the Cloudflare rules and save the successful verification output.
- [ ] Review, apply, and verify VPS tuning on the production host.
- [ ] Forward `[rum:metric]` logs to a durable metrics backend.
- [ ] Capture before/after p75 and p95 windows by route class.
- [ ] Add aggregate alert rules in the metrics backend.
- [ ] Add authenticated deploy-completion and rollback controls before enabling
      unattended performance rollback.
