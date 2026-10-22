# 06 — Report template

`06-report.md` is written at integration (P2) from the `results/` files, by the
documentation agent, and reviewed by the coordinator. It follows this skeleton,
in this order, so a reader who stops after §1 still has the answer. Numbers are
copied from `results/`, never re-derived; a figure without a results row does
not appear.

```markdown
# Server-side performance program — report

Merged tree <sha>, baseline <sha>, <date>. Environment deviations: <none | …>.

## 1. Headline
Per route class (`core` · `content` · `interactive` · `api`), medians over the
route list from `results/baseline.json` and the post-merge run:

| Class | Auth | TTFB p50 before → after | TTFB p95 before → after | rps before → after | Queries before → after |
|---|---|---:|---:|---:|---:|

One paragraph: what moved most, what did not, and whether each class is inside
its `02-budgets.md` §2 budget. Latency figures come from the post-merge harness
run, not from workstream-local numbers.

## 2. Per-workstream summary
One row per workstream: shipped / rejected / deferred counts, the headline
shipped row, evidence class (`exact` / `latency`), and the link.

| WS | Shipped | Rejected | Deferred | Headline | Ledger |
|---|---:|---:|---:|---|---|
| 0 | | | | | [`results/ws-0.md`](results/ws-0.md) |
| 1–7 | | | | | `results/ws-N.md` (WS7: Go services) |

Rows run WS0 to WS9 (WS8, search and tags, and WS9, worker indexes, were added mid-program); WS7 (Go services) reports `go test -bench` and
`pg_stat_statements` evidence (`01-method.md` §1.7) and its `make test` result.
Stage A changes that failed re-measurement in Stage B are counted as rejected.

## 3. Correctness and privacy fixes found during the program
Defects found while reading the paths to speed them up, separate from the speed
work and at least as important. One row per defect: what a viewer could do, the
fix, what the fix costs (extra queries), the commit, and the test that fails on
the parent.

| # | Defect | Fix | Cost of the fix | Commit | Test |
|---|---|---|---|---|---|

## 4. Regressions checked
The `02-budgets.md` §3 check across the merged tree: every route, both auth
modes, p50 TTFB worse by more than the larger of 10 % or 5 ms, or any added
query.

| Route | Auth | Metric | Baseline | Merged | Verdict / explanation |
|---|---|---|---:|---:|---|

State the command. "None found" is a result only if the command and the route
count are written next to it.

## 5. Rejected ideas registry
Merged from the Rejected table of every `results/ws-N.md`, so a future pass does
not retry them. Binding in the same way as the loading audit's
"Measured and rejected" table: not re-attempted without new evidence.

| WS | Idea | Route(s) | Metric | Before | After | Why it didn't help |
|---|---|---|---:|---:|---:|---|

## 6. Follow-ups and handoffs not done
Deferred leads and unrouted handoffs, each with what would unblock it, plus
infrastructure proposals that are out of scope (`index.md` §3).

| Source | Item | file:line | Why not done | Unblock |
|---|---|---|---|---|

## 7. Production verification plan
Per [`performance-slo.md`](../performance-slo.md): which RUM and synthetic
windows the operator compares after deploy, against which baseline values from
§1, the thresholds, and the rollback policy there (unchanged). List every new
cache and the invalidation that keeps it safe, so the operator knows what to
purge if it misbehaves.

| Signal | Window | Baseline | Alert / rollback threshold |
|---|---|---:|---|

## 8. Rule objections
Collected from the workstream ledgers, with the coordinator's ruling.
```
