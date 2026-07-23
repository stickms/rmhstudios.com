# Performance SLOs and CI/CD Guardrails

This document defines the active performance guardrails for build, deploy, and
runtime, and the rollback trigger policy when user-facing performance degrades.

## 1) Build-time guardrails

- **Bundle budget is blocking** in CI:
  - `scripts/ci/perf-budgets.json`
  - enforced by `scripts/ci/bundle-budget.ts --strict`
- `web-ci` fails when eager payload budgets regress.
- `deploy` includes `perf-gate` so production deploys are blocked when strict
  bundle budgets or synthetic probes fail.

## 2) Synthetic performance SLOs

Synthetic probes run from GitHub Actions via:

- `.github/workflows/synthetic-perf.yml`
- route-class thresholds in
  `scripts/ci/synthetic-perf-bands.json`
- evaluation script:
  `scripts/ci/synthetic-perf-report.mjs`

Current median guardrails (Lighthouse, 3 runs):

- **core**: LCP ≤ 2500ms, INP ≤ 200ms, CLS ≤ 0.10, TTFB ≤ 800ms, perf score ≥ 80
- **content**: LCP ≤ 3000ms, INP ≤ 250ms, CLS ≤ 0.15, TTFB ≤ 1000ms, perf score ≥ 75
- **interactive**: LCP ≤ 3500ms, INP ≤ 300ms, CLS ≤ 0.20, TTFB ≤ 1200ms, perf score ≥ 70
- **realtime**: LCP ≤ 4000ms, INP ≤ 350ms, CLS ≤ 0.20, TTFB ≤ 1500ms, perf score ≥ 65

## 3) RUM SLO alerts (real users)

- Client reports Web Vitals through `lib/rum.ts` to `app/routes/api/rum.ts`.
- Server logs:
  - `[rum:poor]` for Web Vitals native `poor` ratings
  - `[rum:slo-breach]` when route-class thresholds are exceeded
- Route classes and thresholds are defined in:
  `lib/rum-slo.ts`

## 4) Cloudflare cache-rule drift detection

- Rule management script:
  `deploy/apply-cloudflare-cache-rules.sh`
- Drift check mode:
  `VERIFY_ONLY=1 bash deploy/apply-cloudflare-cache-rules.sh`
- Scheduled workflow runs drift verification when Cloudflare credentials are
  present (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`).

## 5) VPS tuning verification and p95 capture

Apply host tuning:

```bash
sudo bash deploy/apply-perf-tuning.sh
```

Capture before/after metrics (recommended):

1. p95/median TTFB per route class from access logs
2. p95 LCP/INP/CLS from RUM stream (`[rum:slo-breach]` and `[rum:poor]`)
3. error rate and restart count during peak window

Keep snapshots with timestamps in incident/perf notes so regressions can be
compared across deploys.

## 6) Rollback trigger policy

Trigger rollback when either condition persists for two consecutive synthetic
runs (or one run with severe breach):

- severe breach: any route class exceeds threshold by **25%+**
- sustained breach: threshold exceeded in two consecutive runs

Rollback path:

1. Execute web hotswap rollback runbook (`docs/runbooks/web-hotswap-rollback.md`)
2. Re-run synthetic workflow
3. Keep rollback in place until metrics re-enter SLO band

This policy is intentionally conservative: protect user experience first,
investigate root cause second.
